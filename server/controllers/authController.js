const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { query } = require('../config/database');
const { auditLog, bumpUserTokenVersion } = require('../middleware/auth');
const { sendEmail } = require('../utils/emailService');
const { extractCalendarDate, getTodayDateString } = require('../services/officePortalService');
const { sendOtp, verifyOtp } = require('../utils/otpService');

// Constant-time dummy bcrypt cost-12 hash used when login receives unknown/unregistered accounts
const DUMMY_BCRYPT_HASH = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 12);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const REG_GENERIC_ERROR =
  'Your details do not match active hospital HR records, or your official email is not yet registered in HRMS. Please verify your Employee ID, Full Name, and official HR email or contact HR.';

const UNIFORM_RESET_MESSAGE =
  'If your details match an active registered account, a verification OTP has been sent to the registered email.';

const SHARED_LOGIN_RETIRED_RESPONSE = {
  error: 'Shared committee logins have been retired. Please sign in with your individual Employee ID and switch roles.',
  code: 'SHARED_LOGIN_RETIRED'
};

const HRMS_CONTACT_READ_ONLY_RESPONSE = {
  error: 'Email and phone are managed by OfficePortal HRMS and cannot be edited here. Please contact HR to update your details.',
  code: 'HRMS_MANAGED_READ_ONLY'
};

// Compact denylist of trivial / commonly breached passwords (case-insensitive)
const COMMON_WEAK_PASSWORDS = new Set([
  'password1', 'password12', 'password123', 'password@1', 'password@123', 'p@ssword1', 'p@ssw0rd',
  'admin1', 'admin12', 'admin123', 'admin@123', 'admin1234', 'administrator1',
  'welcome1', 'welcome123', 'welcome@123',
  'qwerty1', 'qwerty12', 'qwerty123', 'qwerty@123', 'abc123', 'abc1234', 'abcd1234', 'asdf1234',
  'hospital1', 'hospital123', 'hospital@123',
  'jphrc1', 'jphrc123', 'jphrc@123', 'jphrc2024', 'jphrc2025', 'jphrc2026',
  'jaiprakash1', 'jaiprakash123', 'ims123', 'ims@123', 'ims2026',
  'pass123', 'pass1234', 'test123', 'test1234', 'user123', 'user1234', 'demo123',
  'letmein1', 'iloveyou1', '123456a', 'a123456', '1234567a', '12345678a', '12345a', 'a12345'
]);

// ─── Helper: HTML escaping for email templates ───────────────────────────────
const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
exports.escapeHtml = escapeHtml;

// ─── Helper: System / retired generic account checks ─────────────────────────
const isRootAdminAccount = (empId) => String(empId || '').trim() === '00000';

const isRetiredSharedAccount = (empId) =>
  ['SYS_IMC', 'SYS_MGMT'].includes(String(empId || '').trim().toUpperCase());

const isGenericSystemAccount = (empId) =>
  ['00000', 'SYS_IMC', 'SYS_MGMT'].includes(String(empId || '').trim().toUpperCase());

// ─── Helper: Safe Registration Name Verification (prevents 1-2 char substring bypass) ─
const isRegistrationNameMatch = (recordName, suppliedName) => {
  const rec = String(recordName || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const sup = String(suppliedName || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!rec || !sup) return false;
  if (sup.length < 3) {
    return rec === sup;
  }
  return rec.includes(sup) || sup.includes(rec);
};

// ─── Helper: Password Complexity Policy (>=6 chars, <=72 UTF-8 bytes, letter + digit/symbol, no trivial passwords) ─
const validatePasswordStrength = (password) => {
  if (typeof password !== 'string' || password.length < 6) {
    return {
      valid: false,
      error: 'Password must be at least 6 characters and include at least one letter and one number or special character.'
    };
  }
  if (Buffer.byteLength(password, 'utf8') > 72) {
    return {
      valid: false,
      error: 'Password must not exceed 72 bytes.'
    };
  }
  const hasLetter = /[A-Za-z]/.test(password);
  const hasDigitOrSymbol = /[0-9]|[^A-Za-z0-9]/.test(password);
  if (!hasLetter || !hasDigitOrSymbol) {
    return {
      valid: false,
      error: 'Password must be at least 6 characters and include at least one letter and one number or special character.'
    };
  }
  if (COMMON_WEAK_PASSWORDS.has(password.trim().toLowerCase())) {
    return {
      valid: false,
      error: 'This password is too common. Please choose a stronger, unique password.'
    };
  }
  return { valid: true };
};
exports.validatePasswordStrength = validatePasswordStrength;

// ─── Helper: Check HRMS lifecycle access (terminated / inactive / deleted / portalAccessDisableDate) ─
const checkMasterLifecycleAccess = async (employeeId) => {
  const empCode = String(employeeId || '').trim().toUpperCase();
  // Only root System Admin (00000) is exempt from HRMS directory lookup
  if (!empCode || isRootAdminAccount(empCode)) {
    return { allowed: true };
  }
  try {
    const res = await query(
      `SELECT status, portal_access_disable_date FROM master_employees WHERE employee_id = $1 LIMIT 1`,
      [empCode]
    );
    if (!res.rows.length) return { allowed: true };
    const { status, portal_access_disable_date } = res.rows[0];
    if (['terminated', 'inactive', 'deleted'].includes(status)) {
      const label = status === 'inactive' ? 'inactive' : 'terminated';
      return {
        allowed: false,
        code: status === 'inactive' ? 'EMPLOYEE_INACTIVE' : 'EMPLOYEE_TERMINATED',
        error: `Access denied. This employee record is marked as ${label} in HRMS.`
      };
    }
    if (portal_access_disable_date) {
      const disableDate = extractCalendarDate(portal_access_disable_date);
      const today = getTodayDateString();
      if (disableDate && disableDate <= today) {
        return {
          allowed: false,
          code: 'PORTAL_ACCESS_DISABLED',
          error: 'Access denied. Portal access for this employee has been disabled in HRMS.'
        };
      }
    }
    return { allowed: true };
  } catch (err) {
    return { allowed: true };
  }
};

// ─── Helper: Check if user is HOD based on role or designation ──────────────
const isUserHod = (user) => {
  if (isGenericSystemAccount(user?.employee_id)) return false;
  if (user?.role === 'hod') return true;
  const desig = (user?.designation || '').toUpperCase();
  return desig === 'HOD' || desig.includes('HEAD OF DEPARTMENT') || desig.includes('HEAD OF DEPT') || desig.startsWith('HEAD OF ') || desig.includes('(HOD)');
};

// ─── Helper: Fetch assigned incident categories for any user ────────────────
const getUserAssignedCategories = async (userId) => {
  if (!userId) return [];
  try {
    const res = await query(
      `SELECT ic.id, ic.name
       FROM category_feedback_assignees cfa
       JOIN incident_categories ic ON ic.id = cfa.category_id
       WHERE cfa.user_id = $1 AND cfa.is_active = TRUE AND ic.is_active = TRUE
       ORDER BY ic.name ASC`,
      [userId]
    );
    return res.rows;
  } catch (err) {
    return [];
  }
};

// ─── Helper: Check if user has Department Reviewer / HOD access in DB ───────
const checkUserHodAccess = async (user) => {
  if (!user || isGenericSystemAccount(user.employee_id)) return false;
  if (isUserHod(user)) return true;
  try {
    const deptCheck = await query(
      `SELECT 1 FROM departments WHERE assigned_user_id = $1 OR hod_user_id = $1
       UNION ALL
       SELECT 1 FROM department_reviewers WHERE user_id = $1 AND is_active = TRUE
       LIMIT 1`,
      [user.id]
    );
    return deptCheck.rows.length > 0;
  } catch (err) {
    return false;
  }
};

const syncHodDepartment = async (user) => {
  try {
    if (user && isUserHod(user) && user.department) {
      await query(
        `UPDATE departments SET hod_user_id = $1
         WHERE (LOWER(name) = LOWER($2) OR LOWER(name) LIKE LOWER($2) || '%' OR LOWER($2) LIKE LOWER(name) || '%')
         AND (hod_user_id IS NULL OR hod_user_id != $1)`,
        [user.id, user.department.trim()]
      );
    }
  } catch (err) {
    console.error('Failed to sync HOD department:', err.message);
  }
};

// ─── Welcome Email Template (HTML-escaped) ───────────────────────────────────
const welcomeEmailTemplate = (user) => {
  const safeName = escapeHtml(user?.full_name || '');
  const safeEmpId = escapeHtml(user?.employee_id || '');
  const safeDept = escapeHtml(user?.department || 'Not assigned');
  const safeRole = escapeHtml(user?.role || 'employee');

  return {
    subject: `Welcome to JPHRC Incident Management System`,
    html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><title>Welcome to JPHRC IMS</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:30px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#064e3b 0%,#065f46 100%);padding:28px 36px;">
            <p style="margin:0;color:#6ee7b7;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;">Jaiprakash Hospital &amp; Research Centre</p>
            <h1 style="margin:4px 0 0;color:#fff;font-size:20px;font-weight:700;">Incident Management System</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:36px;">
            <h2 style="color:#065f46;font-size:24px;margin:0 0 8px;">Welcome, ${safeName}! 🎉</h2>
            <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 24px;">Your JPHRC IMS account has been successfully created. You can now log in to report incidents, track their status, and stay informed throughout the resolution process.</p>
            
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #059669;border-radius:8px;padding:20px;margin:0 0 24px;">
              <p style="margin:0 0 12px;color:#64748b;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Your Account Details</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:4px 0;color:#64748b;font-size:13px;width:140px;">Employee ID</td><td style="padding:4px 0;color:#0f172a;font-size:13px;font-weight:700;font-family:monospace;">${safeEmpId}</td></tr>
                <tr><td style="padding:4px 0;color:#64748b;font-size:13px;">Full Name</td><td style="padding:4px 0;color:#0f172a;font-size:13px;font-weight:600;">${safeName}</td></tr>
                <tr><td style="padding:4px 0;color:#64748b;font-size:13px;">Department</td><td style="padding:4px 0;color:#0f172a;font-size:13px;">${safeDept}</td></tr>
                <tr><td style="padding:4px 0;color:#64748b;font-size:13px;">Role</td><td style="padding:4px 0;color:#0f172a;font-size:13px;text-transform:capitalize;">${safeRole}</td></tr>
              </table>
            </div>

            <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:16px;margin:0 0 24px;">
              <p style="margin:0;color:#065f46;font-size:13px;font-weight:600;">🔐 Security Reminder</p>
              <p style="margin:6px 0 0;color:#047857;font-size:13px;">Keep your Employee ID and password confidential. Never share your login credentials with anyone.</p>
            </div>

            <p style="color:#475569;font-size:14px;line-height:1.7;">If you did not create this account or believe this is an error, please contact your System Administrator immediately.</p>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 36px;">
            <p style="margin:0;color:#94a3b8;font-size:12px;">This is an automated message from <strong>JPHRC IMS</strong>. Do not reply to this email.</p>
            <p style="margin:6px 0 0;color:#cbd5e1;font-size:11px;">© ${new Date().getFullYear()} Jaiprakash Hospital &amp; Research Centre</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
`
  };
};
exports.welcomeEmailTemplate = welcomeEmailTemplate;

// ─── Helper: Sign HS256 JWT with token_version (`tv`) ───────────────────────
const signAuthToken = (user, role) => {
  const tokenVersion = typeof user.token_version === 'number' ? user.token_version : 1;
  return jwt.sign(
    {
      userId: user.id,
      employeeId: user.employee_id,
      role,
      tv: tokenVersion
    },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
};

// ─── Helper: Validate registration details strictly against master_employees ─
const verifyRegistrationAgainstHrms = async (employeeId, fullName, submittedEmail) => {
  if (isGenericSystemAccount(employeeId)) {
    return {
      ok: false,
      status: 400,
      body: { error: REG_GENERIC_ERROR, code: 'REGISTRATION_VERIFICATION_FAILED' }
    };
  }

  const masterRes = await query(
    `SELECT employee_id, name, email, phone, department, designation, role, status, portal_access_disable_date
     FROM master_employees
     WHERE UPPER(TRIM(employee_id)) = $1
     LIMIT 1`,
    [employeeId]
  );

  if (masterRes.rows.length === 0) {
    return {
      ok: false,
      status: 400,
      body: { error: REG_GENERIC_ERROR, code: 'REGISTRATION_VERIFICATION_FAILED' }
    };
  }

  const masterEmp = masterRes.rows[0];
  const canonicalEmail = String(masterEmp.email || '').trim().toLowerCase();

  // Mandatory HRMS email: block sign-up if OfficePortal has no valid email on file
  if (!canonicalEmail || !EMAIL_REGEX.test(canonicalEmail)) {
    return {
      ok: false,
      status: 400,
      body: { error: REG_GENERIC_ERROR, code: 'REGISTRATION_VERIFICATION_FAILED' }
    };
  }

  // Submitted email MUST match master_employees.email (case-insensitively)
  if (canonicalEmail !== submittedEmail) {
    return {
      ok: false,
      status: 400,
      body: { error: REG_GENERIC_ERROR, code: 'REGISTRATION_VERIFICATION_FAILED' }
    };
  }

  // Full name MUST match HRMS record
  if (!isRegistrationNameMatch(masterEmp.name, fullName)) {
    return {
      ok: false,
      status: 400,
      body: { error: REG_GENERIC_ERROR, code: 'REGISTRATION_VERIFICATION_FAILED' }
    };
  }

  // Check existing user row (skeleton or already registered)
  const existingRes = await query(
    'SELECT * FROM users WHERE UPPER(TRIM(employee_id)) = $1 LIMIT 1',
    [employeeId]
  );
  const existingUser = existingRes.rows[0] || null;

  if (existingUser && existingUser.password_hash) {
    return {
      ok: false,
      status: 409,
      body: {
        error: 'An account with this Employee ID already exists. Please login instead.',
        code: 'ALREADY_REGISTERED'
      }
    };
  }

  // HRMS lifecycle check (after name + email match so outsiders cannot enumerate status)
  const lifecycle = await checkMasterLifecycleAccess(masterEmp.employee_id);
  if (!lifecycle.allowed) {
    return {
      ok: false,
      status: 403,
      body: { error: lifecycle.error, code: lifecycle.code }
    };
  }

  if (existingUser && existingUser.is_active === false) {
    return {
      ok: false,
      status: 403,
      body: {
        error: 'Account deactivated. Please contact the System Administrator or HR.',
        code: 'ACCOUNT_DEACTIVATED'
      }
    };
  }

  return {
    ok: true,
    masterEmp,
    existingUser,
    canonicalEmail
  };
};

// =============================================
// REQUEST REGISTRATION OTP (Mandatory HRMS Email)
// =============================================
exports.requestRegistrationOtp = async (req, res) => {
  try {
    let { fullName, employeeId, email, password } = req.body;
    employeeId = String(employeeId || '').trim().toUpperCase();
    const submittedEmail = String(email || '').trim().toLowerCase();

    if (!fullName?.trim() || !employeeId || !submittedEmail || !password) {
      return res.status(400).json({ error: 'Full name, Employee ID, email, and password are required.' });
    }
    if (!EMAIL_REGEX.test(submittedEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    const pwCheck = validatePasswordStrength(password);
    if (!pwCheck.valid) {
      return res.status(400).json({ error: pwCheck.error, code: 'WEAK_PASSWORD' });
    }

    const hrmsCheck = await verifyRegistrationAgainstHrms(employeeId, fullName, submittedEmail);
    if (!hrmsCheck.ok) {
      return res.status(hrmsCheck.status).json(hrmsCheck.body);
    }

    const { masterEmp, canonicalEmail } = hrmsCheck;

    // Send OTP strictly to master_employees.email (canonicalEmail)
    const sent = await sendOtp(masterEmp.employee_id, canonicalEmail, 'registration');
    if (sent && typeof sent === 'object' && sent.code === 'OTP_COOLDOWN') {
      return res.status(429).json({
        error: `Please wait ${sent.retryAfterSeconds} seconds before requesting another OTP.`,
        code: 'OTP_COOLDOWN',
        retryAfterSeconds: sent.retryAfterSeconds
      });
    }
    if (sent === true) {
      return res.json({ success: true, message: 'Verification OTP sent to your official HRMS email address.' });
    }
    return res.status(503).json({
      error: 'Unable to deliver verification OTP email right now. Please try again shortly or contact IT support.',
      code: 'OTP_DELIVERY_FAILED'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to request OTP. Please try again.' });
  }
};

// =============================================
// REGISTER — Create new employee account (Email-Bound OTP)
// =============================================
exports.register = async (req, res) => {
  try {
    let { fullName, employeeId, email, password, otp } = req.body;
    employeeId = String(employeeId || '').trim().toUpperCase();
    const submittedEmail = String(email || '').trim().toLowerCase();
    const cleanOtp = String(otp || '').trim();

    if (!fullName?.trim() || !employeeId || !submittedEmail || !password || !cleanOtp) {
      return res.status(400).json({ error: 'Full name, Employee ID, email, password, and OTP are required.' });
    }
    if (!EMAIL_REGEX.test(submittedEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    const regPwCheck = validatePasswordStrength(password);
    if (!regPwCheck.valid) {
      return res.status(400).json({ error: regPwCheck.error, code: 'WEAK_PASSWORD' });
    }

    // Re-verify employee against master_employees (ensures canonical HRMS email & name match)
    const hrmsCheck = await verifyRegistrationAgainstHrms(employeeId, fullName, submittedEmail);
    if (!hrmsCheck.ok) {
      return res.status(hrmsCheck.status).json(hrmsCheck.body);
    }

    const { masterEmp, existingUser, canonicalEmail } = hrmsCheck;

    // Verify email-bound OTP strictly against canonicalEmail
    const isValid = await verifyOtp(masterEmp.employee_id, 'registration', cleanOtp, canonicalEmail);
    if (!isValid) {
      await auditLog(existingUser?.id || null, 'OTP_FAILED', null, {
        employeeId: masterEmp.employee_id,
        action: 'registration'
      }, req.ip);
      return res.status(400).json({ error: 'Invalid or expired OTP.', code: 'INVALID_OTP' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    if (existingUser) {
      const updatedUser = await query(
        `UPDATE users SET
          password_hash = $1,
          email = $2,
          full_name = COALESCE(NULLIF(full_name, ''), $3),
          phone = COALESCE(phone, $4),
          updated_at = NOW()
         WHERE id = $5
         RETURNING *`,
        [
          passwordHash,
          canonicalEmail,
          masterEmp.name || fullName.trim(),
          masterEmp.phone || null,
          existingUser.id
        ]
      );

      const user = updatedUser.rows[0];
      await syncHodDepartment(user);

      if (user.email) {
        sendEmail(user.email, welcomeEmailTemplate(user)).catch(() => {});
      }

      await auditLog(user.id, 'ACCOUNT_REGISTERED', null, {
        employeeId: user.employee_id,
        method: 'db_match'
      }, req.ip);

      return res.status(201).json({
        success: true,
        message: 'Account created successfully! A welcome email has been sent. Please login.',
        employeeId: user.employee_id
      });
    }

    // Automatically assign 'hod' role if designation is HOD (does not override system_admin or committee roles)
    let assignedRole = masterEmp.role || 'employee';
    const desig = (masterEmp.designation || '').toUpperCase();
    if (assignedRole === 'employee' && (desig === 'HOD' || desig.includes('HEAD OF DEPARTMENT') || desig.includes('HEAD OF DEPT'))) {
      assignedRole = 'hod';
    }

    const newUser = await query(
      `INSERT INTO users (employee_id, full_name, email, phone, department, designation, role, password_hash, token_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1)
       RETURNING *`,
      [
        masterEmp.employee_id,
        masterEmp.name || fullName.trim(),
        canonicalEmail,
        masterEmp.phone || null,
        masterEmp.department || null,
        masterEmp.designation || null,
        assignedRole,
        passwordHash
      ]
    );

    const user = newUser.rows[0];
    await syncHodDepartment(user);

    if (user.email) {
      sendEmail(user.email, welcomeEmailTemplate(user)).catch(() => {});
    }

    await auditLog(user.id, 'ACCOUNT_REGISTERED', null, {
      employeeId: user.employee_id,
      method: 'portal'
    }, req.ip);

    res.status(201).json({
      success: true,
      message: 'Account created successfully! A welcome email has been sent. Please login.',
      employeeId: user.employee_id
    });
  } catch (error) {
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
};

// =============================================
// LOGIN — Employee ID + Password (Constant-Time Anti-Enumeration)
// =============================================
exports.login = async (req, res) => {
  try {
    let { employeeId, password } = req.body;
    employeeId = String(employeeId || '').trim().toUpperCase();

    if (!employeeId || typeof password !== 'string' || !password) {
      return res.status(400).json({ error: 'Employee ID and password are required.' });
    }

    // Explicitly reject retired shared committee accounts
    if (isRetiredSharedAccount(employeeId)) {
      return res.status(410).json(SHARED_LOGIN_RETIRED_RESPONSE);
    }

    const result = await query(
      'SELECT * FROM users WHERE employee_id = $1 LIMIT 1',
      [employeeId]
    );
    const user = result.rows[0] || null;

    // ALWAYS execute bcrypt.compare BEFORE revealing lockout, deactivation, or unregistered status
    const hashToCompare = user && user.password_hash ? user.password_hash : DUMMY_BCRYPT_HASH;
    const passwordValid = await bcrypt.compare(password, hashToCompare);
    const credentialsMatched = Boolean(user && user.password_hash && passwordValid);

    if (!credentialsMatched) {
      await auditLog(user?.id || null, 'LOGIN_FAILED', null, {
        employeeId,
        reason: !user ? 'UNKNOWN_EMPLOYEE' : !user.password_hash ? 'NOT_REGISTERED' : 'INVALID_PASSWORD'
      }, req.ip);
      return res.status(401).json({
        error: 'Invalid Employee ID or password.',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Only AFTER password verified: enforce HRMS lifecycle lockout and manual deactivation
    const loginLifecycle = await checkMasterLifecycleAccess(user.employee_id);
    if (!loginLifecycle.allowed) {
      await auditLog(user.id, 'LOGIN_BLOCKED', null, {
        employeeId: user.employee_id,
        reason: loginLifecycle.code
      }, req.ip);
      return res.status(403).json({
        error: loginLifecycle.error,
        code: loginLifecycle.code
      });
    }

    if (user.is_active === false) {
      await auditLog(user.id, 'LOGIN_BLOCKED', null, {
        employeeId: user.employee_id,
        reason: 'ACCOUNT_DEACTIVATED'
      }, req.ip);
      return res.status(403).json({
        error: 'Account deactivated. Please contact the System Administrator or HR.',
        code: 'ACCOUNT_DEACTIVATED'
      });
    }

    // Determine active role on login:
    // 1. Root System Admin (00000) always logs into system_admin and never has an employee view
    // 2. Real employees assigned as Admin (is_system_admin = true) land on their Employee / HOD Dashboard first by default
    let activeRole = user.role;
    const hasHodAccess = await checkUserHodAccess(user);

    if (isRootAdminAccount(user.employee_id)) {
      activeRole = 'system_admin';
      if (user.role !== 'system_admin' || !user.is_system_admin) {
        await query('UPDATE users SET role = $1, is_system_admin = TRUE WHERE id = $2', ['system_admin', user.id]);
      }
      user.role = 'system_admin';
      user.is_system_admin = true;
    } else if (!isGenericSystemAccount(user.employee_id)) {
      if (activeRole === 'system_admin') {
        activeRole = hasHodAccess ? 'hod' : 'employee';
        await query('UPDATE users SET role = $1 WHERE id = $2', [activeRole, user.id]);
        user.role = activeRole;
      } else if (activeRole === 'employee' && hasHodAccess) {
        activeRole = 'hod';
        await query('UPDATE users SET role = $1 WHERE id = $2', [activeRole, user.id]);
        user.role = activeRole;
      }
    }

    await syncHodDepartment(user);

    const token = signAuthToken(user, activeRole);

    await auditLog(user.id, 'LOGIN', null, { role: activeRole }, req.ip);
    await query('UPDATE users SET last_sync = NOW() WHERE id = $1', [user.id]);

    if (!user.phone) {
      const portalRes = await query('SELECT phone FROM master_employees WHERE employee_id = $1', [user.employee_id]).catch(() => ({ rows: [] }));
      if (portalRes.rows[0]?.phone) {
        user.phone = portalRes.rows[0].phone;
        await query('UPDATE users SET phone = $1 WHERE id = $2', [user.phone, user.id]).catch(() => {});
      }
    }

    const assignedCategories = await getUserAssignedCategories(user.id);
    const isCategoryReviewer = assignedCategories.length > 0;

    res.json({
      token,
      user: {
        id: user.id,
        employeeId: user.employee_id,
        fullName: user.full_name,
        email: user.email,
        phone: user.phone || '',
        department: user.department,
        designation: user.designation,
        role: activeRole,
        isHod: hasHodAccess,
        isCategoryReviewer,
        isFeedbackReviewer: hasHodAccess || isCategoryReviewer,
        assignedCategories,
        isImcLead: user.is_imc_lead,
        isImcMember: user.is_imc_member,
        isManagementMember: user.is_management_member,
        isSystemAdmin: user.is_system_admin
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error during login.' });
  }
};

// =============================================
// LOGOUT — Immediate Server-Side JWT Revocation
// =============================================
exports.logout = async (req, res) => {
  try {
    await bumpUserTokenVersion(req.user.id);
    await auditLog(req.user.id, 'LOGOUT', null, {
      employeeId: req.user.employee_id,
      role: req.user.role
    }, req.ip);
    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to log out.' });
  }
};

// =============================================
// GET ME
// =============================================
exports.getMe = async (req, res) => {
  try {
    const result = await query(
      `SELECT id, employee_id, full_name, email, phone, department, designation, role,
              is_imc_lead, is_imc_member, is_management_member, is_system_admin
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const user = result.rows[0];
    const hasHodAccess = await checkUserHodAccess(user);

    if (isRootAdminAccount(user.employee_id)) {
      if (user.role !== 'system_admin' || !user.is_system_admin) {
        await query('UPDATE users SET role = $1, is_system_admin = TRUE WHERE id = $2', ['system_admin', user.id]);
      }
      user.role = 'system_admin';
      user.is_system_admin = true;
    } else if (!isGenericSystemAccount(user.employee_id) && user.role === 'employee' && hasHodAccess) {
      user.role = 'hod';
      await query('UPDATE users SET role = $1 WHERE id = $2', [user.role, user.id]);
    }

    await syncHodDepartment(user);
    if (!user.phone) {
      const portalRes = await query('SELECT phone FROM master_employees WHERE employee_id = $1', [user.employee_id]).catch(() => ({ rows: [] }));
      if (portalRes.rows[0]?.phone) {
        user.phone = portalRes.rows[0].phone;
        await query('UPDATE users SET phone = $1 WHERE id = $2', [user.phone, user.id]).catch(() => {});
      }
    }
    const assignedCategories = await getUserAssignedCategories(user.id);
    const isCategoryReviewer = assignedCategories.length > 0;

    res.json({
      id: user.id,
      employeeId: user.employee_id,
      fullName: user.full_name,
      email: user.email,
      phone: user.phone || '',
      department: user.department,
      designation: user.designation,
      role: user.role,
      isHod: hasHodAccess,
      isCategoryReviewer,
      isFeedbackReviewer: hasHodAccess || isCategoryReviewer,
      assignedCategories,
      isImcLead: user.is_imc_lead,
      isImcMember: user.is_imc_member,
      isManagementMember: user.is_management_member,
      isSystemAdmin: user.is_system_admin
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

// =============================================
// REQUEST ROOT ADMIN (00000) RECOVERY EMAIL CHANGE OTP
// =============================================
exports.requestAdminEmailChangeOtp = async (req, res) => {
  try {
    if (!isRootAdminAccount(req.user?.employee_id)) {
      return res.status(403).json(HRMS_CONTACT_READ_ONLY_RESPONSE);
    }

    const { currentPassword, newEmail } = req.body || {};
    const normalizedNewEmail = String(newEmail || '').trim().toLowerCase();

    if (!currentPassword || !normalizedNewEmail) {
      return res.status(400).json({ error: 'Current password and new recovery email are required.' });
    }
    if (!EMAIL_REGEX.test(normalizedNewEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const userRes = await query(
      'SELECT id, employee_id, email, password_hash FROM users WHERE id = $1 LIMIT 1',
      [req.user.id]
    );
    if (!userRes.rows.length) {
      return res.status(404).json({ error: 'User not found.' });
    }
    const user = userRes.rows[0];

    const passwordValid = user.password_hash
      ? await bcrypt.compare(String(currentPassword), user.password_hash)
      : false;
    if (!passwordValid) {
      await auditLog(user.id, 'LOGIN_FAILED', null, {
        employeeId: user.employee_id,
        context: 'admin_email_change_otp'
      }, req.ip);
      return res.status(401).json({
        error: 'Current password is incorrect.',
        code: 'INVALID_PASSWORD'
      });
    }

    if (String(user.email || '').trim().toLowerCase() === normalizedNewEmail) {
      return res.status(400).json({ error: 'New email address must be different from your current email.' });
    }

    const sent = await sendOtp(user.employee_id, normalizedNewEmail, 'admin_email_change');
    if (sent && typeof sent === 'object' && sent.code === 'OTP_COOLDOWN') {
      return res.status(429).json({
        error: `Please wait ${sent.retryAfterSeconds} seconds before requesting another OTP.`,
        code: 'OTP_COOLDOWN',
        retryAfterSeconds: sent.retryAfterSeconds
      });
    }
    if (sent === true) {
      return res.json({
        success: true,
        message: 'Verification OTP sent to your new recovery email address.'
      });
    }
    return res.status(503).json({
      error: 'Unable to deliver verification OTP email right now. Please try again shortly.',
      code: 'OTP_DELIVERY_FAILED'
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error while requesting email verification OTP.' });
  }
};

// =============================================
// UPDATE CONTACT INFO (HRMS Read-Only for Employees; Password + OTP for Root 00000 Email Only)
// =============================================
exports.updateContactInfo = async (req, res) => {
  try {
    // Email and phone are strictly HRMS-managed (read-only) for all hospital employees
    if (!isRootAdminAccount(req.user?.employee_id)) {
      return res.status(403).json(HRMS_CONTACT_READ_ONLY_RESPONSE);
    }

    const { email, newEmail, currentPassword, otp } = req.body || {};
    const targetEmail = String(newEmail || email || '').trim().toLowerCase();
    const cleanOtp = String(otp || '').trim();

    if (!targetEmail || !currentPassword || !cleanOtp) {
      return res.status(400).json({
        error: 'Current password, new email address, and verification OTP are required.',
        code: 'MISSING_FIELDS'
      });
    }
    if (!EMAIL_REGEX.test(targetEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const userRes = await query(
      'SELECT * FROM users WHERE id = $1 LIMIT 1',
      [req.user.id]
    );
    if (!userRes.rows.length) {
      return res.status(404).json({ error: 'User not found.' });
    }
    const existingUser = userRes.rows[0];

    const passwordValid = existingUser.password_hash
      ? await bcrypt.compare(String(currentPassword), existingUser.password_hash)
      : false;
    if (!passwordValid) {
      await auditLog(existingUser.id, 'LOGIN_FAILED', null, {
        employeeId: existingUser.employee_id,
        context: 'admin_email_update'
      }, req.ip);
      return res.status(401).json({
        error: 'Current password is incorrect.',
        code: 'INVALID_PASSWORD'
      });
    }

    // Verify email-bound OTP sent strictly to targetEmail
    const isValid = await verifyOtp(existingUser.employee_id, 'admin_email_change', cleanOtp, targetEmail);
    if (!isValid) {
      await auditLog(existingUser.id, 'OTP_FAILED', null, {
        employeeId: existingUser.employee_id,
        action: 'admin_email_change'
      }, req.ip);
      return res.status(400).json({ error: 'Invalid or expired OTP.', code: 'INVALID_OTP' });
    }

    // Update ONLY users.email (never phone, never master_employees) and bump token_version
    const result = await query(
      `UPDATE users
       SET email = $1,
           token_version = COALESCE(token_version, 1) + 1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING id, employee_id, full_name, email, phone, department, designation, role,
                 is_imc_lead, is_imc_member, is_management_member, is_system_admin, token_version`,
      [targetEmail, existingUser.id]
    );

    const updatedUser = result.rows[0];
    const freshToken = signAuthToken(updatedUser, updatedUser.role);

    await auditLog(updatedUser.id, 'ADMIN_EMAIL_UPDATED', null, {
      employeeId: updatedUser.employee_id,
      previousEmail: existingUser.email || null,
      newEmail: updatedUser.email
    }, req.ip);

    res.json({
      success: true,
      token: freshToken,
      user: {
        id: updatedUser.id,
        employeeId: updatedUser.employee_id,
        fullName: updatedUser.full_name,
        email: updatedUser.email || '',
        phone: updatedUser.phone || '',
        department: updatedUser.department,
        designation: updatedUser.designation,
        role: updatedUser.role,
        isImcLead: updatedUser.is_imc_lead,
        isImcMember: updatedUser.is_imc_member,
        isManagementMember: updatedUser.is_management_member,
        isSystemAdmin: updatedUser.is_system_admin
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error while updating contact info.' });
  }
};

// =============================================
// RETIRED SHARED COMMITTEE LOGINS (410 Gone)
// =============================================
exports.committeeLogin = async (req, res) => {
  return res.status(410).json(SHARED_LOGIN_RETIRED_RESPONSE);
};

exports.forgotPasswordRequest = async (req, res) => {
  return res.status(410).json(SHARED_LOGIN_RETIRED_RESPONSE);
};

exports.resetPassword = async (req, res) => {
  return res.status(410).json(SHARED_LOGIN_RETIRED_RESPONSE);
};

// =============================================
// SWITCH ROLE (HRMS Lifecycle + Valid Role Checks + tv-Bound JWT)
// =============================================
exports.switchRole = async (req, res) => {
  try {
    const { targetRole } = req.body || {};
    if (!targetRole) {
      return res.status(400).json({ error: 'Target role is required' });
    }

    const validRoles = ['employee', 'system_admin', 'imc', 'head_management', 'hod'];
    if (!validRoles.includes(targetRole)) {
      return res.status(400).json({ error: 'Invalid target role' });
    }

    const userRes = await query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userRes.rows[0];

    if (user.is_active === false) {
      return res.status(403).json({ error: 'Account deactivated.', code: 'ACCOUNT_DISABLED' });
    }

    // Enforce live HRMS lifecycle check before switching roles
    const lifecycle = await checkMasterLifecycleAccess(user.employee_id);
    if (!lifecycle.allowed) {
      return res.status(403).json({ error: lifecycle.error, code: lifecycle.code });
    }

    // Root / generic system accounts do not have an Employee or HOD view
    if (isGenericSystemAccount(user.employee_id) && (targetRole === 'employee' || targetRole === 'hod')) {
      return res.status(403).json({ error: 'The root System Admin account does not have an Employee view.' });
    }

    const hasHodAccess = await checkUserHodAccess(user);

    // Validate that the user actually holds the permissions for the target role
    if (targetRole === 'system_admin' && !user.is_system_admin) {
      return res.status(403).json({ error: 'Not authorized for System Admin role.' });
    }
    if (targetRole === 'imc' && !(user.is_imc_member || user.is_imc_lead)) {
      return res.status(403).json({ error: 'Not authorized for IMC role.' });
    }
    if (targetRole === 'head_management' && !user.is_management_member) {
      return res.status(403).json({ error: 'Not authorized for Management role.' });
    }
    if (targetRole === 'hod' && !hasHodAccess) {
      return res.status(403).json({ error: 'Not authorized for HOD role.' });
    }

    let finalTargetRole = targetRole;
    if (finalTargetRole === 'employee' && hasHodAccess) {
      finalTargetRole = 'hod';
    }

    await query('UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2', [finalTargetRole, user.id]);

    const token = signAuthToken(user, finalTargetRole);

    await auditLog(user.id, 'ROLE_SWITCH', null, { targetRole: finalTargetRole }, req.ip);

    const assignedCategories = await getUserAssignedCategories(user.id);
    const isCategoryReviewer = assignedCategories.length > 0;

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        employeeId: user.employee_id,
        fullName: user.full_name,
        email: user.email || '',
        phone: user.phone || '',
        department: user.department,
        designation: user.designation,
        role: finalTargetRole,
        isHod: hasHodAccess,
        isCategoryReviewer,
        isFeedbackReviewer: hasHodAccess || isCategoryReviewer,
        assignedCategories,
        isImcLead: user.is_imc_lead,
        isImcMember: user.is_imc_member,
        isManagementMember: user.is_management_member,
        isSystemAdmin: user.is_system_admin
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error during role switch.' });
  }
};

// =============================================
// EMPLOYEE SELF-SERVICE: Anti-Enumeration Forgot Password & Reset via OTP
// =============================================
exports.requestEmployeePasswordReset = async (req, res) => {
  try {
    let { employeeId, email } = req.body || {};
    employeeId = String(employeeId || '').trim().toUpperCase();
    const submittedEmail = String(email || '').trim().toLowerCase();

    if (!employeeId || !submittedEmail) {
      return res.status(400).json({ error: 'Employee ID and Email address are required.' });
    }

    // Never send OTP for retired shared accounts; return uniform anti-enumeration response
    if (isRetiredSharedAccount(employeeId)) {
      return res.json({ success: true, message: UNIFORM_RESET_MESSAGE });
    }

    const lifecycle = await checkMasterLifecycleAccess(employeeId);
    if (!lifecycle.allowed) {
      return res.json({ success: true, message: UNIFORM_RESET_MESSAGE });
    }

    const result = await query(
      `SELECT id, employee_id, email, is_active, password_hash
       FROM users
       WHERE employee_id = $1 AND LOWER(TRIM(email)) = $2
       LIMIT 1`,
      [employeeId, submittedEmail]
    );

    if (result.rows.length > 0) {
      const user = result.rows[0];
      if (user.is_active !== false && user.password_hash && user.email) {
        const canonicalEmail = user.email.trim().toLowerCase();
        const sent = await sendOtp(user.employee_id, canonicalEmail, 'employee_password_reset');
        await auditLog(user.id, 'PASSWORD_RESET_REQUESTED', null, {
          employeeId: user.employee_id,
          delivered: sent === true,
          cooldown: Boolean(sent && typeof sent === 'object' && sent.code === 'OTP_COOLDOWN')
        }, req.ip);
      }
    }

    // Always return identical 200 response to prevent account / email / status enumeration
    return res.json({ success: true, message: UNIFORM_RESET_MESSAGE });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.requestChangePasswordOtp = async (req, res) => {
  try {
    const result = await query('SELECT id, employee_id, email FROM users WHERE id = $1', [req.user.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'User not found.' });

    const user = result.rows[0];
    if (!user.email) return res.status(400).json({ error: 'No email address associated with your account.' });

    const sent = await sendOtp(user.employee_id, user.email.trim().toLowerCase(), 'employee_password_reset');
    if (sent && typeof sent === 'object' && sent.code === 'OTP_COOLDOWN') {
      return res.status(429).json({
        error: `Please wait ${sent.retryAfterSeconds} seconds before requesting another OTP.`,
        code: 'OTP_COOLDOWN',
        retryAfterSeconds: sent.retryAfterSeconds
      });
    }
    if (sent === true) {
      return res.json({ success: true, message: 'OTP sent to your registered email address.' });
    }
    return res.status(503).json({
      error: 'Unable to deliver verification OTP email right now. Please try again shortly.',
      code: 'OTP_DELIVERY_FAILED'
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.resetEmployeePassword = async (req, res) => {
  try {
    let { employeeId, otp, newPassword } = req.body || {};
    employeeId = String(employeeId || '').trim().toUpperCase();
    const cleanOtp = String(otp || '').trim();

    if (!employeeId || !cleanOtp || !newPassword) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    if (isRetiredSharedAccount(employeeId)) {
      return res.status(410).json(SHARED_LOGIN_RETIRED_RESPONSE);
    }

    const empResetPwCheck = validatePasswordStrength(newPassword);
    if (!empResetPwCheck.valid) {
      return res.status(400).json({ error: empResetPwCheck.error, code: 'WEAK_PASSWORD' });
    }

    const lifecycle = await checkMasterLifecycleAccess(employeeId);
    const existingUserRes = await query(
      'SELECT id, employee_id, email, is_active, password_hash FROM users WHERE employee_id = $1 LIMIT 1',
      [employeeId]
    );

    const existingUser = existingUserRes.rows[0] || null;
    if (
      !lifecycle.allowed ||
      !existingUser ||
      existingUser.is_active === false ||
      !existingUser.password_hash ||
      !existingUser.email
    ) {
      await auditLog(existingUser?.id || null, 'OTP_FAILED', null, {
        employeeId,
        action: 'employee_password_reset',
        reason: 'ACCOUNT_INELIGIBLE'
      }, req.ip);
      return res.status(400).json({ error: 'Invalid or expired OTP.', code: 'INVALID_OTP' });
    }

    // Verify email-bound OTP FIRST (before password-reuse check so unauthenticated callers cannot probe current password),
    // and only consume/delete the OTP when the new password is NOT a reuse of the current password.
    const canonicalEmail = existingUser.email.trim().toLowerCase();
    let isReused = false;
    const isValid = await verifyOtp(employeeId, 'employee_password_reset', cleanOtp, canonicalEmail, {
      shouldConsume: async () => {
        isReused = await bcrypt.compare(newPassword, existingUser.password_hash);
        return !isReused;
      }
    });
    if (!isValid) {
      await auditLog(existingUser.id, 'OTP_FAILED', null, {
        employeeId,
        action: 'employee_password_reset'
      }, req.ip);
      return res.status(400).json({ error: 'Invalid or expired OTP.', code: 'INVALID_OTP' });
    }

    // Block password reuse (OTP remains intact until expiry or successful reset)
    if (isReused) {
      return res.status(400).json({
        error: 'New password must be different from your current password.',
        code: 'PASSWORD_REUSE'
      });
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await query(
      `UPDATE users
       SET password_hash = $1,
           token_version = COALESCE(token_version, 1) + 1,
           updated_at = NOW()
       WHERE id = $2`,
      [hash, existingUser.id]
    );

    await auditLog(existingUser.id, 'EMPLOYEE_PASSWORD_RESET', null, { employeeId }, req.ip);
    res.json({ success: true, message: 'Password reset successfully. Please login.' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

// =============================================
// GET COMMITTEE MEMBERS (IMC, Admin, Management — RBAC Restricted)
// =============================================
exports.getCommitteeMembers = async (req, res) => {
  try {
    const result = await query(
      `SELECT id, employee_id, full_name, department, designation, role,
              is_imc_lead, is_imc_member, is_management_member, is_system_admin
       FROM users
       WHERE (is_imc_member = TRUE OR role = 'imc'
          OR is_management_member = TRUE OR role = 'head_management'
          OR is_system_admin = TRUE OR role = 'system_admin')
         AND employee_id NOT LIKE 'SYS_%'
       ORDER BY full_name ASC`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch committee members.' });
  }
};

// =============================================
// LEAVE ROLE (Remove self from Management / System Admin + Revoke Elevated JWTs)
// =============================================
exports.leaveRole = async (req, res) => {
  try {
    const { targetRole } = req.body || {};
    if (!targetRole) return res.status(400).json({ error: 'Target role is required' });

    const userId = req.user.id;
    const prevUserRes = await query('SELECT * FROM users WHERE id = $1', [userId]);
    if (!prevUserRes.rows.length) return res.status(404).json({ error: 'User not found' });
    const prevUser = prevUserRes.rows[0];

    if (isGenericSystemAccount(prevUser.employee_id)) {
      return res.status(403).json({ error: 'The root System Admin account cannot leave its system role.' });
    }

    const hasHodAccess = await checkUserHodAccess(prevUser);
    const baseRole = hasHodAccess ? 'hod' : 'employee';

    if (targetRole === 'imc') {
      return res.status(403).json({ error: 'Self-removal from IMC is disabled. Only System Administrators have the authority to revoke or assign IMC committee membership.' });
    } else if (targetRole === 'head_management') {
      await query(
        `UPDATE users SET is_management_member = FALSE,
                          role = CASE WHEN role = 'head_management' THEN $2 ELSE role END,
                          token_version = COALESCE(token_version, 1) + 1,
                          updated_at = NOW() WHERE id = $1`,
        [userId, baseRole]
      );
    } else if (targetRole === 'system_admin') {
      await query(
        `UPDATE users SET is_system_admin = FALSE,
                          role = CASE WHEN role = 'system_admin' THEN $2 ELSE role END,
                          token_version = COALESCE(token_version, 1) + 1,
                          updated_at = NOW() WHERE id = $1`,
        [userId, baseRole]
      );
    } else {
      return res.status(400).json({ error: 'Cannot leave this role' });
    }

    await auditLog(userId, 'ROLE_LEFT', null, { targetRole, previousRole: prevUser.role }, req.ip);

    const updatedRes = await query(
      `SELECT id, employee_id, full_name, email, phone, department, designation, role,
              is_imc_lead, is_imc_member, is_management_member, is_system_admin, token_version
       FROM users WHERE id = $1`,
      [userId]
    );
    const updatedUser = updatedRes.rows[0];

    // Generate new token bound to bumped token_version (immediately invalidates old elevated tokens)
    const token = signAuthToken(updatedUser, updatedUser.role);

    const assignedCategories = await getUserAssignedCategories(updatedUser.id);
    const isCategoryReviewer = assignedCategories.length > 0;

    res.json({
      success: true,
      token,
      user: {
        id: updatedUser.id,
        employeeId: updatedUser.employee_id,
        fullName: updatedUser.full_name,
        email: updatedUser.email || '',
        phone: updatedUser.phone || '',
        department: updatedUser.department,
        designation: updatedUser.designation,
        role: updatedUser.role,
        isHod: hasHodAccess,
        isCategoryReviewer,
        isFeedbackReviewer: hasHodAccess || isCategoryReviewer,
        assignedCategories,
        isImcLead: updatedUser.is_imc_lead,
        isImcMember: updatedUser.is_imc_member,
        isManagementMember: updatedUser.is_management_member,
        isSystemAdmin: updatedUser.is_system_admin
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to leave role.' });
  }
};

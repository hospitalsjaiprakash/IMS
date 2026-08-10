const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { query } = require('../config/database');
const { auditLog } = require('../middleware/auth');
const { sendEmail } = require('../utils/emailService');

// ─── Helper: Check if user is HOD based on role or designation ──────────────
const isUserHod = (user) => {
  if (user?.role === 'hod') return true;
  const desig = (user?.designation || '').toUpperCase();
  return desig === 'HOD' || desig.includes('HEAD OF DEPARTMENT') || desig.includes('HEAD OF DEPT');
};

const syncHodDepartment = async (user) => {
  try {
    if (user && isUserHod(user) && user.department) {
      await query(
        `UPDATE departments SET hod_user_id = $1
         WHERE LOWER(name) = LOWER($2) AND (hod_user_id IS NULL OR hod_user_id != $1)`,
        [user.id, user.department.trim()]
      );
    }
  } catch (err) {
    console.error('Failed to sync HOD department:', err.message);
  }
};

// ─── Welcome Email Template ───────────────────────────────────────────────────
const welcomeEmailTemplate = (user) => ({
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
            <p style="margin:0;color:#6ee7b7;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;">Jaiprakash Hospital & Research Centre</p>
            <h1 style="margin:4px 0 0;color:#fff;font-size:20px;font-weight:700;">Incident Management System</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:36px;">
            <h2 style="color:#065f46;font-size:24px;margin:0 0 8px;">Welcome, ${user.full_name}! 🎉</h2>
            <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 24px;">Your JPHRC IMS account has been successfully created. You can now log in to report incidents, track their status, and stay informed throughout the resolution process.</p>
            
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #059669;border-radius:8px;padding:20px;margin:0 0 24px;">
              <p style="margin:0 0 12px;color:#64748b;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Your Account Details</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:4px 0;color:#64748b;font-size:13px;width:140px;">Employee ID</td><td style="padding:4px 0;color:#0f172a;font-size:13px;font-weight:700;font-family:monospace;">${user.employee_id}</td></tr>
                <tr><td style="padding:4px 0;color:#64748b;font-size:13px;">Full Name</td><td style="padding:4px 0;color:#0f172a;font-size:13px;font-weight:600;">${user.full_name}</td></tr>
                <tr><td style="padding:4px 0;color:#64748b;font-size:13px;">Department</td><td style="padding:4px 0;color:#0f172a;font-size:13px;">${user.department || 'Not assigned'}</td></tr>
                <tr><td style="padding:4px 0;color:#64748b;font-size:13px;">Role</td><td style="padding:4px 0;color:#0f172a;font-size:13px;text-transform:capitalize;">${user.role || 'employee'}</td></tr>
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
            <p style="margin:6px 0 0;color:#cbd5e1;font-size:11px;">© ${new Date().getFullYear()} Jaiprakash Hospital & Research Centre</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
`
});

// =============================================
// REGISTER — Create new employee account
// =============================================
exports.register = async (req, res) => {
  try {
    const { fullName, employeeId, whatsapp, email, password } = req.body;

    // Basic validation
    if (!fullName?.trim() || !employeeId?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ error: 'Full name, Employee ID, email, and password are required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    // Check if employee ID already has a password set (already registered)
    const existing = await query(
      'SELECT id, employee_id, password_hash FROM users WHERE employee_id = $1',
      [employeeId.trim()]
    );

    if (existing.rows.length > 0 && existing.rows[0].password_hash) {
      return res.status(409).json({
        error: 'An account with this Employee ID already exists. Please login instead.',
        code: 'ALREADY_REGISTERED'
      });
    }

    // If user exists in DB (pre-seeded from office portal), validate name match
    if (existing.rows.length > 0) {
      const dbUser = existing.rows[0];
      // Get full record
      const fullRecord = await query('SELECT * FROM users WHERE id = $1', [dbUser.id]);
      const record = fullRecord.rows[0];

      // Validate name matches (case-insensitive, partial OK)
      const nameMatch = record.full_name.toLowerCase().includes(fullName.trim().toLowerCase()) ||
                        fullName.trim().toLowerCase().includes(record.full_name.toLowerCase());

      if (!nameMatch) {
        return res.status(401).json({
          error: 'Name does not match our records for this Employee ID. Contact HR if you believe this is incorrect.',
          code: 'NAME_MISMATCH'
        });
      }

      // Hash password and update record
      const passwordHash = await bcrypt.hash(password, 12);

      const portalCheck = await query('SELECT phone FROM office_portal_employees WHERE employee_id = $1', [record.employee_id]).catch(() => ({ rows: [] }));
      const portalPhone = portalCheck.rows[0]?.phone || null;

      const updatedUser = await query(
        `UPDATE users SET
          password_hash = $1,
          email = COALESCE(NULLIF($2, ''), email),
          whatsapp = COALESCE(NULLIF($3, ''), whatsapp),
          full_name = COALESCE(NULLIF($4, ''), full_name),
          phone = COALESCE(phone, $5),
          updated_at = NOW()
         WHERE id = $6
         RETURNING *`,
        [passwordHash, email.trim(), whatsapp?.trim() || null, fullName.trim(), portalPhone, record.id]
      );

      const user = updatedUser.rows[0];

      // Send welcome email (fire and forget)
      if (user.email) {
        sendEmail(user.email, welcomeEmailTemplate(user)).catch(() => {});
      }

      await auditLog(user.id, 'ACCOUNT_REGISTERED', null, {
        employeeId: user.employee_id, method: 'db_match'
      }, req.ip);

      return res.status(201).json({
        success: true,
        message: 'Account created successfully! A welcome email has been sent. Please login.',
        employeeId: user.employee_id
      });
    }

    // Employee ID NOT in DB — try Office Portal API
    let portalData = null;
    if (process.env.OFFICE_PORTAL_API_URL) {
      try {
        const response = await require('axios').post(
          `${process.env.OFFICE_PORTAL_API_URL}/validate-employee`,
          { name: fullName, employeeId },
          { timeout: parseInt(process.env.OFFICE_PORTAL_API_TIMEOUT || '5000') }
        );
        if (response.data?.valid) {
          portalData = response.data.data;
        }
      } catch (err) {
        // Portal unavailable — fall through to error
      }
    }

    // If external portal failed or not running, check local Office Portal DB table
    if (!portalData) {
      try {
        const mockRes = await query(
          'SELECT employee_id, name, email, phone, department, designation, role FROM office_portal_employees WHERE employee_id = $1',
          [employeeId.trim()]
        );
        if (mockRes.rows.length > 0) {
          portalData = mockRes.rows[0];
        }
      } catch (mockErr) {
        // Fallback table check failed
      }
    }

    if (!portalData) {
      return res.status(404).json({
        error: 'Employee ID not found in hospital records. Please contact HR or the System Administrator.',
        code: 'EMPLOYEE_NOT_FOUND'
      });
    }

    // Validate name from portal
    const nameMatch = portalData.name?.toLowerCase().includes(fullName.trim().toLowerCase()) ||
                      fullName.trim().toLowerCase().includes(portalData.name?.toLowerCase());
    if (!nameMatch) {
      return res.status(401).json({
        error: 'Name does not match portal records for this Employee ID.',
        code: 'NAME_MISMATCH'
      });
    }

    // Create new user from portal data + supplied info
    const passwordHash = await bcrypt.hash(password, 12);

    // Automatically assign 'hod' role if designation is HOD (does not override system_admin or committee roles)
    let assignedRole = portalData.role || 'employee';
    const desig = (portalData.designation || '').toUpperCase();
    if (assignedRole === 'employee' && (desig === 'HOD' || desig.includes('HEAD OF DEPARTMENT') || desig.includes('HEAD OF DEPT'))) {
      assignedRole = 'hod';
    }

    const newUser = await query(
      `INSERT INTO users (employee_id, full_name, email, phone, whatsapp, department, designation, role, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        employeeId.trim(),
        portalData.name || fullName.trim(),
        email.trim(),
        portalData.phone || null,
        whatsapp?.trim() || portalData.whatsapp || null,
        portalData.department || null,
        portalData.designation || null,
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
      employeeId: user.employee_id, method: 'portal'
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
// LOGIN — Employee ID + Password
// =============================================
exports.login = async (req, res) => {
  try {
    const { employeeId, password } = req.body;

    if (!employeeId?.trim() || !password) {
      return res.status(400).json({ error: 'Employee ID and password are required.' });
    }

    // Find user by employee ID
    const result = await query(
      'SELECT * FROM users WHERE employee_id = $1',
      [employeeId.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: 'Invalid Employee ID or password.',
        code: 'INVALID_CREDENTIALS'
      });
    }

    const user = result.rows[0];

    // Check if account is active
    if (user.is_active === false) {
      return res.status(401).json({
        error: 'Account deactivated. Please contact Digital Communications department.',
        code: 'ACCOUNT_DEACTIVATED'
      });
    }

    // Must have a password set (registered)
    if (!user.password_hash) {
      return res.status(401).json({
        error: 'Account not yet activated. Please register first to set your password.',
        code: 'NOT_REGISTERED'
      });
    }

    // Verify password
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      return res.status(401).json({
        error: 'Invalid Employee ID or password.',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Since this is the Employee Portal login (/login), if DB role is currently an administrative or committee role, default to employee view
    let activeRole = user.role;
    if (['system_admin', 'imc', 'head_management'].includes(activeRole)) {
      activeRole = isUserHod(user) ? 'hod' : 'employee';
      await query('UPDATE users SET role = $1 WHERE id = $2', [activeRole, user.id]);
      user.role = activeRole;
    } else if (activeRole === 'employee' && isUserHod(user)) {
      activeRole = 'hod';
      await query('UPDATE users SET role = $1 WHERE id = $2', [activeRole, user.id]);
      user.role = activeRole;
    }

    await syncHodDepartment(user);

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, employeeId: user.employee_id, role: activeRole },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    // Update last_sync
    await query('UPDATE users SET last_sync = NOW() WHERE id = $1', [user.id]);

    if (!user.phone) {
      const portalRes = await query('SELECT phone FROM office_portal_employees WHERE employee_id = $1', [user.employee_id]).catch(() => ({ rows: [] }));
      if (portalRes.rows[0]?.phone) {
        user.phone = portalRes.rows[0].phone;
        await query('UPDATE users SET phone = $1 WHERE id = $2', [user.phone, user.id]).catch(() => {});
      }
    }

    res.json({
      token,
      user: {
        id: user.id,
        employeeId: user.employee_id,
        fullName: user.full_name,
        email: user.email,
        phone: user.phone || '',
        whatsapp: user.whatsapp || '',
        department: user.department,
        designation: user.designation,
        role: activeRole,
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
// GET ME
// =============================================
exports.getMe = async (req, res) => {
  try {
    const result = await query(
      `SELECT id, employee_id, full_name, email, phone, whatsapp, department, designation, role,
              is_imc_lead, is_imc_member, is_management_member, is_system_admin, whatsapp_notifications
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const user = result.rows[0];
    if (user.role === 'employee' && isUserHod(user)) {
      user.role = 'hod';
      await query('UPDATE users SET role = $1 WHERE id = $2', [user.role, user.id]);
    }
    await syncHodDepartment(user);
    if (!user.phone) {
      const portalRes = await query('SELECT phone FROM office_portal_employees WHERE employee_id = $1', [user.employee_id]).catch(() => ({ rows: [] }));
      if (portalRes.rows[0]?.phone) {
        user.phone = portalRes.rows[0].phone;
        await query('UPDATE users SET phone = $1 WHERE id = $2', [user.phone, user.id]).catch(() => {});
      }
    }
    res.json({
      id: user.id,
      employeeId: user.employee_id,
      fullName: user.full_name,
      email: user.email,
      phone: user.phone || '',
      whatsapp: user.whatsapp || '',
      department: user.department,
      designation: user.designation,
      role: user.role,
      isImcLead: user.is_imc_lead,
      isImcMember: user.is_imc_member,
      isManagementMember: user.is_management_member,
      isSystemAdmin: user.is_system_admin,
      whatsappNotifications: user.whatsapp_notifications
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

// =============================================
// UPDATE NOTIFICATION PREFS
// =============================================
exports.updateNotificationPrefs = async (req, res) => {
  try {
    const { whatsappNotifications } = req.body;
    await query(
      'UPDATE users SET whatsapp_notifications = $1, updated_at = NOW() WHERE id = $2',
      [whatsappNotifications, req.user.id]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

// =============================================
// UPDATE CONTACT INFO (Email, Phone & WhatsApp)
// =============================================
exports.updateContactInfo = async (req, res) => {
  try {
    const { email, whatsapp, phone } = req.body;

    // Check if user is allowed (employee or hod or any logged in user)
    if (!['employee', 'hod', 'imc', 'head_management', 'system_admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Not authorized to update profile information' });
    }

    // Validate email basic structure if provided
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    // Update in DB
    const result = await query(
      `UPDATE users 
       SET email = $1, whatsapp = $2, phone = COALESCE($3, phone), updated_at = NOW() 
       WHERE id = $4 
       RETURNING id, employee_id, full_name, email, phone, whatsapp, department, designation, role, is_imc_lead, is_imc_member, is_management_member, is_system_admin, whatsapp_notifications`,
      [email ? email.trim() : null, whatsapp ? whatsapp.trim() : null, phone ? phone.trim() : null, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updatedUser = result.rows[0];

    // Also update office_portal_employees if present so it stays in sync
    await query(
      `UPDATE office_portal_employees SET email = $1, phone = COALESCE($2, phone) WHERE employee_id = $3`,
      [updatedUser.email, updatedUser.phone, updatedUser.employee_id]
    ).catch(() => {});

    res.json({
      success: true,
      user: {
        id: updatedUser.id,
        employeeId: updatedUser.employee_id,
        fullName: updatedUser.full_name,
        email: updatedUser.email || '',
        phone: updatedUser.phone || '',
        whatsapp: updatedUser.whatsapp || '',
        department: updatedUser.department,
        designation: updatedUser.designation,
        role: updatedUser.role,
        isImcLead: updatedUser.is_imc_lead,
        isImcMember: updatedUser.is_imc_member,
        isManagementMember: updatedUser.is_management_member,
        isSystemAdmin: updatedUser.is_system_admin,
        whatsappNotifications: updatedUser.whatsapp_notifications
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error while updating contact info.' });
  }
};

// =============================================
// COMMITTEE LOGIN (IMC / Management / Admin)
// =============================================
const roleToGenericUser = {
  system_admin: 'SYS_ADMIN',
  imc: 'SYS_IMC',
  head_management: 'SYS_MGMT'
};

exports.committeeLogin = async (req, res) => {
  try {
    const { username, password, targetRole } = req.body;
    if (!username || !password || !targetRole) {
      return res.status(400).json({ error: 'Username, password, and role are required' });
    }

    const credRes = await query('SELECT * FROM role_credentials WHERE role = $1', [targetRole]);
    if (credRes.rows.length === 0) {
      return res.status(401).json({ error: 'Role credentials not configured in system' });
    }

    const roleCred = credRes.rows[0];
    const isUsernameValid = username === roleCred.username;
    let isPasswordValid = false;

    if (isUsernameValid) {
      isPasswordValid = await bcrypt.compare(password, roleCred.password_hash);
    }

    if (!isUsernameValid || !isPasswordValid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const genericEmpId = roleToGenericUser[targetRole];
    const userRes = await query('SELECT * FROM users WHERE employee_id = $1', [genericEmpId]);
    if (userRes.rows.length === 0) {
      return res.status(500).json({ error: 'System configuration error: Generic user missing' });
    }
    const user = userRes.rows[0];

    const token = jwt.sign(
      { userId: user.id, employeeId: user.employee_id, role: targetRole },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    await auditLog(user.id, 'COMMITTEE_LOGIN', null, { targetRole }, req.ip);

    res.json({
      token,
      user: {
        id: user.id,
        employeeId: user.employee_id,
        fullName: user.full_name,
        email: user.email || '',
        phone: user.phone || '',
        whatsapp: user.whatsapp || '',
        department: user.department,
        designation: user.designation,
        role: targetRole,
        isImcLead: user.is_imc_lead,
        isImcMember: user.is_imc_member,
        isManagementMember: user.is_management_member,
        isSystemAdmin: user.is_system_admin,
        whatsappNotifications: user.whatsapp_notifications
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error during committee login.' });
  }
};

// =============================================
// SWITCH ROLE (Requires user password verification)
// =============================================
exports.switchRole = async (req, res) => {
  try {
    const { password, targetRole } = req.body;
    if (!password || !targetRole) {
      return res.status(400).json({ error: 'Password and target role are required' });
    }

    const userRes = await query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userRes.rows[0];

    if (user.is_active === false) {
      return res.status(401).json({ error: 'Account deactivated.' });
    }

    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      return res.status(401).json({ error: 'Incorrect login password.' });
    }

    const validRoles = ['employee', 'system_admin', 'imc', 'head_management', 'hod'];
    if (!validRoles.includes(targetRole)) {
      return res.status(400).json({ error: 'Invalid target role' });
    }

    let finalTargetRole = targetRole;
    if (finalTargetRole === 'employee' && isUserHod(user)) {
      finalTargetRole = 'hod';
    }

    await query('UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2', [finalTargetRole, user.id]);

    const token = jwt.sign(
      { userId: user.id, employeeId: user.employee_id, role: finalTargetRole },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    await auditLog(user.id, 'ROLE_SWITCH', null, { targetRole: finalTargetRole }, req.ip);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        employeeId: user.employee_id,
        fullName: user.full_name,
        email: user.email || '',
        phone: user.phone || '',
        whatsapp: user.whatsapp || '',
        department: user.department,
        designation: user.designation,
        role: finalTargetRole,
        isImcLead: user.is_imc_lead,
        isImcMember: user.is_imc_member,
        isManagementMember: user.is_management_member,
        isSystemAdmin: user.is_system_admin,
        whatsappNotifications: user.whatsapp_notifications
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error during role switch.' });
  }
};

// =============================================
// FORGOT PASSWORD / RESET (OTP via email)
// =============================================
const { sendOtp, verifyOtp } = require('../utils/otpService');

exports.forgotPasswordRequest = async (req, res) => {
  try {
    const { username, targetRole } = req.body;
    if (!username || !targetRole) {
      return res.status(400).json({ error: 'Username and Role are required' });
    }

    const credRes = await query('SELECT * FROM role_credentials WHERE role = $1 AND username = $2', [targetRole, username]);
    if (credRes.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid username for the selected role' });
    }

    const genericEmpId = roleToGenericUser[targetRole];
    const userRes = await query('SELECT * FROM users WHERE employee_id = $1', [genericEmpId]);
    if (userRes.rows.length === 0) {
      return res.status(500).json({ error: 'System configuration error: Generic user missing' });
    }
    const user = userRes.rows[0];

    if (!user.email) {
      return res.status(400).json({ error: 'No email address registered for this system account.' });
    }

    const sent = await sendOtp(genericEmpId, user.email, 'password_reset');
    if (sent) {
      res.json({ success: true, message: 'OTP sent to registered email.' });
    } else {
      res.status(500).json({ error: 'Failed to send OTP email.' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Internal server error while processing forgot password request.' });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { username, targetRole, otp, newPassword } = req.body;
    if (!username || !targetRole || !otp || !newPassword) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const genericEmpId = roleToGenericUser[targetRole];
    const isValid = verifyOtp(genericEmpId, 'password_reset', otp);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    const credRes = await query('SELECT * FROM role_credentials WHERE role = $1 AND username = $2', [targetRole, username]);
    if (credRes.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid username' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await query('UPDATE role_credentials SET password_hash = $1, updated_at = NOW() WHERE role = $2', [hash, targetRole]);

    const userRes = await query('SELECT id FROM users WHERE employee_id = $1', [genericEmpId]);
    if (userRes.rows.length > 0) {
      await auditLog(userRes.rows[0].id, 'PASSWORD_RESET', null, { targetRole }, req.ip);
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error during password reset.' });
  }
};

// =============================================
// EMPLOYEE SELF-SERVICE: Reset own password via OTP
// =============================================
exports.requestEmployeePasswordReset = async (req, res) => {
  try {
    const { employeeId, email } = req.body;
    if (!employeeId || !email) {
      return res.status(400).json({ error: 'Employee ID and Email address are required.' });
    }

    const result = await query('SELECT * FROM users WHERE employee_id = $1 AND LOWER(email) = LOWER($2)', [employeeId.trim(), email.trim()]);
    if (!result.rows.length) {
      return res.status(404).json({ error: 'No account found matching this Employee ID and Email address.' });
    }

    const user = result.rows[0];
    await sendOtp(employeeId.trim(), user.email, 'employee_password_reset');
    res.json({ success: true, message: 'OTP sent to your registered email address.' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.requestChangePasswordOtp = async (req, res) => {
  try {
    const result = await query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'User not found.' });
    
    const user = result.rows[0];
    if (!user.email) return res.status(400).json({ error: 'No email address associated with your account.' });

    await sendOtp(user.employee_id, user.email, 'employee_password_reset');
    res.json({ success: true, message: 'OTP sent to your registered email address.' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.resetEmployeePassword = async (req, res) => {
  try {
    const { employeeId, otp, newPassword } = req.body;
    if (!employeeId || !otp || !newPassword) {
      return res.status(400).json({ error: 'All fields are required.' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const isValid = verifyOtp(employeeId.trim(), 'employee_password_reset', otp.trim());
    if (!isValid) return res.status(400).json({ error: 'Invalid or expired OTP.' });

    const hash = await bcrypt.hash(newPassword, 12);
    const result = await query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE employee_id = $2 RETURNING id',
      [hash, employeeId.trim()]
    );

    if (!result.rows.length) return res.status(404).json({ error: 'Employee not found.' });

    await auditLog(result.rows[0].id, 'EMPLOYEE_PASSWORD_RESET', null, {}, req.ip);
    res.json({ success: true, message: 'Password reset successfully. Please login.' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

// =============================================
// GET COMMITTEE MEMBERS (IMC, Admin, Management)
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
// LEAVE ROLE (Remove self from IMC / Management)
// =============================================
exports.leaveRole = async (req, res) => {
  try {
    const { targetRole } = req.body;
    if (!targetRole) return res.status(400).json({ error: 'Target role is required' });

    const userId = req.user.id;
    const prevUserRes = await query('SELECT * FROM users WHERE id = $1', [userId]);
    if (!prevUserRes.rows.length) return res.status(404).json({ error: 'User not found' });
    const prevUser = prevUserRes.rows[0];

    const baseRole = isUserHod(prevUser) ? 'hod' : 'employee';

    if (targetRole === 'imc') {
      return res.status(403).json({ error: 'Self-removal from IMC is disabled. Only System Administrators have the authority to revoke or assign IMC committee membership.' });
    } else if (targetRole === 'head_management') {
      await query(
        `UPDATE users SET is_management_member = FALSE,
                          role = CASE WHEN role = 'head_management' THEN $2 ELSE role END,
                          updated_at = NOW() WHERE id = $1`,
        [userId, baseRole]
      );
    } else if (targetRole === 'system_admin') {
      await query(
        `UPDATE users SET is_system_admin = FALSE,
                          role = CASE WHEN role = 'system_admin' THEN $2 ELSE role END,
                          updated_at = NOW() WHERE id = $1`,
        [userId, baseRole]
      );
    } else {
      return res.status(400).json({ error: 'Cannot leave this role' });
    }

    await auditLog(userId, 'ROLE_LEFT', null, { targetRole, previousRole: prevUser.role }, req.ip);

    const updatedRes = await query(
      `SELECT id, employee_id, full_name, email, department, designation, role,
              is_imc_lead, is_imc_member, is_management_member, is_system_admin
       FROM users WHERE id = $1`,
      [userId]
    );
    const updatedUser = updatedRes.rows[0];

    // Generate new token reflecting updated role
    const token = jwt.sign(
      { id: updatedUser.id, role: updatedUser.role, employeeId: updatedUser.employee_id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: updatedUser.id,
        employeeId: updatedUser.employee_id,
        fullName: updatedUser.full_name,
        email: updatedUser.email || '',
        phone: updatedUser.phone || '',
        whatsapp: updatedUser.whatsapp || '',
        department: updatedUser.department,
        designation: updatedUser.designation,
        role: updatedUser.role,
        isImcLead: updatedUser.is_imc_lead,
        isImcMember: updatedUser.is_imc_member,
        isManagementMember: updatedUser.is_management_member,
        isSystemAdmin: updatedUser.is_system_admin,
        whatsappNotifications: updatedUser.whatsapp_notifications
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to leave role.' });
  }
};

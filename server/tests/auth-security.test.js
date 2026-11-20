const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { io: ioClient } = require('../../client/node_modules/socket.io-client');

process.env.NODE_ENV = 'test';
process.env.EMAIL_SAFE_MODE = 'mock';

const { app, server } = require('../index');
const { query, pool } = require('../config/database');
const transporter = require('../config/mail');
const { sendOtp, verifyOtp, computeOtpMac } = require('../utils/otpService');
const { welcomeEmailTemplate, validatePasswordStrength } = require('../controllers/authController');

function signJwt(user, extra = {}) {
  return jwt.sign(
    {
      userId: user.id,
      employeeId: user.employee_id,
      role: user.role,
      tv: typeof user.token_version === 'number' ? user.token_version : 1,
      ...extra
    },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' }
  );
}

describe('Auth Security Hardening Verification Suite (Risks #1-#11)', () => {
  const tag = `AUTHSEC_${Date.now().toString(36).toUpperCase()}`;
  const createdUserIds = [];
  const createdMasterEmpIds = [];
  const createdOtpEmpIds = [];

  let adminUser;
  let adminToken;
  let activeEmp;
  let activeEmpPassword = 'ActiveUser#99';
  let terminatedEmp;
  let terminatedEmpPassword = 'TermUser#99';
  let imcRevokeEmp;
  let mgmtLeaveEmp;

  const seedMasterAndUser = async ({
    suffix,
    email,
    role = 'employee',
    status = 'active',
    password = null,
    isActive = true,
    isAdmin = false,
    isImc = false,
    isMgmt = false,
    createUserRow = true
  }) => {
    const empId = `${tag}_${suffix}`;
    const fullName = `AuthTest ${suffix} ${tag}`;

    await query(
      `INSERT INTO master_employees (employee_id, name, email, phone, department, designation, role, status, portal_access_disable_date)
       VALUES ($1, $2, $3, '9876500001', 'Quality Assurance', 'Staff', $4, $5, $6)`,
      [
        empId,
        fullName,
        email,
        role,
        status,
        status === 'terminated' ? '2020-01-01' : null
      ]
    );
    createdMasterEmpIds.push(empId);
    createdOtpEmpIds.push(empId);

    if (!createUserRow) {
      return { employee_id: empId, full_name: fullName, email };
    }

    const passwordHash = password ? await bcrypt.hash(password, 10) : null;
    const uRes = await query(
      `INSERT INTO users (employee_id, full_name, email, phone, department, designation, role, password_hash, is_active, is_system_admin, is_imc_member, is_imc_lead, is_management_member, token_version)
       VALUES ($1, $2, $3, '9876500001', 'Quality Assurance', 'Staff', $4, $5, $6, $7, $8, $8, $9, 1)
       RETURNING *`,
      [empId, fullName, email, role, passwordHash, isActive, isAdmin, isImc, isMgmt]
    );
    createdUserIds.push(uRes.rows[0].id);
    return uRes.rows[0];
  };

  before(async () => {
    adminUser = await seedMasterAndUser({
      suffix: 'ADMIN',
      email: `${tag.toLowerCase()}_admin@jphrc.test`,
      role: 'system_admin',
      password: 'AdminUser#99',
      isAdmin: true
    });
    adminToken = signJwt(adminUser);

    activeEmp = await seedMasterAndUser({
      suffix: 'ACT',
      email: `${tag.toLowerCase()}_act@jphrc.test`,
      role: 'employee',
      password: activeEmpPassword
    });

    terminatedEmp = await seedMasterAndUser({
      suffix: 'TRM',
      email: `${tag.toLowerCase()}_trm@jphrc.test`,
      role: 'employee',
      status: 'terminated',
      password: terminatedEmpPassword,
      isActive: false
    });

    imcRevokeEmp = await seedMasterAndUser({
      suffix: 'IMCREV',
      email: `${tag.toLowerCase()}_imcrev@jphrc.test`,
      role: 'imc',
      password: 'ImcRevoke#99',
      isImc: true
    });

    mgmtLeaveEmp = await seedMasterAndUser({
      suffix: 'MGMTLV',
      email: `${tag.toLowerCase()}_mgmtlv@jphrc.test`,
      role: 'head_management',
      password: 'MgmtLeave#99',
      isMgmt: true
    });
  });

  after(async () => {
    if (createdOtpEmpIds.length) {
      await query('DELETE FROM security_otps WHERE employee_id = ANY($1::text[])', [createdOtpEmpIds]).catch(() => {});
    }
    if (createdUserIds.length) {
      await query('DELETE FROM role_audit WHERE employee_id = ANY($1::uuid[]) OR changed_by = ANY($1::uuid[])', [createdUserIds]).catch(() => {});
      await query('DELETE FROM audit_logs WHERE user_id = ANY($1::uuid[])', [createdUserIds]).catch(() => {});
      await query('DELETE FROM users WHERE id = ANY($1::uuid[])', [createdUserIds]).catch(() => {});
    }
    if (createdMasterEmpIds.length) {
      await query('DELETE FROM audit_logs WHERE details->>\'employeeId\' = ANY($1::text[])', [createdMasterEmpIds]).catch(() => {});
      await query('DELETE FROM master_employees WHERE employee_id = ANY($1::text[])', [createdMasterEmpIds]).catch(() => {});
    }
    await pool.end();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // RISK #1: Mandatory HRMS Email & Email-Bound OTP on Registration
  // ─────────────────────────────────────────────────────────────────────────
  test('Risk #1: blocks registration if HRMS email is missing/mismatched and binds registration OTP strictly to HRMS email', async () => {
    const noEmailEmp = await seedMasterAndUser({
      suffix: 'NOEMAIL',
      email: null,
      createUserRow: false
    });
    const realEmail = `${tag.toLowerCase()}_real@jphrc.test`;
    const realEmp = await seedMasterAndUser({
      suffix: 'REALMAIL',
      email: realEmail,
      createUserRow: false
    });

    // 1. Employee with master_employees.email = NULL is blocked from /register-otp
    const noEmailRes = await request(app)
      .post('/api/auth/register-otp')
      .set('X-Forwarded-For', '10.90.1.1')
      .send({
        fullName: noEmailEmp.full_name,
        employeeId: noEmailEmp.employee_id,
        email: 'attacker@evil.com',
        password: 'ValidReg#99'
      })
      .expect(400);
    assert.equal(noEmailRes.body.code, 'REGISTRATION_VERIFICATION_FAILED');

    const noEmailOtps = await query('SELECT id FROM security_otps WHERE employee_id = $1', [noEmailEmp.employee_id]);
    assert.equal(noEmailOtps.rows.length, 0);

    // 2. Employee with real HRMS email submitting attacker@evil.com is rejected
    const wrongEmailRes = await request(app)
      .post('/api/auth/register-otp')
      .set('X-Forwarded-For', '10.90.1.2')
      .send({
        fullName: realEmp.full_name,
        employeeId: realEmp.employee_id,
        email: 'attacker@evil.com',
        password: 'ValidReg#99'
      })
      .expect(400);
    assert.equal(wrongEmailRes.body.code, 'REGISTRATION_VERIFICATION_FAILED');

    const wrongEmailOtps = await query('SELECT id FROM security_otps WHERE employee_id = $1', [realEmp.employee_id]);
    assert.equal(wrongEmailOtps.rows.length, 0);

    // 3. Valid OTP bound to realEmail CANNOT be used to register with attacker@evil.com
    const knownOtp = '445566';
    const mac = computeOtpMac(realEmp.employee_id, 'registration', realEmail, knownOtp);
    await query(
      `INSERT INTO security_otps (employee_id, action, otp_hash, target_email, attempts, max_attempts, expires_at)
       VALUES ($1, 'registration', $2, $3, 0, 5, NOW() + INTERVAL '10 minutes')`,
      [realEmp.employee_id, mac, realEmail]
    );

    const hijackRes = await request(app)
      .post('/api/auth/register')
      .set('X-Forwarded-For', '10.90.1.3')
      .send({
        fullName: realEmp.full_name,
        employeeId: realEmp.employee_id,
        email: 'attacker@evil.com',
        password: 'ValidReg#99',
        otp: knownOtp
      })
      .expect(400);
    assert.equal(hijackRes.body.code, 'REGISTRATION_VERIFICATION_FAILED');

    // 4. Legitimate registration with matching HRMS email (case-insensitive) succeeds and stores canonical lowercase email
    const okRes = await request(app)
      .post('/api/auth/register')
      .set('X-Forwarded-For', '10.90.1.4')
      .send({
        fullName: realEmp.full_name,
        employeeId: realEmp.employee_id,
        email: realEmail.toUpperCase(),
        password: 'ValidReg#99',
        otp: knownOtp
      })
      .expect(201);
    assert.equal(okRes.body.success, true);

    const createdRes = await query('SELECT id, email FROM users WHERE employee_id = $1', [realEmp.employee_id]);
    assert.equal(createdRes.rows.length, 1);
    createdUserIds.push(createdRes.rows[0].id);
    assert.equal(createdRes.rows[0].email, realEmail);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // RISKS #2 & #5: OTP Hardening (HMAC, FOR UPDATE TOCTOU, 60s Cooldown, Prod SMTP Fail-Closed)
  // ─────────────────────────────────────────────────────────────────────────
  test('Risks #2 & #5: OTP uses peppered HMAC, enforces FOR UPDATE concurrency limit, 60s cooldown, and zero prod plaintext logs on SMTP failure', async () => {
    const empId = `${tag}_OTPTEST`;
    const email = `${tag.toLowerCase()}_otp@jphrc.test`;
    createdOtpEmpIds.push(empId);

    // 1. Peppered HMAC is NOT bare sha256(otp)
    const testCode = '135791';
    const mac = computeOtpMac(empId, 'concurrent_test', email, testCode);
    const bareSha = crypto.createHash('sha256').update(testCode).digest('hex');
    assert.notEqual(mac, bareSha);

    // 2. Concurrent parallel verifyOtp calls (8 simultaneous wrong guesses) serialize via FOR UPDATE and purge at 5 attempts
    await query('DELETE FROM security_otps WHERE employee_id = $1 AND action = $2', [empId, 'concurrent_test']);
    await query(
      `INSERT INTO security_otps (employee_id, action, otp_hash, target_email, attempts, max_attempts, expires_at)
       VALUES ($1, 'concurrent_test', $2, $3, 0, 5, NOW() + INTERVAL '10 minutes')`,
      [empId, mac, email]
    );

    const results = await Promise.all(
      Array.from({ length: 8 }, (_, idx) =>
        verifyOtp(empId, 'concurrent_test', String(200000 + idx), email)
      )
    );
    assert.equal(results.every((r) => r === false), true);

    const afterConcurrent = await query(
      'SELECT * FROM security_otps WHERE employee_id = $1 AND action = $2',
      [empId, 'concurrent_test']
    );
    assert.equal(afterConcurrent.rows.length, 0, 'Row must be atomically purged at 5 attempts even under parallel load');
    assert.equal(await verifyOtp(empId, 'concurrent_test', testCode, email), false);

    // 3. 60-second resend cooldown (including concurrent race serialization via pg_advisory_xact_lock)
    await query('DELETE FROM security_otps WHERE employee_id = $1 AND action = $2', [empId, 'cooldown_test']);
    const concurrentSends = await Promise.all(
      Array.from({ length: 6 }, () => sendOtp(empId, email, 'cooldown_test'))
    );
    const sentCount = concurrentSends.filter((r) => r === true).length;
    const cooldownCount = concurrentSends.filter((r) => r && typeof r === 'object' && r.code === 'OTP_COOLDOWN').length;
    assert.equal(sentCount, 1, `Expected strictly 1 concurrent sendOtp to succeed, got ${sentCount}`);
    assert.equal(cooldownCount, 5, `Expected 5 concurrent sendOtp calls to hit OTP_COOLDOWN, got ${cooldownCount}`);

    const secondSend = await sendOtp(empId, email, 'cooldown_test');
    assert.equal(typeof secondSend, 'object');
    assert.equal(secondSend.sent, false);
    assert.equal(secondSend.code, 'OTP_COOLDOWN');
    assert.ok(secondSend.retryAfterSeconds >= 1 && secondSend.retryAfterSeconds <= 60);

    // 4. Production SMTP failure: returns false, deletes undelivered OTP row, logs ZERO 6-digit plaintext OTP digits
    await query('DELETE FROM security_otps WHERE employee_id = $1 AND action = $2', [empId, 'smtp_fail_test']);
    const prevNodeEnv = process.env.NODE_ENV;
    const prevSmtpUser = process.env.SMTP_USER;
    const prevSmtpPass = process.env.SMTP_PASS;
    const prevSafeMode = process.env.EMAIL_SAFE_MODE;
    const origSendMail = transporter.sendMail;
    const origLog = console.log;
    const origWarn = console.warn;
    const origError = console.error;

    const capturedLogs = [];
    let capturedOtpFromHtml = null;

    try {
      process.env.NODE_ENV = 'production';
      process.env.SMTP_USER = 'real-smtp@jphrc.org';
      process.env.SMTP_PASS = 'real-smtp-secret';
      process.env.EMAIL_SAFE_MODE = '';

      console.log = (...args) => capturedLogs.push(args.join(' '));
      console.warn = (...args) => capturedLogs.push(args.join(' '));
      console.error = (...args) => capturedLogs.push(args.join(' '));

      transporter.sendMail = async (mailOptions) => {
        const m = String(mailOptions.html || '').match(/>(\d{6})</);
        if (m) capturedOtpFromHtml = m[1];
        throw new Error('SMTP connection refused');
      };

      const prodRes = await sendOtp(empId, email, 'smtp_fail_test');
      assert.equal(prodRes, false, 'Production SMTP failure must return false (fail closed)');
      assert.ok(capturedOtpFromHtml && /^\d{6}$/.test(capturedOtpFromHtml), 'Expected 6-digit OTP in attempted email');

      const orphanRows = await query(
        'SELECT id FROM security_otps WHERE employee_id = $1 AND action = $2',
        [empId, 'smtp_fail_test']
      );
      assert.equal(orphanRows.rows.length, 0, 'Undelivered OTP row must be deleted on SMTP failure');

      const combinedLogs = capturedLogs.join('\n');
      assert.equal(
        combinedLogs.includes(capturedOtpFromHtml),
        false,
        'Plaintext OTP must NEVER appear in production logs on SMTP failure'
      );
    } finally {
      transporter.sendMail = origSendMail;
      console.log = origLog;
      console.warn = origWarn;
      console.error = origError;
      process.env.NODE_ENV = prevNodeEnv;
      if (prevSmtpUser === undefined) delete process.env.SMTP_USER; else process.env.SMTP_USER = prevSmtpUser;
      if (prevSmtpPass === undefined) delete process.env.SMTP_PASS; else process.env.SMTP_PASS = prevSmtpPass;
      if (prevSafeMode === undefined) delete process.env.EMAIL_SAFE_MODE; else process.env.EMAIL_SAFE_MODE = prevSafeMode;
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // RISK #6: Anti-Enumeration on Login & Forgot Password
  // ─────────────────────────────────────────────────────────────────────────
  test('Risk #6: Login and Forgot Password enforce strict anti-enumeration (password verified before lockout status)', async () => {
    const unregEmp = await seedMasterAndUser({
      suffix: 'UNREG_ENUM',
      email: `${tag.toLowerCase()}_unreg@jphrc.test`,
      password: null
    });

    // Unknown ID, unregistered ID, terminated ID + wrong password, active ID + wrong password -> identical 401 INVALID_CREDENTIALS
    const loginProbes = [
      { employeeId: `NO_SUCH_${tag}`, password: 'WrongPassword#1' },
      { employeeId: unregEmp.employee_id, password: 'WrongPassword#1' },
      { employeeId: terminatedEmp.employee_id, password: 'WrongPassword#1' },
      { employeeId: activeEmp.employee_id, password: 'WrongPassword#1' }
    ];

    const bodies = [];
    for (let i = 0; i < loginProbes.length; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', `10.90.2.${i + 1}`)
        .send(loginProbes[i])
        .expect(401);
      assert.equal(res.body.code, 'INVALID_CREDENTIALS');
      bodies.push(JSON.stringify(res.body));
    }
    assert.equal(new Set(bodies).size, 1, 'All failed login probes must return byte-identical JSON error responses');

    // Audit log must record LOGIN_FAILED for failed active user login
    const failedAudit = await query(
      `SELECT action FROM audit_logs WHERE user_id = $1 AND action = 'LOGIN_FAILED' ORDER BY created_at DESC LIMIT 1`,
      [activeEmp.id]
    );
    assert.equal(failedAudit.rows.length, 1);

    // Terminated user with CORRECT password -> 403 EMPLOYEE_TERMINATED
    const termCorrectRes = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '10.90.2.10')
      .send({ employeeId: terminatedEmp.employee_id, password: terminatedEmpPassword })
      .expect(403);
    assert.equal(termCorrectRes.body.code, 'EMPLOYEE_TERMINATED');

    // Forgot Password uniform 200 across unknown, wrong email, terminated, and active valid user
    const forgotProbes = [
      { employeeId: `NO_SUCH_${tag}`, email: 'x@jphrc.test' },
      { employeeId: activeEmp.employee_id, email: 'wrong@jphrc.test' },
      { employeeId: terminatedEmp.employee_id, email: terminatedEmp.email },
      { employeeId: activeEmp.employee_id, email: activeEmp.email }
    ];
    const forgotBodies = [];
    for (let i = 0; i < forgotProbes.length; i++) {
      const res = await request(app)
        .post('/api/auth/employee-forgot-password')
        .set('X-Forwarded-For', `10.90.2.${20 + i}`)
        .send(forgotProbes[i])
        .expect(200);
      assert.equal(res.body.success, true);
      forgotBodies.push(JSON.stringify(res.body));
    }
    assert.equal(new Set(forgotBodies).size, 1, 'All forgot-password probes must return identical uniform 200');

    // Verify ONLY the active registered user got an OTP row (terminated did NOT)
    const termOtps = await query('SELECT id FROM security_otps WHERE employee_id = $1', [terminatedEmp.employee_id]);
    assert.equal(termOtps.rows.length, 0);
    const actOtps = await query('SELECT id FROM security_otps WHERE employee_id = $1 AND action = $2', [activeEmp.employee_id, 'employee_password_reset']);
    assert.equal(actOtps.rows.length, 1);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // RISK #3: Server-Side JWT Revocation (token_version), Logout, Reset, Role Revoke & Socket.IO
  // ─────────────────────────────────────────────────────────────────────────
  test('Risk #3: token_version revokes JWTs on logout, password reset, admin role revocation, deactivation, leaveRole & Socket.IO', async () => {
    // 1. Legacy token without `tv` claim is rejected on HTTP and Socket.IO
    const legacyToken = jwt.sign(
      { userId: activeEmp.id, employeeId: activeEmp.employee_id, role: 'employee' },
      process.env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' }
    );
    const legacyRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${legacyToken}`)
      .expect(401);
    assert.equal(legacyRes.body.code, 'SESSION_REVOKED');

    // Socket.IO rejects legacy token without `tv`
    const testServer = server.listening ? server : await new Promise((resolve) => {
      const s = server.listen(0, '127.0.0.1', () => resolve(s));
    });
    const addr = testServer.address();
    const sockUrl = `http://127.0.0.1:${addr.port}`;

    const sockErr = await new Promise((resolve) => {
      const sock = ioClient(sockUrl, {
        auth: { token: legacyToken },
        transports: ['websocket'],
        reconnection: false
      });
      sock.on('connect_error', (err) => { sock.close(); resolve(err); });
      sock.on('connect', () => { sock.close(); resolve(null); });
    });
    assert.ok(sockErr, 'Socket.IO must reject token without matching tv');
    assert.equal(sockErr.message, 'SESSION_REVOKED');

    // 2. Login -> T1 -> POST /api/auth/logout -> T1 immediately fails with 401 SESSION_REVOKED
    const loginRes1 = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '10.90.3.1')
      .send({ employeeId: activeEmp.employee_id, password: activeEmpPassword })
      .expect(200);
    const T1 = loginRes1.body.token;

    await request(app).get('/api/auth/me').set('Authorization', `Bearer ${T1}`).expect(200);

    await request(app)
      .post('/api/auth/logout')
      .set('X-Forwarded-For', '10.90.3.2')
      .set('Authorization', `Bearer ${T1}`)
      .expect(200);

    const afterLogout = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${T1}`)
      .expect(401);
    assert.equal(afterLogout.body.code, 'SESSION_REVOKED');

    const logoutAudit = await query(
      `SELECT action FROM audit_logs WHERE user_id = $1 AND action = 'LOGOUT' ORDER BY created_at DESC LIMIT 1`,
      [activeEmp.id]
    );
    assert.equal(logoutAudit.rows.length, 1);

    // 3. Login -> T2 -> Password Reuse blocked (400 PASSWORD_REUSE) -> Password Reset -> T2 fails with 401 SESSION_REVOKED
    const loginRes2 = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '10.90.3.3')
      .send({ employeeId: activeEmp.employee_id, password: activeEmpPassword })
      .expect(200);
    const T2 = loginRes2.body.token;

    const seedResetOtp = async (code) => {
      const mac = computeOtpMac(activeEmp.employee_id, 'employee_password_reset', activeEmp.email, code);
      await query('DELETE FROM security_otps WHERE employee_id = $1 AND action = $2', [activeEmp.employee_id, 'employee_password_reset']);
      await query(
        `INSERT INTO security_otps (employee_id, action, otp_hash, target_email, attempts, max_attempts, expires_at)
         VALUES ($1, 'employee_password_reset', $2, $3, 0, 5, NOW() + INTERVAL '10 minutes')`,
        [activeEmp.employee_id, mac, activeEmp.email]
      );
    };

    // 3a. Wrong OTP + current password MUST return 400 INVALID_OTP (never leak PASSWORD_REUSE)
    await seedResetOtp('556677');
    const wrongOtpReuseRes = await request(app)
      .post('/api/auth/employee-reset-password')
      .set('X-Forwarded-For', '10.90.3.4')
      .send({
        employeeId: activeEmp.employee_id,
        otp: '000000',
        newPassword: activeEmpPassword
      })
      .expect(400);
    assert.equal(wrongOtpReuseRes.body.code, 'INVALID_OTP');

    // 3b. Valid OTP + exact same password fails with 400 PASSWORD_REUSE WITHOUT destroying the valid OTP
    const reuseRes = await request(app)
      .post('/api/auth/employee-reset-password')
      .set('X-Forwarded-For', '10.90.3.4')
      .send({
        employeeId: activeEmp.employee_id,
        otp: '556677',
        newPassword: activeEmpPassword
      })
      .expect(400);
    assert.equal(reuseRes.body.code, 'PASSWORD_REUSE');

    // 3c. Re-submitting the SAME still-valid OTP with a distinct new password succeeds and immediately revokes T2
    const newActivePassword = 'NewActivePass#88';
    await request(app)
      .post('/api/auth/employee-reset-password')
      .set('X-Forwarded-For', '10.90.3.5')
      .send({
        employeeId: activeEmp.employee_id,
        otp: '556677',
        newPassword: newActivePassword
      })
      .expect(200);
    activeEmpPassword = newActivePassword;

    const afterReset = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${T2}`)
      .expect(401);
    assert.equal(afterReset.body.code, 'SESSION_REVOKED');

    // 4. Admin revoking IMC role immediately invalidates user's old JWT
    const imcToken = signJwt(imcRevokeEmp);
    await request(app).get('/api/auth/me').set('Authorization', `Bearer ${imcToken}`).expect(200);

    await request(app)
      .delete(`/api/admin/imc-members/${imcRevokeEmp.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const afterRevoke = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${imcToken}`)
      .expect(401);
    assert.equal(afterRevoke.body.code, 'SESSION_REVOKED');

    // 5. User calling leaveRole gets a fresh token while OLD elevated JWT is immediately revoked
    const oldMgmtToken = signJwt(mgmtLeaveEmp);
    const leaveRes = await request(app)
      .post('/api/auth/leave-role')
      .set('X-Forwarded-For', '10.90.3.6')
      .set('Authorization', `Bearer ${oldMgmtToken}`)
      .send({ targetRole: 'head_management' })
      .expect(200);
    assert.ok(leaveRes.body.token);

    const oldMgmtCheck = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${oldMgmtToken}`)
      .expect(401);
    assert.equal(oldMgmtCheck.body.code, 'SESSION_REVOKED');

    await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${leaveRes.body.token}`)
      .expect(200);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // RISK #4: Read-Only HRMS Contact Info & Root 00000 Password + OTP Email Update
  // ─────────────────────────────────────────────────────────────────────────
  test('Risk #4: Contact info is read-only for all hospital employees; root 00000 requires current password + email-bound OTP and bumps token_version', async () => {
    // 1. Regular employee & non-root admin employee both get 403 HRMS_MANAGED_READ_ONLY
    const loginAct = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '10.90.4.1')
      .send({ employeeId: activeEmp.employee_id, password: activeEmpPassword })
      .expect(200);
    const actToken = loginAct.body.token;

    const empUpdateRes = await request(app)
      .put('/api/auth/contact-info')
      .set('X-Forwarded-For', '10.90.4.2')
      .set('Authorization', `Bearer ${actToken}`)
      .send({ email: 'hijacked@evil.com', phone: '0000000000' })
      .expect(403);
    assert.equal(empUpdateRes.body.code, 'HRMS_MANAGED_READ_ONLY');

    // Verify master_employees was NOT touched
    const masterCheck = await query('SELECT email FROM master_employees WHERE employee_id = $1', [activeEmp.employee_id]);
    assert.equal(masterCheck.rows[0].email, activeEmp.email);

    // Non-root employee with is_system_admin=true also gets 403 HRMS_MANAGED_READ_ONLY on /admin-email-otp and /contact-info
    const nonRootAdminOtp = await request(app)
      .post('/api/auth/admin-email-otp')
      .set('X-Forwarded-For', '10.90.4.3')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ currentPassword: 'AdminUser#99', newEmail: 'new@jphrc.test' })
      .expect(403);
    assert.equal(nonRootAdminOtp.body.code, 'HRMS_MANAGED_READ_ONLY');

    // 2. Root 00000 flow (snapshot & restore original row in finally)
    const rootRes = await query(`SELECT * FROM users WHERE TRIM(employee_id) = '00000' LIMIT 1`);
    assert.equal(rootRes.rows.length, 1, 'Root 00000 user must exist');
    const origRoot = rootRes.rows[0];
    const tempRootPass = 'RootTempPass#99';
    const tempRootHash = await bcrypt.hash(tempRootPass, 10);
    const newRecoveryEmail = `${tag.toLowerCase()}_root_recovery@jphrc.test`;
    createdOtpEmpIds.push('00000');

    try {
      await query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [tempRootHash, origRoot.id]);
      const rootOldToken = signJwt({ ...origRoot, role: 'system_admin' });

      // 2a. Missing currentPassword/OTP -> 400
      await request(app)
        .put('/api/auth/contact-info')
        .set('X-Forwarded-For', '10.90.4.4')
        .set('Authorization', `Bearer ${rootOldToken}`)
        .send({ email: newRecoveryEmail })
        .expect(400);

      // 2b. Wrong currentPassword on /admin-email-otp -> 401 INVALID_PASSWORD
      const badPwdRes = await request(app)
        .post('/api/auth/admin-email-otp')
        .set('X-Forwarded-For', '10.90.4.5')
        .set('Authorization', `Bearer ${rootOldToken}`)
        .send({ currentPassword: 'WrongRootPassword#1', newEmail: newRecoveryEmail })
        .expect(401);
      assert.equal(badPwdRes.body.code, 'INVALID_PASSWORD');

      // 2c. Seed email-bound OTP for newRecoveryEmail, try submitting DIFFERENT email -> 400 INVALID_OTP
      const rootOtp = '918273';
      const rootMac = computeOtpMac('00000', 'admin_email_change', newRecoveryEmail, rootOtp);
      await query(`DELETE FROM security_otps WHERE employee_id = '00000' AND action = 'admin_email_change'`);
      await query(
        `INSERT INTO security_otps (employee_id, action, otp_hash, target_email, attempts, max_attempts, expires_at)
         VALUES ('00000', 'admin_email_change', $1, $2, 0, 5, NOW() + INTERVAL '10 minutes')`,
        [rootMac, newRecoveryEmail]
      );

      const mismatchEmailRes = await request(app)
        .put('/api/auth/contact-info')
        .set('X-Forwarded-For', '10.90.4.6')
        .set('Authorization', `Bearer ${rootOldToken}`)
        .send({
          newEmail: 'other-attacker@evil.com',
          currentPassword: tempRootPass,
          otp: rootOtp
        })
        .expect(400);
      assert.equal(mismatchEmailRes.body.code, 'INVALID_OTP');

      // 2d. Valid currentPassword + email-bound OTP -> 200, updates email, bumps token_version, revokes old JWT
      const okRootUpdate = await request(app)
        .put('/api/auth/contact-info')
        .set('X-Forwarded-For', '10.90.4.7')
        .set('Authorization', `Bearer ${rootOldToken}`)
        .send({
          newEmail: newRecoveryEmail,
          currentPassword: tempRootPass,
          otp: rootOtp,
          phone: '1111111111' // phone must be ignored
        })
        .expect(200);

      assert.equal(okRootUpdate.body.success, true);
      assert.equal(okRootUpdate.body.user.email, newRecoveryEmail);
      assert.equal(okRootUpdate.body.user.phone, origRoot.phone || '');
      assert.ok(okRootUpdate.body.token);

      // Old root JWT is immediately revoked
      const oldRootMe = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${rootOldToken}`)
        .expect(401);
      assert.equal(oldRootMe.body.code, 'SESSION_REVOKED');

      // Fresh root JWT works
      await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${okRootUpdate.body.token}`)
        .expect(200);
    } finally {
      await query(
        `UPDATE users SET email = $1, password_hash = $2, token_version = $3, updated_at = NOW() WHERE id = $4`,
        [origRoot.email, origRoot.password_hash, origRoot.token_version, origRoot.id]
      );
      await query(`DELETE FROM security_otps WHERE employee_id = '00000' AND action = 'admin_email_change'`).catch(() => {});
      await query(
        `DELETE FROM audit_logs WHERE user_id = $1 AND action IN ('ADMIN_EMAIL_UPDATED', 'LOGIN_FAILED', 'OTP_FAILED') AND created_at >= NOW() - INTERVAL '5 minutes'`,
        [origRoot.id]
      ).catch(() => {});
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // RISKS #7 & #10: Retired Shared Logins, committee-members RBAC & switchRole
  // ─────────────────────────────────────────────────────────────────────────
  test('Risks #7 & #10: all shared committee endpoints return 410 SHARED_LOGIN_RETIRED, committee-members is RBAC-gated, and switchRole validates roles & HRMS lifecycle', async () => {
    const retiredEndpoints = [
      { method: 'post', url: '/api/auth/committee-login', body: { username: 'IMC2026', password: 'x', targetRole: 'imc' } },
      { method: 'post', url: '/api/auth/forgot-password', body: { username: 'IMC2026', targetRole: 'imc' } },
      { method: 'post', url: '/api/auth/reset-password', body: { username: 'IMC2026', targetRole: 'imc', otp: '123456', newPassword: 'StrongNew#1' } },
      { method: 'post', url: '/api/auth/login', body: { employeeId: 'SYS_IMC', password: 'AnyPassword#1' } },
      { method: 'post', url: '/api/auth/login', body: { employeeId: 'SYS_MGMT', password: 'AnyPassword#1' } },
      { method: 'post', url: '/api/admin/role-credentials/otp', auth: adminToken, body: {} },
      { method: 'put', url: '/api/admin/role-credentials', auth: adminToken, body: { targetRole: 'imc', otp: '123456', newPassword: 'StrongNew#1' } }
    ];

    for (let i = 0; i < retiredEndpoints.length; i++) {
      const ep = retiredEndpoints[i];
      let reqBuilder = request(app)[ep.method](ep.url)
        .set('X-Forwarded-For', `10.90.5.${i + 1}`);
      if (ep.auth) reqBuilder = reqBuilder.set('Authorization', `Bearer ${ep.auth}`);
      const res = await reqBuilder.send(ep.body).expect(410);
      assert.equal(res.body.code, 'SHARED_LOGIN_RETIRED', `Expected 410 SHARED_LOGIN_RETIRED for ${ep.url}`);
    }

    // Regular employee calling GET /api/auth/committee-members gets 403; admin gets 200
    const loginAct = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '10.90.5.20')
      .send({ employeeId: activeEmp.employee_id, password: activeEmpPassword })
      .expect(200);

    await request(app)
      .get('/api/auth/committee-members')
      .set('X-Forwarded-For', '10.90.5.21')
      .set('Authorization', `Bearer ${loginAct.body.token}`)
      .expect(403);

    await request(app)
      .get('/api/auth/committee-members')
      .set('X-Forwarded-For', '10.90.5.22')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    // switchRole rejects invalid role before DB writes
    await request(app)
      .post('/api/auth/switch-role')
      .set('X-Forwarded-For', '10.90.5.23')
      .set('Authorization', `Bearer ${loginAct.body.token}`)
      .send({ targetRole: 'superadmin' })
      .expect(400);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // RISK #8: Dual-Layer Hospital NAT-Safe OTP Rate Limiting
  // ─────────────────────────────────────────────────────────────────────────
  test('Risk #8: Per-account OTP limiter caps single account at 5/15m without blocking colleagues on same hospital NAT IP', async () => {
    const sharedHospitalIp = '10.90.6.100';
    const empA = `NAT_A_${tag}`;
    const empB = `NAT_B_${tag}`;

    for (let i = 1; i <= 5; i++) {
      const res = await request(app)
        .post('/api/auth/employee-forgot-password')
        .set('X-Forwarded-For', sharedHospitalIp)
        .send({ employeeId: empA, email: 'a@jphrc.test' });
      assert.equal(res.status, 200, `Request ${i} for empA should be allowed`);
    }

    // 6th request for empA -> 429 OTP_RATE_LIMITED
    const blockedA = await request(app)
      .post('/api/auth/employee-forgot-password')
      .set('X-Forwarded-For', sharedHospitalIp)
      .send({ employeeId: empA, email: 'a@jphrc.test' })
      .expect(429);
    assert.equal(blockedA.body.code, 'OTP_RATE_LIMITED');

    // Colleague empB sharing the exact same NAT IP is NOT blocked!
    const okB = await request(app)
      .post('/api/auth/employee-forgot-password')
      .set('X-Forwarded-For', sharedHospitalIp)
      .send({ employeeId: empB, email: 'b@jphrc.test' })
      .expect(200);
    assert.equal(okB.body.success, true);

    // 429 OTP_COOLDOWN via HTTP on /register-otp when requesting twice within 60s
    const coolEmail = `${tag.toLowerCase()}_cool@jphrc.test`;
    const coolEmp = await seedMasterAndUser({
      suffix: 'COOLHTTP',
      email: coolEmail,
      createUserRow: false
    });
    await request(app)
      .post('/api/auth/register-otp')
      .set('X-Forwarded-For', '10.90.6.101')
      .send({
        fullName: coolEmp.full_name,
        employeeId: coolEmp.employee_id,
        email: coolEmail,
        password: 'ValidCool#99'
      })
      .expect(200);

    const coolRes = await request(app)
      .post('/api/auth/register-otp')
      .set('X-Forwarded-For', '10.90.6.101')
      .send({
        fullName: coolEmp.full_name,
        employeeId: coolEmp.employee_id,
        email: coolEmail,
        password: 'ValidCool#99'
      })
      .expect(429);
    assert.equal(coolRes.body.code, 'OTP_COOLDOWN');
    assert.ok(coolRes.body.retryAfterSeconds >= 1);

    // Admin deactivating a user via toggle-status bumps token_version and immediately revokes their JWT
    const deactEmp = await seedMasterAndUser({
      suffix: 'DEACT_TV',
      email: `${tag.toLowerCase()}_deact@jphrc.test`,
      password: 'DeactPass#99'
    });
    const deactToken = signJwt(deactEmp);
    await request(app).get('/api/auth/me').set('Authorization', `Bearer ${deactToken}`).expect(200);

    await request(app)
      .post(`/api/admin/users/${deactEmp.id}/toggle-status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const afterDeact = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${deactToken}`)
      .expect(401);
    assert.equal(afterDeact.body.code, 'SESSION_REVOKED');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // RISK #11: Password Bounds (>72 UTF-8 bytes), Common Passwords & HTML Escaping
  // ─────────────────────────────────────────────────────────────────────────
  test('Risk #11: rejects >72-byte passwords and common breached passwords, and HTML-escapes welcome email template', async () => {
    // >72 ASCII bytes
    const over72Ascii = 'A1' + 'x'.repeat(71); // 73 bytes
    assert.equal(validatePasswordStrength(over72Ascii).valid, false);

    // >72 UTF-8 bytes via multi-byte characters (each emoji is 4 bytes; 19 * 4 = 76 bytes)
    const over72Utf8 = 'A1' + '🔐'.repeat(18); // 2 + 72 = 74 bytes
    assert.equal(validatePasswordStrength(over72Utf8).valid, false);

    // Exactly 72 bytes passes
    const exact72 = 'A1' + 'x'.repeat(70);
    assert.equal(validatePasswordStrength(exact72).valid, true);

    // Common passwords rejected via HTTP endpoint as 400 WEAK_PASSWORD
    for (const trivial of ['Admin123', 'Password1', 'Hospital1', 'Jphrc123', over72Ascii]) {
      const res = await request(app)
        .post('/api/auth/register-otp')
        .set('X-Forwarded-For', '10.90.7.1')
        .send({
          fullName: 'Test User',
          employeeId: `PWCHK_${tag}`,
          email: 'pwchk@jphrc.test',
          password: trivial
        })
        .expect(400);
      assert.equal(res.body.code, 'WEAK_PASSWORD', `Expected WEAK_PASSWORD for "${trivial.slice(0, 15)}"`);
    }

    // Welcome email HTML escaping
    const tpl = welcomeEmailTemplate({
      full_name: '<script>alert("xss")</script>',
      employee_id: 'EMP<1>',
      department: '<img src=x onerror=alert(1)>',
      role: 'employee'
    });
    assert.equal(tpl.html.includes('<script>'), false);
    assert.equal(tpl.html.includes('<img src=x'), false);
    assert.equal(tpl.html.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'), true);
    assert.equal(tpl.html.includes('&lt;img src=x onerror=alert(1)&gt;'), true);
  });
});

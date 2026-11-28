const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { io: ioClient } = require('../../client/node_modules/socket.io-client');

process.env.NODE_ENV = 'test';

const { app, server } = require('../index');
const { query, pool } = require('../config/database');
const officePortalService = require('../services/officePortalService');
const {
  encryptSecret,
  decryptSecret,
  isEncryptedSecret,
  assertAllowedOfficePortalUrl
} = require('../utils/secretCrypto');
const { sanitizeCsvCell, escapeCsvField } = require('../utils/csvSanitizer');
const { buildLetterHtml, escapeHtml } = require('../templates/letterHtmlTemplate');
const { generateLetterPdf, closeBrowser } = require('../services/pdfService');
const { uploadIncidentAttachments, hasValidMagicBytes } = require('../middleware/upload');
const { canNonPrivilegedUserViewLetter } = require('../utils/accessControl');
const { computeOtpMac } = require('../utils/otpService');

function signTestJwt(user, extra = {}) {
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

describe('Comprehensive Security Hardening Verification Suite (Risks #1-#16)', () => {
  const tag = `SEC_${Date.now().toString(36).toUpperCase()}`;
  const createdUserIds = [];
  const createdMasterEmpIds = [];
  const createdIncidentIds = [];
  const createdLetterIds = [];
  const createdTrainerIds = [];
  const createdNotificationIds = [];
  const createdWebhookEventIds = [];
  const createdAuditLogIds = [];
  const createdDepartmentIds = [];
  const createdOtpEmpIds = [];
  let savedConfigSnapshot = {};

  let adminUser;
  let imcUser;
  let hodUser;
  let reporterUser;
  let recipientUser;
  let trainerUser;
  let outsiderUser;
  let terminatedUser;

  let adminToken;
  let imcToken;
  let hodToken;
  let reporterToken;
  let recipientToken;
  let trainerToken;
  let outsiderToken;
  let terminatedToken;

  let testIncidentId;
  let draftLetterId;
  let approvedLetterId;
  let testBroadcastKey;

  const scratchDir = path.resolve(__dirname, '../scratch-sec-test');

  before(async () => {
    if (!fs.existsSync(scratchDir)) {
      fs.mkdirSync(scratchDir, { recursive: true });
    }

    // Snapshot existing officeportal_* config values so we restore them cleanly in after()
    const cfgRes = await query(`SELECT key, value FROM system_config WHERE key LIKE 'officeportal_%'`);
    for (const r of cfgRes.rows) {
      savedConfigSnapshot[r.key] = r.value;
    }

    const createTestUser = async ({
      suffix,
      role = 'employee',
      status = 'active',
      department = 'Nursing Services',
      designation = 'Staff Nurse',
      isAdmin = false,
      isImc = false,
      isActive = true
    }) => {
      const empId = `${tag}_${suffix}`;
      const email = `${empId.toLowerCase()}@test.jphrc.local`;
      const phone = '9876543210';

      await query(
        `INSERT INTO master_employees (employee_id, name, email, phone, department, designation, role, status, notice_period_end_date, portal_access_disable_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          empId,
          `Test ${suffix} ${tag}`,
          email,
          phone,
          department,
          designation,
          role,
          status,
          status === 'noticePeriod' ? '2099-12-31' : null,
          status === 'terminated' ? '2020-01-01' : null
        ]
      );
      createdMasterEmpIds.push(empId);

      const uRes = await query(
        `INSERT INTO users (employee_id, full_name, email, phone, department, designation, role, is_active, is_system_admin, is_imc_member, is_imc_lead)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [empId, `Test ${suffix} ${tag}`, email, phone, department, designation, role, isActive, isAdmin, isImc, isImc]
      );
      createdUserIds.push(uRes.rows[0].id);
      return uRes.rows[0];
    };

    adminUser = await createTestUser({ suffix: 'ADM', role: 'system_admin', isAdmin: true });
    imcUser = await createTestUser({ suffix: 'IMC', role: 'imc', isImc: true });
    hodUser = await createTestUser({ suffix: 'HOD', role: 'hod', designation: 'HOD' });
    reporterUser = await createTestUser({ suffix: 'REP', role: 'employee' });
    recipientUser = await createTestUser({ suffix: 'RCP', role: 'employee' });
    trainerUser = await createTestUser({ suffix: 'TRN', role: 'employee' });
    outsiderUser = await createTestUser({ suffix: 'OUT', role: 'employee' });
    terminatedUser = await createTestUser({ suffix: 'TRM', role: 'employee', status: 'terminated', isActive: false });

    adminToken = signTestJwt(adminUser);
    imcToken = signTestJwt(imcUser);
    hodToken = signTestJwt(hodUser);
    reporterToken = signTestJwt(reporterUser);
    recipientToken = signTestJwt(recipientUser);
    trainerToken = signTestJwt(trainerUser);
    outsiderToken = signTestJwt(outsiderUser);
    terminatedToken = signTestJwt(terminatedUser);

    // Create test incident reported by reporterUser
    const seqNum = Math.floor(Math.random() * 800000) + 100000;
    const incRes = await query(
      `INSERT INTO incidents (
         reference_id, year, seq_number, reporter_id, incident_date, incident_time,
         incident_category, incident_type, occurred_to, description,
         severity, status
       )
       VALUES ($1, 2026, $2, $3, CURRENT_DATE, '10:00', 'Medication Error', 'Clinical', 'Patient', 'Security test incident description', 'Major', 'pending_letter_generation')
       RETURNING id`,
      [`JPHRC/IMS/2026/${seqNum}`, seqNum, reporterUser.id]
    );
    testIncidentId = incRes.rows[0].id;
    createdIncidentIds.push(testIncidentId);

    // Create a DRAFT letter addressed to recipientUser
    const draftRes = await query(
      `INSERT INTO incident_letters (
         incident_id, employee_id, recipient_name, recipient_emp_no,
         recipient_department, recipient_designation, template_type,
         reference_number, letter_date, subject, salutation, body_text,
         status, drafted_by
       )
       VALUES ($1, $2, $3, $4, 'Nursing Services', 'Staff Nurse', 'warning_letter', $5, CURRENT_DATE, 'Draft Warning', 'Dear Staff,', 'Confidential draft content', 'drafted', $6)
       RETURNING id`,
      [testIncidentId, recipientUser.id, recipientUser.full_name, recipientUser.employee_id, `JPHRC/IMC/DRAFT/${tag}`, imcUser.id]
    );
    draftLetterId = draftRes.rows[0].id;
    createdLetterIds.push(draftLetterId);

    // Create an APPROVED letter addressed to recipientUser
    const apprRes = await query(
      `INSERT INTO incident_letters (
         incident_id, employee_id, recipient_name, recipient_emp_no,
         recipient_department, recipient_designation, template_type,
         reference_number, letter_date, subject, salutation, body_text,
         status, drafted_by, approved_by, approved_at
       )
       VALUES ($1, $2, $3, $4, 'Nursing Services', 'Staff Nurse', 'advisory_letter', $5, CURRENT_DATE, 'Approved Advisory', 'Dear Staff,', 'Official approved advisory text.', 'approved', $6, $7, NOW())
       RETURNING id`,
      [testIncidentId, recipientUser.id, recipientUser.full_name, recipientUser.employee_id, `JPHRC/IMC/APPR/${tag}`, imcUser.id, adminUser.id]
    );
    approvedLetterId = apprRes.rows[0].id;
    createdLetterIds.push(approvedLetterId);

    // Assign trainerUser on this incident
    const trRes = await query(
      `INSERT INTO incident_trainers (
         incident_id, trainee_employee_id, trainee_name, trainer_id,
         assigned_by, training_topic, status
       )
       VALUES ($1, $2, $3, $4, $5, 'Medication Safety SOP', 'assigned')
       RETURNING id`,
      [testIncidentId, recipientUser.employee_id, recipientUser.full_name, trainerUser.id, imcUser.id]
    );
    createdTrainerIds.push(trRes.rows[0].id);

    // Record a legitimate broadcast notification with a valid broadcast/ key
    testBroadcastKey = `broadcast/${tag.toLowerCase()}-circular.pdf`;
    const notifRes = await query(
      `INSERT INTO notifications (user_id, title, message, type, attachment_url, attachment_name)
       VALUES ($1, 'Hospital Circular', 'Read circular', 'broadcast', $2, 'circular.pdf')
       RETURNING id`,
      [outsiderUser.id, testBroadcastKey]
    );
    createdNotificationIds.push(notifRes.rows[0].id);

    // Insert an audit log row containing a CSV formula injection payload
    const auditRes = await query(
      `INSERT INTO audit_logs (user_id, action, details, ip_address)
       VALUES ($1, $2, $3, '127.0.0.1')
       RETURNING id`,
      [adminUser.id, `=CMD|' /C calc'!A0_${tag}`, JSON.stringify({ note: '+SUM(1,2)' })]
    );
    createdAuditLogIds.push(auditRes.rows[0].id);
  });

  after(async () => {
    try {
      await closeBrowser();
    } catch (_) {}
    try {
      fs.rmSync(scratchDir, { recursive: true, force: true });
    } catch (_) {}

    // Cleanup all test records cleanly
    if (createdAuditLogIds.length) {
      await query('DELETE FROM audit_logs WHERE id = ANY($1::uuid[])', [createdAuditLogIds]).catch(() => {});
    }
    if (createdWebhookEventIds.length) {
      await query('DELETE FROM hrms_webhook_events WHERE event_id = ANY($1::text[])', [createdWebhookEventIds]).catch(() => {});
    }
    if (createdNotificationIds.length) {
      await query('DELETE FROM notifications WHERE id = ANY($1::uuid[])', [createdNotificationIds]).catch(() => {});
    }
    if (createdTrainerIds.length) {
      await query('DELETE FROM incident_trainers WHERE id = ANY($1::uuid[])', [createdTrainerIds]).catch(() => {});
    }
    if (createdLetterIds.length) {
      await query('DELETE FROM incident_letters WHERE id = ANY($1::uuid[])', [createdLetterIds]).catch(() => {});
    }
    if (createdIncidentIds.length) {
      await query('DELETE FROM incident_events WHERE incident_id = ANY($1::uuid[])', [createdIncidentIds]).catch(() => {});
      await query('DELETE FROM incidents WHERE id = ANY($1::uuid[])', [createdIncidentIds]).catch(() => {});
    }
    if (createdOtpEmpIds.length) {
      await query('DELETE FROM security_otps WHERE employee_id = ANY($1::text[])', [createdOtpEmpIds]).catch(() => {});
    }
    await query(`DELETE FROM communication_logs WHERE recipient_contact LIKE $1`, [`%${tag.toLowerCase()}%@test.jphrc.local`]).catch(() => {});
    if (createdUserIds.length) {
      await query('DELETE FROM department_reviewers WHERE user_id = ANY($1::uuid[]) OR assigned_by = ANY($1::uuid[])', [createdUserIds]).catch(() => {});
      await query('DELETE FROM role_audit WHERE employee_id = ANY($1::uuid[]) OR changed_by = ANY($1::uuid[])', [createdUserIds]).catch(() => {});
      await query('DELETE FROM audit_logs WHERE user_id = ANY($1::uuid[])', [createdUserIds]).catch(() => {});
      await query('DELETE FROM users WHERE id = ANY($1::uuid[])', [createdUserIds]).catch(() => {});
    }
    if (createdDepartmentIds.length) {
      await query('DELETE FROM department_reviewers WHERE department_id = ANY($1::int[])', [createdDepartmentIds]).catch(() => {});
      await query('DELETE FROM departments WHERE id = ANY($1::int[])', [createdDepartmentIds]).catch(() => {});
    }
    if (createdMasterEmpIds.length) {
      await query('DELETE FROM master_employees WHERE employee_id = ANY($1::text[])', [createdMasterEmpIds]).catch(() => {});
    }

    // Restore system_config officeportal_* keys to exact pre-test state
    const currentCfg = await query(`SELECT key FROM system_config WHERE key LIKE 'officeportal_%'`).catch(() => ({ rows: [] }));
    for (const r of currentCfg.rows) {
      if (!(r.key in savedConfigSnapshot)) {
        await query('DELETE FROM system_config WHERE key = $1', [r.key]).catch(() => {});
      }
    }
    for (const [k, v] of Object.entries(savedConfigSnapshot)) {
      await query(
        `INSERT INTO system_config (key, value, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [k, v]
      ).catch(() => {});
    }
    officePortalService.clearCaches();

    if (server && server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
    await pool.end();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // RISK #1: Arbitrary R2 Broadcast Download & Path Traversal
  // ─────────────────────────────────────────────────────────────────────────
  test('Risk #1: rejects arbitrary R2 keys and path traversal on broadcast attachment download', async () => {
    const maliciousKeys = [
      'JPHRC-IMS-2026-0001/letters/secret.pdf',
      '../../.env',
      'broadcast/../../.env',
      '/etc/passwd',
      'broadcast/sub/nested.pdf',
      'broadcast/bad\\slash.pdf'
    ];

    for (const badKey of maliciousKeys) {
      const res = await request(app)
        .get('/api/admin/broadcast-attachments/download')
        .query({ key: badKey })
        .set('Authorization', `Bearer ${outsiderToken}`);

      assert.equal(res.status, 400, `Expected 400 for key "${badKey}", got ${res.status}`);
    }

    // Valid prefix but NOT backed by a broadcast notification record -> 404
    const missingRes = await request(app)
      .get('/api/admin/broadcast-attachments/download')
      .query({ key: 'broadcast/does-not-exist-999.pdf' })
      .set('Authorization', `Bearer ${outsiderToken}`);
    assert.equal(missingRes.status, 404);

    // Recorded broadcast key succeeds with presigned R2 URL (or 503 if R2 unconfigured, NEVER /uploads/)
    const validRes = await request(app)
      .get('/api/admin/broadcast-attachments/download')
      .query({ key: testBroadcastKey })
      .set('Authorization', `Bearer ${outsiderToken}`);
    assert.ok([200, 503].includes(validRes.status), `Expected 200 or 503, got ${validRes.status}`);
    if (validRes.status === 200) {
      assert.ok(validRes.body.url && !validRes.body.url.startsWith('/uploads/'));
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // RISK #2: BOLA / IDOR on Formal Letters, PDFs, Defaults & Trainers
  // ─────────────────────────────────────────────────────────────────────────
  test('Risk #2: enforces BOLA/IDOR controls on letters, letter PDFs, defaults, and trainers', async () => {
    // Unrelated outsider blocked (403) across all 4 endpoints
    await request(app)
      .get(`/api/incidents/${testIncidentId}/letters`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(403);

    await request(app)
      .get(`/api/incidents/${testIncidentId}/letters/${approvedLetterId}/pdf`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(403);

    await request(app)
      .get(`/api/incidents/${testIncidentId}/letters/defaults`)
      .query({ employeeId: recipientUser.employee_id, templateType: 'warning_letter' })
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(403);

    await request(app)
      .get(`/api/incidents/${testIncidentId}/trainers`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(403);

    // Reporter (participant on incident, NOT letter recipient) cannot see draft or another staff's disciplinary letter
    const repLetters = await request(app)
      .get(`/api/incidents/${testIncidentId}/letters`)
      .set('Authorization', `Bearer ${reporterToken}`)
      .expect(200);
    assert.equal(repLetters.body.length, 0, 'Reporter must not see drafts or another employee disciplinary letters');

    await request(app)
      .get(`/api/incidents/${testIncidentId}/letters/${draftLetterId}/pdf`)
      .set('Authorization', `Bearer ${reporterToken}`)
      .expect(403);

    await request(app)
      .get(`/api/incidents/${testIncidentId}/letters/${approvedLetterId}/pdf`)
      .set('Authorization', `Bearer ${reporterToken}`)
      .expect(403);

    await request(app)
      .get(`/api/incidents/${testIncidentId}/letters/defaults`)
      .query({ employeeId: recipientUser.employee_id, templateType: 'warning_letter' })
      .set('Authorization', `Bearer ${reporterToken}`)
      .expect(403);

    // Recipient sees ONLY their approved letter (NOT draft)
    const rcpLetters = await request(app)
      .get(`/api/incidents/${testIncidentId}/letters`)
      .set('Authorization', `Bearer ${recipientToken}`)
      .expect(200);
    assert.equal(rcpLetters.body.length, 1);
    assert.equal(rcpLetters.body[0].id, approvedLetterId);

    // Recipient blocked from draft PDF (403)
    await request(app)
      .get(`/api/incidents/${testIncidentId}/letters/${draftLetterId}/pdf`)
      .set('Authorization', `Bearer ${recipientToken}`)
      .expect(403);

    // Recipient CAN view their own approved letter PDF (200 application/pdf)
    const rcpPdf = await request(app)
      .get(`/api/incidents/${testIncidentId}/letters/${approvedLetterId}/pdf`)
      .set('Authorization', `Bearer ${recipientToken}`)
      .expect(200);
    assert.ok(rcpPdf.headers['content-type'].includes('application/pdf'));

    // Assigned trainer CAN view trainers for the incident
    const trRes = await request(app)
      .get(`/api/incidents/${testIncidentId}/trainers`)
      .set('Authorization', `Bearer ${trainerToken}`)
      .expect(200);
    assert.equal(trRes.body.length, 1);

    // Privileged IMC user CAN view all letters (including drafts) and defaults
    const imcLetters = await request(app)
      .get(`/api/incidents/${testIncidentId}/letters`)
      .set('Authorization', `Bearer ${imcToken}`)
      .expect(200);
    assert.equal(imcLetters.body.length, 2);

    await request(app)
      .get(`/api/incidents/${testIncidentId}/letters/defaults`)
      .query({ employeeId: recipientUser.employee_id, templateType: 'warning_letter' })
      .set('Authorization', `Bearer ${imcToken}`)
      .expect(200);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // RISK #3: Socket.IO JWT Authentication & Anti-Room-Hijacking
  // ─────────────────────────────────────────────────────────────────────────
  test('Risk #3: Socket.IO rejects unauthenticated/spoofed handshakes and binds room to verified JWT', async () => {
    if (!server.listening) {
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    }
    const { port } = server.address();
    const url = `http://127.0.0.1:${port}`;

    // 1. Unauthenticated handshake with spoofed ?userId must fail
    const unauthErr = await new Promise((resolve) => {
      const sock = ioClient(url, {
        query: { userId: adminUser.id },
        transports: ['websocket'],
        reconnection: false
      });
      sock.on('connect', () => {
        sock.disconnect();
        resolve(null);
      });
      sock.on('connect_error', (err) => {
        sock.disconnect();
        resolve(err);
      });
    });
    assert.ok(unauthErr, 'Unauthenticated Socket.IO connection must be rejected');
    assert.equal(unauthErr.message, 'UNAUTHORIZED');

    // 2. Terminated/disabled user JWT must be rejected
    const disabledErr = await new Promise((resolve) => {
      const sock = ioClient(url, {
        auth: { token: terminatedToken },
        transports: ['websocket'],
        reconnection: false
      });
      sock.on('connect', () => {
        sock.disconnect();
        resolve(null);
      });
      sock.on('connect_error', (err) => {
        sock.disconnect();
        resolve(err);
      });
    });
    assert.ok(disabledErr, 'Disabled user Socket.IO connection must be rejected');
    assert.equal(disabledErr.message, 'ACCOUNT_DISABLED');

    // 3. Valid JWT connects AND ignores spoofed query.userId (cannot receive adminUser notifications)
    const connectedSocket = await new Promise((resolve, reject) => {
      const sock = ioClient(url, {
        auth: { token: outsiderToken },
        query: { userId: adminUser.id },
        transports: ['websocket'],
        reconnection: false
      });
      sock.on('connect', () => resolve(sock));
      sock.on('connect_error', (err) => reject(err));
    });

    try {
      const { io } = require('../index');
      const serverSocket = io.sockets.sockets.get(connectedSocket.id);
      assert.ok(serverSocket, 'Server socket should exist');
      assert.equal(serverSocket.rooms.has(`user_${outsiderUser.id}`), true, 'Must join verified user room');
      assert.equal(serverSocket.rooms.has(`user_${adminUser.id}`), false, 'Must NEVER join spoofed query.userId room');
    } finally {
      connectedSocket.disconnect();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // RISK #4: Strict Least-Privilege on GET /api/employee/search
  // ─────────────────────────────────────────────────────────────────────────
  test('Risk #4: restricts employee search PII, terminated staff, and recentIncidents to privileged roles', async () => {
    const allowedMinimalKeys = ['department', 'designation', 'employee_id', 'full_name', 'id', 'status'];

    // Regular employee attempting include_terminated=true
    const empRes = await request(app)
      .get('/api/employee/search')
      .query({ q: tag, include_terminated: 'true' })
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(200);

    assert.ok(empRes.body.employees.length > 0);
    assert.equal(
      empRes.body.employees.some((e) => e.employee_id === terminatedUser.employee_id),
      false,
      'Regular employee must never see terminated staff'
    );
    for (const emp of empRes.body.employees) {
      assert.deepEqual(Object.keys(emp).sort(), allowedMinimalKeys);
      assert.equal(emp.phone, undefined);
      assert.equal(emp.email, undefined);
      assert.equal(emp.portal_access_disable_date, undefined);
    }
    assert.equal(empRes.body.selectedEmployee.recentIncidents, undefined);
    assert.equal(empRes.body.selectedEmployee.totalIncidentsReported, undefined);

    // HOD also receives strictly minimal fields
    const hodRes = await request(app)
      .get('/api/employee/search')
      .query({ q: reporterUser.employee_id, include_terminated: 'true' })
      .set('Authorization', `Bearer ${hodToken}`)
      .expect(200);
    assert.deepEqual(Object.keys(hodRes.body.selectedEmployee).sort(), allowedMinimalKeys);

    // System Admin receives full profile + terminated rows + recentIncidents
    const adminTermRes = await request(app)
      .get('/api/employee/search')
      .query({ q: terminatedUser.employee_id, include_terminated: 'true' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.equal(adminTermRes.body.employees.length, 1);
    assert.equal(adminTermRes.body.employees[0].status, 'terminated');
    assert.equal(adminTermRes.body.employees[0].phone, '9876543210');

    const adminRepRes = await request(app)
      .get('/api/employee/search')
      .query({ q: reporterUser.employee_id })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.ok(Array.isArray(adminRepRes.body.selectedEmployee.recentIncidents));
    assert.ok(adminRepRes.body.selectedEmployee.totalIncidentsReported >= 1);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // RISK #5: Puppeteer HTML Escaping & Outbound Network SSRF Block
  // ─────────────────────────────────────────────────────────────────────────
  test('Risk #5: escapes HTML injection in letter templates and blocks all outbound Chromium network requests', async () => {
    // Spin up a local probe server to detect ANY outbound HTTP request from Puppeteer
    let probeHits = 0;
    const probeServer = http.createServer((req, res) => {
      probeHits++;
      res.writeHead(200);
      res.end('EXFILTRATED');
    });
    await new Promise((resolve) => probeServer.listen(0, '127.0.0.1', resolve));
    const probePort = probeServer.address().port;

    try {
      const xssPayload = `<script>fetch("http://127.0.0.1:${probePort}/js")</script><img src="http://127.0.0.1:${probePort}/img" onerror="fetch('http://127.0.0.1:${probePort}/err')">`;
      const html = buildLetterHtml({
        letter: {
          reference_number: `REF-<script>1</script>`,
          recipient_name: `Dr. "Evil" <img src=x>`,
          recipient_emp_no: `EMP-1`,
          recipient_department: `ICU & <Surgery>`,
          subject: `Subject ${xssPayload}`,
          salutation: `Dear <Staff>,`,
          body_text: `Body line 1\n${xssPayload}`,
          cc_recipients: [{ label: `<b>HOD</b>`, role: `Lead` }]
        },
        incident: { id: testIncidentId, reference_id: 'JPHRC/IMS/SEC' },
        approvers: { draftedByName: '<b>IMC</b>', approvedByName: '<i>MD</i>' }
      });

      // Verify raw HTML tags are escaped
      assert.equal(html.includes('<script>'), false, 'Raw <script> tag must be escaped');
      assert.equal(html.includes('<img src="http://'), false, 'Raw <img> tag must be escaped');
      assert.ok(html.includes('&lt;script&gt;'), 'Escaped script text should appear literally');
      assert.equal(escapeHtml(`"a&b'<>`), '&quot;a&amp;b&#39;&lt;&gt;');

      // Generate real PDF via Puppeteer and confirm 0 outbound network requests
      const pdfBuf = await generateLetterPdf({
        letter: {
          reference_number: 'JPHRC/SEC/001',
          recipient_name: 'Test Staff',
          recipient_department: 'Nursing',
          subject: `Directive ${xssPayload}`,
          salutation: 'Dear Staff,',
          body_text: `Line 1 ${xssPayload}`
        },
        incident: { id: testIncidentId },
        isDraft: true
      });

      assert.ok(Buffer.isBuffer(pdfBuf) && pdfBuf.length > 1000, 'Should produce a valid PDF buffer');
      assert.equal(pdfBuf.subarray(0, 5).toString('ascii'), '%PDF-', 'Output must have valid PDF header');
      assert.equal(probeHits, 0, 'Headless Chromium must make ZERO outbound HTTP requests');
    } finally {
      await new Promise((resolve) => probeServer.close(resolve));
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // RISK #6: AES-256-GCM Secret Encryption at Rest
  // ─────────────────────────────────────────────────────────────────────────
  test('Risk #6: encrypts OfficePortal secrets at rest with AES-256-GCM and fails closed on tampering', async () => {
    const sampleSecret = `op_secret_${crypto.randomBytes(8).toString('hex')}`;
    const sampleWhsec = `whsec_${crypto.randomBytes(16).toString('hex')}`;

    await officePortalService.setConfigValues({
      officeportal_client_secret: sampleSecret,
      officeportal_webhook_secret: sampleWhsec
    });

    // Verify raw PostgreSQL column holds enc:v1:... ciphertext, NOT plaintext
    const rawRes = await query(
      `SELECT key, value FROM system_config WHERE key IN ('officeportal_client_secret', 'officeportal_webhook_secret')`
    );
    const byKey = Object.fromEntries(rawRes.rows.map((r) => [r.key, r.value]));
    assert.equal(isEncryptedSecret(byKey.officeportal_client_secret), true);
    assert.equal(isEncryptedSecret(byKey.officeportal_webhook_secret), true);
    assert.equal(byKey.officeportal_client_secret.includes(sampleSecret), false);
    assert.equal(byKey.officeportal_webhook_secret.includes(sampleWhsec), false);

    // Verify getConfig() decrypts transparently
    const cfg = await officePortalService.getConfig(true);
    assert.equal(cfg.clientSecret, sampleSecret);
    assert.equal(cfg.webhookSecret, sampleWhsec);

    // Verify legacy plaintext compatibility
    assert.equal(decryptSecret('legacy_plain_value'), 'legacy_plain_value');

    // Verify tampered ciphertext fails closed cleanly
    const encrypted = encryptSecret('top-secret-value');
    const parts = encrypted.split(':');
    parts[4] = Buffer.from('tampered_payload_bytes').toString('base64');
    const tampered = parts.join(':');
    assert.throws(
      () => decryptSecret(tampered),
      (err) => err.code === 'SECRET_DECRYPTION_FAILED'
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // RISK #7: SSRF & Credential Exfiltration URL Allowlist
  // ─────────────────────────────────────────────────────────────────────────
  test('Risk #7: rejects disallowed/SSRF URLs on config endpoints and enforces production HTTPS allowlist', async () => {
    // Reject evil host via /api/master-employees/hrms-config
    const res1 = await request(app)
      .put('/api/master-employees/hrms-config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ authUrl: 'https://evil.example.com/steal-secret' })
      .expect(400);
    assert.equal(res1.body.code, 'INVALID_OFFICEPORTAL_URL');

    // Reject AWS/cloud metadata SSRF via /api/admin/config
    const res2 = await request(app)
      .put('/api/admin/config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ officeportal_base_url: 'http://169.254.169.254/latest/meta-data/' })
      .expect(400);
    assert.equal(res2.body.code, 'INVALID_OFFICEPORTAL_URL');

    // Reject embedded credentials in URL
    const res3 = await request(app)
      .put('/api/master-employees/hrms-config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ baseUrl: 'https://attacker:pass@publicapi.officeportal.io/employee' })
      .expect(400);
    assert.equal(res3.body.code, 'INVALID_OFFICEPORTAL_URL');

    // Verify strict production allowlist blocks localhost/HTTP when NODE_ENV === 'production'
    const prevEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      assert.throws(
        () => assertAllowedOfficePortalUrl('http://127.0.0.1:5000/token', 'auth'),
        (err) => err.code === 'INVALID_OFFICEPORTAL_URL'
      );
      assert.throws(
        () => assertAllowedOfficePortalUrl('http://publicapi.officeportal.io/employee', 'api'),
        (err) => err.code === 'INVALID_OFFICEPORTAL_URL'
      );
      assert.equal(
        assertAllowedOfficePortalUrl('https://accounts.awarious.com/publicapi/connect/token', 'auth'),
        'https://accounts.awarious.com/publicapi/connect/token'
      );
      assert.equal(
        assertAllowedOfficePortalUrl('https://publicapi.officeportal.io/employee', 'api'),
        'https://publicapi.officeportal.io/employee'
      );
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // RISK #8: Webhook 2MB Payload Cap
  // ─────────────────────────────────────────────────────────────────────────
  test('Risk #8: enforces strict 2MB payload cap on POST /api/webhooks/officeportal', async () => {
    const oversizedPayload = JSON.stringify({ padding: 'A'.repeat(2.2 * 1024 * 1024) });
    const res = await request(app)
      .post('/api/webhooks/officeportal')
      .set('Content-Type', 'application/json')
      .set('X-Awarious-Signature', 't=1700000000,v1=deadbeef')
      .send(oversizedPayload);

    assert.equal(res.status, 413, `Expected 413 Payload Too Large, got ${res.status}`);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // RISK #9: Password Complexity Policy (>=6 chars + letter + number/symbol) & Login Rate Limiting
  // ─────────────────────────────────────────────────────────────────────────
  test('Risk #9: enforces >=6-char complex password policy and 10/15m per-account login rate limit', async () => {
    // Weak passwords rejected on registration OTP
    for (const weak of ['abcdef', '123456', 'ab12', '!!!!!!']) {
      const res = await request(app)
        .post('/api/auth/register-otp')
        .send({
          fullName: 'Weak Pw User',
          employeeId: 'NONEXISTENT_999',
          email: 'weak@example.com',
          password: weak
        })
        .expect(400);
      assert.equal(res.body.code, 'WEAK_PASSWORD', `Expected WEAK_PASSWORD for "${weak}"`);
    }

    // Complex 6-char non-trivial password passes validation (reaches HR lookup -> 400 REGISTRATION_VERIFICATION_FAILED, not WEAK_PASSWORD)
    const strongRes = await request(app)
      .post('/api/auth/register-otp')
      .set('X-Forwarded-For', '10.20.30.11')
      .send({
        fullName: 'Strong Pw User',
        employeeId: 'NONEXISTENT_999',
        email: 'strong@example.com',
        password: 'K9x#m2'
      });
    assert.equal(strongRes.status, 400);
    assert.equal(strongRes.body.code, 'REGISTRATION_VERIFICATION_FAILED');

    // Weak password also rejected on employee password reset
    const resetWeakRes = await request(app)
      .post('/api/auth/employee-reset-password')
      .send({
        employeeId: outsiderUser.employee_id,
        otp: '000000',
        newPassword: 'onlyletters'
      })
      .expect(400);
    assert.equal(resetWeakRes.body.code, 'WEAK_PASSWORD');

    // Login rate limiter: 10 failed attempts permitted, 11th returns 429
    const bruteEmpId = `BRUTE_${tag}`;
    for (let i = 1; i <= 10; i++) {
      const attempt = await request(app)
        .post('/api/auth/login')
        .send({ employeeId: bruteEmpId, password: 'WrongPassword1!' });
      assert.equal(attempt.status, 401, `Attempt ${i} should be 401`);
    }
    const blockedAttempt = await request(app)
      .post('/api/auth/login')
      .send({ employeeId: bruteEmpId, password: 'WrongPassword1!' });
    assert.equal(blockedAttempt.status, 429, '11th failed login attempt must be rate-limited (429)');

    // Different employeeId is NOT blocked by bruteEmpId's rate limit bucket
    const otherEmpAttempt = await request(app)
      .post('/api/auth/login')
      .send({ employeeId: `OTHER_${tag}`, password: 'WrongPassword1!' });
    assert.equal(otherEmpAttempt.status, 401);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // RISKS #10, #11, #14: No ?token=, HS256 Pin, No Static /uploads, Security Headers
  // ─────────────────────────────────────────────────────────────────────────
  test('Risks #10, #11, #14: rejects ?token= query JWT, blocks alg:none, removes /uploads, sets Helmet headers', async () => {
    // ?token= query parameter must NOT authenticate
    await request(app)
      .get('/api/auth/me')
      .query({ token: adminToken })
      .expect(401);

    // Forged unsigned alg:none JWT must be rejected
    const fakeHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const fakePayload = Buffer.from(JSON.stringify({ userId: adminUser.id, role: 'system_admin' })).toString('base64url');
    const algNoneToken = `${fakeHeader}.${fakePayload}.`;
    await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${algNoneToken}`)
      .expect(401);

    // Static /uploads route must return 404
    await request(app)
      .get('/uploads/any-file.pdf')
      .expect(404);

    // Helmet security headers present and X-Powered-By absent
    const healthRes = await request(app).get('/health').expect(200);
    assert.equal(healthRes.headers['x-powered-by'], undefined);
    assert.equal(healthRes.headers['referrer-policy'], 'strict-origin-when-cross-origin');
    assert.equal(healthRes.headers['x-frame-options'], 'SAMEORIGIN');
    assert.ok(healthRes.headers['strict-transport-security']);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // RISK #12: 30-Day Webhook PII Redaction & 180-Day Pruning
  // ─────────────────────────────────────────────────────────────────────────
  test('Risk #12: redacts 31-day-old processed webhook PII and prunes 181-day-old processed rows', async () => {
    const freshId = `evt-fresh-${tag}`;
    const redactId = `evt-redact-${tag}`;
    const pruneId = `evt-prune-${tag}`;
    const failedOldId = `evt-failed-${tag}`;
    createdWebhookEventIds.push(freshId, redactId, pruneId, failedOldId);

    const piiPayload = {
      eventId: redactId,
      types: ['employee.updated'],
      occurredAt: '2026-09-01T10:00:00Z',
      data: {
        employeeCode: 'EMP-PII-1',
        fullName: 'Sensitive Name',
        workEmail: 'sensitive@hospital.org',
        mobileNumber: '9999888877'
      }
    };

    await query(
      `INSERT INTO hrms_webhook_events (event_id, event_type, delivery_id, occurred_at, payload, signature_verified, status, received_at, processed_at)
       VALUES
         ($1, 'employee.updated', 'del-1', NOW() - INTERVAL '5 days', $5::jsonb, true, 'PROCESSED', NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days'),
         ($2, 'employee.updated', 'del-2', NOW() - INTERVAL '35 days', $5::jsonb, true, 'PROCESSED', NOW() - INTERVAL '35 days', NOW() - INTERVAL '35 days'),
         ($3, 'employee.updated', 'del-3', NOW() - INTERVAL '190 days', $5::jsonb, true, 'PROCESSED', NOW() - INTERVAL '190 days', NOW() - INTERVAL '190 days'),
         ($4, 'employee.updated', 'del-4', NOW() - INTERVAL '200 days', $5::jsonb, true, 'FAILED', NOW() - INTERVAL '200 days', NULL)`,
      [freshId, redactId, pruneId, failedOldId, JSON.stringify(piiPayload)]
    );

    const cleanup = await officePortalService.cleanupWebhookPiiRetention();
    assert.ok(cleanup.redactedCount >= 1);
    assert.ok(cleanup.prunedCount >= 1);

    const rowsRes = await query(
      `SELECT event_id, status, payload FROM hrms_webhook_events WHERE event_id = ANY($1::text[])`,
      [[freshId, redactId, pruneId, failedOldId]]
    );
    const byEvt = Object.fromEntries(rowsRes.rows.map((r) => [r.event_id, r]));

    // Fresh 5d row keeps full payload
    assert.equal(byEvt[freshId].payload.data.mobileNumber, '9999888877');

    // 35d processed row is redacted while keeping metadata
    assert.equal(byEvt[redactId].payload.redacted, true);
    assert.equal(byEvt[redactId].payload.employeeCode, 'EMP-PII-1');
    assert.equal(byEvt[redactId].payload.data, undefined);
    assert.equal(JSON.stringify(byEvt[redactId].payload).includes('9999888877'), false);
    assert.equal(JSON.stringify(byEvt[redactId].payload).includes('sensitive@hospital.org'), false);

    // 190d processed row is pruned
    assert.equal(byEvt[pruneId], undefined);

    // 200d FAILED row is preserved for troubleshooting
    assert.ok(byEvt[failedOldId]);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // RISKS #13 & #15: Magic-Byte Validation, Crypto S3 Keys & CSV Neutralization
  // ─────────────────────────────────────────────────────────────────────────
  test('Risks #13 & #15: rejects spoofed MIME magic bytes, uses cryptographic S3 keys, and neutralizes CSV formulas', async () => {
    const uploadApp = express();
    uploadApp.post('/upload', uploadIncidentAttachments, (req, res) => {
      res.json({
        keys: (req.files || []).map((f) => f.key)
      });
    });
    uploadApp.use((err, req, res, next) => {
      res.status(err.statusCode || 400).json({ error: err.message });
    });

    // 1. HTML script disguised as .jpg must be rejected with 400
    const spoofedJpg = path.join(scratchDir, 'evil.jpg');
    fs.writeFileSync(spoofedJpg, '<html><script>alert(1)</script></html>');
    const spoofRes = await request(uploadApp)
      .post('/upload')
      .attach('attachments', spoofedJpg, { contentType: 'image/jpeg' })
      .expect(400);
    assert.ok(spoofRes.body.error.includes('binary signature verification'));

    // 2. PDF bytes disguised as .png must be rejected with 400
    const spoofedPng = path.join(scratchDir, 'polyglot.png');
    fs.writeFileSync(spoofedPng, '%PDF-1.4\n%%EOF');
    await request(uploadApp)
      .post('/upload')
      .attach('attachments', spoofedPng, { contentType: 'image/png' })
      .expect(400);

    // 3. Valid JPEG magic bytes accepted & gets 24-hex-char crypto random key
    const validJpg = path.join(scratchDir, 'real.jpg');
    fs.writeFileSync(validJpg, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]));
    const okRes = await request(uploadApp)
      .post('/upload')
      .attach('attachments', validJpg, { contentType: 'image/jpeg' })
      .expect(200);
    assert.equal(okRes.body.keys.length, 1);
    assert.match(okRes.body.keys[0], /-[0-9a-f]{24}-real\.jpg$/);

    // 4. Direct WEBP magic byte check
    const validWebp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]);
    assert.equal(hasValidMagicBytes(validWebp, 'image/webp'), true);
    assert.equal(hasValidMagicBytes(Buffer.from('NOT_A_WEBP_FILE'), 'image/webp'), false);

    // 5. CSV formula neutralization unit & export endpoint check
    assert.equal(sanitizeCsvCell(`=CMD|' /C calc'!A0`), `'=CMD|' /C calc'!A0`);
    assert.equal(sanitizeCsvCell('+1+1'), `'+1+1`);
    assert.equal(sanitizeCsvCell('-2+3'), `'-2+3`);
    assert.equal(sanitizeCsvCell('@SUM(1,2)'), `'@SUM(1,2)`);
    assert.equal(sanitizeCsvCell('\t=1+1'), `'\t=1+1`);
    assert.equal(sanitizeCsvCell('Normal hospital text'), 'Normal hospital text');
    assert.equal(escapeCsvField('=1+1'), `"'=1+1"`);

    const csvRes = await request(app)
      .get('/api/admin/audit-logs/export')
      .query({ action: `=CMD|' /C calc'!A0_${tag}` })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.ok(csvRes.text.includes(`"'=CMD|' /C calc'!A0_${tag}"`), 'CSV export must prefix formula action with single quote');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ADVERSARIAL REGRESSIONS: Secondary BOLA, Incident Detail Letter Leaks,
  // Workflow Hijacking, HOD Team PII, Role Credentials Password Policy,
  // Double-Dot Filename Keys, Secret Edge Cases & Blank-Dept Fail-Closed
  // ─────────────────────────────────────────────────────────────────────────
  test('Adversarial regressions: GET /api/incidents/:id letter/event filtering, HOD BOLA, workflow hijacking, /hod/team PII, role-credentials password policy, and edge cases', async () => {
    // Seed an internal draft letter event on testIncidentId
    await query(
      `INSERT INTO incident_events (incident_id, seq, event_type, actor_id, actor_name, actor_role, title, summary, payload)
       VALUES ($1, 1, 'LETTER_DRAFTED', $2, $3, 'imc', 'Draft Letter Created', 'Confidential draft summary', '{"recipientName":"Confidential"}'::jsonb)`,
      [testIncidentId, imcUser.id, imcUser.full_name]
    );

    // 1. Unrelated HOD must get 403 on GET /api/incidents/:id and /api/hod/incidents/:id (no cross-department HOD IDOR)
    await request(app)
      .get(`/api/incidents/${testIncidentId}`)
      .set('Authorization', `Bearer ${hodToken}`)
      .expect(403);
    await request(app)
      .get(`/api/hod/incidents/${testIncidentId}`)
      .set('Authorization', `Bearer ${hodToken}`)
      .expect(403);

    // 2. Reporter on GET /api/incidents/:id must see ZERO draft or other-staff letters and ZERO internal draft letter events
    const repDetail = await request(app)
      .get(`/api/incidents/${testIncidentId}`)
      .set('Authorization', `Bearer ${reporterToken}`)
      .expect(200);
    assert.equal(repDetail.body.letters.length, 0, 'GET /api/incidents/:id must not leak draft or other-staff letters to reporter');
    assert.equal(
      repDetail.body.events.some((e) => e.event_type === 'LETTER_DRAFTED'),
      false,
      'GET /api/incidents/:id must not leak internal LETTER_DRAFTED events to non-privileged users'
    );

    // 3. Recipient on GET /api/incidents/:id sees ONLY their approved letter (never draft)
    const rcpDetail = await request(app)
      .get(`/api/incidents/${testIncidentId}`)
      .set('Authorization', `Bearer ${recipientToken}`)
      .expect(200);
    assert.equal(rcpDetail.body.letters.length, 1);
    assert.equal(rcpDetail.body.letters[0].id, approvedLetterId);

    // 4. Assigned trainer CAN view GET /api/incidents/:id (200) and sees zero letters
    const trDetail = await request(app)
      .get(`/api/incidents/${testIncidentId}`)
      .set('Authorization', `Bearer ${trainerToken}`)
      .expect(200);
    assert.equal(trDetail.body.letters.length, 0);

    // 5. Privileged IMC user sees BOTH letters and internal draft events
    const imcDetail = await request(app)
      .get(`/api/incidents/${testIncidentId}`)
      .set('Authorization', `Bearer ${imcToken}`)
      .expect(200);
    assert.equal(imcDetail.body.letters.length, 2);
    assert.equal(imcDetail.body.events.some((e) => e.event_type === 'LETTER_DRAFTED'), true);

    // 6. Create a submitted incident to test workflow hijacking on request-redirect & hod-feedback
    const seq2 = Math.floor(Math.random() * 800000) + 100000;
    const subIncRes = await query(
      `INSERT INTO incidents (
         reference_id, year, seq_number, reporter_id, incident_date, incident_time,
         incident_category, incident_type, occurred_to, description,
         severity, status
       )
       VALUES ($1, 2026, $2, $3, CURRENT_DATE, '11:00', 'Safety', 'Non-Clinical', 'Patient', 'Submitted incident for BOLA test', 'Minor', 'submitted')
       RETURNING id`,
      [`JPHRC/IMS/2026/${seq2}`, seq2, reporterUser.id]
    );
    const subIncId = subIncRes.rows[0].id;
    createdIncidentIds.push(subIncId);

    // Unrelated employee & unrelated HOD must be blocked (403) from hijacking redirect or submitting HOD feedback
    await request(app)
      .post(`/api/incidents/${subIncId}/request-redirect`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ reason: 'Unauthorized hijack attempt' })
      .expect(403);

    await request(app)
      .post(`/api/incidents/${subIncId}/request-redirect`)
      .set('Authorization', `Bearer ${hodToken}`)
      .send({ reason: 'Cross-department HOD hijack attempt' })
      .expect(403);

    await request(app)
      .post(`/api/incidents/${subIncId}/hod-feedback`)
      .set('Authorization', `Bearer ${hodToken}`)
      .send({ feedbackText: 'Cross-department HOD feedback attempt' })
      .expect(403);

    // Confirm incident remained untouched in 'submitted' status
    const subCheck = await query('SELECT status, redirect_requested_by_user_id FROM incidents WHERE id = $1', [subIncId]);
    assert.equal(subCheck.rows[0].status, 'submitted');
    assert.equal(subCheck.rows[0].redirect_requested_by_user_id, null);

    // 7. Regular non-HOD employee must get 403 on GET /api/hod/team (no colleague phone/email leak)
    await request(app)
      .get('/api/hod/team')
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(403);

    // 8. PUT /api/admin/role-credentials is retired (410 SHARED_LOGIN_RETIRED)
    const retiredRoleRes = await request(app)
      .put('/api/admin/role-credentials')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ targetRole: 'imc', otp: '000000', newPassword: 'onlyletters' })
      .expect(410);
    assert.equal(retiredRoleRes.body.code, 'SHARED_LOGIN_RETIRED');

    // 9. Blank-department letters must fail CLOSED for unrelated HODs
    const canViewBlankDept = canNonPrivilegedUserViewLetter(
      hodUser,
      { status: 'approved', employee_id: recipientUser.id, recipient_department: '' },
      new Set(['nursing services'])
    );
    assert.equal(canViewBlankDept, false, 'HOD must not view blank-department letters by default');

    // 10. Upload filename with ".." collapses dots so broadcast download key validation never breaks
    const uploadApp2 = express();
    uploadApp2.post('/upload', uploadIncidentAttachments, (req, res) => {
      res.json({
        keys: (req.files || []).map((f) => f.key),
        hasBuffers: (req.files || []).map((f) => Boolean(f.buffer))
      });
    });
    const dotJpg = path.join(scratchDir, 'circular..v2.jpg');
    fs.writeFileSync(dotJpg, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]));
    const dotRes = await request(uploadApp2)
      .post('/upload')
      .attach('attachments', dotJpg, { contentType: 'image/jpeg' })
      .expect(200);
    assert.equal(dotRes.body.keys[0].includes('..'), false, 'Generated S3 key must not contain ".."');
    assert.equal(dotRes.body.hasBuffers[0], false, 'In-memory file buffer should be freed after middleware');

    // 11. Malformed "enc:v1:" plaintext is encrypted cleanly instead of corrupting getConfig(); non-443 port blocked in prod
    const malformedPrefixed = 'enc:v1:user-typed-literal';
    const reEncrypted = encryptSecret(malformedPrefixed);
    assert.notEqual(reEncrypted, malformedPrefixed);
    assert.equal(decryptSecret(reEncrypted), malformedPrefixed);

    const prevEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      assert.throws(
        () => assertAllowedOfficePortalUrl('https://accounts.awarious.com:8443/publicapi/connect/token', 'auth'),
        (err) => err.code === 'INVALID_OFFICEPORTAL_URL'
      );
    } finally {
      process.env.NODE_ENV = prevEnv;
    }

    // 12. CSV sanitizer neutralizes leading newline formula payloads
    assert.equal(sanitizeCsvCell('\n=1+1'), `'\n=1+1`);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CRITICAL REGRESSION: No Hardcoded '123456' Password in getOrCreateUserFromMaster()
  // ─────────────────────────────────────────────────────────────────────────
  test('Critical regression: assigning privileged roles via all getOrCreateUserFromMaster paths leaves password_hash NULL and rejects login with 123456 (401 NOT_REGISTERED)', async () => {
    const unregAdminEmpId = `${tag}_UNREG_ADM`;
    const unregImcEmpId = `${tag}_UNREG_IMC`;
    const unregLeaderEmpId = `${tag}_UNREG_HOD`;
    const unregReviewerEmpId = `${tag}_UNREG_REV`;

    // Seed four active master_employees with NO corresponding rows in users
    await query(
      `INSERT INTO master_employees (employee_id, name, email, phone, department, designation, role, status)
       VALUES
         ($1, $2, $3, '9876543211', 'Nursing Services', 'Nursing Superintendent', 'employee', 'active'),
         ($4, $5, $6, '9876543212', 'Medical Services', 'Senior Consultant', 'employee', 'active'),
         ($7, $8, $9, '9876543213', 'Quality Assurance', 'Department Lead', 'employee', 'active'),
         ($10, $11, $12, '9876543214', 'Quality Assurance', 'Senior Reviewer', 'employee', 'active')`,
      [
        unregAdminEmpId,
        `Unregistered Admin ${tag}`,
        `${unregAdminEmpId.toLowerCase()}@test.jphrc.local`,
        unregImcEmpId,
        `Unregistered IMC ${tag}`,
        `${unregImcEmpId.toLowerCase()}@test.jphrc.local`,
        unregLeaderEmpId,
        `Unregistered Leader ${tag}`,
        `${unregLeaderEmpId.toLowerCase()}@test.jphrc.local`,
        unregReviewerEmpId,
        `Unregistered Reviewer ${tag}`,
        `${unregReviewerEmpId.toLowerCase()}@test.jphrc.local`
      ]
    );
    createdMasterEmpIds.push(unregAdminEmpId, unregImcEmpId, unregLeaderEmpId, unregReviewerEmpId);

    // Create a temporary department for testing map-department-leader & department-reviewers
    const tmpDeptRes = await query(
      `INSERT INTO departments (name, is_hrms_synced) VALUES ($1, FALSE) RETURNING id`,
      [`Temp Sec Dept ${tag}`]
    );
    const tmpDeptId = tmpDeptRes.rows[0].id;
    createdDepartmentIds.push(tmpDeptId);

    // 0. Invalid targetRole is rejected with 400 before provisioning any user row
    await request(app)
      .post('/api/admin/assign-role')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ employeeId: unregAdminEmpId, targetRole: 'superadmin' })
      .expect(400);

    // 1. Admin maps unregistered master employee to system_admin via POST /api/admin/assign-role (case-insensitive empId)
    await request(app)
      .post('/api/admin/assign-role')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ employeeId: unregAdminEmpId.toLowerCase(), targetRole: 'system_admin' })
      .expect(200);

    const provisionedAdmin = await query(
      'SELECT id, employee_id, password_hash, is_system_admin, is_active FROM users WHERE employee_id = $1',
      [unregAdminEmpId]
    );
    assert.equal(provisionedAdmin.rows.length, 1);
    createdUserIds.push(provisionedAdmin.rows[0].id);
    assert.equal(provisionedAdmin.rows[0].is_system_admin, true);
    assert.equal(provisionedAdmin.rows[0].is_active, true);
    assert.equal(provisionedAdmin.rows[0].password_hash, null, 'Provisioned privileged user must have password_hash = NULL');

    // Attempt login with legacy hardcoded password '123456' -> must fail with uniform 401 INVALID_CREDENTIALS (anti-enumeration)
    const adminLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ employeeId: unregAdminEmpId, password: '123456' })
      .expect(401);
    assert.equal(adminLoginRes.body.code, 'INVALID_CREDENTIALS');

    // 2. Admin maps another unregistered master employee to IMC Lead via POST /api/admin/assign-imc
    await request(app)
      .post('/api/admin/assign-imc')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ employeeId: unregImcEmpId, isImcLead: true })
      .expect(200);

    const provisionedImc = await query(
      'SELECT id, employee_id, password_hash, role, is_imc_member, is_imc_lead FROM users WHERE employee_id = $1',
      [unregImcEmpId]
    );
    assert.equal(provisionedImc.rows.length, 1);
    createdUserIds.push(provisionedImc.rows[0].id);
    assert.equal(provisionedImc.rows[0].role, 'imc');
    assert.equal(provisionedImc.rows[0].is_imc_member, true);
    assert.equal(provisionedImc.rows[0].is_imc_lead, true);
    assert.equal(provisionedImc.rows[0].password_hash, null, 'Provisioned IMC user must have password_hash = NULL');

    const imcLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ employeeId: unregImcEmpId, password: '123456' })
      .expect(401);
    assert.equal(imcLoginRes.body.code, 'INVALID_CREDENTIALS');

    // 3. Admin maps unregistered master employee as department leader via POST /api/admin/map-department-leader
    await request(app)
      .post('/api/admin/map-department-leader')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ departmentId: tmpDeptId, employeeId: unregLeaderEmpId })
      .expect(200);

    const provisionedLeader = await query(
      'SELECT id, employee_id, password_hash, role FROM users WHERE employee_id = $1',
      [unregLeaderEmpId]
    );
    assert.equal(provisionedLeader.rows.length, 1);
    createdUserIds.push(provisionedLeader.rows[0].id);
    assert.equal(provisionedLeader.rows[0].role, 'employee');
    assert.equal(provisionedLeader.rows[0].password_hash, null, 'Provisioned department leader must have password_hash = NULL');

    const leaderLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ employeeId: unregLeaderEmpId, password: '123456' })
      .expect(401);
    assert.equal(leaderLoginRes.body.code, 'INVALID_CREDENTIALS');

    // 4. Admin maps unregistered master employee as department reviewer via POST /api/admin/department-reviewers
    await request(app)
      .post('/api/admin/department-reviewers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ employeeId: unregReviewerEmpId, departmentIds: [tmpDeptId] })
      .expect(200);

    const provisionedReviewer = await query(
      'SELECT id, employee_id, password_hash, role FROM users WHERE employee_id = $1',
      [unregReviewerEmpId]
    );
    assert.equal(provisionedReviewer.rows.length, 1);
    createdUserIds.push(provisionedReviewer.rows[0].id);
    assert.equal(provisionedReviewer.rows[0].role, 'employee');
    assert.equal(provisionedReviewer.rows[0].password_hash, null, 'Provisioned department reviewer must have password_hash = NULL');

    const reviewerLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ employeeId: unregReviewerEmpId, password: '123456' })
      .expect(401);
    assert.equal(reviewerLoginRes.body.code, 'INVALID_CREDENTIALS');

    // 5. Unregistered skeleton user cannot abuse employee-forgot-password before registration (returns uniform 200 anti-enumeration and creates ZERO OTP rows)
    const forgotUnregRes = await request(app)
      .post('/api/auth/employee-forgot-password')
      .set('X-Forwarded-For', '10.20.30.41')
      .send({
        employeeId: unregAdminEmpId,
        email: `${unregAdminEmpId.toLowerCase()}@test.jphrc.local`
      })
      .expect(200);
    assert.equal(forgotUnregRes.body.success, true);
    const unregOtpCheck = await query(
      `SELECT id FROM security_otps WHERE employee_id = $1 AND action = 'employee_password_reset'`,
      [unregAdminEmpId]
    );
    assert.equal(unregOtpCheck.rows.length, 0, 'Unregistered skeleton user must NOT receive a password-reset OTP');

    // 6. End-to-end OTP self-registration on skeleton privileged account:
    //    - 1-char fullName bypass is blocked (400 REGISTRATION_VERIFICATION_FAILED)
    //    - deactivated skeleton is blocked (403 ACCOUNT_DEACTIVATED)
    //    - legitimate registration preserves canonical full_name & is_system_admin flag and hashes at bcrypt cost 12
    const unregAdminEmail = `${unregAdminEmpId.toLowerCase()}@test.jphrc.local`;
    createdOtpEmpIds.push(unregAdminEmpId);
    const seedRegOtp = async (code) => {
      const hash = computeOtpMac(unregAdminEmpId, 'registration', unregAdminEmail, code);
      await query('DELETE FROM security_otps WHERE employee_id = $1 AND action = $2', [unregAdminEmpId, 'registration']);
      await query(
        `INSERT INTO security_otps (employee_id, action, otp_hash, target_email, attempts, max_attempts, expires_at)
         VALUES ($1, 'registration', $2, $3, 0, 5, NOW() + INTERVAL '10 minutes')`,
        [unregAdminEmpId, hash, unregAdminEmail]
      );
    };

    // 6a. 1-character fullName bypass must fail with 400 REGISTRATION_VERIFICATION_FAILED
    await seedRegOtp('112233');
    const shortNameRes = await request(app)
      .post('/api/auth/register')
      .set('X-Forwarded-For', '10.20.30.42')
      .send({
        fullName: 'a',
        employeeId: unregAdminEmpId,
        email: unregAdminEmail,
        password: 'StrongReg123!',
        otp: '112233'
      })
      .expect(400);
    assert.equal(shortNameRes.body.code, 'REGISTRATION_VERIFICATION_FAILED');

    // 6b. Manually deactivated skeleton account must fail with 403 ACCOUNT_DEACTIVATED
    await query('UPDATE users SET is_active = FALSE WHERE id = $1', [provisionedAdmin.rows[0].id]);
    await seedRegOtp('223344');
    const deactRegRes = await request(app)
      .post('/api/auth/register')
      .send({
        fullName: 'Unregistered Admin',
        employeeId: unregAdminEmpId,
        email: `${unregAdminEmpId.toLowerCase()}@test.jphrc.local`,
        password: 'StrongReg123!',
        otp: '223344'
      })
      .expect(403);
    assert.equal(deactRegRes.body.code, 'ACCOUNT_DEACTIVATED');

    // 6c. Re-activate and complete legitimate partial-name registration
    await query('UPDATE users SET is_active = TRUE WHERE id = $1', [provisionedAdmin.rows[0].id]);
    await seedRegOtp('334455');
    await request(app)
      .post('/api/auth/register')
      .send({
        fullName: 'Unregistered Admin',
        employeeId: unregAdminEmpId,
        email: `${unregAdminEmpId.toLowerCase()}@test.jphrc.local`,
        password: 'StrongReg123!',
        otp: '334455'
      })
      .expect(201);

    const registeredAdmin = await query(
      'SELECT full_name, password_hash, is_system_admin FROM users WHERE id = $1',
      [provisionedAdmin.rows[0].id]
    );
    assert.equal(registeredAdmin.rows[0].is_system_admin, true, 'is_system_admin flag must survive self-registration');
    assert.equal(
      registeredAdmin.rows[0].full_name,
      `Unregistered Admin ${tag}`,
      'Canonical HRMS full_name must not be overwritten by partial registration input'
    );
    assert.match(
      registeredAdmin.rows[0].password_hash,
      /^\$2[ab]\$12\$/,
      'Registration must hash passwords with bcrypt cost 12'
    );

    // Login with '123456' still fails; login with newly registered password succeeds with isSystemAdmin = true
    await request(app)
      .post('/api/auth/login')
      .send({ employeeId: unregAdminEmpId, password: '123456' })
      .expect(401);

    const regLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ employeeId: unregAdminEmpId, password: 'StrongReg123!' })
      .expect(200);
    assert.equal(regLoginRes.body.user.isSystemAdmin, true);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // RETIRED SHARED COMMITTEE ENDPOINTS (410 SHARED_LOGIN_RETIRED)
  // ─────────────────────────────────────────────────────────────────────────
  test('Retired shared committee logins: POST /api/auth/reset-password and /committee-login return 410 SHARED_LOGIN_RETIRED without mutating role_credentials', async () => {
    const res1 = await request(app)
      .post('/api/auth/reset-password')
      .set('X-Forwarded-For', '10.20.30.43')
      .send({
        username: 'IMC2026',
        targetRole: 'toString',
        otp: '123456',
        newPassword: 'StrongReset123!'
      })
      .expect(410);
    assert.equal(res1.body.code, 'SHARED_LOGIN_RETIRED');

    const res2 = await request(app)
      .post('/api/auth/committee-login')
      .set('X-Forwarded-For', '10.20.30.43')
      .send({
        username: 'IMC2026',
        targetRole: 'imc',
        password: 'AnyPassword1!'
      })
      .expect(410);
    assert.equal(res2.body.code, 'SHARED_LOGIN_RETIRED');
  });
});

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const request = require('supertest');

process.env.NODE_ENV = 'test';

const { app } = require('../index');
const { query, getClient } = require('../config/database');
const { getRuntimeSystemConfig, invalidateSystemConfigCache } = require('../utils/systemConfigCache');
const { sendOtp } = require('../utils/otpService');
const { processHodEscalations } = require('../services/cronService');
const { upsertMasterEmployee } = require('../services/officePortalService');

function signTestJwt(user) {
  return jwt.sign(
    {
      userId: user.id,
      employeeId: user.employee_id,
      role: user.role,
      tv: typeof user.token_version === 'number' ? user.token_version : 1
    },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' }
  );
}

function getLocalTodayIso() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('-');
}

describe('Batch 2 Workflow Fixes (#8, #9, #10, #11, #12, #13)', () => {
  const tag = `B2_${Date.now().toString(36).toUpperCase()}`;
  const createdUserIds = [];
  const createdMasterEmpIds = [];
  const createdIncidentIds = [];
  let createdCategoryId = null;
  let mainLocationId = 1;
  let originalSystemConfig = {};

  let adminUser;
  let imcLeadUser;
  let mgmtUser;
  let catReviewerEmp;
  let hodUser;
  let regularEmp;
  let unregisteredEmpId;

  let adminToken;
  let imcLeadToken;
  let catReviewerToken;
  let hodToken;
  let regularEmpToken;

  let catAssigned;

  before(async () => {
    // Snapshot system_config keys we will touch
    const cfgRes = await query(
      `SELECT key, value FROM system_config WHERE key IN (
        'maintenance_mode', 'otp_validity_minutes', 'imc_feedback_days',
        'mgmt_feedback_days', 'auto_reminder_days', 'hod_reminder_1_days', 'hod_reminder_2_days'
      )`
    );
    for (const r of cfgRes.rows) {
      originalSystemConfig[r.key] = r.value;
    }

    const locRes = await query(`SELECT id FROM main_locations ORDER BY id ASC LIMIT 1`);
    if (locRes.rows.length > 0) {
      mainLocationId = locRes.rows[0].id;
    }

    const catRes = await query(
      `INSERT INTO incident_categories (name, is_active) VALUES ($1, TRUE) RETURNING id, name`,
      [`Cat ${tag}`]
    );
    catAssigned = catRes.rows[0];
    createdCategoryId = catAssigned.id;

    const createUser = async ({
      suffix,
      role = 'employee',
      designation = 'Staff',
      department = `Dept_${tag}`,
      isAdmin = false,
      isImc = false,
      isImcLead = false,
      isMgmt = false
    }) => {
      const empId = `${tag}_${suffix}`;
      const email = `${empId.toLowerCase()}@test.jphrc.local`;
      await query(
        `INSERT INTO master_employees (employee_id, name, email, department, designation, role, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'active')`,
        [empId, `Test ${suffix}`, email, department, designation, role]
      );
      createdMasterEmpIds.push(empId);

      const uRes = await query(
        `INSERT INTO users (
           employee_id, full_name, email, department, designation, role,
           is_active, is_system_admin, is_imc_member, is_imc_lead, is_management_member, token_version
         ) VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, $8, $9, $10, 1)
         RETURNING *`,
        [empId, `Test ${suffix}`, email, department, designation, role, isAdmin, isImc, isImcLead, isMgmt]
      );
      const user = uRes.rows[0];
      createdUserIds.push(user.id);
      return user;
    };

    adminUser = await createUser({ suffix: 'ADMIN', role: 'system_admin', isAdmin: true });
    imcLeadUser = await createUser({ suffix: 'IMCLEAD', role: 'imc', isImc: true, isImcLead: true });
    mgmtUser = await createUser({ suffix: 'MGMT', role: 'head_management', isMgmt: true });
    catReviewerEmp = await createUser({ suffix: 'CATREV', role: 'employee' });
    hodUser = await createUser({ suffix: 'HOD', role: 'hod', designation: 'HOD', department: `HODDept_${tag}` });
    regularEmp = await createUser({ suffix: 'REGEMP', role: 'employee' });

    // Create an unregistered employee in master_employees only (no users row)
    unregisteredEmpId = `${tag}_UNREG`;
    await query(
      `INSERT INTO master_employees (employee_id, name, email, department, designation, role, status)
       VALUES ($1, $2, $3, $4, $5, 'employee', 'active')`,
      [unregisteredEmpId, `Unregistered Staff ${tag}`, `${unregisteredEmpId.toLowerCase()}@test.jphrc.local`, 'Nursing', 'Educator']
    );
    createdMasterEmpIds.push(unregisteredEmpId);

    // Map catReviewerEmp to catAssigned
    await query(
      `INSERT INTO category_feedback_assignees (category_id, user_id, is_active)
       VALUES ($1, $2, TRUE)`,
      [catAssigned.id, catReviewerEmp.id]
    );

    adminToken = signTestJwt(adminUser);
    imcLeadToken = signTestJwt(imcLeadUser);
    catReviewerToken = signTestJwt(catReviewerEmp);
    hodToken = signTestJwt(hodUser);
    regularEmpToken = signTestJwt(regularEmp);
  });

  after(async () => {
    try {
      // Restore original system_config values
      const keys = [
        'maintenance_mode', 'otp_validity_minutes', 'imc_feedback_days',
        'mgmt_feedback_days', 'auto_reminder_days', 'hod_reminder_1_days', 'hod_reminder_2_days'
      ];
      for (const k of keys) {
        if (Object.prototype.hasOwnProperty.call(originalSystemConfig, k)) {
          await query(`UPDATE system_config SET value = $1 WHERE key = $2`, [originalSystemConfig[k], k]);
        } else {
          await query(`DELETE FROM system_config WHERE key = $1`, [k]);
        }
      }
      invalidateSystemConfigCache();

      if (createdIncidentIds.length > 0) {
        await query(`DELETE FROM notifications WHERE incident_id = ANY($1::uuid[])`, [createdIncidentIds]);
        await query(`DELETE FROM incident_letters WHERE incident_id = ANY($1::uuid[])`, [createdIncidentIds]);
        await query(`DELETE FROM incident_trainers WHERE incident_id = ANY($1::uuid[])`, [createdIncidentIds]);
        await query(`DELETE FROM attachments WHERE incident_id = ANY($1::uuid[])`, [createdIncidentIds]);
        await query(`DELETE FROM feedbacks WHERE incident_id = ANY($1::uuid[])`, [createdIncidentIds]);
        await query(`DELETE FROM investigators WHERE incident_id = ANY($1::uuid[])`, [createdIncidentIds]);
        await query(`DELETE FROM incident_responsible_employees WHERE incident_id = ANY($1::uuid[])`, [createdIncidentIds]);
        await query(`DELETE FROM incident_category_links WHERE incident_id = ANY($1::uuid[])`, [createdIncidentIds]);
        await query(`DELETE FROM incident_departments WHERE incident_id = ANY($1::uuid[])`, [createdIncidentIds]);
        await query(`DELETE FROM incident_events WHERE incident_id = ANY($1::uuid[])`, [createdIncidentIds]);
        await query(`DELETE FROM audit_logs WHERE incident_id = ANY($1::uuid[])`, [createdIncidentIds]);
        await query(`DELETE FROM incidents WHERE id = ANY($1::uuid[])`, [createdIncidentIds]);
      }

      if (createdCategoryId) {
        await query(`DELETE FROM category_feedback_assignees WHERE category_id = $1`, [createdCategoryId]);
        await query(`DELETE FROM incident_categories WHERE id = $1`, [createdCategoryId]);
      }

      if (createdUserIds.length > 0) {
        await query(`DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, [createdUserIds]);
        await query(`DELETE FROM audit_logs WHERE user_id = ANY($1::uuid[])`, [createdUserIds]);
        await query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [createdUserIds]);
      }

      if (createdMasterEmpIds.length > 0) {
        await query(`DELETE FROM security_otps WHERE employee_id = ANY($1::text[])`, [createdMasterEmpIds]);
        await query(`DELETE FROM master_employees WHERE employee_id = ANY($1::text[])`, [createdMasterEmpIds]);
      }
    } catch (cleanupErr) {
      console.error('Batch 2 cleanup error:', cleanupErr.message);
    }
  });

  test('#8 & #9: Employee-role Category Reviewer sees separate Reviewer vs Personal queues and Personal Total excludes Withdrawn', async () => {
    // 1. Create an incident reported by regularEmp under catAssigned (assigned to catReviewerEmp for review)
    const assignedIncRes = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${regularEmpToken}`)
      .send({
        incidentDate: getLocalTodayIso(),
        incidentTime: '09:30',
        mainLocationId,
        subLocationText: 'Ward 1',
        occurredTo: 'Patient',
        incidentCategories: [catAssigned.name],
        incidentTypes: ['Type Assigned'],
        description: `Assigned review incident ${tag}`
      });
    assert.equal(assignedIncRes.status, 201);
    const assignedIncidentId = assignedIncRes.body.incident.id;
    createdIncidentIds.push(assignedIncidentId);

    // 2. Create a personal incident reported by catReviewerEmp under an unmapped/different category or direct DB insert
    const personalActiveRes = await query(
      `INSERT INTO incidents (
         reference_id, year, seq_number, reporter_id, incident_date, incident_time,
         main_location_id, occurred_to, severity, incident_category, incident_type,
         description, status
       ) VALUES ($1, 2026, $2, $3, CURRENT_DATE, '10:00', $4, 'Patient', 'Pending', 'General', 'Other', $5, 'with_imc')
       RETURNING id`,
      [`JPHRC/IMS/2026/9${Math.floor(1000 + Math.random() * 8999)}`, Math.floor(100000 + Math.random() * 899999), catReviewerEmp.id, mainLocationId, `Personal active ${tag}`]
    );
    const personalActiveId = personalActiveRes.rows[0].id;
    createdIncidentIds.push(personalActiveId);

    // 3. Create a Withdrawn personal incident reported by catReviewerEmp
    const personalWithdrawnRes = await query(
      `INSERT INTO incidents (
         reference_id, year, seq_number, reporter_id, incident_date, incident_time,
         main_location_id, occurred_to, severity, incident_category, incident_type,
         description, status
       ) VALUES ($1, 2026, $2, $3, CURRENT_DATE, '10:15', $4, 'Patient', 'Pending', 'General', 'Other', $5, 'withdrawn')
       RETURNING id`,
      [`JPHRC/IMS/2026/9${Math.floor(1000 + Math.random() * 8999)}`, Math.floor(100000 + Math.random() * 899999), catReviewerEmp.id, mainLocationId, `Personal withdrawn ${tag}`]
    );
    const personalWithdrawnId = personalWithdrawnRes.rows[0].id;
    createdIncidentIds.push(personalWithdrawnId);

    // 4. Reviewer tab (viewMode=department) must include assignedIncidentId and exclude personalActiveId
    const reviewerListRes = await request(app)
      .get('/api/incidents?viewMode=department&limit=50')
      .set('Authorization', `Bearer ${catReviewerToken}`);
    assert.equal(reviewerListRes.status, 200);
    const reviewerIds = reviewerListRes.body.incidents.map((i) => i.id);
    assert.ok(reviewerIds.includes(assignedIncidentId), 'Reviewer queue should contain category-assigned incident');
    assert.ok(!reviewerIds.includes(personalActiveId), 'Reviewer queue must not contain personal-only incident');

    // 5. Personal tab (viewMode=my_incidents) must include personalActiveId and exclude assignedIncidentId
    const personalListRes = await request(app)
      .get('/api/incidents?viewMode=my_incidents&limit=50')
      .set('Authorization', `Bearer ${catReviewerToken}`);
    assert.equal(personalListRes.status, 200);
    const personalIds = personalListRes.body.incidents.map((i) => i.id);
    assert.ok(personalIds.includes(personalActiveId), 'Personal queue should contain personal active incident');
    assert.ok(!personalIds.includes(assignedIncidentId), 'Personal queue must not contain category-assigned review incident');

    // 6. Dashboard stats for catReviewerEmp in Personal View (viewMode=my_incidents):
    //    hodReport.myIncidents.total and totals.total must both equal 1 (excluding the 1 withdrawn incident)
    const statsPersonalRes = await request(app)
      .get('/api/incidents/stats?viewMode=my_incidents')
      .set('Authorization', `Bearer ${catReviewerToken}`);
    assert.equal(statsPersonalRes.status, 200);
    assert.equal(statsPersonalRes.body.totals.total, 1, 'totals.total should exclude withdrawn incident');
    assert.equal(statsPersonalRes.body.totals.withdrawn, 1, 'totals.withdrawn should count withdrawn incident');
    assert.ok(statsPersonalRes.body.hodReport, 'Category reviewer should receive hodReport');
    assert.equal(
      statsPersonalRes.body.hodReport.myIncidents.total,
      1,
      'hodReport.myIncidents.total must exclude withdrawn incidents (#9 Option A)'
    );
    assert.equal(statsPersonalRes.body.hodReport.myIncidents.withdrawn, 1);

    // 7. Dashboard stats in Reviewer View (viewMode=department) must match assigned scope (1 incident)
    const statsReviewerRes = await request(app)
      .get('/api/incidents/stats?viewMode=department')
      .set('Authorization', `Bearer ${catReviewerToken}`);
    assert.equal(statsReviewerRes.status, 200);
    assert.equal(statsReviewerRes.body.totals.total, 1);
    assert.equal(statsReviewerRes.body.hodReport.received, 1);
  });

  test('#10: Legacy Department Reviewer (role=hod) CC’d on approved letter or appointed as Trainer sees those incidents in My Incidents', async () => {
    // Create two incidents reported by regularEmp (not in hodUser's department)
    const incLetterRes = await query(
      `INSERT INTO incidents (
         reference_id, year, seq_number, reporter_id, incident_date, incident_time,
         main_location_id, occurred_to, severity, incident_category, incident_type,
         description, status
       ) VALUES ($1, 2026, $2, $3, CURRENT_DATE, '11:00', $4, 'Patient', 'Major', 'Clinical', 'Care', $5, 'resolved')
       RETURNING id`,
      [`JPHRC/IMS/2026/8${Math.floor(1000 + Math.random() * 8999)}`, Math.floor(200000 + Math.random() * 699999), regularEmp.id, mainLocationId, `HOD CC letter incident ${tag}`]
    );
    const letterIncidentId = incLetterRes.rows[0].id;
    createdIncidentIds.push(letterIncidentId);

    const incTrainerRes = await query(
      `INSERT INTO incidents (
         reference_id, year, seq_number, reporter_id, incident_date, incident_time,
         main_location_id, occurred_to, severity, incident_category, incident_type,
         description, status
       ) VALUES ($1, 2026, $2, $3, CURRENT_DATE, '11:30', $4, 'Patient', 'Pending', 'Clinical', 'Training', $5, 'training_in_progress')
       RETURNING id`,
      [`JPHRC/IMS/2026/8${Math.floor(1000 + Math.random() * 8999)}`, Math.floor(200000 + Math.random() * 699999), regularEmp.id, mainLocationId, `HOD Trainer incident ${tag}`]
    );
    const trainerIncidentId = incTrainerRes.rows[0].id;
    createdIncidentIds.push(trainerIncidentId);

    // Attach an approved letter on letterIncidentId where hodUser is in cc_recipients
    await query(
      `INSERT INTO incident_letters (
         incident_id, employee_id, recipient_name, recipient_emp_no,
         template_type, reference_number, letter_date, subject,
         salutation, body_text, status, cc_recipients, drafted_by
       ) VALUES (
         $1, $2, 'Some Staff', $2,
         'advisory', $3, CURRENT_DATE, 'Advisory',
         'Dear Staff,', 'Body text', 'approved', $4::jsonb, $5
       )`,
      [
        letterIncidentId,
        regularEmp.employee_id,
        `JPHRC/ADV/2026/${Math.floor(1000 + Math.random() * 8999)}`,
        JSON.stringify([
          {
            user_id: hodUser.id,
            employee_id: hodUser.employee_id,
            full_name: hodUser.full_name,
            designation: hodUser.designation,
            department: hodUser.department
          }
        ]),
        imcLeadUser.id
      ]
    );

    // Appoint hodUser as trainer on trainerIncidentId
    await query(
      `INSERT INTO incident_trainers (
         incident_id, trainer_id, assigned_by, trainee_employee_id, trainee_name, training_topic, status
       ) VALUES ($1, $2, $3, $4, $5, 'Safety SOP', 'assigned')`,
      [trainerIncidentId, hodUser.id, imcLeadUser.id, regularEmp.employee_id, regularEmp.full_name]
    );

    // Query GET /api/incidents?viewMode=my_incidents as hodUser
    const hodPersonalList = await request(app)
      .get('/api/incidents?viewMode=my_incidents&limit=50')
      .set('Authorization', `Bearer ${hodToken}`);
    assert.equal(hodPersonalList.status, 200);
    const returnedIds = hodPersonalList.body.incidents.map((i) => i.id);
    assert.ok(returnedIds.includes(letterIncidentId), 'HOD My Incidents queue must include incident where HOD is CC’d on approved letter');
    assert.ok(returnedIds.includes(trainerIncidentId), 'HOD My Incidents queue must include incident where HOD is appointed as Trainer');

    // Verify dashboard stats in Personal View also counts both incidents for hodUser
    const hodPersonalStats = await request(app)
      .get('/api/incidents/stats?viewMode=my_incidents')
      .set('Authorization', `Bearer ${hodToken}`);
    assert.equal(hodPersonalStats.status, 200);
    assert.equal(hodPersonalStats.body.totals.total, 2);
    assert.equal(hodPersonalStats.body.hodReport.myIncidents.total, 2);
  });

  test('#11: 5 System Settings (maintenance_mode, otp_validity_minutes, imc_feedback_days, mgmt_feedback_days, auto_reminder_days) and 30s cache invalidation on save', async () => {
    // 1. Update all 5 settings via PUT /api/admin/config
    const updateRes = await request(app)
      .put('/api/admin/config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        maintenance_mode: 'true',
        otp_validity_minutes: '25',
        imc_feedback_days: '3',
        mgmt_feedback_days: '4',
        auto_reminder_days: '2',
        hod_reminder_1_days: '5',
        hod_reminder_2_days: '7'
      });
    assert.equal(updateRes.status, 200);

    // 2. Verify cache invalidated immediately on save and reflects new values
    const cfg = await getRuntimeSystemConfig();
    assert.equal(cfg.maintenance_mode, true);
    assert.equal(cfg.otp_validity_minutes, 25);
    assert.equal(cfg.imc_feedback_days, 3);
    assert.equal(cfg.mgmt_feedback_days, 4);
    assert.equal(cfg.auto_reminder_days, 2);

    // 3. Verify GET /api/auth/me exposes maintenanceMode: true
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${regularEmpToken}`);
    assert.equal(meRes.status, 200);
    assert.equal(meRes.body.maintenanceMode, true);

    // 4. Verify non-admin incident creation is blocked with 503 MAINTENANCE_MODE
    const blockedCreateRes = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${regularEmpToken}`)
      .send({
        incidentDate: getLocalTodayIso(),
        incidentTime: '12:00',
        mainLocationId,
        subLocationText: 'OPD',
        occurredTo: 'Patient',
        incidentCategories: [catAssigned.name],
        incidentTypes: ['Fall'],
        description: 'Should be blocked during maintenance'
      });
    assert.equal(blockedCreateRes.status, 503);
    assert.equal(blockedCreateRes.body.code, 'MAINTENANCE_MODE');

    // Turn off maintenance_mode via PUT /api/admin/config and confirm immediate cache invalidation
    await request(app)
      .put('/api/admin/config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ maintenance_mode: 'false' });
    const cfgAfter = await getRuntimeSystemConfig();
    assert.equal(cfgAfter.maintenance_mode, false);

    // 5. Verify sendOtp uses configured otp_validity_minutes (25 minutes = ~1500 seconds)
    const sent = await sendOtp(
      regularEmp.employee_id,
      regularEmp.email,
      'employee_password_reset',
      { bypassCooldown: true }
    );
    assert.equal(sent, true);
    const otpRowRes = await query(
      `SELECT EXTRACT(EPOCH FROM (expires_at - NOW())) AS ttl_seconds
       FROM security_otps
       WHERE employee_id = $1 AND action = 'employee_password_reset'
       LIMIT 1`,
      [regularEmp.employee_id]
    );
    assert.equal(otpRowRes.rows.length, 1);
    const ttlSeconds = Number(otpRowRes.rows[0].ttl_seconds);
    assert.ok(ttlSeconds > 23 * 60 && ttlSeconds <= 25 * 60 + 5, `Expected ~25 min OTP TTL, got ${ttlSeconds}s`);

    // 6. Verify cronService uses auto_reminder_days, imc_feedback_days, and mgmt_feedback_days
    // 6a. Pending reviewer incident at 6 days elapsed (between rem1=5 and rem2=7) with last_reminder_day=5 and reminder_last_sent=3 days ago (>= auto_reminder_days=2)
    const cronHodInc = await query(
      `INSERT INTO incidents (
         reference_id, year, seq_number, reporter_id, incident_date, incident_time,
         main_location_id, occurred_to, severity, incident_category, incident_type,
         description, status, created_at, last_reminder_day, reminder_last_sent
       ) VALUES (
         $1, 2026, $2, $3, CURRENT_DATE - INTERVAL '6 days', '09:00',
         $4, 'Patient', 'Pending', $5, 'Type', 'Cron HOD auto reminder test', 'with_hod',
         NOW() - INTERVAL '6 days', 5, NOW() - INTERVAL '3 days'
       ) RETURNING id, reference_id`,
      [`JPHRC/IMS/2026/7${Math.floor(1000 + Math.random() * 8999)}`, Math.floor(300000 + Math.random() * 599999), regularEmp.id, mainLocationId, catAssigned.name]
    );
    const cronHodIncId = cronHodInc.rows[0].id;
    createdIncidentIds.push(cronHodIncId);
    await query(
      `INSERT INTO incident_category_links (incident_id, category_id, incident_type) VALUES ($1, $2, 'Type')`,
      [cronHodIncId, catAssigned.id]
    );

    // 6b. Overdue IMC incident in 'with_imc' for 4 days (>= imc_feedback_days=3)
    const cronImcInc = await query(
      `INSERT INTO incidents (
         reference_id, year, seq_number, reporter_id, incident_date, incident_time,
         main_location_id, occurred_to, severity, incident_category, incident_type,
         description, status, created_at
       ) VALUES (
         $1, 2026, $2, $3, CURRENT_DATE - INTERVAL '4 days', '09:00',
         $4, 'Patient', 'Pending', 'General', 'Type', 'Cron IMC deadline test', 'with_imc',
         NOW() - INTERVAL '4 days'
       ) RETURNING id, reference_id`,
      [`JPHRC/IMS/2026/7${Math.floor(1000 + Math.random() * 8999)}`, Math.floor(300000 + Math.random() * 599999), regularEmp.id, mainLocationId]
    );
    const cronImcIncId = cronImcInc.rows[0].id;
    createdIncidentIds.push(cronImcIncId);

    // 6c. Overdue Management incident in 'with_head_management' for 5 days (>= mgmt_feedback_days=4)
    const cronMgmtInc = await query(
      `INSERT INTO incidents (
         reference_id, year, seq_number, reporter_id, incident_date, incident_time,
         main_location_id, occurred_to, severity, incident_category, incident_type,
         description, status, created_at, updated_at
       ) VALUES (
         $1, 2026, $2, $3, CURRENT_DATE - INTERVAL '5 days', '09:00',
         $4, 'Patient', 'Major', 'General', 'Type', 'Cron Mgmt deadline test', 'with_head_management',
         NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days'
       ) RETURNING id, reference_id`,
      [`JPHRC/IMS/2026/7${Math.floor(1000 + Math.random() * 8999)}`, Math.floor(300000 + Math.random() * 599999), regularEmp.id, mainLocationId]
    );
    const cronMgmtIncId = cronMgmtInc.rows[0].id;
    createdIncidentIds.push(cronMgmtIncId);

    await processHodEscalations();

    const hodNotifRes = await query(
      `SELECT title FROM notifications WHERE incident_id = $1 AND user_id = $2`,
      [cronHodIncId, catReviewerEmp.id]
    );
    assert.ok(
      hodNotifRes.rows.some((r) => r.title.includes('Automated Reminder')),
      'Expected recurring auto-reminder notification for pending category reviewer'
    );

    const imcNotifRes = await query(
      `SELECT title FROM notifications WHERE incident_id = $1 AND user_id = $2`,
      [cronImcIncId, imcLeadUser.id]
    );
    assert.ok(
      imcNotifRes.rows.some((r) => r.title.includes('Overdue IMC Review')),
      'Expected overdue IMC review notification when stage_days_elapsed >= imc_feedback_days'
    );

    const mgmtNotifRes = await query(
      `SELECT title FROM notifications WHERE incident_id = $1 AND user_id = $2`,
      [cronMgmtIncId, mgmtUser.id]
    );
    assert.ok(
      mgmtNotifRes.rows.some((r) => r.title.includes('Overdue Management Action')),
      'Expected overdue Management action notification when stage_days_elapsed >= mgmt_feedback_days'
    );
  });

  test('#12: Employee search returns is_registered flag for privileged Trainer Picker callers and assignTrainer rejects unregistered HR staff with 400', async () => {
    // 1. Privileged employee search (IMC / Admin who assign trainers) returns is_registered: false for unregistered HR employee
    const imcSearchRes = await request(app)
      .get(`/api/employee/search?q=${encodeURIComponent(unregisteredEmpId)}`)
      .set('Authorization', `Bearer ${imcLeadToken}`);
    assert.equal(imcSearchRes.status, 200);
    const foundPriv = imcSearchRes.body.employees.find((e) => e.employee_id === unregisteredEmpId);
    assert.ok(foundPriv, 'Unregistered active HR employee should appear in search results');
    assert.equal(foundPriv.is_registered, false, 'Privileged search must include is_registered: false');

    // 2. Submitting an unregistered HR employee to assignTrainer returns 400 TRAINER_NOT_REGISTERED
    const trainingInc = await query(
      `INSERT INTO incidents (
         reference_id, year, seq_number, reporter_id, incident_date, incident_time,
         main_location_id, occurred_to, severity, incident_category, incident_type,
         description, status, management_decision, needs_training
       ) VALUES (
         $1, 2026, $2, $3, CURRENT_DATE, '13:00',
         $4, 'Patient', 'Major', 'Clinical', 'Training', 'Trainer reg check',
         'pending_trainer_assignment', 'AGREE', TRUE
       ) RETURNING id`,
      [`JPHRC/IMS/2026/6${Math.floor(1000 + Math.random() * 8999)}`, Math.floor(400000 + Math.random() * 499999), regularEmp.id, mainLocationId]
    );
    const trainingIncId = trainingInc.rows[0].id;
    createdIncidentIds.push(trainingIncId);

    const assignRes = await request(app)
      .post(`/api/incidents/${trainingIncId}/trainers/assign`)
      .set('Authorization', `Bearer ${imcLeadToken}`)
      .send({
        trainerId: unregisteredEmpId,
        traineeEmployeeId: regularEmp.employee_id,
        traineeName: regularEmp.full_name,
        trainingTopic: 'Clinical Protocol'
      });
    assert.equal(assignRes.status, 400);
    assert.equal(assignRes.body.code, 'TRAINER_NOT_REGISTERED');
  });

  test('#13: HRMS termination/inactivation sync alerts System Admins and IMC Leads when a Category Feedback Reviewer is deactivated', async () => {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      await upsertMasterEmployee(client, {
        employeeCode: catReviewerEmp.employee_id,
        firstName: 'Test',
        lastName: 'CATREV',
        email: catReviewerEmp.email,
        departmentName: catReviewerEmp.department,
        jobTitleName: catReviewerEmp.designation,
        status: 'terminated'
      });
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const alertRes = await query(
      `SELECT title, message FROM notifications
       WHERE user_id = $1 AND title LIKE $2
       ORDER BY created_at DESC LIMIT 1`,
      [imcLeadUser.id, `%${catReviewerEmp.employee_id}%`]
    );
    assert.equal(alertRes.rows.length, 1, 'Expected HRMS reviewer deactivation alert for IMC Lead');
    assert.ok(
      alertRes.rows[0].message.includes(catAssigned.name),
      `Expected alert message to name the assigned incident category (${catAssigned.name}), got: ${alertRes.rows[0].message}`
    );
  });
});

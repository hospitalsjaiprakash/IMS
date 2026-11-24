const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const request = require('supertest');

process.env.NODE_ENV = 'test';

const { app } = require('../index');
const { query } = require('../config/database');

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

describe('Batch 3 Workflow Fixes (#15, #16, #20, #21)', () => {
  const tag = `B3_${Date.now().toString(36).toUpperCase()}`;
  const createdUserIds = [];
  const createdMasterEmpIds = [];
  const createdIncidentIds = [];
  let mainLocationId = 1;

  let adminUser;
  let imcLeadUser;
  let empA;
  let empB;

  let adminToken;
  let imcLeadToken;
  let empAToken;
  let empBToken;

  before(async () => {
    const locRes = await query(`SELECT id FROM main_locations ORDER BY id ASC LIMIT 1`);
    if (locRes.rows.length > 0) {
      mainLocationId = locRes.rows[0].id;
    }

    const createUser = async ({
      suffix,
      fullName,
      role = 'employee',
      designation = 'Staff Nurse',
      department = `DeptA_${tag}`,
      isAdmin = false,
      isImc = false,
      isImcLead = false
    }) => {
      const empId = `${tag}_${suffix}`;
      const name = fullName || `Test ${suffix}`;
      const email = `${empId.toLowerCase()}@test.jphrc.local`;

      await query(
        `INSERT INTO master_employees (employee_id, name, email, department, designation, role, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'active')`,
        [empId, name, email, department, designation, role]
      );
      createdMasterEmpIds.push(empId);

      const uRes = await query(
        `INSERT INTO users (
           employee_id, full_name, email, department, designation, role,
           is_active, is_system_admin, is_imc_member, is_imc_lead, token_version
         ) VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, $8, $9, 1)
         RETURNING *`,
        [empId, name, email, department, designation, role, isAdmin, isImc, isImcLead]
      );
      const user = uRes.rows[0];
      createdUserIds.push(user.id);
      return user;
    };

    adminUser = await createUser({
      suffix: 'ADMIN',
      fullName: `Admin ${tag}`,
      role: 'system_admin',
      isAdmin: true
    });
    imcLeadUser = await createUser({
      suffix: 'IMCLEAD',
      fullName: `Dr. Asha ${tag}`,
      role: 'imc',
      designation: 'Senior Consultant',
      department: `Cardiology_${tag}`,
      isImc: true,
      isImcLead: true
    });
    empA = await createUser({
      suffix: 'EMPA',
      fullName: `Rahul Verma`,
      role: 'employee',
      designation: 'Nursing Officer',
      department: `Nursing_${tag}`
    });
    empB = await createUser({
      suffix: 'EMPB',
      fullName: `Dr. Meera Nair`,
      role: 'employee',
      designation: 'Consultant',
      department: `Radiology_${tag}`
    });

    adminToken = signTestJwt(adminUser);
    imcLeadToken = signTestJwt(imcLeadUser);
    empAToken = signTestJwt(empA);
    empBToken = signTestJwt(empB);
  });

  after(async () => {
    try {
      if (createdIncidentIds.length > 0) {
        await query(`DELETE FROM notifications WHERE incident_id = ANY($1::uuid[])`, [createdIncidentIds]);
        await query(`DELETE FROM incident_letter_versions WHERE incident_id = ANY($1::uuid[])`, [createdIncidentIds]).catch(() => {});
        await query(`DELETE FROM incident_letters WHERE incident_id = ANY($1::uuid[])`, [createdIncidentIds]);
        await query(`DELETE FROM incident_events WHERE incident_id = ANY($1::uuid[])`, [createdIncidentIds]);
        await query(`DELETE FROM audit_logs WHERE incident_id = ANY($1::uuid[])`, [createdIncidentIds]);
        await query(`DELETE FROM incidents WHERE id = ANY($1::uuid[])`, [createdIncidentIds]);
      }

      if (createdUserIds.length > 0) {
        await query(`DELETE FROM role_audit WHERE employee_id = ANY($1::uuid[]) OR changed_by = ANY($1::uuid[])`, [createdUserIds]);
        await query(`DELETE FROM communication_logs WHERE user_id = ANY($1::uuid[])`, [createdUserIds]);
        await query(`DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, [createdUserIds]);
        await query(`DELETE FROM audit_logs WHERE user_id = ANY($1::uuid[])`, [createdUserIds]);
        await query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [createdUserIds]);
      }

      if (createdMasterEmpIds.length > 0) {
        await query(`DELETE FROM master_employees WHERE employee_id = ANY($1::text[])`, [createdMasterEmpIds]);
      }
    } catch (err) {
      console.error('Batch 3 cleanup error:', err.message);
    }
  });

  test('#15: GET /api/notifications returns accurate total, page, totalPages, and unreadCount beyond 25 items', async () => {
    // Seed 30 notifications for empA (20 unread, 10 read)
    for (let i = 1; i <= 30; i++) {
      await query(
        `INSERT INTO notifications (user_id, title, message, type, is_read)
         VALUES ($1, $2, $3, 'system', $4)`,
        [empA.id, `Notif ${i} ${tag}`, `Body ${i}`, i > 20]
      );
    }

    const page1Res = await request(app)
      .get('/api/notifications?page=1&limit=25')
      .set('Authorization', `Bearer ${empAToken}`);
    assert.equal(page1Res.status, 200);
    assert.equal(page1Res.body.notifications.length, 25);
    assert.equal(page1Res.body.total, 30);
    assert.equal(page1Res.body.unreadCount, 20);
    assert.equal(page1Res.body.page, 1);
    assert.equal(page1Res.body.totalPages, 2);

    const page2Res = await request(app)
      .get('/api/notifications?page=2&limit=25')
      .set('Authorization', `Bearer ${empAToken}`);
    assert.equal(page2Res.status, 200);
    assert.equal(page2Res.body.notifications.length, 5);
    assert.equal(page2Res.body.total, 30);
    assert.equal(page2Res.body.page, 2);
    assert.equal(page2Res.body.totalPages, 2);
  });

  test('#16: Letter Drafting preserves personalized salutation and allows clearing saved Department, Designation, and Email on draft edit', async () => {
    const incRes = await query(
      `INSERT INTO incidents (
         reference_id, year, seq_number, reporter_id, incident_date, incident_time,
         main_location_id, occurred_to, severity, incident_category, incident_type,
         description, status
       ) VALUES ($1, 2026, $2, $3, CURRENT_DATE, '10:00', $4, 'Patient', 'Major', 'Clinical', 'Lapse', $5, 'pending_letter_generation')
       RETURNING id`,
      [`JPHRC/IMS/2026/5${Math.floor(1000 + Math.random() * 8999)}`, Math.floor(500000 + Math.random() * 399999), empA.id, mainLocationId, `Letter draft test ${tag}`]
    );
    const incidentId = incRes.rows[0].id;
    createdIncidentIds.push(incidentId);

    // 1. Create initial draft for empA ("Rahul Verma") without explicit salutation -> should auto-compute "Dear Rahul,"
    const createDraftRes = await request(app)
      .post(`/api/incidents/${incidentId}/letters/draft`)
      .set('Authorization', `Bearer ${imcLeadToken}`)
      .send({
        employeeId: empA.employee_id,
        recipientName: empA.full_name,
        recipientEmpNo: empA.employee_id,
        recipientDepartment: empA.department,
        recipientDesignation: empA.designation,
        recipientEmail: empA.email,
        templateType: 'warning_penalty_letter',
        refNumber: `JPHRC/IMC/2026/901`,
        subject: 'Warning & Penalty Letter',
        bodyContent: 'Initial penalty clause text.',
        penaltyAmount: 1500
      });
    assert.equal(createDraftRes.status, 200);
    const letterId = createDraftRes.body.letter.id;
    assert.equal(createDraftRes.body.letter.salutation, 'Dear Rahul,');
    assert.equal(createDraftRes.body.letter.recipient_department, empA.department);
    assert.equal(createDraftRes.body.letter.recipient_designation, empA.designation);
    assert.equal(createDraftRes.body.letter.recipient_email, empA.email);

    // 2. Edit existing draft: clear recipientDepartment, recipientDesignation, and recipientEmail to null, and set custom salutation
    const updateDraftRes = await request(app)
      .post(`/api/incidents/${incidentId}/letters/draft`)
      .set('Authorization', `Bearer ${imcLeadToken}`)
      .send({
        letterId,
        employeeId: empA.employee_id,
        recipientName: empA.full_name,
        recipientEmpNo: empA.employee_id,
        recipientDepartment: null,
        recipientDesignation: null,
        recipientEmail: null,
        templateType: 'warning_penalty_letter',
        refNumber: `JPHRC/IMC/2026/901`,
        subject: 'Updated Warning & Penalty Letter',
        salutation: 'Dear Mr. Rahul Verma,',
        bodyContent: 'Updated penalty clause text.',
        penaltyAmount: 2500
      });
    assert.equal(updateDraftRes.status, 200);
    assert.equal(updateDraftRes.body.letter.salutation, 'Dear Mr. Rahul Verma,');
    assert.equal(updateDraftRes.body.letter.recipient_department, null, 'Cleared department must persist as NULL');
    assert.equal(updateDraftRes.body.letter.recipient_designation, null, 'Cleared designation must persist as NULL');
    assert.equal(updateDraftRes.body.letter.recipient_email, null, 'Cleared email must persist as NULL');
  });

  test('#20: Analytics & Dashboard stats support dateFrom/dateTo filters; Role Governance History and Personnel Profile incidents paginate', async () => {
    // 1. Insert two incidents for empB on distinct dates (10 days ago vs today)
    const tenDaysAgoRes = await query(`SELECT (CURRENT_DATE - INTERVAL '10 days')::text AS d, CURRENT_DATE::text AS today`);
    const dateOld = tenDaysAgoRes.rows[0].d;
    const dateToday = tenDaysAgoRes.rows[0].today;

    const incOldRes = await query(
      `INSERT INTO incidents (
         reference_id, year, seq_number, reporter_id, incident_date, incident_time,
         main_location_id, occurred_to, severity, incident_category, incident_type,
         description, status
       ) VALUES ($1, 2026, $2, $3, $4::date, '09:00', $5, 'Patient', 'Minor', 'Clinical', 'TypeOld', $6, 'with_imc')
       RETURNING id`,
      [`JPHRC/IMS/2026/4${Math.floor(1000 + Math.random() * 8999)}`, Math.floor(600000 + Math.random() * 299999), empB.id, dateOld, mainLocationId, `Old incident ${tag}`]
    );
    createdIncidentIds.push(incOldRes.rows[0].id);

    const incTodayRes = await query(
      `INSERT INTO incidents (
         reference_id, year, seq_number, reporter_id, incident_date, incident_time,
         main_location_id, occurred_to, severity, incident_category, incident_type,
         description, status
       ) VALUES ($1, 2026, $2, $3, $4::date, '10:00', $5, 'Patient', 'Major', 'Clinical', 'TypeToday', $6, 'with_imc')
       RETURNING id`,
      [`JPHRC/IMS/2026/4${Math.floor(1000 + Math.random() * 8999)}`, Math.floor(600000 + Math.random() * 299999), empB.id, dateToday, mainLocationId, `Today incident ${tag}`]
    );
    createdIncidentIds.push(incTodayRes.rows[0].id);

    // 2. Dashboard stats for empB filtered to today only vs both dates
    const statsTodayOnly = await request(app)
      .get(`/api/incidents/stats?dateFrom=${dateToday}&dateTo=${dateToday}`)
      .set('Authorization', `Bearer ${empBToken}`);
    assert.equal(statsTodayOnly.status, 200);
    assert.equal(statsTodayOnly.body.totals.total, 1);

    const statsBoth = await request(app)
      .get(`/api/incidents/stats?dateFrom=${dateOld}&dateTo=${dateToday}`)
      .set('Authorization', `Bearer ${empBToken}`);
    assert.equal(statsBoth.status, 200);
    assert.equal(statsBoth.body.totals.total, 2);

    // 3. System Analytics accepts dateFrom & dateTo
    const sysAnalyticsRes = await request(app)
      .get(`/api/admin/analytics?dateFrom=${dateToday}&dateTo=${dateToday}`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(sysAnalyticsRes.status, 200);
    assert.ok(Array.isArray(sysAnalyticsRes.body.byCategory));

    // 4. Personnel Profile search paginates reported incidents via incidents_page & incidents_limit
    const empPage1 = await request(app)
      .get(`/api/employee/search?q=${encodeURIComponent(empB.employee_id)}&incidents_page=1&incidents_limit=1`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(empPage1.status, 200);
    assert.equal(empPage1.body.selectedEmployee.totalIncidentsReported, 2);
    assert.equal(empPage1.body.selectedEmployee.recentIncidents.length, 1);

    const empPage2 = await request(app)
      .get(`/api/employee/search?q=${encodeURIComponent(empB.employee_id)}&incidents_page=2&incidents_limit=1`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(empPage2.status, 200);
    assert.equal(empPage2.body.selectedEmployee.recentIncidents.length, 1);
    assert.notEqual(
      empPage1.body.selectedEmployee.recentIncidents[0].id,
      empPage2.body.selectedEmployee.recentIncidents[0].id
    );

    // 5. Role Governance History (/api/admin/role-audit) supports pagination when page/limit are passed
    await query(
      `INSERT INTO role_audit (employee_id, previous_role, new_role, changed_by)
       VALUES ($1, 'employee', 'imc', $2), ($3, 'employee', 'system_admin', $2)`,
      [empA.id, adminUser.id, empB.id]
    );

    const roleAuditPaginated = await request(app)
      .get('/api/admin/role-audit?page=1&limit=1')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(roleAuditPaginated.status, 200);
    assert.equal(roleAuditPaginated.body.logs.length, 1);
    assert.ok(roleAuditPaginated.body.total >= 2);
    assert.ok(roleAuditPaginated.body.totalPages >= 2);
  });

  test('#21: Broadcast notification supports targetRole and targetDepartment filtering', async () => {
    // Send a broadcast targeted specifically to department Nursing_${tag} and role employee (should match empA only, not empB)
    const broadcastRes = await request(app)
      .post('/api/admin/broadcast-notification')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('title', `Nursing Broadcast ${tag}`)
      .field('message', 'Department-targeted announcement')
      .field('targetRole', 'employee')
      .field('targetDepartment', `Nursing_${tag}`);
    assert.equal(broadcastRes.status, 200);
    assert.equal(broadcastRes.body.count, 1);
    assert.ok(broadcastRes.body.recipientLabel.includes(`Nursing_${tag}`));

    const empANotif = await query(
      `SELECT 1 FROM notifications WHERE user_id = $1 AND title = $2`,
      [empA.id, `Nursing Broadcast ${tag}`]
    );
    assert.equal(empANotif.rows.length, 1, 'Targeted department/role user empA should receive broadcast');

    const empBNotif = await query(
      `SELECT 1 FROM notifications WHERE user_id = $1 AND title = $2`,
      [empB.id, `Nursing Broadcast ${tag}`]
    );
    assert.equal(empBNotif.rows.length, 0, 'Non-matching department user empB must not receive broadcast');
  });
});

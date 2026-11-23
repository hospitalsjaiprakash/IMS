const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const request = require('supertest');

process.env.NODE_ENV = 'test';

const { app, server } = require('../index');
const { query, pool } = require('../config/database');

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

describe('Category-Based Feedback & Routing Workflow Tests (TC-01..TC-06)', () => {
  const tag = `CATWF_${Date.now().toString(36).toUpperCase()}`;
  const createdUserIds = [];
  const createdMasterEmpIds = [];
  const createdIncidentIds = [];

  let adminUser;
  let imcLeadUser;
  let imcMemberUser;
  let mgmtUser;
  let reviewerEmp;
  let reporterEmp;

  let adminToken;
  let imcLeadToken;
  let imcMemberToken;
  let mgmtToken;
  let reviewerToken;
  let reporterToken;

  let catA;
  let catB;
  let catC;
  let savedAssigneesSnapshot = [];
  let createdIncId;
  let withdrawnIncId;

  before(async () => {
    const catsRes = await query(
      `SELECT id, name FROM incident_categories WHERE is_active = TRUE ORDER BY id ASC LIMIT 3`
    );
    assert.ok(catsRes.rows.length >= 3, 'Expected at least 3 seeded active incident_categories');
    [catA, catB, catC] = catsRes.rows;

    const snapRes = await query(
      `SELECT id, category_id, user_id, is_active FROM category_feedback_assignees WHERE category_id = ANY($1::int[])`,
      [[catA.id, catB.id, catC.id]]
    );
    savedAssigneesSnapshot = snapRes.rows;

    const createUser = async ({ suffix, role = 'employee', isAdmin = false, isImc = false, isImcLead = false, isMgmt = false }) => {
      const empId = `${tag}_${suffix}`;
      const email = `${empId.toLowerCase()}@test.jphrc.local`;
      await query(
        `INSERT INTO master_employees (employee_id, name, email, phone, department, designation, role, status)
         VALUES ($1, $2, $3, '9876500000', 'Quality Control', 'Executive', $4, 'active')`,
        [empId, `CatTest ${suffix} ${tag}`, email, role]
      );
      createdMasterEmpIds.push(empId);

      const uRes = await query(
        `INSERT INTO users (employee_id, full_name, email, phone, department, designation, role, is_active, is_system_admin, is_imc_member, is_imc_lead, is_management_member)
         VALUES ($1, $2, $3, '9876500000', 'Quality Control', 'Executive', $4, TRUE, $5, $6, $7, $8)
         RETURNING *`,
        [empId, `CatTest ${suffix} ${tag}`, email, role, isAdmin, isImc, isImcLead, isMgmt]
      );
      createdUserIds.push(uRes.rows[0].id);
      return uRes.rows[0];
    };

    adminUser = await createUser({ suffix: 'ADM', role: 'system_admin', isAdmin: true });
    imcLeadUser = await createUser({ suffix: 'IMCL', role: 'imc', isImc: true, isImcLead: true });
    imcMemberUser = await createUser({ suffix: 'IMCM', role: 'imc', isImc: true, isImcLead: false });
    mgmtUser = await createUser({ suffix: 'MGT', role: 'head_management', isMgmt: true });
    reviewerEmp = await createUser({ suffix: 'REV', role: 'employee' });
    reporterEmp = await createUser({ suffix: 'REP', role: 'employee' });

    adminToken = signTestJwt(adminUser);
    imcLeadToken = signTestJwt(imcLeadUser);
    imcMemberToken = signTestJwt(imcMemberUser);
    mgmtToken = signTestJwt(mgmtUser);
    reviewerToken = signTestJwt(reviewerEmp);
    reporterToken = signTestJwt(reporterEmp);
  });

  after(async () => {
    if (createdUserIds.length) {
      await query('DELETE FROM category_feedback_assignees WHERE user_id = ANY($1::uuid[])', [createdUserIds]).catch(() => {});
    }
    for (const snap of savedAssigneesSnapshot) {
      await query(
        'UPDATE category_feedback_assignees SET is_active = $1, updated_at = NOW() WHERE id = $2',
        [snap.is_active, snap.id]
      ).catch(() => {});
    }

    if (createdIncidentIds.length) {
      await query('DELETE FROM audit_logs WHERE incident_id = ANY($1::uuid[])', [createdIncidentIds]).catch(() => {});
      await query('DELETE FROM notifications WHERE incident_id = ANY($1::uuid[])', [createdIncidentIds]).catch(() => {});
      await query('DELETE FROM incident_events WHERE incident_id = ANY($1::uuid[])', [createdIncidentIds]).catch(() => {});
      await query('DELETE FROM feedbacks WHERE incident_id = ANY($1::uuid[])', [createdIncidentIds]).catch(() => {});
      await query('DELETE FROM incident_category_links WHERE incident_id = ANY($1::uuid[])', [createdIncidentIds]).catch(() => {});
      await query('DELETE FROM incident_departments WHERE incident_id = ANY($1::uuid[])', [createdIncidentIds]).catch(() => {});
      await query('DELETE FROM incidents WHERE id = ANY($1::uuid[])', [createdIncidentIds]).catch(() => {});
    }

    if (createdUserIds.length) {
      await query('DELETE FROM audit_logs WHERE user_id = ANY($1::uuid[])', [createdUserIds]).catch(() => {});
      await query('DELETE FROM notifications WHERE user_id = ANY($1::uuid[])', [createdUserIds]).catch(() => {});
      await query('DELETE FROM users WHERE id = ANY($1::uuid[])', [createdUserIds]).catch(() => {});
    }
    if (createdMasterEmpIds.length) {
      await query('DELETE FROM master_employees WHERE employee_id = ANY($1::text[])', [createdMasterEmpIds]).catch(() => {});
    }

    if (server && server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
    await pool.end();
  });

  test('1. GET /api/categories returns seeded active Incident Categories (>= 27)', async () => {
    const res = await request(app)
      .get('/api/categories')
      .set('Authorization', `Bearer ${reporterToken}`)
      .expect(200);

    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.length >= 27, `Expected >= 27 categories, got ${res.body.length}`);
    assert.ok(res.body.every((c) => typeof c.id === 'number' && typeof c.name === 'string'));
  });

  test('2. Admin can map any active employee to an Incident Category without forcing HOD role', async () => {
    const mapRes = await request(app)
      .post('/api/admin/category-mappings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ categoryId: catA.id, employeeId: reviewerEmp.employee_id, replaceExisting: true })
      .expect(200);

    assert.equal(mapRes.body.success, true);

    const dbUser = await query('SELECT role FROM users WHERE id = $1', [reviewerEmp.id]);
    assert.equal(dbUser.rows[0].role, 'employee', 'Mapped reviewer role must stay employee, not forced to hod');

    const mappingsRes = await request(app)
      .get('/api/admin/category-mappings')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const mappedRow = mappingsRes.body.find((r) => Number(r.id) === Number(catA.id));
    assert.ok(mappedRow);
    assert.equal(mappedRow.assigned_employee_id, reviewerEmp.employee_id);

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${reviewerToken}`)
      .expect(200);

    assert.equal(meRes.body.role, 'employee');
    assert.equal(meRes.body.isCategoryReviewer, true);
    assert.equal(meRes.body.isFeedbackReviewer, true);
    assert.ok(
      Array.isArray(meRes.body.assignedCategories) &&
        meRes.body.assignedCategories.some((c) => c.name === catA.name)
    );
  });

  test('3. POST /api/incidents succeeds without departmentIds, links category, and notifies reviewer', async () => {
    const res = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${reporterToken}`)
      .send({
        incidentCategories: [catA.name],
        incidentCategory: catA.name,
        incidentType: 'Workflow Verification Case',
        incidentDate: getLocalTodayIso(),
        incidentTime: '11:15',
        occurredTo: 'Patient',
        description: `Automated integration check ${tag} verifying category routing without departmentIds`,
        hasResponsiblePerson: false
      })
      .expect(201);

    assert.equal(res.body.success, true);
    assert.ok(res.body.incident?.id);
    assert.equal(res.body.incident.status, 'with_hod');
    createdIncId = res.body.incident.id;
    createdIncidentIds.push(createdIncId);

    const linkRes = await query(
      'SELECT category_id FROM incident_category_links WHERE incident_id = $1',
      [createdIncId]
    );
    assert.equal(linkRes.rows.length, 1);
    assert.equal(linkRes.rows[0].category_id, catA.id);

    const notifRes = await query(
      `SELECT id FROM notifications WHERE incident_id = $1 AND user_id = $2`,
      [createdIncId, reviewerEmp.id]
    );
    assert.ok(notifRes.rows.length >= 1, 'Category-mapped reviewer must receive notification');
  });

  test('4. Priority escalation is strictly restricted to IMC Lead / Convenor (403 for others, 200 for lead)', async () => {
    await request(app)
      .post(`/api/incidents/${createdIncId}/escalate-priority`)
      .set('Authorization', `Bearer ${imcMemberToken}`)
      .expect(403);

    await request(app)
      .post(`/api/incidents/${createdIncId}/escalate-priority`)
      .set('Authorization', `Bearer ${mgmtToken}`)
      .expect(403);

    await request(app)
      .post(`/api/incidents/${createdIncId}/escalate-priority`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .expect(403);

    const leadRes = await request(app)
      .post(`/api/incidents/${createdIncId}/escalate-priority`)
      .set('Authorization', `Bearer ${imcLeadToken}`)
      .expect(200);

    assert.equal(leadRes.body.success, true);

    const incCheck = await query('SELECT priority_escalated_by FROM incidents WHERE id = $1', [createdIncId]);
    assert.ok(incCheck.rows[0].priority_escalated_by);
  });

  test('5. Category redirection request & IMC approval updates linked incident category', async () => {
    const reqRedirectRes = await request(app)
      .post(`/api/incidents/${createdIncId}/request-redirect`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({ reason: `Belongs to ${catB.name}` })
      .expect(200);
    assert.equal(reqRedirectRes.body.success, true);

    // Non-lead IMC member cannot approve redirect
    await request(app)
      .post(`/api/incidents/${createdIncId}/approve-redirect`)
      .set('Authorization', `Bearer ${imcMemberToken}`)
      .send({ targetCategories: [catB.name] })
      .expect(403);

    const approveRes = await request(app)
      .post(`/api/incidents/${createdIncId}/approve-redirect`)
      .set('Authorization', `Bearer ${imcLeadToken}`)
      .send({ targetCategories: [catB.name] })
      .expect(200);

    assert.equal(approveRes.body.success, true);
    assert.deepEqual(approveRes.body.targetCategories, [catB.name]);

    const linkRes = await query(
      'SELECT category_id FROM incident_category_links WHERE incident_id = $1',
      [createdIncId]
    );
    assert.deepEqual(linkRes.rows.map((r) => r.category_id), [catB.id]);

    const incRow = await query('SELECT incident_category, status FROM incidents WHERE id = $1', [createdIncId]);
    assert.equal(incRow.rows[0].incident_category, catB.name);
    assert.equal(incRow.rows[0].status, 'with_hod');
  });

  test('6. Involve additional Incident Category attaches category link without requiring departments', async () => {
    const involveRes = await request(app)
      .post(`/api/incidents/${createdIncId}/involve-departments`)
      .set('Authorization', `Bearer ${imcLeadToken}`)
      .send({ categories: [catC.name] })
      .expect(200);

    assert.equal(involveRes.body.success, true);

    const linkRes = await query(
      'SELECT category_id FROM incident_category_links WHERE incident_id = $1 ORDER BY category_id ASC',
      [createdIncId]
    );
    const linkedIds = linkRes.rows.map((r) => r.category_id);
    assert.ok(linkedIds.includes(catB.id));
    assert.ok(linkedIds.includes(catC.id));
  });

  test('7. GET /api/incidents/stats returns SQL-exact metrics and excludes withdrawn from active/total', async () => {
    const statsBefore = await request(app)
      .get('/api/incidents/stats')
      .set('Authorization', `Bearer ${reporterToken}`)
      .expect(200);

    assert.equal(statsBefore.body.totals.total, 1);
    assert.equal(statsBefore.body.totals.active, 1);
    assert.equal(statsBefore.body.totals.withdrawn, 0);

    // Insert a withdrawn incident for reporterEmp and verify totals vs withdrawn
    const seq = Math.floor(Math.random() * 800000) + 100000;
    const wRes = await query(
      `INSERT INTO incidents (
         reference_id, year, seq_number, reporter_id, incident_date, incident_time,
         incident_category, incident_type, occurred_to, description, severity, status
       ) VALUES ($1, 2026, $2, $3, CURRENT_DATE, '09:00', $4, 'Test Withdrawn', 'Patient', 'Withdrawn check', 'Minor', 'withdrawn')
       RETURNING id`,
      [`JPHRC/IMS/2026/${seq}`, seq, reporterEmp.id, catA.name]
    );
    withdrawnIncId = wRes.rows[0].id;
    createdIncidentIds.push(withdrawnIncId);

    const statsAfter = await request(app)
      .get('/api/incidents/stats')
      .set('Authorization', `Bearer ${reporterToken}`)
      .expect(200);

    assert.equal(statsAfter.body.totals.total, 1, 'total (valid) must exclude withdrawn');
    assert.equal(statsAfter.body.totals.totalAll, 2);
    assert.equal(statsAfter.body.totals.active, 1, 'active must exclude withdrawn');
    assert.equal(statsAfter.body.totals.withdrawn, 1);
    assert.ok(Array.isArray(statsAfter.body.monthly));
    assert.ok(Array.isArray(statsAfter.body.categoryAnalytics));
    assert.ok(statsAfter.body.durationMetrics && typeof statsAfter.body.durationMetrics === 'object');
  });
});

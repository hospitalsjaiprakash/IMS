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
  let reviewerEmpC;
  let reporterEmp;

  let adminToken;
  let imcLeadToken;
  let imcMemberToken;
  let mgmtToken;
  let reviewerToken;
  let reviewerCToken;
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
    reviewerEmpC = await createUser({ suffix: 'REVC', role: 'employee' });
    reporterEmp = await createUser({ suffix: 'REP', role: 'employee' });

    adminToken = signTestJwt(adminUser);
    imcLeadToken = signTestJwt(imcLeadUser);
    imcMemberToken = signTestJwt(imcMemberUser);
    mgmtToken = signTestJwt(mgmtUser);
    reviewerToken = signTestJwt(reviewerEmp);
    reviewerCToken = signTestJwt(reviewerEmpC);
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
      await query('DELETE FROM incident_responsible_employees WHERE incident_id = ANY($1::uuid[])', [createdIncidentIds]).catch(() => {});
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

  test('8. Redirection unlocks target category staff (any role) and keeps other categories unblocked during redirect_requested', async () => {
    // Map imcMemberUser (role: imc) to catB and reviewerEmpC (role: employee) to catC
    await request(app)
      .post('/api/admin/category-mappings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ categoryId: catB.id, employeeId: imcMemberUser.employee_id, replaceExisting: true })
      .expect(200);

    await request(app)
      .post('/api/admin/category-mappings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ categoryId: catC.id, employeeId: reviewerEmpC.employee_id, replaceExisting: true })
      .expect(200);

    // Create a multi-category incident across catA and catB
    const createRes = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${reporterToken}`)
      .send({
        incidentCategories: [catA.name, catB.name],
        incidentCategory: catA.name,
        incidentType: 'Multi-Category Redirection Case',
        incidentDate: getLocalTodayIso(),
        incidentTime: '12:00',
        occurredTo: 'Patient',
        description: `Multi-category redirect verification ${tag}`,
        hasResponsiblePerson: false
      })
      .expect(201);

    const multiIncId = createRes.body.incident.id;
    createdIncidentIds.push(multiIncId);

    // catA reviewer requests redirection -> status becomes redirect_requested
    await request(app)
      .post(`/api/incidents/${multiIncId}/request-redirect`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({ reason: `Please route catA portion to ${catC.name}` })
      .expect(200);

    // Requesting reviewer (catA) cannot submit feedback while their redirect is pending
    await request(app)
      .post(`/api/incidents/${multiIncId}/hod-feedback`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({ feedbackText: 'Should be blocked while my redirect is pending' })
      .expect(400);

    // Unmapped management user cannot submit feedback (403)
    await request(app)
      .post(`/api/incidents/${multiIncId}/hod-feedback`)
      .set('Authorization', `Bearer ${mgmtToken}`)
      .send({ feedbackText: 'Unmapped user should be rejected' })
      .expect(403);

    // catB mapped staff (role: imc) CAN submit feedback during redirect_requested without overwriting status
    await request(app)
      .post(`/api/incidents/${multiIncId}/hod-feedback`)
      .set('Authorization', `Bearer ${imcMemberToken}`)
      .send({ feedbackText: `Category B feedback by non-HOD/IMC mapped reviewer ${tag}` })
      .expect(200);

    const midState = await query('SELECT status FROM incidents WHERE id = $1', [multiIncId]);
    assert.equal(midState.rows[0].status, 'redirect_requested', 'Status must stay redirect_requested while IMC has not yet resolved the redirect');

    // IMC Lead approves redirect of catA -> catC
    await request(app)
      .post(`/api/incidents/${multiIncId}/approve-redirect`)
      .set('Authorization', `Bearer ${imcLeadToken}`)
      .send({ targetCategories: [catC.name] })
      .expect(200);

    // Stale redirect_requested_by_user_id must be cleared and old requester is no longer target reviewer
    const afterApproveRow = await query(
      'SELECT status, redirect_requested_by_user_id, redirect_requested_by_category FROM incidents WHERE id = $1',
      [multiIncId]
    );
    assert.equal(afterApproveRow.rows[0].status, 'with_hod');
    assert.equal(afterApproveRow.rows[0].redirect_requested_by_user_id, null);
    assert.equal(afterApproveRow.rows[0].redirect_requested_by_category, null);

    // Newly redirected category C staff sees is_target_reviewer = true and submits feedback -> advances to with_imc
    const getAsC = await request(app)
      .get(`/api/incidents/${multiIncId}`)
      .set('Authorization', `Bearer ${reviewerCToken}`)
      .expect(200);
    assert.equal(getAsC.body.incident.is_target_reviewer, true);
    assert.equal(getAsC.body.incident.user_hod_dept_submitted, false);

    const fbCRes = await request(app)
      .post(`/api/incidents/${multiIncId}/hod-feedback`)
      .set('Authorization', `Bearer ${reviewerCToken}`)
      .send({ feedbackText: `Redirected Category C feedback ${tag}` })
      .expect(200);
    assert.equal(fbCRes.body.allResponded, true);

    const finalState = await query('SELECT status FROM incidents WHERE id = $1', [multiIncId]);
    assert.equal(finalState.rows[0].status, 'with_imc');
  });

  test('9. Management Financial Penalty decision requires positive penalty amount (> 0) on both AGREE and DISAGREE_MODIFY', async () => {
    // Create incident and push straight to with_head_management via IMC assessment with Financial Penalty on reviewerEmp
    const createRes = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${reporterToken}`)
      .send({
        incidentCategories: [catC.name],
        incidentCategory: catC.name,
        incidentType: 'Financial Penalty Verification Case',
        incidentDate: getLocalTodayIso(),
        incidentTime: '13:30',
        occurredTo: 'Patient',
        description: `Financial penalty enforcement test ${tag}`,
        hasResponsiblePerson: true,
        responsiblePersonName: reviewerEmp.full_name
      })
      .expect(201);

    const penIncId = createRes.body.incident.id;
    createdIncidentIds.push(penIncId);

    // Category C reviewer submits feedback -> moves to with_imc
    await request(app)
      .post(`/api/incidents/${penIncId}/hod-feedback`)
      .set('Authorization', `Bearer ${reviewerCToken}`)
      .send({ feedbackText: `Category C initial review ${tag}` })
      .expect(200);

    // IMC submits assessment recommending Financial Penalty (without penalty_amount, as decided solely by Management)
    await request(app)
      .post(`/api/incidents/${penIncId}/imc-feedback`)
      .set('Authorization', `Bearer ${imcLeadToken}`)
      .send({
        feedbackText: `IMC recommends financial penalty ${tag}`,
        forwardToMd: true,
        severity: 'Major',
        proposedOutcome: 'Financial Penalty',
        responsibleEmployees: JSON.stringify([
          {
            id: reviewerEmp.id,
            employee_id: reviewerEmp.employee_id,
            full_name: reviewerEmp.full_name,
            outcomes: ['Financial Penalty'],
            penalty_amount: null
          }
        ])
      })
      .expect(200);

    // Management AGREE without penalty amount -> 400
    await request(app)
      .post(`/api/incidents/${penIncId}/management-action`)
      .set('Authorization', `Bearer ${mgmtToken}`)
      .send({
        decision: 'AGREE',
        notes: 'Approving without amount should fail',
        responsibleEmployees: JSON.stringify([
          {
            id: reviewerEmp.id,
            employee_id: reviewerEmp.employee_id,
            full_name: reviewerEmp.full_name,
            outcomes: ['Financial Penalty'],
            penalty_amount: null
          }
        ])
      })
      .expect(400);

    // Management AGREE with 0 penalty amount -> 400
    await request(app)
      .post(`/api/incidents/${penIncId}/management-action`)
      .set('Authorization', `Bearer ${mgmtToken}`)
      .send({
        decision: 'AGREE',
        responsibleEmployees: JSON.stringify([
          {
            id: reviewerEmp.id,
            employee_id: reviewerEmp.employee_id,
            full_name: reviewerEmp.full_name,
            outcomes: ['Financial Penalty'],
            penalty_amount: 0
          }
        ])
      })
      .expect(400);

    // Management DISAGREE_MODIFY with Financial Penalty and no amount -> 400
    await request(app)
      .post(`/api/incidents/${penIncId}/management-action`)
      .set('Authorization', `Bearer ${mgmtToken}`)
      .send({
        decision: 'DISAGREE_MODIFY',
        proposedOutcome: 'Financial Penalty',
        responsibleEmployees: JSON.stringify([])
      })
      .expect(400);

    // Management AGREE with positive penalty amount (1500) -> 200
    const okRes = await request(app)
      .post(`/api/incidents/${penIncId}/management-action`)
      .set('Authorization', `Bearer ${mgmtToken}`)
      .send({
        decision: 'AGREE',
        notes: 'Approved with ₹1500 deduction',
        responsibleEmployees: JSON.stringify([
          {
            id: reviewerEmp.id,
            employee_id: reviewerEmp.employee_id,
            full_name: reviewerEmp.full_name,
            outcomes: ['Financial Penalty'],
            penalty_amount: 1500
          }
        ])
      })
      .expect(200);

    assert.equal(okRes.body.success, true);

    const incRow = await query('SELECT penalty_amount, penalty_amount_words, status FROM incidents WHERE id = $1', [penIncId]);
    assert.equal(Number(incRow.rows[0].penalty_amount), 1500);
    assert.ok(incRow.rows[0].penalty_amount_words && incRow.rows[0].penalty_amount_words.length > 0);
    assert.equal(incRow.rows[0].status, 'pending_letter_generation');

    const empRow = await query('SELECT penalty_amount, penalty_amount_words FROM incident_responsible_employees WHERE incident_id = $1 AND employee_id = $2', [penIncId, reviewerEmp.id]);
    assert.equal(Number(empRow.rows[0].penalty_amount), 1500);
    assert.ok(empRow.rows[0].penalty_amount_words && empRow.rows[0].penalty_amount_words.length > 0);

    const evtRow = await query(`SELECT payload FROM incident_events WHERE incident_id = $1 AND event_type = 'MGMT_DECISION_AGREED' ORDER BY seq DESC LIMIT 1`, [penIncId]);
    assert.equal(Number(evtRow.rows[0]?.payload?.penalty_amount), 1500);
  });
});

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const request = require('supertest');

process.env.NODE_ENV = 'test';

const { app } = require('../index');
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

describe('Unified Reviewer Role & Dynamic Categories CRUD', () => {
  const tag = `URC_${Date.now().toString(36).toUpperCase()}`;
  const createdUserIds = [];
  const createdMasterEmpIds = [];
  const createdIncidentIds = [];
  const createdCategoryIds = [];
  let mainLocationId = 1;

  let adminUser;
  let imcLeadUser;
  let unassignedHodUser;
  let reviewerA;
  let peerDeptA;
  let reviewerB;
  let reporterEmp;

  let adminToken;
  let imcLeadToken;
  let unassignedHodToken;
  let reviewerAToken;
  let reviewerBToken;
  let reporterToken;

  const sharedPassword = 'TestPassword#9';
  let sharedPasswordHash;

  before(async () => {
    const locRes = await query(`SELECT id FROM main_locations ORDER BY id ASC LIMIT 1`);
    if (locRes.rows.length > 0) {
      mainLocationId = locRes.rows[0].id;
    }

    sharedPasswordHash = await bcrypt.hash(sharedPassword, 10);

    const createUser = async ({
      suffix,
      role = 'employee',
      designation = 'Staff',
      department = `Dept_${tag}`,
      isAdmin = false,
      isImc = false,
      isImcLead = false
    }) => {
      const empId = `${tag}_${suffix}`;
      const email = `${empId.toLowerCase()}@test.jphrc.local`;
      await query(
        `INSERT INTO master_employees (employee_id, name, email, department, designation, role, status)
         VALUES ($1, $2, $3, $4, $5, 'employee', 'active')`,
        [empId, `Test ${suffix}`, email, department, designation]
      );
      createdMasterEmpIds.push(empId);

      const uRes = await query(
        `INSERT INTO users (
           employee_id, full_name, email, department, designation, role, password_hash,
           is_active, is_system_admin, is_imc_member, is_imc_lead, is_management_member, token_version
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8, $9, $10, FALSE, 1)
         RETURNING *`,
        [empId, `Test ${suffix}`, email, department, designation, role, sharedPasswordHash, isAdmin, isImc, isImcLead]
      );
      const user = uRes.rows[0];
      createdUserIds.push(user.id);
      return user;
    };

    adminUser = await createUser({ suffix: 'ADMIN', role: 'system_admin', isAdmin: true });
    imcLeadUser = await createUser({ suffix: 'IMCLEAD', role: 'imc', isImc: true, isImcLead: true });
    unassignedHodUser = await createUser({
      suffix: 'HOD_UNASSIGNED',
      role: 'employee',
      designation: 'HOD',
      department: `Cardiology_${tag}`
    });
    reviewerA = await createUser({
      suffix: 'REVA',
      role: 'employee',
      designation: 'Manager',
      department: `DeptA_${tag}`
    });
    peerDeptA = await createUser({
      suffix: 'PEERA',
      role: 'employee',
      designation: 'Staff Nurse',
      department: `DeptA_${tag}`
    });
    reviewerB = await createUser({
      suffix: 'REVB',
      role: 'employee',
      designation: 'Lead',
      department: `DeptB_${tag}`
    });
    reporterEmp = await createUser({
      suffix: 'REPORTER',
      role: 'employee',
      designation: 'Executive',
      department: `DeptOther_${tag}`
    });

    adminToken = signTestJwt(adminUser);
    imcLeadToken = signTestJwt(imcLeadUser);
    unassignedHodToken = signTestJwt(unassignedHodUser);
    reviewerAToken = signTestJwt(reviewerA);
    reviewerBToken = signTestJwt(reviewerB);
    reporterToken = signTestJwt(reporterEmp);
  });

  after(async () => {
    try {
      if (createdIncidentIds.length > 0) {
        await query(`DELETE FROM notifications WHERE incident_id = ANY($1::uuid[])`, [createdIncidentIds]);
        await query(`DELETE FROM incident_events WHERE incident_id = ANY($1::uuid[])`, [createdIncidentIds]);
        await query(`DELETE FROM incident_category_links WHERE incident_id = ANY($1::uuid[])`, [createdIncidentIds]);
        await query(`DELETE FROM feedbacks WHERE incident_id = ANY($1::uuid[])`, [createdIncidentIds]);
        await query(`DELETE FROM audit_logs WHERE incident_id = ANY($1::uuid[])`, [createdIncidentIds]);
        await query(`DELETE FROM incidents WHERE id = ANY($1::uuid[])`, [createdIncidentIds]);
      }

      if (createdCategoryIds.length > 0) {
        await query(`DELETE FROM category_feedback_assignees WHERE category_id = ANY($1::int[])`, [createdCategoryIds]);
        await query(`DELETE FROM incident_category_types WHERE category_id = ANY($1::int[])`, [createdCategoryIds]);
        await query(`DELETE FROM incident_categories WHERE id = ANY($1::int[])`, [createdCategoryIds]);
      }

      if (createdUserIds.length > 0) {
        await query(`DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, [createdUserIds]);
        await query(`DELETE FROM audit_logs WHERE user_id = ANY($1::uuid[])`, [createdUserIds]);
        await query(`DELETE FROM category_feedback_assignees WHERE user_id = ANY($1::uuid[])`, [createdUserIds]);
        await query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [createdUserIds]);
      }

      if (createdMasterEmpIds.length > 0) {
        await query(`DELETE FROM master_employees WHERE employee_id = ANY($1::text[])`, [createdMasterEmpIds]);
      }
    } catch (err) {
      console.error('Unified Reviewer test cleanup error:', err);
      throw err;
    } finally {
      await pool.end().catch(() => {});
    }
  });

  test('1. Unassigned HR HOD receives Employee View only (isReviewer=false, 403 /hod/team, skipped by Reviewer broadcast)', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ employeeId: unassignedHodUser.employee_id, password: sharedPassword })
      .expect(200);

    assert.equal(loginRes.body.user.role, 'employee');
    assert.equal(loginRes.body.user.isReviewer, false);
    assert.equal(loginRes.body.user.isFeedbackReviewer, false);
    assert.deepEqual(loginRes.body.user.assignedCategories, []);

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${unassignedHodToken}`)
      .expect(200);
    assert.equal(meRes.body.role, 'employee');
    assert.equal(meRes.body.isReviewer, false);
    assert.deepEqual(meRes.body.assignedCategories, []);

    await request(app)
      .get('/api/hod/team')
      .set('Authorization', `Bearer ${unassignedHodToken}`)
      .expect(403);

    const statsRes = await request(app)
      .get('/api/incidents/stats')
      .set('Authorization', `Bearer ${unassignedHodToken}`)
      .expect(200);
    assert.equal(statsRes.body.hodReport ?? null, null);

    await request(app)
      .post('/api/admin/broadcast-notification')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: `Reviewer Notice ${tag}`,
        message: 'Only active reviewers should get this',
        targetRole: 'reviewer'
      })
      .expect(200);

    const hodNotifs = await query(
      `SELECT id FROM notifications WHERE user_id = $1 AND title = $2`,
      [unassignedHodUser.id, `Reviewer Notice ${tag}`]
    );
    assert.equal(hodNotifs.rows.length, 0, 'Unassigned HR HOD must not receive Reviewer broadcasts');
  });

  test('2. Reviewer assignment grants Reviewer View + own-dept My Team; handover lets new Reviewer see & edit pre-IMC feedback; unassignment revokes immediately', async () => {
    const catCreateRes = await request(app)
      .post('/api/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `Handover Cat ${tag}`,
        incidentTypes: ['SOP Lapse', 'Process Delay']
      })
      .expect(201);
    const handoverCat = catCreateRes.body.category;
    createdCategoryIds.push(handoverCat.id);

    await request(app)
      .post('/api/admin/category-mappings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ categoryId: handoverCat.id, employeeId: reviewerA.employee_id, replaceExisting: true })
      .expect(200);

    // reviewerA becomes active Reviewer without altering base role
    const meARes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${reviewerAToken}`)
      .expect(200);
    assert.equal(meARes.body.role, 'employee');
    assert.equal(meARes.body.isReviewer, true);
    assert.ok(meARes.body.assignedCategories.some((c) => c.id === handoverCat.id));

    // My Team is scoped strictly to reviewerA's own HR department
    const teamARes = await request(app)
      .get('/api/hod/team')
      .set('Authorization', `Bearer ${reviewerAToken}`)
      .expect(200);
    assert.ok(Array.isArray(teamARes.body));
    assert.ok(teamARes.body.every((m) => m.department === `DeptA_${tag}`));
    const teamEmpIds = teamARes.body.map((m) => m.employee_id);
    assert.ok(teamEmpIds.includes(peerDeptA.employee_id));
    assert.ok(!teamEmpIds.includes(reviewerB.employee_id));
    assert.ok(!teamEmpIds.includes(reporterEmp.employee_id));

    // Reviewer broadcast reaches active reviewerA
    await request(app)
      .post('/api/admin/broadcast-notification')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: `Reviewer Ping ${tag}`,
        message: 'Active reviewer ping',
        targetRole: 'reviewer'
      })
      .expect(200);
    const revANotif = await query(
      `SELECT id FROM notifications WHERE user_id = $1 AND title = $2`,
      [reviewerA.id, `Reviewer Ping ${tag}`]
    );
    assert.equal(revANotif.rows.length, 1);

    // Reporter submits an incident in handoverCat
    const incRes = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${reporterToken}`)
      .send({
        incidentDate: getLocalTodayIso(),
        incidentTime: '10:30',
        mainLocationId,
        subLocationText: 'Ward B',
        occurredTo: 'Patient',
        incidentCategories: [handoverCat.name],
        incidentTypes: ['SOP Lapse'],
        description: `Handover incident ${tag}`
      })
      .expect(201);
    const incId = incRes.body.incident.id;
    createdIncidentIds.push(incId);

    // reviewerA submits category feedback
    await request(app)
      .post(`/api/incidents/${incId}/hod-feedback`)
      .set('Authorization', `Bearer ${reviewerAToken}`)
      .send({ feedbackText: `Initial feedback by A ${tag}` })
      .expect(200);

    const fbRowRes = await query(
      `SELECT id FROM feedbacks WHERE incident_id = $1 AND role = 'hod' AND category_id = $2`,
      [incId, handoverCat.id]
    );
    assert.equal(fbRowRes.rows.length, 1);
    const feedbackId = fbRowRes.rows[0].id;

    // Reassign category from reviewerA -> reviewerB
    await request(app)
      .post('/api/admin/category-mappings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ categoryId: handoverCat.id, employeeId: reviewerB.employee_id, replaceExisting: true })
      .expect(200);

    // Immediate unassignment revocation for reviewerA
    const meAAfter = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${reviewerAToken}`)
      .expect(200);
    assert.equal(meAAfter.body.isReviewer, false);
    assert.equal(meAAfter.body.isFeedbackReviewer, false);
    assert.deepEqual(meAAfter.body.assignedCategories, []);

    await request(app)
      .get('/api/hod/team')
      .set('Authorization', `Bearer ${reviewerAToken}`)
      .expect(403);

    // reviewerA still retains Personal View access to incident where they authored feedback
    const personalAList = await request(app)
      .get('/api/incidents?viewMode=my_incidents&limit=50')
      .set('Authorization', `Bearer ${reviewerAToken}`)
      .expect(200);
    assert.ok(personalAList.body.incidents.some((i) => i.id === incId));
    await request(app)
      .get(`/api/incidents/${incId}`)
      .set('Authorization', `Bearer ${reviewerAToken}`)
      .expect(200);

    // Handover: reviewerB sees historical category incident, category-level KPIs, and can edit pre-IMC feedback
    const revBList = await request(app)
      .get('/api/incidents?viewMode=department&limit=50')
      .set('Authorization', `Bearer ${reviewerBToken}`)
      .expect(200);
    assert.ok(revBList.body.incidents.some((i) => i.id === incId));

    const statsB = await request(app)
      .get('/api/incidents/stats?viewMode=dept_reviews')
      .set('Authorization', `Bearer ${reviewerBToken}`)
      .expect(200);
    assert.ok(statsB.body.hodReport);
    assert.ok(statsB.body.hodReport.feedbackGiven >= 1);
    assert.equal(statsB.body.hodReport.feedbackPending, 0);

    const detailB = await request(app)
      .get(`/api/incidents/${incId}`)
      .set('Authorization', `Bearer ${reviewerBToken}`)
      .expect(200);
    assert.ok(Array.isArray(detailB.body.incident.userAssignedCategoryIds));
    assert.ok(detailB.body.incident.userAssignedCategoryIds.includes(handoverCat.id));

    await request(app)
      .put(`/api/incidents/${incId}/feedback`)
      .set('Authorization', `Bearer ${reviewerBToken}`)
      .send({ feedbackId, feedbackText: `Handover edited by B ${tag}` })
      .expect(200);

    const editedFb = await query(`SELECT feedback_text FROM feedbacks WHERE id = $1`, [feedbackId]);
    assert.equal(editedFb.rows[0].feedback_text, `Handover edited by B ${tag}`);

    const auditEdit = await query(
      `SELECT details FROM audit_logs WHERE incident_id = $1 AND action = 'FEEDBACK_EDITED' ORDER BY created_at DESC LIMIT 1`,
      [incId]
    );
    assert.equal(auditEdit.rows.length, 1);
    const details = typeof auditEdit.rows[0].details === 'string'
      ? JSON.parse(auditEdit.rows[0].details)
      : auditEdit.rows[0].details;
    assert.equal(details.originalAuthorId, reviewerA.id);

    // Once IMC submits review, reviewerB can no longer edit category feedback
    await request(app)
      .post(`/api/incidents/${incId}/imc-feedback`)
      .set('Authorization', `Bearer ${imcLeadToken}`)
      .send({
        severity: 'Minor',
        feedbackText: `IMC Quality Review ${tag}`,
        proposedOutcome: 'Employee Warning Letter'
      })
      .expect(200);

    await request(app)
      .put(`/api/incidents/${incId}/feedback`)
      .set('Authorization', `Bearer ${reviewerBToken}`)
      .send({ feedbackId, feedbackText: 'Should be blocked after IMC' })
      .expect(403);
  });

  test('3. Dynamic Category & Incident Type CRUD: Create, Rename syncs historical incidents, Smart Remove (archive vs delete), Restore', async () => {
    // Create category with custom incident types (Others auto-appended)
    const createRes = await request(app)
      .post('/api/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `DNB Related ${tag}`,
        incidentTypes: ['Resident Duty', 'Logbook Delay']
      })
      .expect(201);
    const dnbCat = createRes.body.category;
    createdCategoryIds.push(dnbCat.id);
    assert.ok(dnbCat.incident_types.includes('Resident Duty'));
    assert.ok(dnbCat.incident_types.includes('Logbook Delay'));
    assert.ok(dnbCat.incident_types.includes('Others'));

    // Public active categories endpoint includes it with types
    const catsPublic = await request(app)
      .get('/api/categories')
      .set('Authorization', `Bearer ${reporterToken}`)
      .expect(200);
    const foundPublic = catsPublic.body.find((c) => c.id === dnbCat.id);
    assert.ok(foundPublic);
    assert.ok(foundPublic.incident_types.includes('Resident Duty'));
    assert.ok(foundPublic.incident_types.includes('Others'));

    // Create an incident referencing DNB Related
    const incCreateRes = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${reporterToken}`)
      .send({
        incidentDate: getLocalTodayIso(),
        incidentTime: '11:00',
        mainLocationId,
        subLocationText: 'DNB Block',
        occurredTo: 'Hospital Employee',
        incidentCategories: [dnbCat.name],
        incidentTypes: ['Resident Duty'],
        description: `DNB incident ${tag}`
      })
      .expect(201);
    const dnbIncId = incCreateRes.body.incident.id;
    createdIncidentIds.push(dnbIncId);

    // Map reviewerA to dnbCat so Smart Remove deactivation can also be verified
    await request(app)
      .post('/api/admin/category-mappings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ categoryId: dnbCat.id, employeeId: reviewerA.employee_id, replaceExisting: true })
      .expect(200);

    // Rename & update types
    const renamed = `DNB & Academic ${tag}`;
    await request(app)
      .put(`/api/admin/categories/${dnbCat.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: renamed,
        incidentTypes: ['Logbook Delay', 'Thesis Review']
      })
      .expect(200);

    const incAfterRename = await query(`SELECT incident_category FROM incidents WHERE id = $1`, [dnbIncId]);
    assert.equal(incAfterRename.rows[0].incident_category, renamed);

    const updateAudit = await query(
      `SELECT id FROM audit_logs WHERE user_id = $1 AND action = 'CATEGORY_UPDATED' AND details::text LIKE $2`,
      [adminUser.id, `%${renamed}%`]
    );
    assert.ok(updateAudit.rows.length >= 1);

    // Smart Remove on referenced category -> Archives + unassigns reviewers
    const archiveRes = await request(app)
      .delete(`/api/admin/categories/${dnbCat.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.equal(archiveRes.body.action, 'archived');
    assert.ok(archiveRes.body.incidentCount >= 1);

    const activeAssignees = await query(
      `SELECT id FROM category_feedback_assignees WHERE category_id = $1 AND is_active = TRUE`,
      [dnbCat.id]
    );
    assert.equal(activeAssignees.rows.length, 0);

    const catsAfterArchive = await request(app)
      .get('/api/categories')
      .set('Authorization', `Bearer ${reporterToken}`)
      .expect(200);
    assert.ok(!catsAfterArchive.body.some((c) => c.id === dnbCat.id));

    const adminAllMappings = await request(app)
      .get('/api/admin/category-mappings?includeArchived=true')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const archivedRow = adminAllMappings.body.find((c) => c.id === dnbCat.id);
    assert.ok(archivedRow);
    assert.equal(archivedRow.is_active, false);

    // Restore archived category
    await request(app)
      .post(`/api/admin/categories/${dnbCat.id}/restore`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const catsAfterRestore = await request(app)
      .get('/api/categories')
      .set('Authorization', `Bearer ${reporterToken}`)
      .expect(200);
    assert.ok(catsAfterRestore.body.some((c) => c.id === dnbCat.id));

    // Create 0-incident category and Smart Remove -> Hard deletes
    const emptyCatRes = await request(app)
      .post('/api/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `Unused Cat ${tag}`, incidentTypes: ['Temp Type'] })
      .expect(201);
    const emptyCatId = emptyCatRes.body.category.id;
    createdCategoryIds.push(emptyCatId);

    const delRes = await request(app)
      .delete(`/api/admin/categories/${emptyCatId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.equal(delRes.body.action, 'deleted');
    assert.equal(delRes.body.incidentCount, 0);

    const dbCheck = await query(`SELECT id FROM incident_categories WHERE id = $1`, [emptyCatId]);
    assert.equal(dbCheck.rows.length, 0);

    const delAudit = await query(
      `SELECT id FROM audit_logs WHERE user_id = $1 AND action = 'CATEGORY_DELETED' AND details::text LIKE $2`,
      [adminUser.id, `%Unused Cat ${tag}%`]
    );
    assert.ok(delAudit.rows.length >= 1);
  });
});

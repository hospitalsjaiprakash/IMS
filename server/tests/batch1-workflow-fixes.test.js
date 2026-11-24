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

describe('Batch 1 High-Impact Workflow Fixes (#1, #3, #4, #5, #6)', () => {
  const tag = `B1_${Date.now().toString(36).toUpperCase()}`;
  const createdUserIds = [];
  const createdMasterEmpIds = [];
  const createdIncidentIds = [];
  let savedAssigneesSnapshot = [];

  let catA;
  let catB;
  let catUnmapped;
  let mainLocationId = 1;

  let imcLeadUser;
  let imcMemberUser;
  let mgmtUser;
  let reviewerEmp;
  let reporterEmp;
  let ccEmp;

  let imcLeadToken;
  let mgmtToken;
  let reviewerToken;
  let reporterToken;
  let ccEmpToken;

  before(async () => {
    const catsRes = await query(
      `SELECT id, name FROM incident_categories WHERE is_active = TRUE ORDER BY id ASC LIMIT 2`
    );
    assert.ok(catsRes.rows.length >= 2, 'Expected at least 2 seeded active incident_categories');
    [catA, catB] = catsRes.rows;

    const unmappedRes = await query(
      `INSERT INTO incident_categories (name, is_active) VALUES ($1, TRUE) RETURNING id, name`,
      [`Unmapped ${tag}`]
    );
    catUnmapped = unmappedRes.rows[0];

    const locRes = await query(`SELECT id FROM main_locations ORDER BY id ASC LIMIT 1`);
    if (locRes.rows.length > 0) {
      mainLocationId = locRes.rows[0].id;
    }

    const snapRes = await query(
      `SELECT id, category_id, user_id, is_active FROM category_feedback_assignees WHERE category_id = ANY($1::int[])`,
      [[catA.id, catB.id]]
    );
    savedAssigneesSnapshot = snapRes.rows;

    const createUser = async ({ suffix, role = 'employee', designation = 'Staff', isImc = false, isImcLead = false, isMgmt = false }) => {
      const empId = `${tag}_${suffix}`;
      const email = `${empId.toLowerCase()}@test.jphrc.local`;
      await query(
        `INSERT INTO master_employees (employee_id, name, email, phone, department, designation, role, status)
         VALUES ($1, $2, $3, '9876500001', 'Quality Control', $5, $4, 'active')`,
        [empId, `B1Test ${suffix} ${tag}`, email, role, designation]
      );
      createdMasterEmpIds.push(empId);

      const uRes = await query(
        `INSERT INTO users (employee_id, full_name, email, phone, department, designation, role, is_active, is_system_admin, is_imc_member, is_imc_lead, is_management_member)
         VALUES ($1, $2, $3, '9876500001', 'Quality Control', $8, $4, TRUE, FALSE, $5, $6, $7)
         RETURNING *`,
        [empId, `B1Test ${suffix} ${tag}`, email, role, isImc, isImcLead, isMgmt, designation]
      );
      createdUserIds.push(uRes.rows[0].id);
      return uRes.rows[0];
    };

    imcLeadUser = await createUser({ suffix: 'IMCL', role: 'imc', isImc: true, isImcLead: true });
    imcMemberUser = await createUser({ suffix: 'IMCM', role: 'imc', isImc: true, isImcLead: false });
    mgmtUser = await createUser({ suffix: 'MGT', role: 'head_management', isMgmt: true });
    reviewerEmp = await createUser({ suffix: 'REV', role: 'employee' });
    reporterEmp = await createUser({ suffix: 'REP', role: 'employee' });
    ccEmp = await createUser({ suffix: 'CC', role: 'employee', designation: `Quality Officer ${tag}` });

    imcLeadToken = signTestJwt(imcLeadUser);
    mgmtToken = signTestJwt(mgmtUser);
    reviewerToken = signTestJwt(reviewerEmp);
    reporterToken = signTestJwt(reporterEmp);
    ccEmpToken = signTestJwt(ccEmp);

    await query(
      `INSERT INTO category_feedback_assignees (category_id, user_id, assigned_by, is_active)
       VALUES ($1, $2, $3, TRUE)
       ON CONFLICT (category_id, user_id) DO UPDATE SET is_active = TRUE`,
      [catA.id, reviewerEmp.id, imcLeadUser.id]
    );
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
      await query('DELETE FROM incident_letter_versions WHERE incident_id = ANY($1::uuid[])', [createdIncidentIds]).catch(() => {});
      await query('DELETE FROM incident_trainers WHERE incident_id = ANY($1::uuid[])', [createdIncidentIds]).catch(() => {});
      await query('DELETE FROM attachments WHERE incident_id = ANY($1::uuid[])', [createdIncidentIds]).catch(() => {});
      await query('DELETE FROM incident_letters WHERE incident_id = ANY($1::uuid[])', [createdIncidentIds]).catch(() => {});
      await query('DELETE FROM investigators WHERE incident_id = ANY($1::uuid[])', [createdIncidentIds]).catch(() => {});
      await query('DELETE FROM incident_events WHERE incident_id = ANY($1::uuid[])', [createdIncidentIds]).catch(() => {});
      await query('DELETE FROM incident_responsible_employees WHERE incident_id = ANY($1::uuid[])', [createdIncidentIds]).catch(() => {});
      await query('DELETE FROM feedbacks WHERE incident_id = ANY($1::uuid[])', [createdIncidentIds]).catch(() => {});
      await query('DELETE FROM incident_category_links WHERE incident_id = ANY($1::uuid[])', [createdIncidentIds]).catch(() => {});
      await query('DELETE FROM incidents WHERE id = ANY($1::uuid[])', [createdIncidentIds]).catch(() => {});
    }
    if (catUnmapped?.id) {
      await query('DELETE FROM incident_categories WHERE id = $1', [catUnmapped.id]).catch(() => {});
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

  test('#5 & #3: Multi-category incident persists all category types, and reporter can edit in with_hod only before first feedback', async () => {
    const typeA = `TypeA_${tag}`;
    const typeB = `TypeB_${tag}`;

    const createRes = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${reporterToken}`)
      .send({
        incidentDate: getLocalTodayIso(),
        incidentTime: '10:30',
        mainLocationId,
        subLocationText: `Ward 2 ${tag}`,
        occurredTo: 'Patient',
        incidentCategory: catA.name,
        incidentType: typeA,
        incidentCategories: JSON.stringify([catA.name, catB.name]),
        incidentTypes: JSON.stringify([typeA, typeB]),
        categoryTypeMap: JSON.stringify({ [catA.name]: typeA, [catB.name]: typeB }),
        description: `Initial description ${tag}`,
        hasResponsiblePerson: false
      })
      .expect(201);

    const incId = createRes.body.incident.id;
    createdIncidentIds.push(incId);
    assert.equal(createRes.body.incident.status, 'with_hod');

    // #3: Reporter edits description/occurredTo while in with_hod & before any feedback; severity change is ignored
    await request(app)
      .put(`/api/incidents/${incId}`)
      .set('Authorization', `Bearer ${reporterToken}`)
      .send({
        description: `Updated description ${tag}`,
        occurredTo: 'Hospital Employee',
        severity: 'Grave'
      })
      .expect(200);

    const detailRes = await request(app)
      .get(`/api/incidents/${incId}`)
      .set('Authorization', `Bearer ${imcLeadToken}`)
      .expect(200);

    assert.equal(detailRes.body.incident.description, `Updated description ${tag}`);
    assert.equal(detailRes.body.incident.occurred_to, 'Hospital Employee');
    assert.equal(detailRes.body.incident.severity, 'Pending', 'Reporter edit must not override severity');

    // #5: Both category types retained in summary + per-category links
    assert.ok(detailRes.body.incident.incident_type.includes(typeA), 'Summary incident_type should include first type');
    assert.ok(detailRes.body.incident.incident_type.includes(typeB), 'Summary incident_type should include second type');
    const catMap = new Map(detailRes.body.incident.categories.map((c) => [c.name, c.incident_type]));
    assert.equal(catMap.get(catA.name), typeA);
    assert.equal(catMap.get(catB.name), typeB);

    // Submit reviewer feedback -> reporter editing must now be blocked
    await request(app)
      .post(`/api/incidents/${incId}/hod-feedback`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({ feedbackText: `Reviewer feedback ${tag}` })
      .expect(200);

    await request(app)
      .put(`/api/incidents/${incId}`)
      .set('Authorization', `Bearer ${reporterToken}`)
      .send({ description: 'Should fail after feedback' })
      .expect(400);
  });

  test('#1, #4, #6: Management return & reopen allow revised IMC assessment + fresh investigation; trainer letter & 3 evidence files persist', async () => {
    const createRes = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${reporterToken}`)
      .send({
        incidentDate: getLocalTodayIso(),
        incidentTime: '11:15',
        mainLocationId,
        subLocationText: `ICU ${tag}`,
        occurredTo: 'Process Flow',
        incidentCategory: catUnmapped.name, // unmapped -> routes directly to with_imc
        incidentType: `SingleType_${tag}`,
        incidentCategories: JSON.stringify([catUnmapped.name]),
        categoryTypeMap: JSON.stringify({ [catUnmapped.name]: `SingleType_${tag}` }),
        description: `Workflow re-review & training test ${tag}`,
        hasResponsiblePerson: false
      })
      .expect(201);

    const incId = createRes.body.incident.id;
    createdIncidentIds.push(incId);
    assert.equal(createRes.body.incident.status, 'with_imc');

    // Round 1 IMC Assessment -> Management
    await request(app)
      .post(`/api/incidents/${incId}/imc-feedback`)
      .set('Authorization', `Bearer ${imcLeadToken}`)
      .send({
        feedbackText: `IMC round 1 ${tag}`,
        forwardToMd: true,
        severity: 'Minor',
        proposedOutcome: 'No Action'
      })
      .expect(200);

    // #1a: Management returns for revised feedback
    await request(app)
      .post(`/api/incidents/${incId}/management-action`)
      .set('Authorization', `Bearer ${mgmtToken}`)
      .send({
        decision: 'DISAGREE_REVISE_FEEDBACK',
        notes: `Please add training outcome ${tag}`
      })
      .expect(200);

    // Round 2 IMC Assessment -> preserves round 1 feedback row cleanly and sends Training outcome
    await request(app)
      .post(`/api/incidents/${incId}/imc-feedback`)
      .set('Authorization', `Bearer ${imcLeadToken}`)
      .send({
        feedbackText: `IMC round 2 ${tag}`,
        forwardToMd: true,
        severity: 'Major',
        proposedOutcome: 'Training',
        responsibleEmployees: JSON.stringify([
          {
            id: reviewerEmp.id,
            employee_id: reviewerEmp.employee_id,
            full_name: reviewerEmp.full_name,
            outcomes: ['Training'],
            needs_training: true
          }
        ])
      })
      .expect(200);

    const imcFeedbackRows = await query(
      `SELECT stage, feedback_text FROM feedbacks WHERE incident_id = $1 AND role = 'imc' ORDER BY created_at ASC`,
      [incId]
    );
    assert.equal(imcFeedbackRows.rows.length, 2);
    assert.equal(imcFeedbackRows.rows[0].feedback_text, `IMC round 1 ${tag}`);
    assert.equal(imcFeedbackRows.rows[1].stage, 'revised_imc');

    // Management approves Training -> pending_trainer_assignment
    await request(app)
      .post(`/api/incidents/${incId}/management-action`)
      .set('Authorization', `Bearer ${mgmtToken}`)
      .send({
        decision: 'AGREE',
        notes: `Approve training ${tag}`,
        responsibleEmployees: JSON.stringify([
          {
            id: reviewerEmp.id,
            employee_id: reviewerEmp.employee_id,
            full_name: reviewerEmp.full_name,
            outcomes: ['Training'],
            needs_training: true
          }
        ])
      })
      .expect(200);

    // Assign trainer with CC
    const assignRes = await request(app)
      .post(`/api/incidents/${incId}/trainers/assign`)
      .set('Authorization', `Bearer ${imcLeadToken}`)
      .send({
        trainerId: imcMemberUser.id,
        trainingTopic: `SOP Refresher ${tag}`,
        trainingInstructions: `Hands-on check ${tag}`,
        traineeIds: [reviewerEmp.id],
        ccRecipients: [{ employee_id: ccEmp.employee_id }]
      })
      .expect(200);

    const assignmentId = assignRes.body.assignment.id;
    const appointmentLetterId = assignRes.body.assignment.appointment_letter?.id;
    assert.ok(appointmentLetterId);

    // #4: getIncident returns full letter_* fields on trainers[0] and PDF endpoint authorizes CC staff
    const incAfterTrainer = await request(app)
      .get(`/api/incidents/${incId}`)
      .set('Authorization', `Bearer ${ccEmpToken}`)
      .expect(200);

    const trainerEntry = incAfterTrainer.body.trainers[0];
    assert.ok(trainerEntry.letter_reference_number?.startsWith('JPHRC/TRN/'));
    assert.ok(trainerEntry.letter_body_text?.includes('SOP Refresher'));
    assert.ok(trainerEntry.letter_qr_code_url);
    assert.ok(trainerEntry.letter_subject);

    // #6: Upload 3 valid files (PDF, PNG, JPEG) on trainer completion report
    const pdfBuf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
    const pngBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    const jpgBuf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

    await request(app)
      .post(`/api/incidents/${incId}/trainers/submit-report`)
      .set('Authorization', `Bearer ${imcLeadToken}`)
      .field('assignmentId', assignmentId)
      .field('completionDate', getLocalTodayIso())
      .field('durationMinutes', '60')
      .field('venue', 'Ward Nursing Station')
      .field('methodology', 'Practical Demonstration & Hands-on SOP Simulation')
      .field('summary', `Completed session with 3 attendance docs ${tag}`)
      .attach('attachments', pdfBuf, { filename: 'attendance.pdf', contentType: 'application/pdf' })
      .attach('attachments', pngBuf, { filename: 'photo1.png', contentType: 'image/png' })
      .attach('attachments', jpgBuf, { filename: 'photo2.jpg', contentType: 'image/jpeg' })
      .expect(200);

    const afterReport = await request(app)
      .get(`/api/incidents/${incId}`)
      .set('Authorization', `Bearer ${imcLeadToken}`)
      .expect(200);

    const reportFiles = afterReport.body.trainers[0].report_attachments;
    assert.equal(reportFiles.length, 3, 'All 3 uploaded training evidence files must persist');
    assert.deepEqual(
      reportFiles.map((f) => f.original_filename),
      ['attendance.pdf', 'photo1.png', 'photo2.jpg']
    );

    const trainersListRes = await request(app)
      .get(`/api/incidents/${incId}/trainers`)
      .set('Authorization', `Bearer ${ccEmpToken}`)
      .expect(200);
    assert.equal(trainersListRes.body[0].report_attachments.length, 3);
    assert.ok(trainersListRes.body[0].letter_reference_number?.startsWith('JPHRC/TRN/'));

    const trEvent = afterReport.body.events.find((e) => e.event_type === 'TRAINING_REPORT_SUBMITTED');
    assert.equal(trEvent.attachments.length, 3, 'All 3 files must link to Case Story event');

    // Verify training & close, then test Reopen (#1b) + fresh investigator assignment
    await request(app)
      .post(`/api/incidents/${incId}/trainers/imc-verify`)
      .set('Authorization', `Bearer ${imcLeadToken}`)
      .send({ assignmentId, action: 'VERIFY', reviewNotes: 'Verified' })
      .expect(200);

    await request(app)
      .post(`/api/incidents/${incId}/trainers/management-close`)
      .set('Authorization', `Bearer ${mgmtToken}`)
      .send({ assignmentId, closureNotes: 'Closed' })
      .expect(200);

    await request(app)
      .post(`/api/incidents/${incId}/reopen`)
      .set('Authorization', `Bearer ${mgmtToken}`)
      .send({ reason: `Exceptional reopening check ${tag}` })
      .expect(200);

    const reopenedDetail = await request(app)
      .get(`/api/incidents/${incId}`)
      .set('Authorization', `Bearer ${imcLeadToken}`)
      .expect(200);

    assert.equal(reopenedDetail.body.incident.status, 'with_imc');
    assert.equal(reopenedDetail.body.incident.management_decision, null);
    assert.equal(reopenedDetail.body.incident.management_notes, null);
    assert.equal(reopenedDetail.body.incident.resolved_at, null);

    // Reopened case supports appointing a new investigation panel round
    await request(app)
      .post(`/api/incidents/${incId}/assign-investigator`)
      .set('Authorization', `Bearer ${imcLeadToken}`)
      .send({ investigatorIds: [imcMemberUser.id] })
      .expect(200);

    const invDetail = await request(app)
      .get(`/api/incidents/${incId}`)
      .set('Authorization', `Bearer ${imcLeadToken}`)
      .expect(200);
    assert.equal(invDetail.body.incident.status, 'with_investigator');
    assert.equal(invDetail.body.incident.investigators.length, 1);
    assert.equal(invDetail.body.incident.investigators[0].status, 'assigned');
  });
});

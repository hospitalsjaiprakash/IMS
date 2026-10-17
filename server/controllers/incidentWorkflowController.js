const { query, getClient } = require('../config/database');
const { auditLog } = require('../middleware/auth');
const { createNotification } = require('../utils/notifications');
const { sendEmail, templates } = require('../utils/emailService');
const { recordEvent, getNextRoundNo } = require('../utils/incidentEvents');
const bcrypt = require('bcryptjs');

function formatProposedOutcome(outcome) {
  if (!outcome) return null;
  if (Array.isArray(outcome)) {
    return outcome.filter(Boolean).join(', ');
  }
  if (typeof outcome === 'string') {
    const trimmed = outcome.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.filter(Boolean).join(', ');
      } catch (e) {}
    }
    return trimmed;
  }
  return String(outcome);
}

async function resolveEmployeeUserId(emp, client) {
  if (!emp) return null;
  const candidates = [
    emp.user_id,
    emp.userId,
    emp.employee_id,
    emp.emp_id,
    emp.id
  ].filter(Boolean).map(String);

  // 1. Direct match in users table by UUID or employee code
  for (const candidate of candidates) {
    const uRes = await client.query(
      `SELECT id FROM users WHERE id::text = $1 OR employee_id = $1 LIMIT 1`,
      [candidate]
    );
    if (uRes.rows.length > 0) {
      return uRes.rows[0].id;
    }
  }

  // 2. Check master_employees and provision if needed
  for (const candidate of candidates) {
    const mRes = await client.query(
      `SELECT * FROM master_employees WHERE id::text = $1 OR employee_id = $1 LIMIT 1`,
      [candidate]
    );
    if (mRes.rows.length > 0) {
      const m = mRes.rows[0];
      const nu = await client.query(
        `INSERT INTO users (employee_id, full_name, email, department, designation, role, is_active, password_hash)
         VALUES ($1, $2, $3, $4, $5, 'employee', TRUE, NULL)
         ON CONFLICT (employee_id) DO UPDATE SET full_name = EXCLUDED.full_name
         RETURNING id`,
        [m.employee_id, m.name, m.email || `${m.employee_id}@jphrc.org`, m.department, m.designation]
      );
      if (nu.rows.length > 0) {
        return nu.rows[0].id;
      }
    }
  }

  return null;
}

// =============================================
// SUBMIT HOD FEEDBACK
// =============================================
exports.submitHodFeedback = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { id } = req.params;
    let { feedbackText, redirectToImc, redirectReason } = req.body;

    const incidentResult = await client.query(
      'SELECT * FROM incidents WHERE id = $1',
      [id]
    );

    if (!incidentResult.rows.length) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    const incident = incidentResult.rows[0];

    // Rule: Cannot submit HOD feedback after IMC has already given feedback
    const imcCheck = await client.query(
      "SELECT 1 FROM feedbacks WHERE incident_id = $1 AND role = 'imc'",
      [id]
    );
    if (imcCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Cannot submit HOD feedback because IMC has already submitted quality review feedback.' });
    }

    // Get department(s) where current user is the assigned feedback staff
    const deptResult = await client.query(
      'SELECT id, name FROM departments WHERE assigned_user_id = $1 OR (assigned_user_id IS NULL AND hod_user_id = $1)',
      [req.user.id]
    );

    const userDeptIds = deptResult.rows.map(d => d.id);
    let deptId = null;

    if (userDeptIds.length > 0) {
      // Check if any of HOD's departments is targeted by this incident
      const targetCheck = await client.query(
        'SELECT department_id FROM incident_departments WHERE incident_id = $1 AND department_id = ANY($2)',
        [id, userDeptIds]
      );
      if (targetCheck.rows.length) {
        deptId = targetCheck.rows[0].department_id;
      }
    }

    // If user requested redirect for this incident, allow them to submit on the incident's department
    if (!deptId && (incident.redirect_requested_by_user_id === req.user.id || req.user.role === 'hod')) {
      const incDepts = await client.query('SELECT department_id FROM incident_departments WHERE incident_id = $1 LIMIT 1', [id]);
      if (incDepts.rows.length) {
        deptId = incDepts.rows[0].department_id;
      } else if (userDeptIds.length > 0) {
        deptId = userDeptIds[0];
      }
    }

    if (!deptId) {
      return res.status(403).json({ error: 'This incident is not targeted at your department.' });
    }

    // Check if this HOD or department has already submitted feedback
    const existingFb = await client.query(
      `SELECT id FROM feedbacks 
       WHERE incident_id = $1 AND role = 'hod' 
         AND (author_id = $2 OR department_id = $3)`,
      [id, req.user.id, deptId]
    );

    if (existingFb.rows.length > 0) {
      return res.status(400).json({ error: 'Feedback has already been submitted for your department. You can edit your existing feedback.' });
    }

    // Insert feedback
    await client.query(
      `INSERT INTO feedbacks (incident_id, author_id, role, department_id, feedback_text, acknowledged_at)
       VALUES ($1, $2, 'hod', $3, $4, NOW())`,
      [id, req.user.id, deptId, feedbackText]
    );

    // Insert attachments if any
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await client.query(
          `INSERT INTO attachments (incident_id, uploader_id, stage, original_filename, stored_filename, file_size, mime_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [id, req.user.id, 'hod_feedback', file.originalname, (file.filename || file.key), file.size, file.mimetype]
        );
      }
    }

    // Check if ALL concerned departments have responded
    const pendingDepts = await client.query(`
      SELECT d.id, d.name
      FROM incident_departments id_dept
      JOIN departments d ON d.id = id_dept.department_id
      WHERE id_dept.incident_id = $1
        AND NOT EXISTS (
          SELECT 1 FROM feedbacks f
          LEFT JOIN users u ON u.id = f.author_id
          WHERE f.incident_id = $1 
            AND f.role = 'hod'
            AND (
              f.department_id = d.id 
              OR f.author_id = COALESCE(d.assigned_user_id, d.hod_user_id)
            )
        )
    `, [id]);

    const allResponded = pendingDepts.rows.length === 0;

    // Update status
    if (redirectToImc) {
      await client.query(
        `UPDATE incidents SET status = 'redirect_requested', updated_at = NOW() WHERE id = $1`,
        [id]
      );
    } else if (allResponded) {
      const newStatus = incident.status === 'with_hod_and_imc' ? 'with_hod_and_imc' : 'with_imc';
      await client.query(
        `UPDATE incidents SET status = $1, updated_at = NOW() WHERE id = $2`,
        [newStatus, id]
      );
    } else if (!allResponded && incident.status === 'submitted') {
      await client.query(
        `UPDATE incidents SET status = 'with_hod', updated_at = NOW() WHERE id = $1`,
        [id]
      );
    }

    // Record immutable HOD_FEEDBACK_SUBMITTED event
    const dNameRes = await client.query('SELECT name FROM departments WHERE id = $1', [deptId]);
    const deptName = dNameRes.rows[0]?.name || req.user.department || 'Department';

    const hodEvt = await recordEvent(client, {
      incidentId: id,
      eventType: 'HOD_FEEDBACK_SUBMITTED',
      actor: req.user,
      title: `Department Feedback: ${deptName}`,
      summary: `Submitted by ${req.user.full_name} (${req.user.designation || 'HOD'})`,
      payload: {
        department_name: deptName,
        feedback_text: feedbackText,
        all_responded: allResponded
      }
    });

    if (req.files && req.files.length > 0) {
      await client.query(
        `UPDATE attachments SET event_id = $1 WHERE incident_id = $2 AND stage = 'hod_feedback' AND uploader_id = $3 AND event_id IS NULL`,
        [hodEvt.id, id, req.user.id]
      );
    }

    await client.query('COMMIT');

    // Notify IMC (in-app + email) only if ready
    if (redirectToImc || allResponded) {
      const imcMembers = await query('SELECT id, email, full_name FROM users WHERE role = $1', ['imc']);
      for (const member of imcMembers.rows) {
        await createNotification(member.id, id,
          'Incident Ready for IMC Review',
          `Incident ${incident.reference_id} is now in the IMC queue (all concerned HOD reviews complete).`,
          'incident_to_imc'
        );
        if (member.email) {
          sendEmail(member.email, templates.incidentToImc(incident, member)).catch(() => {});
        }
      }
    }

    await auditLog(req.user.id, 'HOD_FEEDBACK_SUBMITTED', id, { redirectToImc, deptId, allResponded }, req.ip);

    if (req.io) {
      const currentStatus = redirectToImc ? 'redirect_requested' : (allResponded ? (incident.status === 'with_hod_and_imc' ? 'with_hod_and_imc' : 'with_imc') : incident.status);
      req.io.emit('incident_updated', { id, status: currentStatus });
    }

    res.json({ success: true, allResponded });

  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message || 'Failed to submit feedback.' });
  } finally {
    client.release();
  }
};

// =============================================
// IMC CLAIM INCIDENT
// =============================================
exports.claimIncident = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { id } = req.params;

    // Check no active claim
    const existingClaim = await client.query(
      'SELECT * FROM imc_claims WHERE incident_id = $1 AND is_active = TRUE',
      [id]
    );

    if (existingClaim.rows.length > 0) {
      const claim = existingClaim.rows[0];
      if (new Date(claim.expires_at) > new Date()) {
        return res.status(409).json({ error: 'Incident is already claimed by another IMC member.' });
      }
      // Release expired claim
      await client.query(
        'UPDATE imc_claims SET is_active = FALSE, released_at = NOW() WHERE id = $1',
        [claim.id]
      );
    }

    // Get claim lock duration
    const configResult = await client.query(
      "SELECT value FROM system_config WHERE key = 'claim_lock_minutes'"
    );
    const lockMinutes = parseInt(configResult.rows[0]?.value || '30');

    const expiresAt = new Date(Date.now() + lockMinutes * 60 * 1000);

    await client.query(
      `INSERT INTO imc_claims (incident_id, claimed_by, expires_at) VALUES ($1, $2, $3)`,
      [id, req.user.id, expiresAt]
    );

    await client.query('COMMIT');

    await recordEvent(client, {
      incidentId: id,
      eventType: 'IMC_CLAIMED',
      actor: req.user,
      title: 'Incident Claimed by IMC Member',
      summary: `Locked for review for ${lockMinutes} minutes`,
      payload: { lock_minutes: lockMinutes, expires_at: expiresAt },
      isSystemEvent: true
    });

    await auditLog(req.user.id, 'IMC_CLAIM', id, { lockMinutes }, req.ip);

    res.json({ success: true, expiresAt });

  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to claim incident' });
  } finally {
    client.release();
  }
};

// =============================================
// IMC SUBMIT FEEDBACK
// =============================================
exports.submitImcFeedback = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { id } = req.params;
    let { feedbackText, forwardToMd, severity, proposedOutcome } = req.body;
    
    if (!req.user.is_imc_lead) {
      return res.status(403).json({ error: 'Only the IMC Convenor can submit feedback.' });
    }

    forwardToMd = forwardToMd === 'true' || forwardToMd === true;
    let cleanProposedOutcome = formatProposedOutcome(proposedOutcome);

    const incidentResult = await client.query('SELECT * FROM incidents WHERE id = $1', [id]);
    if (!incidentResult.rows.length) return res.status(404).json({ error: 'Not found' });
    const incident = incidentResult.rows[0];

    // Rule: Only after HOD of all concerned department have given feedback, then only IMC can give feedback.
    const pendingDepts = await client.query(`
      SELECT d.name
      FROM incident_departments id_dept
      JOIN departments d ON d.id = id_dept.department_id
      WHERE id_dept.incident_id = $1
        AND NOT EXISTS (
          SELECT 1 FROM feedbacks f
          LEFT JOIN users u ON u.id = f.author_id
          WHERE f.incident_id = $1 
            AND f.role = 'hod'
            AND (
              f.department_id = d.id 
              OR f.author_id = COALESCE(d.assigned_user_id, d.hod_user_id)
            )
        )
    `, [id]);

    if (pendingDepts.rows.length > 0) {
      const names = pendingDepts.rows.map(d => d.name).join(', ');
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Cannot submit IMC feedback yet. Awaiting HOD feedback from concerned department(s): ${names}.`
      });
    }

    // Rule: If investigators were assigned, joint investigation report must be submitted before Lead can forward to management
    const invPending = await client.query(
      `SELECT COUNT(*) as total, 
              COUNT(CASE WHEN status != 'completed' THEN 1 END) as pending
       FROM investigators WHERE incident_id = $1`,
      [id]
    );
    const totalInvs = parseInt(invPending.rows[0]?.total || '0', 10);
    const pendingInvs = parseInt(invPending.rows[0]?.pending || '0', 10);
    if (totalInvs > 0 && pendingInvs > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Cannot submit feedback to Management yet. The joint investigation report has not been submitted by the investigators.`
      });
    }

    const imcFeedbackStage = incident.management_decision === 'DISAGREE_REVISE_FEEDBACK' ? 'revised_imc' : 'initial_imc';
    await client.query(
      `INSERT INTO feedbacks (incident_id, author_id, role, feedback_text, stage, proposed_outcome)
       VALUES ($1, $2, 'imc', $3, $4, $5)`,
      [id, req.user.id, feedbackText, imcFeedbackStage, cleanProposedOutcome || null]
    );
    
    // Insert attachments if any
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await client.query(
          `INSERT INTO attachments (incident_id, uploader_id, stage, original_filename, stored_filename, file_size, mime_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [id, req.user.id, 'imc_feedback', file.originalname, (file.filename || file.key), file.size, file.mimetype]
        );
      }
    }

    // Save responsible / involved employees if provided by IMC
    let imcResponsibleEmployees = req.body.responsibleEmployees || req.body.involvedEmployees;
    let anyEmployeeNeedsTraining = false;
    const collectedEmployeeOutcomes = new Set();

    if (imcResponsibleEmployees !== undefined) {
      if (typeof imcResponsibleEmployees === 'string') {
        try { imcResponsibleEmployees = JSON.parse(imcResponsibleEmployees); } catch(e) {}
      }
      if (Array.isArray(imcResponsibleEmployees)) {
        await client.query(`DELETE FROM incident_responsible_employees WHERE incident_id = $1`, [id]);
        const { numberToWords } = require('../utils/numberToWords');

        for (const emp of imcResponsibleEmployees) {
          let deptId = emp.department_id;
          if (!deptId && emp.department) {
             const dRes = await client.query('SELECT id FROM departments WHERE LOWER(name) = LOWER($1)', [emp.department]);
             if (dRes.rows.length) deptId = dRes.rows[0].id;
          }
          const validUserId = await resolveEmployeeUserId(emp, client);
          if (validUserId) {
            const empOutcomes = Array.isArray(emp.outcomes)
              ? emp.outcomes.filter(Boolean)
              : (typeof emp.outcomes === 'string' && emp.outcomes.trim() ? emp.outcomes.split(',').map(s => s.trim()).filter(Boolean) : []);

            empOutcomes.forEach(o => collectedEmployeeOutcomes.add(o));

            const empNeedsTraining = Boolean(
              emp.needs_training ||
              empOutcomes.some(o => {
                const ol = o.toLowerCase();
                return ol.includes('training') || ol.includes('counselling') || ol.includes('education');
              })
            );
            if (empNeedsTraining) anyEmployeeNeedsTraining = true;

            const pAmt = emp.penalty_amount ? Number(emp.penalty_amount) : null;
            const pWords = pAmt ? numberToWords(pAmt) : null;

            await client.query(
              `INSERT INTO incident_responsible_employees (
                 incident_id, employee_id, department_id, needs_training, assigned_by,
                 outcomes, penalty_amount, penalty_amount_words, notes
               )
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
              [
                id,
                validUserId,
                deptId || null,
                empNeedsTraining,
                req.user.id,
                empOutcomes,
                pAmt,
                pWords,
                emp.notes || null
              ]
            );
          }
        }
        await client.query(`UPDATE incidents SET has_responsible_person = ${imcResponsibleEmployees.length > 0} WHERE id = $1`, [id]);
      }
    }

    if (!cleanProposedOutcome && collectedEmployeeOutcomes.size > 0) {
      cleanProposedOutcome = Array.from(collectedEmployeeOutcomes).join(', ');
      await client.query(
        `UPDATE feedbacks SET proposed_outcome = $1 WHERE incident_id = $2 AND role = 'imc' AND stage = $3`,
        [cleanProposedOutcome, id, imcFeedbackStage]
      );
    }

    if (severity || cleanProposedOutcome || anyEmployeeNeedsTraining) {
      await client.query(
        `UPDATE incidents 
         SET severity = COALESCE($1, severity), 
             proposed_outcome = COALESCE($2, proposed_outcome),
             imc_proposed_outcome = COALESCE($2, imc_proposed_outcome, proposed_outcome),
             imc_severity = COALESCE($1, imc_severity, severity),
             imc_responsible_employees = $3,
             needs_training = CASE WHEN $4 = TRUE THEN TRUE ELSE needs_training END,
             updated_at = NOW() 
         WHERE id = $5`,
        [
          severity || null,
          cleanProposedOutcome || null,
          JSON.stringify(Array.isArray(imcResponsibleEmployees) ? imcResponsibleEmployees : []),
          anyEmployeeNeedsTraining,
          id
        ]
      );
    }

    if (forwardToMd) {
      await client.query(
        `UPDATE incidents SET status = 'with_head_management', management_decision = NULL, management_notes = NULL, updated_at = NOW() WHERE id = $1`,
        [id]
      );

      // Notify MD (in-app + email)
      const mdUsers = await query('SELECT id, email, full_name FROM users WHERE role = $1', ['head_management']);
      for (const md of mdUsers.rows) {
        await createNotification(md.id, id,
          'Incident Forwarded for Decision',
          `Incident ${incident.reference_id} requires your final decision.`,
          'incident_to_md'
        );
        if (md.email) {
          sendEmail(md.email, templates.incidentToManagement(incident, md)).catch(() => {});
        }
      }
    }
    // Record immutable IMC_ASSESSMENT_SUBMITTED event
    const imcRound = await getNextRoundNo(client, id, 'IMC_ASSESSMENT_SUBMITTED');
    const isRevised = imcRound > 1;

    const imcEvt = await recordEvent(client, {
      incidentId: id,
      eventType: 'IMC_ASSESSMENT_SUBMITTED',
      actor: req.user,
      roundNo: imcRound,
      statusBefore: incident.status,
      statusAfter: forwardToMd ? 'with_head_management' : incident.status,
      title: isRevised ? `IMC Revised Quality Assessment (Round ${imcRound})` : 'IMC Quality Assessment & Proposed Outcome',
      summary: `Assessed Severity: ${severity || incident.severity || 'Minor'} · Proposed Outcome: ${cleanProposedOutcome || 'No Action'}`,
      payload: {
        round_no: imcRound,
        is_revised: isRevised,
        severity: severity || incident.severity,
        proposed_outcome: cleanProposedOutcome || 'No Action',
        responsible_employees: imcResponsibleEmployees,
        feedback_text: feedbackText,
        forwarded_to_management: Boolean(forwardToMd)
      }
    });

    if (req.files && req.files.length > 0) {
      await client.query(
        `UPDATE attachments SET event_id = $1 WHERE incident_id = $2 AND stage = 'imc_feedback' AND uploader_id = $3 AND event_id IS NULL`,
        [imcEvt.id, id, req.user.id]
      );
    }

    await client.query('COMMIT');
    await auditLog(req.user.id, 'IMC_FEEDBACK_SUBMITTED', id, { forwardToMd }, req.ip);

    if (req.io) {
      req.io.emit('incident_updated', { id, status: forwardToMd ? 'with_head_management' : incident.status });
    }

    res.json({ success: true });

  } catch (error) {
    console.error('submitImcFeedback error:', error);
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message || 'Failed to submit IMC feedback' });
  } finally {
    client.release();
  }
};

// =============================================
// MD MANAGEMENT ACTION (Decision)
// =============================================
exports.submitManagementAction = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { id } = req.params;
    let {
      decision,
      notes,
      faultType,
      correctiveActions,
      requireTraining,
      responsibleEmployees,
      proposedOutcome,
      penaltyAmount
    } = req.body;
    
    if (!['AGREE', 'DISAGREE_MODIFY', 'DISAGREE_REINVESTIGATE', 'DISAGREE_REVISE_FEEDBACK'].includes(decision)) {
      return res.status(400).json({ error: 'Invalid decision type' });
    }

    const incidentResult = await client.query('SELECT * FROM incidents WHERE id = $1', [id]);
    if (!incidentResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Incident not found' });
    }
    const incident = incidentResult.rows[0];

    const cleanProposedOutcome = formatProposedOutcome(proposedOutcome);

    const decisionLabels = {
      'AGREE': 'Approved / Agreed with IMC',
      'DISAGREE_MODIFY': `Modified Proposed Outcome${cleanProposedOutcome ? `: ${cleanProposedOutcome}` : ''}`,
      'DISAGREE_REINVESTIGATE': 'Rejected & Re-investigation Requested',
      'DISAGREE_REVISE_FEEDBACK': 'Rejected & Revised Feedback Requested'
    };
    const decisionLabel = decisionLabels[decision] || decision;
    const finalFeedbackText = notes && String(notes).trim()
      ? `Decision: ${decisionLabel}\n\nNotes: ${String(notes).trim()}`
      : `Decision: ${decisionLabel}`;

    await client.query(
      `INSERT INTO feedbacks (incident_id, author_id, role, feedback_text, stage, proposed_outcome)
       VALUES ($1, $2, 'head_management', $3, $4, $5)`,
      [id, req.user.id, finalFeedbackText, decision.toLowerCase(), cleanProposedOutcome || null]
    );

    // Save attached files (supporting documents / executive notes)
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await client.query(
          `INSERT INTO attachments (incident_id, uploader_id, stage, original_filename, stored_filename, file_size, mime_type) 
           VALUES ($1, $2, 'md_decision', $3, $4, $5, $6)`,
          [id, req.user.id, file.originalname, (file.filename || file.key), file.size, file.mimetype]
        );
      }
    }

    if (decision === 'DISAGREE_MODIFY' && cleanProposedOutcome) {
      await client.query(`UPDATE incidents SET proposed_outcome = $1 WHERE id = $2`, [cleanProposedOutcome, id]);
    }

    // Save Management-specified penalty deduction amount if applicable
    if (penaltyAmount !== undefined && penaltyAmount !== null && penaltyAmount !== '') {
      const pAmt = Number(penaltyAmount) || null;
      const { numberToWords } = require('../utils/numberToWords');
      const pWords = pAmt ? numberToWords(pAmt) : null;
      await client.query(
        `UPDATE incidents SET penalty_amount = $1, penalty_amount_words = $2 WHERE id = $3`,
        [pAmt, pWords, id]
      );
    }

    // If returned / re-investigation requested
    if (decision === 'DISAGREE_REINVESTIGATE' || decision === 'DISAGREE_REVISE_FEEDBACK') {
      let nextStatus = 'with_imc';
      if (decision === 'DISAGREE_REINVESTIGATE') {
        const invCheck = await client.query(`SELECT id FROM investigators WHERE incident_id = $1`, [id]);
        nextStatus = invCheck.rows.length > 0 ? 'with_imc_review' : 'with_imc';
      }
      
      await client.query(
        `UPDATE incidents SET status = $1, management_decision = $2, management_notes = $3, updated_at = NOW() WHERE id = $4`,
        [nextStatus, decision, notes, id]
      );

      // Record Management return event
      const isReinvestigate = decision === 'DISAGREE_REINVESTIGATE';
      await recordEvent(client, {
        incidentId: id,
        eventType: isReinvestigate ? 'MGMT_RETURNED_FOR_REINVESTIGATION' : 'MGMT_RETURNED_FOR_REVISION',
        actor: req.user,
        statusBefore: incident.status,
        statusAfter: nextStatus,
        title: isReinvestigate ? 'Management Ordered Re-investigation' : 'Management Returned for Revised Review',
        summary: isReinvestigate
          ? `Findings inconclusive. Notes: "${notes || 'Re-investigation required'}"`
          : `Revision requested. Notes: "${notes || 'Revise quality findings/outcomes'}"`,
        payload: { decision, notes, next_status: nextStatus }
      });

      await client.query('COMMIT');
      await auditLog(req.user.id, 'MANAGEMENT_RETURNED', id, { decision, nextStatus }, req.ip);

      const imcMembers = await query("SELECT id, email FROM users WHERE role = 'imc' OR is_imc_member = TRUE OR is_imc_lead = TRUE");
      for (const member of imcMembers.rows) {
        await createNotification(member.id, id, 'Incident Reverted by Management', `Management returned incident for ${decision === 'DISAGREE_REINVESTIGATE' ? 're-investigation' : 'revised feedback'}.`, 'management_action');
      }

      if (req.io) {
        req.io.emit('incident_updated', { id, status: nextStatus });
      }

      return res.json({ success: true, message: 'Reverted to IMC.' });
    }

    // Update responsible / involved employees if provided by Management
    if (responsibleEmployees !== undefined && responsibleEmployees !== null) {
      if (typeof responsibleEmployees === 'string') {
        try { responsibleEmployees = JSON.parse(responsibleEmployees); } catch(e) {}
      }
      if (!Array.isArray(responsibleEmployees)) {
        responsibleEmployees = [];
      }
      
      await client.query(`DELETE FROM incident_responsible_employees WHERE incident_id = $1`, [id]);

      if (responsibleEmployees.length > 0) {
        const { numberToWords } = require('../utils/numberToWords');
        for (const emp of responsibleEmployees) {
          let deptId = emp.department_id;
          if (!deptId && emp.department) {
             const dRes = await client.query('SELECT id FROM departments WHERE LOWER(name) = LOWER($1)', [emp.department]);
             if (dRes.rows.length) deptId = dRes.rows[0].id;
          }
          const validUserId = await resolveEmployeeUserId(emp, client);
          if (validUserId) {
            const empOutcomes = Array.isArray(emp.outcomes)
              ? emp.outcomes.filter(Boolean)
              : (typeof emp.outcomes === 'string' && emp.outcomes.trim() ? emp.outcomes.split(',').map(s => s.trim()).filter(Boolean) : []);

            const empNeedsTraining = Boolean(
              emp.needs_training ||
              empOutcomes.some(o => {
                const ol = o.toLowerCase();
                return ol.includes('training') || ol.includes('counselling') || ol.includes('education');
              })
            );
            if (empNeedsTraining) requireTraining = true;

            const pAmt = emp.penalty_amount ? Number(emp.penalty_amount) : null;
            const pWords = pAmt ? numberToWords(pAmt) : null;

            await client.query(
              `INSERT INTO incident_responsible_employees (
                 incident_id, employee_id, department_id, needs_training, assigned_by,
                 outcomes, penalty_amount, penalty_amount_words, notes
               )
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
              [
                id,
                validUserId,
                deptId || null,
                empNeedsTraining,
                req.user.id,
                empOutcomes,
                pAmt,
                pWords,
                emp.notes || null
              ]
            );
          }
        }
        await client.query(`UPDATE incidents SET has_responsible_person = TRUE WHERE id = $1`, [id]);
      } else {
        await client.query(`UPDATE incidents SET has_responsible_person = FALSE WHERE id = $1`, [id]);
      }
    }

    // Determine workflow path based on outcome
    const effectiveOutcome = (decision === 'DISAGREE_MODIFY' && cleanProposedOutcome)
      ? cleanProposedOutcome
      : (incident.proposed_outcome || '');
    const outcomeLower = effectiveOutcome.toLowerCase();

    // Check if incident involves formal letters / disciplinary actions
    const respCountRes = await client.query(`SELECT COUNT(*) FROM incident_responsible_employees WHERE incident_id = $1`, [id]);
    const hasEmployeeRoster = parseInt(respCountRes.rows[0].count) > 0 || incident.has_responsible_person;

    const letterOutcomeCheck = await client.query(
      `SELECT COUNT(*) FROM incident_responsible_employees r
       WHERE r.incident_id = $1 AND EXISTS (
         SELECT 1 FROM unnest(r.outcomes) AS o
         WHERE LOWER(o) LIKE '%warning%' OR LOWER(o) LIKE '%advisory%' OR LOWER(o) LIKE '%penalty%' 
            OR LOWER(o) LIKE '%suggestion%' OR LOWER(o) LIKE '%deduction%' OR LOWER(o) LIKE '%suspension%'
       )`,
      [id]
    );
    const hasEmployeeLetterOutcome = parseInt(letterOutcomeCheck.rows[0]?.count || '0', 10) > 0;

    const isLetterOutcome = hasEmployeeLetterOutcome || [
      'warning', 'advisory', 'suggestion', 'penalty', 'salary deduction',
      'suspension', 'transfer', 'demotion', 'termination', 'disciplinary'
    ].some(k => outcomeLower.includes(k)) || (hasEmployeeRoster && !outcomeLower.includes('training') && !outcomeLower.includes('no action'));

    // Check if incident involves training / equipment mishandling
    const trainingRespCheck = await client.query(`SELECT COUNT(*) FROM incident_responsible_employees WHERE incident_id = $1 AND needs_training = TRUE`, [id]);
    const hasTrainingEmployee = parseInt(trainingRespCheck.rows[0].count) > 0;

    const isTrainingOutcome = requireTraining || hasTrainingEmployee || [
      'training', 'counselling', 'education', 'mishandling'
    ].some(k => outcomeLower.includes(k));

    if (isTrainingOutcome) {
      // Mark specific employees needing training, or all if none specifically designated
      const specificTrainingCount = await client.query(
        `SELECT COUNT(*) FROM incident_responsible_employees 
         WHERE incident_id = $1 AND EXISTS (
           SELECT 1 FROM unnest(outcomes) o 
           WHERE LOWER(o) LIKE '%training%' OR LOWER(o) LIKE '%counselling%' OR LOWER(o) LIKE '%education%'
         )`,
        [id]
      );
      if (parseInt(specificTrainingCount.rows[0]?.count || '0', 10) > 0) {
        await client.query(
          `UPDATE incident_responsible_employees 
           SET needs_training = TRUE 
           WHERE incident_id = $1 AND EXISTS (
             SELECT 1 FROM unnest(outcomes) o 
             WHERE LOWER(o) LIKE '%training%' OR LOWER(o) LIKE '%counselling%' OR LOWER(o) LIKE '%education%'
           )`,
          [id]
        );
      } else {
        await client.query(
          `UPDATE incident_responsible_employees SET needs_training = TRUE WHERE incident_id = $1`,
          [id]
        );
      }
    }

    let nextStatus = 'closed';
    let returnMessage = 'Management agreed with IMC. Incident has been officially CLOSED.';

    if (isLetterOutcome) {
      // PATH B (or DUAL TRACK B+C): Forward to IMC for formal letter generation
      nextStatus = 'pending_letter_generation';
      returnMessage = isTrainingOutcome
        ? 'Decision submitted. Case forwarded to IMC for formal letter drafting and trainer assignment.'
        : 'Decision submitted. Case forwarded to IMC for formal letter generation.';
      
      await client.query(
        `UPDATE incidents
         SET status = $1, management_decision = $2, management_notes = $3,
             needs_training = $4, updated_at = NOW()
         WHERE id = $5`,
        [nextStatus, decision, notes, isTrainingOutcome ? true : false, id]
      );

      const imcMembers = await query("SELECT id, email FROM users WHERE role = 'imc' OR is_imc_member = TRUE OR is_imc_lead = TRUE");
      for (const member of imcMembers.rows) {
        await createNotification(
          member.id,
          id,
          isTrainingOutcome ? 'Draft Letter(s) & Assign Trainer Required' : 'Draft Formal Letter(s) Required',
          isTrainingOutcome
            ? `Management approved the proposed outcome for incident ${incident.reference_id}. Please draft the employee letter(s) and assign a dedicated trainer.`
            : `Management approved the proposed outcome for incident ${incident.reference_id}. Please draft the letter(s) for the involved employee(s).`,
          'management_action'
        );
      }

    } else if (isTrainingOutcome) {
      // PATH C: Forward to IMC for trainer assignment (No letter drafting to mgmt)
      nextStatus = 'pending_trainer_assignment';
      returnMessage = 'Decision submitted. Case forwarded to IMC for trainer assignment.';

      await client.query(
        `UPDATE incidents
         SET status = $1, management_decision = $2, management_notes = $3,
             needs_training = TRUE, updated_at = NOW()
         WHERE id = $4`,
        [nextStatus, decision, notes, id]
      );

      const imcMembers = await query("SELECT id, email FROM users WHERE role = 'imc' OR is_imc_member = TRUE OR is_imc_lead = TRUE");
      for (const member of imcMembers.rows) {
        await createNotification(
          member.id,
          id,
          'Assign Trainer Required',
          `Management approved the training mandate for incident ${incident.reference_id}. Please assign a dedicated trainer.`,
          'management_action'
        );
      }

    } else {
      // PATH A: Outcome is "No Action" or general protocol -> DIRECT MANAGEMENT CLOSURE
      nextStatus = 'closed';
      returnMessage = 'Management decision recorded. Incident officially CLOSED.';

      await client.query(
        `UPDATE incidents
         SET status = 'closed', management_decision = $1, management_notes = $2,
             resolved_at = NOW(), updated_at = NOW()
         WHERE id = $3`,
        [decision, notes, id]
      );

      // Notify reporter & committee
      await createNotification(
        incident.reporter_id,
        id,
        'Incident Concluded & Closed',
        `Incident ${incident.reference_id} has been reviewed by Management and is officially closed.`,
        'incident_closed'
      );

      const imcMembers = await query("SELECT id, email FROM users WHERE role = 'imc' OR is_imc_member = TRUE OR is_imc_lead = TRUE");
      for (const member of imcMembers.rows) {
        await createNotification(
          member.id,
          id,
          'Incident Closed by Management',
          `Incident ${incident.reference_id} has been concluded and officially closed by Management.`,
          'incident_closed'
        );
      }
    }

    // Record Management decision event (agreed or modified)
    if (decision === 'DISAGREE_MODIFY') {
      await recordEvent(client, {
        incidentId: id,
        eventType: 'MGMT_DECISION_MODIFIED',
        actor: req.user,
        statusBefore: incident.status,
        statusAfter: nextStatus,
        title: 'Management Directive: Outcome Modified',
        summary: `IMC Proposed: [ ${incident.imc_proposed_outcome || 'No Action'} ] ──► Management Directed: [ ${cleanProposedOutcome || incident.proposed_outcome} ]`,
        payload: {
          decision: 'DISAGREE_MODIFY',
          imc_proposed_outcome: incident.imc_proposed_outcome || 'No Action',
          final_mandated_outcome: cleanProposedOutcome || incident.proposed_outcome,
          penalty_amount: penaltyAmount || incident.penalty_amount,
          responsible_employees: responsibleEmployees,
          notes,
          next_status: nextStatus
        }
      });
    } else {
      await recordEvent(client, {
        incidentId: id,
        eventType: 'MGMT_DECISION_AGREED',
        actor: req.user,
        statusBefore: incident.status,
        statusAfter: nextStatus,
        title: 'Executive Management Endorsement',
        summary: `Management concurred with IMC findings and recommendation (${cleanProposedOutcome || incident.proposed_outcome})`,
        payload: {
          decision: 'AGREE',
          endorsed_outcome: cleanProposedOutcome || incident.proposed_outcome,
          responsible_employees: responsibleEmployees,
          notes,
          next_status: nextStatus
        }
      });
    }

    await client.query('COMMIT');
    await auditLog(req.user.id, 'MANAGEMENT_DECISION', id, { decision, nextStatus }, req.ip);

    if (req.io) {
      req.io.emit('incident_updated', { id, status: nextStatus });
    }

    res.json({ success: true, message: returnMessage, nextStatus });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('submitManagementAction error:', error);
    res.status(500).json({ error: error.message || 'Failed to submit management action' });
  } finally {
    client.release();
  }
};

// =============================================
// GENERATE IMC REPORT (Convenor Only)
// =============================================
exports.generateImcReport = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { id } = req.params;

    if (!req.user.is_imc_lead && !req.user.is_system_admin) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only the IMC Convenor can generate the official IMC report.' });
    }
    
    const incidentResult = await client.query('SELECT * FROM incidents WHERE id = $1', [id]);
    if (!incidentResult.rows.length) return res.status(404).json({ error: 'Not found' });
    const incident = incidentResult.rows[0];

    // Mark the final report as latest
    await client.query(`UPDATE final_reports SET is_latest = TRUE, generated_at = NOW() WHERE incident_id = $1`, [id]);

    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await client.query(
          `INSERT INTO attachments (incident_id, uploader_id, stage, original_filename, stored_filename, file_size, mime_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [id, req.user.id, 'imc_report', file.originalname, (file.filename || file.key), file.size, file.mimetype]
        );
      }
    }

    // Check if training is required
    const trainingCheck = await client.query(`SELECT COUNT(*) FROM incident_responsible_employees WHERE incident_id = $1 AND needs_training = TRUE`, [id]);
    const requiresTraining = parseInt(trainingCheck.rows[0].count) > 0;

    const newStatus = requiresTraining ? 'pending_training' : 'resolved';
    const resolvedAt = newStatus === 'resolved' ? 'NOW()' : 'NULL';

    await client.query(
      `UPDATE incidents SET status = $1, resolved_at = ${resolvedAt === 'NULL' ? 'NULL' : 'NOW()'}, updated_at = NOW() WHERE id = $2`,
      [newStatus, id]
    );

    // Record immutable FINAL_REPORT_GENERATED event
    const finalEvt = await recordEvent(client, {
      incidentId: id,
      eventType: 'FINAL_REPORT_GENERATED',
      actor: req.user,
      statusBefore: incident.status,
      statusAfter: newStatus,
      title: 'Official Final Report Generated',
      summary: `Assessed Fault Type: ${incident.fault_type || 'Hospital / Process'} · CAPA documented`,
      payload: {
        fault_type: incident.fault_type,
        corrective_actions: incident.corrective_actions
      }
    });

    if (req.files && req.files.length > 0) {
      await client.query(
        `UPDATE attachments SET event_id = $1 WHERE incident_id = $2 AND stage = 'imc_report' AND event_id IS NULL`,
        [finalEvt.id, id]
      );
    }

    await client.query('COMMIT');

    const reporterRes = await query('SELECT email, full_name FROM users WHERE id = $1', [incident.reporter_id]);
    const reporter = reporterRes.rows[0];

    if (newStatus === 'pending_training') {
      await createNotification(incident.reporter_id, id, 'Mandatory Training Required', `Management has mandated training for incident ${incident.reference_id}.`, 'training_required');
      if (reporter?.email) {
        sendEmail(reporter.email, templates.trainingRequired(incident, reporter)).catch(() => {});
      }
      
      const responsibleEmployees = await query(`SELECT * FROM incident_responsible_employees WHERE incident_id = $1 AND needs_training = TRUE`, [id]);
      for (const emp of responsibleEmployees.rows) {
        await createNotification(emp.employee_id, id, 'Training Mandated', `You have been marked as needing training for incident ${incident.reference_id}.`, 'training_mandated');
        const hodRes = await query(
          `SELECT u.id, u.email FROM users u JOIN departments d ON COALESCE(d.assigned_user_id, d.hod_user_id) = u.id WHERE d.id = $1`, [emp.department_id]
        );
        for (const hod of hodRes.rows) {
          await createNotification(hod.id, id, 'Employee Training Required', `Your department employee has been marked for training in incident ${incident.reference_id}. Please instruct them.`, 'hod_training_alert');
        }
      }
    } else {
      await createNotification(incident.reporter_id, id, 'Incident Resolved', `Your incident ${incident.reference_id} has been resolved. View the final report.`, 'incident_resolved');
      if (reporter?.email) {
        sendEmail(reporter.email, templates.incidentResolved(incident, reporter)).catch(() => {});
      }
    }

    await auditLog(req.user.id, 'IMC_REPORT_GENERATED', id, {}, req.ip);

    if (req.io) {
      req.io.emit('incident_updated', { id, status: newStatus });
    }

    res.json({ success: true, message: 'IMC Report generated successfully.' });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to generate IMC report' });
  } finally {
    client.release();
  }
};

// =============================================
// CLOSE INCIDENT (Convenor Only - Post-Training)
// =============================================
exports.closeIncident = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.user.is_imc_lead && !req.user.is_system_admin) {
      return res.status(403).json({ error: 'Only the IMC Convenor can close the incident.' });
    }
    
    await query(
      `UPDATE incidents SET status = 'closed', resolved_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [id]
    );

    await recordEvent(query, {
      incidentId: id,
      eventType: 'INCIDENT_CLOSED',
      actor: req.user,
      statusBefore: 'resolved',
      statusAfter: 'closed',
      title: 'Incident Officially Closed',
      summary: 'All findings, directives, letters, and training verification fulfilled. Case closed.',
      payload: {}
    });

    const inc = await query(`SELECT reporter_id, reference_id FROM incidents WHERE id = $1`, [id]);
    const incident = inc.rows[0];

    await createNotification(incident.reporter_id, id, 'Incident Closed', `Incident ${incident.reference_id} has been officially closed.`, 'incident_closed');
    
    await auditLog(req.user.id, 'INCIDENT_CLOSED', id, {}, req.ip);

    if (req.io) {
      req.io.emit('incident_updated', { id, status: 'closed' });
    }

    res.json({ success: true, message: 'Incident officially closed.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to close incident' });
  }
};

// =============================================
// HELPER: RESOLVE & VALIDATE INVESTIGATORS
// =============================================
async function resolveAndValidateInvestigators(investigatorIds, queryFn = query) {
  let invUsers = [];
  for (const rawId of investigatorIds) {
    if (!rawId) continue;
    const invId = String(rawId).trim();
    // 1. Check users table
    let uRes = await queryFn(
      'SELECT id, full_name, email, role, is_imc_member, is_imc_lead FROM users WHERE id::text = $1 OR employee_id = $1',
      [invId]
    );
    if (uRes.rows.length) {
      invUsers.push(uRes.rows[0]);
      continue;
    }

    // 2. If not in users, check master_employees (by id or employee_id)
    const mRes = await queryFn(
      'SELECT * FROM master_employees WHERE id::text = $1 OR employee_id = $1',
      [invId]
    );
    if (mRes.rows.length) {
      const mEmp = mRes.rows[0];
      const newUserRes = await queryFn(
        `INSERT INTO users (employee_id, full_name, email, department, designation, role, is_active, password_hash)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE, NULL)
         ON CONFLICT (employee_id) DO UPDATE SET
           full_name = EXCLUDED.full_name,
           department = EXCLUDED.department,
           designation = EXCLUDED.designation,
           is_active = TRUE
         RETURNING id, full_name, email, role, is_imc_member, is_imc_lead`,
        [
          mEmp.employee_id,
          mEmp.name,
          mEmp.email || `${mEmp.employee_id}@jphrc.org`,
          mEmp.department,
          mEmp.designation,
          mEmp.role || 'employee'
        ]
      );
      if (newUserRes.rows.length) {
        invUsers.push(newUserRes.rows[0]);
        continue;
      }
    }

    throw new Error(`One or more selected investigators (${invId}) were not found in hospital user records.`);
  }

  // Deduplicate investigators
  const uniqueInvUsers = [];
  const seenInvIds = new Set();
  for (const inv of invUsers) {
    if (!seenInvIds.has(inv.id)) {
      seenInvIds.add(inv.id);
      uniqueInvUsers.push(inv);
    }
  }

  // Must include at least one IMC member as primary investigator
  const hasImcMember = uniqueInvUsers.some(u => u.role === 'imc' || u.is_imc_member || u.is_imc_lead);
  if (!hasImcMember) {
    throw new Error('Primary investigators must include at least one IMC member.');
  }

  return uniqueInvUsers;
}

// =============================================
// SUBMIT INVESTIGATION REPORT (Centralized Joint Report - Primary Investigator on behalf of Team)
// =============================================
exports.submitInvestigatorReport = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const { reportText } = req.body;

    if (!reportText || !reportText.trim()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Investigation findings text is required.' });
    }

    // Verify user authorization: must be an assigned investigator for this incident or an IMC member
    const assignedCheck = await client.query(
      `SELECT inv.*, u.role, u.is_imc_member, u.is_imc_lead 
       FROM investigators inv
       JOIN users u ON u.id = inv.investigator_id
       WHERE inv.incident_id = $1 AND inv.investigator_id = $2`,
      [id, req.user.id]
    );

    const isUserImc = Boolean(
      req.user.role === 'imc' ||
      req.user.is_imc_member ||
      req.user.is_imc_lead ||
      req.user.is_system_admin
    );

    if (!assignedCheck.rows.length && !isUserImc) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only assigned investigators or IMC members can submit an investigation report.' });
    }

    const assignedInv = assignedCheck.rows[0];
    const isPrimary = Boolean(
      isUserImc ||
      (assignedInv && (
        assignedInv.role === 'imc' ||
        assignedInv.is_imc_member ||
        assignedInv.is_imc_lead
      ))
    );

    if (!isPrimary) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        error: 'Only primary investigators (IMC members) can submit the centralized investigation report on behalf of the panel.'
      });
    }

    // If an IMC member is submitting on behalf of the panel but was not previously in the investigators table, record them on the panel
    if (!assignedCheck.rows.length && isUserImc) {
      await client.query(
        `INSERT INTO investigators (incident_id, investigator_id, assigned_by, status, report_text, completed_at)
         VALUES ($1, $2, $2, 'completed', $3, NOW())`,
        [id, req.user.id, reportText.trim()]
      );
    }

    // Verify incident is awaiting report
    const incStatusCheck = await client.query('SELECT status FROM incidents WHERE id = $1', [id]);
    if (incStatusCheck.rows.length && incStatusCheck.rows[0].status !== 'with_investigator') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Incident is not currently awaiting investigation report submission.' });
    }

    // Update ALL assigned investigators for this incident to 'completed'
    await client.query(
      `UPDATE investigators 
       SET report_text = $1, status = 'completed', completed_at = NOW() 
       WHERE incident_id = $2`,
      [reportText.trim(), id]
    );

    // Record findings into feedbacks
    await client.query(
      `INSERT INTO feedbacks (incident_id, author_id, role, feedback_text) VALUES ($1, $2, 'investigator', $3)`,
      [id, req.user.id, reportText.trim()]
    );

    // Save attached files (photos, evidence, supporting docs)
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await client.query(
          `INSERT INTO attachments (incident_id, uploader_id, stage, original_filename, stored_filename, file_size, mime_type) 
           VALUES ($1, $2, 'investigator_report', $3, $4, $5, $6)`,
          [id, req.user.id, file.originalname, (file.filename || file.key), file.size, file.mimetype]
        );
      }
    }

    // Incident status advances to with_imc_review for Convenor evaluation
    await client.query(`UPDATE incidents SET status = 'with_imc_review', updated_at = NOW() WHERE id = $1`, [id]);

    // Record immutable INVESTIGATION_REPORT_SUBMITTED event
    const invReportEvt = await recordEvent(client, {
      incidentId: id,
      eventType: 'INVESTIGATION_REPORT_SUBMITTED',
      actor: req.user,
      statusBefore: 'with_investigator',
      statusAfter: 'with_imc_review',
      title: 'Joint Investigation Report Submitted',
      summary: `Submitted by ${req.user.full_name} on behalf of the investigation panel`,
      payload: {
        report_text: reportText.trim(),
        submitted_by: req.user.full_name,
        attachments_count: req.files ? req.files.length : 0
      }
    });

    if (req.files && req.files.length > 0) {
      await client.query(
        `UPDATE attachments SET event_id = $1 WHERE incident_id = $2 AND stage = 'investigator_report' AND event_id IS NULL`,
        [invReportEvt.id, id]
      );
    }

    await client.query('COMMIT');

    const incRes = await query('SELECT reference_id FROM incidents WHERE id = $1', [id]);
    const refId = incRes.rows[0]?.reference_id || id;

    // Notify IMC Convenor
    const convenorRes = await query(
      `SELECT id, email, full_name FROM users WHERE is_imc_lead = TRUE OR (role = 'imc' AND is_imc_lead = TRUE) OR is_system_admin = TRUE`
    );
    for (const member of convenorRes.rows) {
      await createNotification(
        member.id,
        id,
        'Joint Investigation Report Submitted',
        `Joint investigation report for incident ${refId} has been submitted by ${req.user.full_name} on behalf of the panel. Ready for your review and satisfaction assessment.`,
        'investigator_report_submitted'
      );
    }

    // Notify other assigned panel members
    const otherInvs = await query(
      `SELECT u.id, u.email, u.full_name FROM investigators inv
       JOIN users u ON u.id = inv.investigator_id
       WHERE inv.incident_id = $1 AND inv.investigator_id != $2`,
      [id, req.user.id]
    );
    for (const inv of otherInvs.rows) {
      await createNotification(
        inv.id,
        id,
        'Investigation Report Submitted',
        `The joint investigation report for incident ${refId} has been submitted by ${req.user.full_name} on behalf of the panel.`,
        'investigator_report_submitted'
      );
    }

    if (req.io) {
      req.io.emit('incident_updated', { id, status: 'with_imc_review' });
    }

    res.json({
      success: true,
      allCompleted: true,
      message: 'Joint investigation report submitted successfully on behalf of the panel. Incident is now ready for IMC Convenor review.'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[POST /incidents/:id/investigator-report] error:', error);
    res.status(500).json({ error: error.message || 'Failed to submit investigation report' });
  } finally {
    client.release();
  }
};

// =============================================
// REJECT / REINVESTIGATE REPORT (Convenor Only)
// =============================================
exports.rejectInvestigatorReport = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    let { feedbackText, investigatorIds, action } = req.body;
    
    if (!req.user.is_imc_lead && !req.user.is_system_admin) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only the IMC Convenor can request reinvestigation.' });
    }
    
    if (!feedbackText || !feedbackText.trim()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Please provide remarks explaining why reinvestigation is required.' });
    }

    // Record Convenor's feedback into feedbacks table with explicit stage
    await client.query(
      `INSERT INTO feedbacks (incident_id, author_id, role, feedback_text, stage) VALUES ($1, $2, 'imc', $3, 'investigation_returned')`,
      [id, req.user.id, feedbackText.trim()]
    );
    
    let assignedInvs = [];

    // If action is 'reassign' and new investigator IDs are provided, reassign them non-destructively
    if (action === 'reassign' && Array.isArray(investigatorIds) && investigatorIds.length > 0) {
      try {
        assignedInvs = await resolveAndValidateInvestigators(investigatorIds, (sql, p) => client.query(sql, p));
      } catch (validationErr) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: validationErr.message });
      }

      // Deactivate previous investigator panel (non-destructive!)
      await client.query('UPDATE investigators SET is_active = FALSE WHERE incident_id = $1', [id]);

      const nextRoundRes = await client.query('SELECT COALESCE(MAX(round_no), 0) + 1 as nr FROM investigators WHERE incident_id = $1', [id]);
      const nextRoundNo = parseInt(nextRoundRes.rows[0].nr, 10) || 2;

      for (const inv of assignedInvs) {
        await client.query(
          `INSERT INTO investigators (incident_id, investigator_id, assigned_by, status, round_no, is_active) 
           VALUES ($1, $2, $3, 'assigned', $4, TRUE)`,
          [id, inv.id, req.user.id, nextRoundNo]
        );
      }
    } else {
      // Re-open existing investigators for same team
      await client.query(`UPDATE investigators SET status = 'assigned', completed_at = NULL WHERE incident_id = $1 AND is_active = TRUE`, [id]);
      const prevInvs = await client.query(
        `SELECT DISTINCT u.id, u.email, u.full_name 
         FROM investigators inv
         JOIN users u ON u.id = inv.investigator_id
         WHERE inv.incident_id = $1 AND inv.is_active = TRUE`,
        [id]
      );
      assignedInvs = prevInvs.rows;
    }
    
    await client.query(`UPDATE incidents SET status = 'with_investigator', updated_at = NOW() WHERE id = $1`, [id]);

    // Record immutable INVESTIGATION_RETURNED event
    await recordEvent(client, {
      incidentId: id,
      eventType: 'INVESTIGATION_RETURNED',
      actor: req.user,
      statusBefore: 'with_imc_review',
      statusAfter: 'with_investigator',
      title: action === 'reassign' ? 'Investigation Returned & Panel Reassigned' : 'Investigation Returned for Re-investigation',
      summary: action === 'reassign'
        ? `IMC Convenor requested re-investigation and reassigned panel. Remarks: "${feedbackText.trim()}"`
        : `IMC Convenor requested re-investigation with same team. Remarks: "${feedbackText.trim()}"`,
      payload: {
        action,
        feedback_text: feedbackText.trim(),
        reassigned: action === 'reassign',
        new_panel: assignedInvs.map(inv => ({ id: inv.id, full_name: inv.full_name }))
      }
    });
    
    await client.query('COMMIT');

    const incRes = await query('SELECT reference_id FROM incidents WHERE id = $1', [id]);
    const refId = incRes.rows[0]?.reference_id || id;

    // Notify assigned investigators
    for (const inv of assignedInvs) {
      await createNotification(
        inv.id,
        id,
        'Reinvestigation Mandated',
        `The IMC Convenor has requested reinvestigation for incident ${refId}. Remarks: "${feedbackText.trim()}"`,
        'investigator_assigned'
      );
      if (inv.email) {
        sendEmail(inv.email, {
          subject: `Reinvestigation Mandated for Incident ${refId}`,
          html: `<p>Dear ${inv.full_name},</p><p>The IMC Convenor has requested further investigation for incident <b>${refId}</b>.</p><p><b>Remarks:</b> ${feedbackText.trim()}</p>`
        }).catch(() => {});
      }
    }

    if (req.io) {
      req.io.emit('incident_updated', { id, status: 'with_investigator' });
    }

    res.json({ success: true, message: 'Incident successfully scheduled for reinvestigation.' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[POST /incidents/:id/reject-investigator-report] error:', error);
    res.status(500).json({ error: error.message || 'Failed to request reinvestigation.' });
  } finally {
    client.release();
  }
};

// =============================================
// REOPEN INCIDENT
// =============================================
exports.reopenIncident = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: 'Reason is required to re-open an incident.' });
    await query(
      `UPDATE incidents SET status = 'with_imc', updated_at = NOW() WHERE id = $1 AND status = 'resolved'`,
      [id]
    );

    await recordEvent(query, {
      incidentId: id,
      eventType: 'INCIDENT_REOPENED',
      actor: req.user,
      statusBefore: 'resolved',
      statusAfter: 'with_imc',
      title: 'Incident Reopened by Staff',
      summary: `Incident reopened. Reason: "${reason}"`,
      payload: { reason }
    });

    await auditLog(req.user.id, 'INCIDENT_REOPENED', id, { reason }, req.ip);

    if (req.io) {
      req.io.emit('incident_updated', { id, status: 'with_imc' });
    }

    res.json({ success: true });
  } catch (e) {
    console.error('[POST /incidents/:id/reopen] error:', e);
    res.status(500).json({ error: 'Failed to reopen' });
  }
};

// =============================================
// ASSIGN INVESTIGATOR (Convenor Only - After HOD Feedbacks)
// =============================================
exports.assignInvestigator = async (req, res) => {
  try {
    const { id } = req.params;
    const { investigatorIds } = req.body;

    if (!req.user.is_imc_lead && !req.user.is_system_admin) {
      return res.status(403).json({ error: 'Only the IMC Convenor can assign investigators.' });
    }

    if (!Array.isArray(investigatorIds) || investigatorIds.length === 0) {
      return res.status(400).json({ error: 'Please select at least one investigator.' });
    }

    // Rule: Investigation can only be initiated after feedback from ALL concerned HODs!
    const pendingDepts = await query(`
      SELECT d.name
      FROM incident_departments id_dept
      JOIN departments d ON d.id = id_dept.department_id
      WHERE id_dept.incident_id = $1
        AND NOT EXISTS (
          SELECT 1 FROM feedbacks f
          LEFT JOIN users u ON u.id = f.author_id
          WHERE f.incident_id = $1 
            AND f.role = 'hod'
            AND (
              f.department_id = d.id 
              OR f.author_id = COALESCE(d.assigned_user_id, d.hod_user_id)
            )
        )
    `, [id]);

    if (pendingDepts.rows.length > 0) {
      const names = pendingDepts.rows.map(d => d.name).join(', ');
      return res.status(400).json({
        error: `Investigation can only be decided after receiving feedback from all concerned HODs: ${names}.`
      });
    }

    // Resolve investigators using the shared helper
    let uniqueInvUsers;
    try {
      uniqueInvUsers = await resolveAndValidateInvestigators(investigatorIds);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    for (const inv of uniqueInvUsers) {
      const existing = await query(
        'SELECT id FROM investigators WHERE incident_id = $1 AND investigator_id = $2',
        [id, inv.id]
      );
      if (existing.rows.length === 0) {
        await query(
          `INSERT INTO investigators (incident_id, investigator_id, assigned_by) 
           VALUES ($1, $2, $3)`,
          [id, inv.id, req.user.id]
        );
      }
    }

    await query(`UPDATE incidents SET status = 'with_investigator', updated_at = NOW() WHERE id = $1`, [id]);

    await recordEvent(query, {
      incidentId: id,
      eventType: 'INVESTIGATION_PANEL_ASSIGNED',
      actor: req.user,
      statusBefore: 'with_imc',
      statusAfter: 'with_investigator',
      title: 'Investigation Panel Appointed',
      summary: `IMC Convenor appointed ${uniqueInvUsers.length} investigator(s) as a collective panel`,
      payload: {
        panel: uniqueInvUsers.map(u => ({
          id: u.id,
          full_name: u.full_name,
          employee_id: u.employee_id,
          designation: u.designation,
          department: u.department,
          is_primary: Boolean(u.role === 'imc' || u.is_imc_member || u.is_imc_lead)
        }))
      }
    });

    const incResult = await query('SELECT reference_id FROM incidents WHERE id = $1', [id]);
    const refId = incResult.rows[0]?.reference_id || 'Unknown';

    for (const inv of uniqueInvUsers) {
      await createNotification(
        inv.id,
        id,
        'Assigned as Investigator',
        `You have been assigned as an investigator for incident ${refId}.`,
        'investigator_assigned'
      );
      if (inv.email) {
        sendEmail(inv.email, {
          subject: `Assigned as Investigator for Incident ${refId}`,
          html: `<p>Dear ${inv.full_name},</p><p>You have been assigned by the IMC Convenor to investigate incident <b>${refId}</b>.</p>`
        }).catch(() => {});
      }
    }

    res.json({ success: true, message: 'Investigators successfully assigned.' });
  } catch (e) {
    console.error('[POST /incidents/:id/assign-investigator] error:', e);
    res.status(500).json({ error: e.message || 'Failed to assign investigator' });
  }
};

// =============================================
// INVOLVE MORE DEPARTMENTS (Convenor Only)
// =============================================
exports.involveDepartments = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const { departmentIds, departmentNames } = req.body;

    if (!req.user.is_imc_lead && !req.user.is_system_admin) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only the IMC Convenor can involve additional departments.' });
    }

    const incResult = await client.query('SELECT * FROM incidents WHERE id = $1', [id]);
    if (!incResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Incident not found' });
    }
    const incident = incResult.rows[0];

    // Find departments by IDs or Names
    let targetDeptRows = [];
    if (Array.isArray(departmentIds) && departmentIds.length > 0) {
      const dRes = await client.query('SELECT id, name FROM departments WHERE id = ANY($1)', [departmentIds]);
      targetDeptRows = dRes.rows;
    } else if (Array.isArray(departmentNames) && departmentNames.length > 0) {
      const dRes = await client.query('SELECT id, name FROM departments WHERE name = ANY($1)', [departmentNames]);
      targetDeptRows = dRes.rows;
    }

    if (!targetDeptRows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Please provide at least one valid department to involve.' });
    }

    const addedDepts = [];
    for (const d of targetDeptRows) {
      const insertRes = await client.query(
        `INSERT INTO incident_departments (incident_id, department_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING
         RETURNING department_id`,
        [id, d.id]
      );
      if (insertRes.rows.length > 0) {
        addedDepts.push(d);
      }
    }

    if (!addedDepts.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'All selected department(s) are already linked to this incident.' });
    }

    // Transition status to with_hod (or with_hod_and_imc) so the new HOD feedback is submitted
    const newStatus = incident.severity === 'Grave' ? 'with_hod_and_imc' : 'with_hod';
    await client.query(
      `UPDATE incidents SET status = $1, updated_at = NOW() WHERE id = $2`,
      [newStatus, id]
    );

    await client.query('COMMIT');

    // Notify new HODs
    const newlyAddedIds = addedDepts.map(d => d.id);
    const newLeadersRes = await query(
      `SELECT DISTINCT u.id, u.email, u.full_name FROM users u
       JOIN departments d ON (COALESCE(d.assigned_user_id, d.hod_user_id) = u.id)
       WHERE d.id = ANY($1)`,
      [newlyAddedIds]
    );

    for (const leader of newLeadersRes.rows) {
      await createNotification(
        leader.id,
        id,
        'Department Invalidation / Review Required',
        `Incident ${incident.reference_id} has been linked to your department by IMC. Your HOD review and feedback are required.`,
        'incident_to_hod'
      );
      if (leader?.email) {
        sendEmail(leader.email, templates.newIncidentHod(incident, leader)).catch(() => {});
      }
    }

    await recordEvent(client, {
      incidentId: id,
      eventType: 'DEPARTMENTS_INVOLVED',
      actor: req.user,
      title: 'Additional Department(s) Involment',
      summary: `Linked: ${addedDepts.map(d => d.name).join(', ')}`,
      payload: {
        added_departments: addedDepts.map(d => d.name),
        new_status: newStatus
      }
    });

    await auditLog(req.user.id, 'DEPARTMENTS_INVOLVED', id, {
      addedDepartments: addedDepts.map(d => d.name),
      newStatus
    }, req.ip);

    res.json({
      success: true,
      message: `Successfully linked ${addedDepts.map(d => d.name).join(', ')}. Incident returned to HOD review for their feedback.`,
      addedDepartments: addedDepts
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[POST /incidents/:id/involve-departments] error:', error);
    res.status(500).json({ error: error.message || 'Failed to involve departments.' });
  } finally {
    client.release();
  }
};


// =============================================
// GET IMC QUEUE
// =============================================
exports.getImcQueue = async (req, res) => {
  try {
    const result = await query(
      `SELECT i.*,
        u.full_name as reporter_name, u.employee_id as reporter_employee_id,
        ml.name as main_location_name,
        ARRAY_AGG(DISTINCT d.name) as departments,
        ic.claimed_by as claimed_by_id,
        cu.full_name as claimed_by_name,
        ic.expires_at as claim_expires_at,
        EXISTS(SELECT 1 FROM feedbacks f WHERE f.incident_id = i.id AND f.role = 'hod') as has_hod_feedback,
        EXISTS(SELECT 1 FROM feedbacks f WHERE f.incident_id = i.id AND f.role = 'imc') as has_imc_feedback,
        EXISTS(SELECT 1 FROM feedbacks f WHERE f.incident_id = i.id AND f.role = 'head_management') as has_management_feedback
       FROM incidents i
       LEFT JOIN users u ON u.id = i.reporter_id
       LEFT JOIN main_locations ml ON ml.id = i.main_location_id
       LEFT JOIN incident_departments id ON id.incident_id = i.id
       LEFT JOIN departments d ON d.id = id.department_id
       LEFT JOIN imc_claims ic ON ic.incident_id = i.id AND ic.is_active = TRUE AND ic.expires_at > NOW()
       LEFT JOIN users cu ON cu.id = ic.claimed_by
       WHERE i.status IN ('with_imc', 'redirect_requested', 'with_hod_and_imc', 'pending_training')
          OR (i.status = 'resolved' AND i.has_responsible_person = TRUE AND i.training_completed = FALSE)
       GROUP BY i.id, u.full_name, u.employee_id, ml.name, ic.claimed_by, cu.full_name, ic.expires_at
       ORDER BY i.created_at ASC`
    );
    res.json(result.rows);
  } catch (e) {
    console.error('[GET /imc/queue] error:', e);
    res.status(500).json({ error: 'Failed to retrieve IMC queue' });
  }
};


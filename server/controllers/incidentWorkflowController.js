const { query, getClient } = require('../config/database');
const { auditLog } = require('../middleware/auth');
const { createNotification } = require('../utils/notifications');
const { sendEmail, templates } = require('../utils/emailService');
const bcrypt = require('bcryptjs');

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

    await client.query(
      `INSERT INTO feedbacks (incident_id, author_id, role, feedback_text)
       VALUES ($1, $2, 'imc', $3)`,
      [id, req.user.id, feedbackText]
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

    if (severity || proposedOutcome) {
      await client.query(
        `UPDATE incidents SET severity = COALESCE($1, severity), proposed_outcome = COALESCE($2, proposed_outcome), updated_at = NOW() WHERE id = $3`,
        [severity || null, proposedOutcome || null, id]
      );
    }

    if (forwardToMd) {
      await client.query(
        `UPDATE incidents SET status = 'with_head_management', updated_at = NOW() WHERE id = $1`,
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

    await client.query('COMMIT');
    await auditLog(req.user.id, 'IMC_FEEDBACK_SUBMITTED', id, { forwardToMd }, req.ip);

    res.json({ success: true });

  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to submit IMC feedback' });
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
    let { decision, notes, faultType, correctiveActions, requireTraining, responsibleEmployees, proposedOutcome } = req.body;
    
    if (!['AGREE', 'DISAGREE_MODIFY', 'DISAGREE_REINVESTIGATE', 'DISAGREE_REVISE_FEEDBACK'].includes(decision)) {
      return res.status(400).json({ error: 'Invalid decision type' });
    }

    const incidentResult = await client.query('SELECT * FROM incidents WHERE id = $1', [id]);
    if (!incidentResult.rows.length) return res.status(404).json({ error: 'Not found' });
    const incident = incidentResult.rows[0];

    if (notes) {
      await client.query(
        `INSERT INTO feedbacks (incident_id, author_id, role, feedback_text)
         VALUES ($1, $2, 'head_management', $3)`,
        [id, req.user.id, notes]
      );
    }

    if (proposedOutcome) {
      await client.query(`UPDATE incidents SET proposed_outcome = $1 WHERE id = $2`, [proposedOutcome, id]);
    }

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
      await client.query('COMMIT');
      await auditLog(req.user.id, 'MANAGEMENT_RETURNED', id, { decision, nextStatus }, req.ip);
      return res.json({ success: true, message: 'Reverted to IMC.' });
    }

    if (responsibleEmployees !== undefined) {
      if (typeof responsibleEmployees === 'string') {
        try { responsibleEmployees = JSON.parse(responsibleEmployees); } catch(e) {}
      }
      if (!Array.isArray(responsibleEmployees)) {
        responsibleEmployees = [];
      }
      
      requireTraining = requireTraining === 'true' || requireTraining === true || responsibleEmployees.some(e => e.needs_training);

      if (responsibleEmployees.length > 0) {
        // Clear existing responsible employees first to handle modification
        await client.query(`DELETE FROM incident_responsible_employees WHERE incident_id = $1`, [id]);
        
        for (const emp of responsibleEmployees) {
          let deptId = emp.department_id;
          if (!deptId && emp.department) {
             const dRes = await client.query('SELECT id FROM departments WHERE LOWER(name) = LOWER($1)', [emp.department]);
             if (dRes.rows.length) deptId = dRes.rows[0].id;
          }
          await client.query(
            `INSERT INTO incident_responsible_employees (incident_id, employee_id, department_id, needs_training, assigned_by)
             VALUES ($1, $2, $3, $4, $5)`,
            [id, emp.id, deptId || null, emp.needs_training ? true : false, req.user.id]
          );
        }
        await client.query(`UPDATE incidents SET has_responsible_person = TRUE WHERE id = $1`, [id]);
      } else {
        await client.query(`UPDATE incidents SET has_responsible_person = FALSE WHERE id = $1`, [id]);
      }
    }

    // Save final report data but mark it pending IMC official report
    await client.query(
      `INSERT INTO final_reports (incident_id, generated_by, fault_type, corrective_actions, is_latest)
       VALUES ($1, $2, $3, $4, FALSE)
       ON CONFLICT DO NOTHING`,
      [id, req.user.id, faultType, correctiveActions]
    );

    await client.query(
      `UPDATE incidents SET status = 'pending_imc_report', management_decision = $1, management_notes = $2, updated_at = NOW() WHERE id = $3`,
      [decision, notes, id]
    );

    await client.query('COMMIT');
    
    const imcMembers = await query("SELECT id, email FROM users WHERE role = 'imc'");
    for (const member of imcMembers.rows) {
      await createNotification(member.id, id, 'Management Decision Received', 'Please generate the official IMC report.', 'management_action');
    }

    await auditLog(req.user.id, 'MANAGEMENT_DECISION', id, { decision }, req.ip);

    res.json({ success: true, message: 'Decision submitted. Pending IMC Report.' });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to submit management action' });
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

    const inc = await query(`SELECT reporter_id, reference_id FROM incidents WHERE id = $1`, [id]);
    const incident = inc.rows[0];

    await createNotification(incident.reporter_id, id, 'Incident Closed', `Incident ${incident.reference_id} has been officially closed.`, 'incident_closed');
    
    await auditLog(req.user.id, 'INCIDENT_CLOSED', id, {}, req.ip);
    res.json({ success: true, message: 'Incident officially closed.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to close incident' });
  }
};

// =============================================
// SUBMIT INVESTIGATION REPORT (Involved IMC Member / Assigned Investigator)
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

    // Verify user authorization: must be an assigned investigator or an IMC member
    const isImc = Boolean(req.user.role === 'imc' || req.user.is_imc_member || req.user.is_imc_lead);
    const assignedCheck = await client.query(
      `SELECT * FROM investigators WHERE incident_id = $1 AND investigator_id = $2`,
      [id, req.user.id]
    );

    if (!assignedCheck.rows.length && !isImc) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only assigned investigators or involved IMC members can submit the investigation report.' });
    }

    // Update active investigator assignments for this incident
    await client.query(
      `UPDATE investigators 
       SET report_text = $1, status = 'completed', completed_at = NOW() 
       WHERE incident_id = $2 AND status != 'completed'`,
      [reportText.trim(), id]
    );

    // Record findings into feedbacks
    await client.query(
      `INSERT INTO feedbacks (incident_id, author_id, role, feedback_text) VALUES ($1, $2, 'investigator', $3)`,
      [id, req.user.id, reportText.trim()]
    );

    // Save attached files (photos, official report PDFs, etc.)
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

    await client.query('COMMIT');

    // Notify IMC Convenor
    const convenorRes = await query(`SELECT id, email, full_name FROM users WHERE (role = 'imc' AND is_imc_lead = TRUE) OR is_system_admin = TRUE`);
    for (const member of convenorRes.rows) {
      await createNotification(
        member.id,
        id,
        'Investigation Report Ready for Review',
        `An investigation report has been submitted. Please evaluate findings to forward to Management or request reinvestigation.`,
        'investigator_report_submitted'
      );
    }

    res.json({ success: true, message: 'Investigation report submitted successfully.' });
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
    let { feedbackText, investigatorIds, newInvestigatorId } = req.body;
    if (!investigatorIds && newInvestigatorId) {
      investigatorIds = [newInvestigatorId];
    }
    
    if (!req.user.is_imc_lead && !req.user.is_system_admin) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only the IMC Convenor can request reinvestigation.' });
    }
    
    if (!feedbackText || !feedbackText.trim()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Please provide remarks explaining why reinvestigation is required.' });
    }

    // Record Convenor's feedback into feedbacks table
    await client.query(
      `INSERT INTO feedbacks (incident_id, author_id, role, feedback_text) VALUES ($1, $2, 'imc', $3)`,
      [id, req.user.id, feedbackText.trim()]
    );
    
    // If new or reallocated investigator IDs are provided, reassign them
    if (Array.isArray(investigatorIds) && investigatorIds.length > 0) {
      const invUsers = await client.query('SELECT id, email, full_name, role, is_imc_member, is_imc_lead FROM users WHERE id = ANY($1)', [investigatorIds]);
      const hasImc = invUsers.rows.some(u => u.role === 'imc' || u.is_imc_member || u.is_imc_lead);
      if (!hasImc) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'At least one IMC member must be included in the investigation team.' });
      }

      for (const inv of invUsers.rows) {
        await client.query(
          `INSERT INTO investigators (incident_id, investigator_id, assigned_by, status) 
           VALUES ($1, $2, $3, 'assigned')`,
          [id, inv.id, req.user.id]
        );
      }
    } else {
      // Re-open existing completed investigators
      await client.query(`UPDATE investigators SET status = 'assigned' WHERE incident_id = $1`, [id]);
    }
    
    await client.query(`UPDATE incidents SET status = 'with_investigator', updated_at = NOW() WHERE id = $1`, [id]);
    
    await client.query('COMMIT');

    const incRes = await query('SELECT reference_id FROM incidents WHERE id = $1', [id]);
    const refId = incRes.rows[0]?.reference_id || id;

    // Notify assigned investigators
    const assignedInvs = await query(`
      SELECT DISTINCT u.id, u.email, u.full_name 
      FROM investigators inv
      JOIN users u ON u.id = inv.investigator_id
      WHERE inv.incident_id = $1 AND inv.status = 'assigned'
    `, [id]);

    for (const inv of assignedInvs.rows) {
      await createNotification(
        inv.id,
        id,
        'Reinvestigation Mandated',
        `The IMC Convenor has requested reinvestigation for incident ${refId}. Remarks: "${feedbackText.trim()}"`,
        'investigator_assigned'
      );
    }

    res.json({ success: true, message: 'Incident successfully scheduled for reinvestigation.' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[POST /incidents/:id/reject-investigator-report] error:', error);
    res.status(500).json({ error: 'Failed to request reinvestigation.' });
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
    await auditLog(req.user.id, 'INCIDENT_REOPENED', id, { reason }, req.ip);
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

    // Resolve investigators: can be in users table or master_employees (unregistered)
    let invUsers = [];
    for (const rawId of investigatorIds) {
      if (!rawId) continue;
      const invId = String(rawId).trim();
      // First check users table
      let uRes = await query(
        'SELECT id, full_name, email, role, is_imc_member, is_imc_lead FROM users WHERE id::text = $1 OR employee_id = $1',
        [invId]
      );
      if (uRes.rows.length) {
        invUsers.push(uRes.rows[0]);
        continue;
      }

      // If not in users, check master_employees (by id or employee_id)
      const mRes = await query(
        'SELECT * FROM master_employees WHERE id::text = $1 OR employee_id = $1',
        [invId]
      );
      if (mRes.rows.length) {
        const mEmp = mRes.rows[0];
        // Provision user account for unregistered employee so they can be assigned as investigator
        const defaultHash = await bcrypt.hash('123456', 12);
        const newUserRes = await query(
          `INSERT INTO users (employee_id, full_name, email, department, designation, role, is_active, password_hash)
           VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7)
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
            mEmp.role || 'employee',
            defaultHash
          ]
        );
        if (newUserRes.rows.length) {
          invUsers.push(newUserRes.rows[0]);
          continue;
        }
      }

      return res.status(400).json({ error: 'One or more selected investigators were not found in hospital user records.' });
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
      return res.status(400).json({ error: 'Primary investigators must include at least one IMC member.' });
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

    const incResult = await query('SELECT reference_id FROM incidents WHERE id = $1', [id]);
    const refId = incResult.rows[0]?.reference_id || 'Unknown';

    for (const inv of invRes.rows) {
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
    res.status(500).json({ error: 'Failed to assign investigator' });
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


const { query, getClient } = require('../config/database');
const { auditLog } = require('../middleware/auth');
const { createNotification } = require('../utils/notifications');
const { sendEmail, templates } = require('../utils/emailService');

// =============================================
// SUBMIT HOD FEEDBACK
// =============================================
exports.submitHodFeedback = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { id } = req.params;
    let { feedbackText, redirectToImc, redirectReason, acknowledged } = req.body;
    
    acknowledged = acknowledged === 'true' || acknowledged === true;

    if (!acknowledged) {
      return res.status(400).json({ error: 'HOD must acknowledge review before providing feedback.' });
    }

    const incidentResult = await client.query(
      'SELECT * FROM incidents WHERE id = $1',
      [id]
    );

    if (!incidentResult.rows.length) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    const incident = incidentResult.rows[0];

    // Get HOD's department
    const deptResult = await client.query(
      'SELECT id FROM departments WHERE hod_user_id = $1 OR incharge_user_id = $1 OR asst_coo_user_id = $1 OR LOWER(name) = LOWER($2)',
      [req.user.id, (req.user.department || '').trim()]
    );

    if (!deptResult.rows.length) {
      return res.status(403).json({ error: 'Not authorized as HOD' });
    }

    const deptId = deptResult.rows[0].id;

    // Check if HOD's dept is targeted
    const targetCheck = await client.query(
      'SELECT 1 FROM incident_departments WHERE incident_id = $1 AND department_id = $2',
      [id, deptId]
    );

    if (!targetCheck.rows.length) {
      return res.status(403).json({ error: 'This incident is not targeted at your department' });
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

    // Check if all HODs have responded
    const totalHods = await client.query(
      `SELECT COUNT(*) FROM incident_departments id
       JOIN departments d ON d.id = id.department_id
       WHERE id.incident_id = $1 AND (d.hod_user_id IS NOT NULL OR d.incharge_user_id IS NOT NULL OR d.asst_coo_user_id IS NOT NULL)`,
      [id]
    );

    const respondedHods = await client.query(
      `SELECT COUNT(*) FROM feedbacks WHERE incident_id = $1 AND role = 'hod'`,
      [id]
    );

    const allResponded = parseInt(respondedHods.rows[0].count) >= parseInt(totalHods.rows[0].count);

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
    }

    await client.query('COMMIT');

    // Notify IMC (in-app + email) only if ready
    if (redirectToImc || allResponded) {
      const imcMembers = await query('SELECT id, email, full_name FROM users WHERE role = $1', ['imc']);
      for (const member of imcMembers.rows) {
        await createNotification(member.id, id,
          'Incident Ready for IMC Review',
          `Incident ${incident.reference_id} is now in the IMC queue.`,
          'incident_to_imc'
        );
        if (member.email) {
          sendEmail(member.email, templates.incidentToImc(incident, member)).catch(() => {});
        }
      }
    }

    await auditLog(req.user.id, 'HOD_FEEDBACK_SUBMITTED', id, { redirectToImc }, req.ip);

    res.json({ success: true });

  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to submit feedback.' });
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
    let { feedbackText, forwardToMd, severity } = req.body;
    
    if (!req.user.is_imc_lead) {
      return res.status(403).json({ error: 'Only the IMC Convenor can submit feedback.' });
    }

    forwardToMd = forwardToMd === 'true' || forwardToMd === true;

    const incidentResult = await client.query('SELECT * FROM incidents WHERE id = $1', [id]);
    if (!incidentResult.rows.length) return res.status(404).json({ error: 'Not found' });
    const incident = incidentResult.rows[0];

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

    if (severity) {
      await client.query(`UPDATE incidents SET severity = $1, updated_at = NOW() WHERE id = $2`, [severity, id]);
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
    let { decision, notes, faultType, correctiveActions, requireTraining, responsibleEmployees } = req.body;
    
    if (!['AGREE', 'DISAGREE_MODIFY', 'DISAGREE_REINVESTIGATE'].includes(decision)) {
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

    if (decision === 'DISAGREE_REINVESTIGATE') {
      await client.query(
        `UPDATE incidents SET status = 'with_imc', management_decision = $1, management_notes = $2, updated_at = NOW() WHERE id = $3`,
        [decision, notes, id]
      );
      await client.query('COMMIT');
      await auditLog(req.user.id, 'MANAGEMENT_REINVESTIGATE', id, {}, req.ip);
      return res.json({ success: true, message: 'Reverted to IMC for reinvestigation.' });
    }

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
// GENERATE IMC REPORT
// =============================================
exports.generateImcReport = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    
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
          `SELECT u.id, u.email FROM users u JOIN departments d ON d.hod_user_id = u.id OR d.incharge_user_id = u.id WHERE d.id = $1`, [emp.department_id]
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
// CLOSE INCIDENT (Post-Training)
// =============================================
exports.closeIncident = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if training is completed
    const trainingCheck = await query(`SELECT COUNT(*) FROM incident_responsible_employees WHERE incident_id = $1 AND needs_training = TRUE`, [id]);
    // Optionally check if training_records say it is completed
    
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

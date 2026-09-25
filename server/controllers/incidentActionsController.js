const { query, getClient } = require('../config/database');
const { auditLog } = require('../middleware/auth');
const { createNotification } = require('../utils/notifications');
const { sendEmail, templates } = require('../utils/emailService');

// ── UPDATE INCIDENT (employee, while submitted) ────────────────────────────
exports.updateIncident = async (req, res) => {
  try {
    const { id } = req.params;
    const { description, severity, occurredTo, incidentDate, incidentTime } = req.body;

    const result = await query(
      'SELECT * FROM incidents WHERE id = $1 AND reporter_id = $2',
      [id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found or access denied' });

    const incident = result.rows[0];
    if (incident.status !== 'submitted') {
      return res.status(400).json({ error: 'Incident can only be edited while in submitted status.' });
    }

    await query(
      `UPDATE incidents SET
        description = COALESCE($1, description),
        severity = COALESCE($2, severity),
        occurred_to = COALESCE($3, occurred_to),
        incident_date = COALESCE($4, incident_date),
        incident_time = COALESCE($5, incident_time),
        updated_at = NOW()
       WHERE id = $6`,
      [description, severity, occurredTo, incidentDate, incidentTime, id]
    );

    await auditLog(req.user.id, 'INCIDENT_EDITED', id, { fields: Object.keys(req.body) }, req.ip);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update incident.' });
  }
};

// ── ESCALATE PRIORITY ────────────────────────────────────────────────────
exports.escalatePriority = async (req, res) => {
  try {
    const { id } = req.params;
    const role = req.user.role;

    const result = await query('SELECT * FROM incidents WHERE id = $1', [id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    const incident = result.rows[0];

    if (incident.priority_escalated_by) {
      return res.status(400).json({ error: 'Priority already escalated.' });
    }

    const escalatedBy = role === 'head_management' ? 'Management' : 'IMC';

    await query(
      `UPDATE incidents SET priority_escalated_by = $1, priority_escalated_at = NOW(), updated_at = NOW() WHERE id = $2`,
      [escalatedBy, id]
    );

    // Notify all IMC and management
    const notifyUsers = await query(
      "SELECT id, email, full_name FROM users WHERE role IN ('imc','head_management') AND id != $1",
      [req.user.id]
    );
    for (const u of notifyUsers.rows) {
      await createNotification(u.id, id, 'Priority Escalated',
        `Incident ${incident.reference_id} priority has been escalated by ${escalatedBy}.`,
        'priority_escalated');
      if (u.email) {
        sendEmail(u.email, templates.priorityEscalated(incident, u, escalatedBy)).catch(() => { });
      }
    }

    await auditLog(req.user.id, 'PRIORITY_ESCALATED', id, { escalatedBy }, req.ip);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to escalate priority.' });
  }
};

// ── REQUEST REDIRECT (HOD) ─────────────────────────────────────────────────
exports.requestRedirect = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason?.trim()) return res.status(400).json({ error: 'Redirect reason is required.' });

    const incResult = await client.query('SELECT * FROM incidents WHERE id = $1', [id]);
    if (!incResult.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }
    const incident = incResult.rows[0];

    if (!['with_hod', 'with_hod_and_imc'].includes(incident.status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Incident is not in HOD review status.' });
    }

    // Get HOD's department
    const deptRes = await client.query('SELECT name FROM departments WHERE hod_user_id = $1 OR incharge_user_id = $1 OR asst_coo_user_id = $1 OR LOWER(name) = LOWER($2)', [req.user.id, (req.user.department || '').trim()]);
    const deptName = deptRes.rows[0]?.name || req.user.department || 'Unknown';

    await client.query(
      `UPDATE incidents SET status = 'redirect_requested', redirect_reason = $1,
       redirect_requested_by_dept = $2, redirect_requested_at = NOW(), updated_at = NOW() WHERE id = $3`,
      [reason, deptName, id]
    );

    await client.query('COMMIT');

    // Notify IMC
    const imcMembers = await query("SELECT id, email, full_name FROM users WHERE role = 'imc'");
    for (const m of imcMembers.rows) {
      await createNotification(m.id, id, 'Redirect Requested',
        `HOD of ${deptName} has requested a redirect for incident ${incident.reference_id}.`,
        'redirect_requested');
      if (m.email) {
        sendEmail(m.email, templates.redirectRequested(incident, m, deptName, reason)).catch(() => { });
      }
    }

    await auditLog(req.user.id, 'REDIRECT_REQUESTED', id, { reason, fromDept: deptName }, req.ip);
    res.json({ success: true });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to request redirect.' });
  } finally {
    client.release();
  }
};

// ── APPROVE REDIRECT (IMC) ─────────────────────────────────────────────────
exports.approveRedirect = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const { targetDepartment } = req.body;

    if (!targetDepartment) return res.status(400).json({ error: 'Target department is required.' });

    const incResult = await client.query('SELECT * FROM incidents WHERE id = $1', [id]);
    if (!incResult.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }
    const incident = incResult.rows[0];

    // Find target department
    const deptRes = await client.query('SELECT id, hod_user_id FROM departments WHERE name = $1', [targetDepartment]);
    if (!deptRes.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Target department not found' }); }
    const targetDept = deptRes.rows[0];

    const newStatus = incident.severity === 'Grave' ? 'with_hod_and_imc' : 'with_hod';

    // Update incident departments — remove old, add new
    await client.query('DELETE FROM incident_departments WHERE incident_id = $1', [id]);
    await client.query('INSERT INTO incident_departments (incident_id, department_id) VALUES ($1, $2)', [id, targetDept.id]);

    await client.query(
      `UPDATE incidents SET status = $1, updated_at = NOW() WHERE id = $2`,
      [newStatus, id]
    );

    await client.query('COMMIT');

    // Notify new HOD, Incharge, or Assistant COO
    const newLeadersRes = await query(
      `SELECT DISTINCT u.id, u.email, u.full_name FROM users u
       LEFT JOIN departments d ON (d.hod_user_id = u.id OR d.incharge_user_id = u.id OR d.asst_coo_user_id = u.id OR LOWER(d.name) = LOWER(u.department))
       WHERE d.id = $1 AND (u.role = 'hod' OR d.hod_user_id = u.id OR d.incharge_user_id = u.id OR d.asst_coo_user_id = u.id)`, [targetDept.id]
    );
    for (const leader of newLeadersRes.rows) {
      await createNotification(leader.id, id, 'Incident Redirected to You',
        `Incident ${incident.reference_id} has been redirected to your department by IMC.`,
        'incident_redirected');
      if (leader?.email) {
        sendEmail(leader.email, templates.newIncidentHod(incident, leader)).catch(() => { });
      }
    }

    // Notify original HOD of approval
    if (incident.redirect_requested_by_dept) {
      const origHodRes = await query(
        `SELECT DISTINCT u.id, u.email, u.full_name FROM users u
         LEFT JOIN departments d ON (d.hod_user_id = u.id OR d.incharge_user_id = u.id OR d.asst_coo_user_id = u.id OR LOWER(d.name) = LOWER(u.department))
         WHERE d.name = $1 AND (u.role = 'hod' OR d.hod_user_id = u.id OR d.incharge_user_id = u.id OR d.asst_coo_user_id = u.id)`, [incident.redirect_requested_by_dept]
      );
      if (origHodRes.rows.length) {
        const origHod = origHodRes.rows[0];
        if (origHod.email) {
          sendEmail(origHod.email, templates.redirectDecision(incident, origHod, true, targetDepartment, null)).catch(() => { });
        }
      }
    }

    await auditLog(req.user.id, 'REDIRECT_APPROVED', id, { targetDepartment }, req.ip);

    if (req.io) {
      req.io.emit('incident_updated', { id });
    }

    res.json({ success: true, message: 'Redirect approved successfully.' });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to approve redirect.' });
  } finally {
    client.release();
  }
};

// ── REJECT REDIRECT (IMC) ──────────────────────────────────────────────────
exports.rejectRedirect = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const { reason } = req.body;

    const incResult = await client.query('SELECT * FROM incidents WHERE id = $1', [id]);
    if (!incResult.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }
    const incident = incResult.rows[0];

    const newStatus = incident.severity === 'Grave' ? 'with_hod_and_imc' : 'with_hod';

    await client.query(
      `UPDATE incidents SET status = $1, updated_at = NOW() WHERE id = $2`,
      [newStatus, id]
    );

    await client.query('COMMIT');

    if (incident.redirect_requested_by_dept) {
      const origHodRes = await query(
        `SELECT u.id, u.email, u.full_name FROM users u
         JOIN departments d ON (d.hod_user_id = u.id OR d.incharge_user_id = u.id OR d.asst_coo_user_id = u.id)
         WHERE d.name = $1`, [incident.redirect_requested_by_dept]
      );
      if (origHodRes.rows.length) {
        const origHod = origHodRes.rows[0];
        await createNotification(origHod.id, id, 'Redirect Request Rejected',
          `IMC has rejected the redirect request for incident ${incident.reference_id}. Please review and provide feedback.`,
          'redirect_rejected');
        if (origHod.email) {
          sendEmail(origHod.email, templates.redirectDecision(incident, origHod, false, null, reason)).catch(() => { });
        }
      }
    }

    await auditLog(req.user.id, 'REDIRECT_REJECTED', id, { reason }, req.ip);

    if (req.io) {
      req.io.emit('incident_updated', { id });
    }

    res.json({ success: true, message: 'Redirect rejected successfully.' });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to reject redirect.' });
  } finally {
    client.release();
  }
};

// ── VERIFY EMPLOYEE TRAINING (HOD) ──────────────────────────────────────────
exports.verifyEmployeeTraining = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const { employeeId } = req.body;

    if (!employeeId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Employee ID is required.' });
    }

    const incResult = await client.query('SELECT * FROM incidents WHERE id = $1', [id]);
    if (!incResult.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }
    const incident = incResult.rows[0];

    // Check if employee is part of the incident and needs training
    const empCheck = await client.query('SELECT * FROM incident_responsible_employees WHERE incident_id = $1 AND employee_id = $2 AND needs_training = TRUE', [id, employeeId]);
    if (!empCheck.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Employee does not require training for this incident.' });
    }
    const emp = empCheck.rows[0];

    // Verify HOD access
    if (req.user.role === 'hod') {
      const deptRes = await client.query('SELECT * FROM departments WHERE id = $1', [emp.department_id]);
      if (deptRes.rows.length) {
        const d = deptRes.rows[0];
        if (d.hod_user_id !== req.user.id && d.incharge_user_id !== req.user.id && d.asst_coo_user_id !== req.user.id) {
           await client.query('ROLLBACK');
           return res.status(403).json({ error: 'You are not the HOD for this employee’s department.' });
        }
      }
    }

    await client.query(
      `UPDATE incident_responsible_employees 
       SET training_completed = TRUE, training_verified_at = NOW(), training_verified_by = $1
       WHERE incident_id = $2 AND employee_id = $3`,
      [req.user.id, id, employeeId]
    );

    // Check if all trainings are completed
    const pendingTrainings = await client.query(
      'SELECT COUNT(*) FROM incident_responsible_employees WHERE incident_id = $1 AND needs_training = TRUE AND (training_completed IS NULL OR training_completed = FALSE)',
      [id]
    );

    await client.query('COMMIT');

    if (parseInt(pendingTrainings.rows[0].count) === 0) {
      const imcMembers = await query("SELECT id FROM users WHERE role = 'imc' AND is_imc_lead = TRUE");
      for (const imc of imcMembers.rows) {
        await createNotification(imc.id, id, 'All Training Verified',
          `All mandated training for incident ${incident.reference_id} has been verified by HODs. You can now close the incident.`,
          'training_all_verified');
      }
    }

    await auditLog(req.user.id, 'EMPLOYEE_TRAINING_VERIFIED', id, { employeeId }, req.ip);
    res.json({ success: true, message: 'Employee training verified.' });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'Failed to verify employee training.' });
  } finally {
    client.release();
  }
};

// ── VERIFY TRAINING (IMC) ──────────────────────────────────────────────────
exports.verifyTraining = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { id } = req.params;

    const incResult = await client.query('SELECT * FROM incidents WHERE id = $1', [id]);
    if (!incResult.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }
    const incident = incResult.rows[0];

    if (incident.status !== 'pending_training') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Incident is not in pending_training status.' });
    }

    await client.query(
      `UPDATE incidents SET
        status = 'resolved', training_completed = TRUE,
        training_completed_at = NOW(), training_verified_by = $1,
        resolved_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [req.user.id, id]
    );

    await client.query('COMMIT');

    // Notify reporter
    const reporterRes = await query('SELECT email, full_name FROM users WHERE id = $1', [incident.reporter_id]);
    const reporter = reporterRes.rows[0];
    await createNotification(incident.reporter_id, id, 'Training Verified & Incident Closed',
      `Training for incident ${incident.reference_id} has been verified. The incident is now resolved.`,
      'training_verified');
    if (reporter?.email) {
      sendEmail(reporter.email, templates.trainingVerified(incident, reporter)).catch(() => { });
    }

    await auditLog(req.user.id, 'TRAINING_VERIFIED', id, {}, req.ip);
    res.json({ success: true });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to verify training.' });
  } finally {
    client.release();
  }
};

// ── EDIT OWN FEEDBACK (HOD/IMC/Management) ────────────────────────────────
exports.editFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    const { feedbackType, feedbackText, feedbackId } = req.body;
    const role = req.user.role;

    if (!feedbackText?.trim()) return res.status(400).json({ error: 'Feedback text is required.' });

    // Locate the specific feedback
    let fbResult;
    if (feedbackId) {
      fbResult = await query(
        'SELECT * FROM feedbacks WHERE id = $1 AND incident_id = $2',
        [feedbackId, id]
      );
    } else {
      const roleMap = { hod: 'hod', imc: 'imc', head_management: 'head_management', management: 'head_management' };
      const fbRole = roleMap[feedbackType] || feedbackType;
      fbResult = await query(
        'SELECT * FROM feedbacks WHERE incident_id = $1 AND author_id = $2 AND role = $3 ORDER BY created_at DESC LIMIT 1',
        [id, req.user.id, fbRole]
      );
    }

    if (!fbResult.rows.length) {
      return res.status(404).json({ error: 'No matching feedback found to update.' });
    }

    const fb = fbResult.rows[0];

    // Rule: No one can edit the review/feedback given by any other person, except the person itself.
    if (fb.author_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only edit your own feedback.' });
    }

    // Rule: After IMC has given the feedback, the feedbacks given by the HODs of concerned department can not be modified.
    if (fb.role === 'hod') {
      const imcCheck = await query(
        "SELECT 1 FROM feedbacks WHERE incident_id = $1 AND role = 'imc'",
        [id]
      );
      if (imcCheck.rows.length > 0) {
        return res.status(403).json({ error: 'HOD feedback cannot be modified after IMC has submitted quality review feedback.' });
      }
    }

    const result = await query(
      `UPDATE feedbacks SET feedback_text = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id`,
      [feedbackText, fb.id]
    );

    await auditLog(req.user.id, 'FEEDBACK_EDITED', id, { feedbackId: fb.id, role: fb.role }, req.ip);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to edit feedback.' });
  }
};

// ── REMIND HOD TO SUBMIT FEEDBACK (IMC/Management) ──────────────────────────
exports.remindHod = async (req, res) => {
  try {
    const { id } = req.params;
    const role = req.user.role;
    const remindedBy = role === 'head_management' ? 'Management Authority' : 'IMC Committee';

    const incResult = await query('SELECT * FROM incidents WHERE id = $1', [id]);
    if (!incResult.rows.length) return res.status(404).json({ error: 'Incident not found' });
    const incident = incResult.rows[0];

    // Find HOD(s) of concerned department(s) who haven't submitted feedback yet
    const deptRes = await query(
      `SELECT DISTINCT u.id, u.email, u.full_name
       FROM incident_departments id
       JOIN departments d ON d.id = id.department_id
       JOIN users u ON (u.id = d.hod_user_id OR u.id = d.incharge_user_id OR u.id = d.asst_coo_user_id)
       WHERE id.incident_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM feedbacks f
           WHERE f.incident_id = $1 AND f.role = 'hod' AND (f.author_id = u.id OR f.department_id = d.id)
         )`,
      [id]
    );

    let hodUsers = deptRes.rows;

    if (!hodUsers.length) {
      const fallbackRes = await query(
        `SELECT DISTINCT id, email, full_name FROM users
         WHERE role = 'hod'
           AND (department IN (SELECT d.name FROM incident_departments id JOIN departments d ON d.id = id.department_id WHERE id.incident_id = $1)
                OR department = (SELECT department FROM users WHERE id = $2))
           AND NOT EXISTS (
             SELECT 1 FROM feedbacks f WHERE f.incident_id = $1 AND f.role = 'hod' AND f.author_id = users.id
           )`
      , [id, incident.reporter_id]);
      hodUsers = fallbackRes.rows;
    }

    if (!hodUsers.length) {
      const allHodRes = await query(
        `SELECT id, email, full_name FROM users 
         WHERE role = 'hod' 
           AND NOT EXISTS (SELECT 1 FROM feedbacks f WHERE f.incident_id = $1 AND f.role = 'hod' AND f.author_id = users.id)`
      , [id]);
      hodUsers = allHodRes.rows;
    }

    if (!hodUsers.length) {
      return res.status(400).json({ error: 'No HOD user found in the system to remind.' });
    }

    for (const hod of hodUsers) {
      await createNotification(
        hod.id,
        id,
        `🔔 Reminder: HOD Feedback Required (${incident.reference_id})`,
        `You have been reminded by ${remindedBy} to submit your HOD feedback/review for Incident ${incident.reference_id}.`,
        'hod_feedback_reminder'
      );
      if (hod.email) {
        sendEmail(hod.email, templates.hodFeedbackReminder(incident, hod, remindedBy)).catch(e =>
          console.warn('[RemindHOD] Email failed:', e.message)
        );
      }
    }

    await auditLog(req.user.id, 'HOD_REMINDED', id, { remindedBy, hodCount: hodUsers.length }, req.ip);
    res.json({ success: true, count: hodUsers.length, message: `Reminder sent to ${hodUsers.length} HOD(s) via Mail and In-App Notification.` });
  } catch (e) {
    console.error('remindHod error:', e);
    res.status(500).json({ error: 'Failed to send reminder to HOD.' });
  }
};


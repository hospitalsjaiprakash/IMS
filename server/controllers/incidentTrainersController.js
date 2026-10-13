const { query, getClient } = require('../config/database');
const { auditLog } = require('../middleware/auth');
const { createNotification } = require('../utils/notifications');
const { sendEmail } = require('../utils/emailService');

// =============================================
// GET TRAINERS / TRAINING ASSIGNMENTS
// =============================================
exports.getIncidentTrainers = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT t.*,
              u_trainer.full_name as trainer_name,
              u_trainer.email as trainer_email,
              u_trainer.designation as trainer_designation,
              u_trainer.department as trainer_department,
              u_assign.full_name as assigned_by_name,
              u_verify.full_name as verified_by_name,
              att.stored_filename as report_stored_filename,
              att.original_filename as report_original_filename,
              att.file_size as report_file_size
       FROM incident_trainers t
       LEFT JOIN users u_trainer ON u_trainer.id = t.trainer_id
       LEFT JOIN users u_assign ON u_assign.id = t.assigned_by
       LEFT JOIN users u_verify ON u_verify.id = t.imc_verified_by
       LEFT JOIN attachments att ON att.id = t.trainer_attachment_id
       WHERE t.incident_id = $1
       ORDER BY t.created_at ASC`,
      [id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('[GET /incidents/:id/trainers] error:', error);
    res.status(500).json({ error: 'Failed to fetch incident training assignments.' });
  }
};

// =============================================
// IMC ASSIGNS DEDICATED TRAINER
// =============================================
exports.assignTrainer = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const trainerIdInput = req.body.trainerId || req.body.trainer_id;
    const trainingTopic = req.body.trainingTopic || req.body.topic;
    const trainingInstructions = req.body.trainingInstructions || req.body.instructions;
    const targetDate = req.body.targetDate || req.body.targetCompletionDate;
    let traineeEmployeeId = req.body.traineeEmployeeId || req.body.traineeId || req.body.employee_id;
    let traineeName = req.body.traineeName;
    let traineeDepartment = req.body.traineeDepartment;
    let traineeDesignation = req.body.traineeDesignation;

    if (!trainerIdInput || !trainingTopic) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Trainer and training topic are required.' });
    }

    const incRes = await client.query('SELECT * FROM incidents WHERE id = $1', [id]);
    if (!incRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Incident not found.' });
    }
    const incident = incRes.rows[0];

    // If trainee is not supplied, find from responsible employees or incident
    if (!traineeEmployeeId || !traineeName) {
      const respRes = await client.query(
        `SELECT r.employee_id, u.full_name, u.department, u.designation 
         FROM incident_responsible_employees r
         JOIN users u ON u.id = r.employee_id
         WHERE r.incident_id = $1 LIMIT 1`,
        [id]
      );
      if (respRes.rows.length > 0) {
        const r = respRes.rows[0];
        traineeEmployeeId = traineeEmployeeId || r.employee_id;
        traineeName = traineeName || r.full_name;
        traineeDepartment = traineeDepartment || r.department;
        traineeDesignation = traineeDesignation || r.designation;
      } else {
        traineeEmployeeId = traineeEmployeeId || incident.responsible_person_name || 'STAFF';
        traineeName = traineeName || incident.responsible_person_name || 'Designated Hospital Staff';
      }
    }

    // Find trainer user (by UUID or employee_id)
    const trainerUserRes = await client.query(
      'SELECT id, full_name, email FROM users WHERE id::text = $1 OR employee_id = $1',
      [trainerIdInput]
    );
    if (!trainerUserRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Selected trainer not found in staff directory.' });
    }
    const trainerUser = trainerUserRes.rows[0];
    const trainerId = trainerUser.id;

    // Insert assignment
    const insertRes = await client.query(
      `INSERT INTO incident_trainers (
         incident_id, trainee_employee_id, trainee_name, trainee_department,
         trainee_designation, trainer_id, assigned_by, training_topic,
         training_instructions, target_date, status, assigned_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'assigned', NOW())
       RETURNING *`,
      [
        id,
        String(traineeEmployeeId),
        traineeName || 'Staff Member',
        traineeDepartment || null,
        traineeDesignation || null,
        trainerId,
        req.user.id,
        trainingTopic,
        trainingInstructions || null,
        targetDate || null
      ]
    );

    // Flag trainees in incident_responsible_employees
    const traineeIdList = Array.isArray(req.body.traineeIds) && req.body.traineeIds.length > 0
      ? req.body.traineeIds
      : (traineeEmployeeId ? [traineeEmployeeId] : []);

    for (const tId of traineeIdList) {
      await client.query(
        `UPDATE incident_responsible_employees
         SET needs_training = TRUE
         WHERE incident_id = $1 AND employee_id = $2`,
        [id, tId]
      );
    }

    // Update incident status to training_in_progress
    await client.query(
      `UPDATE incidents
       SET status = 'training_in_progress', updated_at = NOW()
       WHERE id = $1`,
      [id]
    );

    await client.query('COMMIT');

    // Notify assigned trainer
    await createNotification(
      trainerId,
      id,
      'Training Mandate Assigned',
      `You have been appointed as the Trainer for incident ${incident.reference_id} regarding: "${trainingTopic}". Please conduct the practical session and submit your report.`,
      'training_assigned'
    );

    if (trainerUser.email) {
      sendEmail(trainerUser.email, {
        subject: `Trainer Appointment - Incident ${incident.reference_id}`,
        text: `Dear ${trainerUser.full_name},\n\nYou have been assigned as the Trainer for incident ${incident.reference_id}.\n\nTrainee: ${traineeName || 'Staff Member'}\nTopic: ${trainingTopic}\nTarget Date: ${targetDate || 'As soon as possible'}\n\nPlease access the IMS portal to log session completion and upload the attendance report.`,
        html: `
          <div style="font-family: sans-serif; padding: 20px; line-height: 1.6;">
            <h2 style="color: #1e3a8a;">Trainer Appointment - Incident ${incident.reference_id}</h2>
            <p>Dear <strong>${trainerUser.full_name}</strong>,</p>
            <p>The Incident Management Committee has appointed you to deliver structured training for incident <strong>${incident.reference_id}</strong>.</p>
            <div style="background: #f8fafc; padding: 15px; border-left: 4px solid #3b82f6; margin: 15px 0;">
              <div><strong>Trainee:</strong> ${traineeName || 'Staff Member'} (${traineeDepartment || ''})</div>
              <div><strong>Training Topic:</strong> ${trainingTopic}</div>
              ${targetDate ? `<div><strong>Target Completion Date:</strong> ${targetDate}</div>` : ''}
              ${trainingInstructions ? `<div><strong>Instructions:</strong> ${trainingInstructions}</div>` : ''}
            </div>
            <p>Once the training is delivered, please log in to the IMS portal to submit your completion notes and upload the signed attendance evidence.</p>
          </div>
        `
      }).catch(err => console.error('[Trainer Email] failed:', err));
    }

    await auditLog(req.user.id, 'TRAINER_ASSIGNED', id, {
      trainerName: trainerUser.full_name,
      traineeName,
      trainingTopic
    }, req.ip);

    if (req.io) {
      req.io.emit('incident_updated', { id, status: 'training_in_progress' });
    }

    res.json({
      success: true,
      message: `Trainer ${trainerUser.full_name} assigned successfully.`,
      assignment: insertRes.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[POST /incidents/:id/trainers/assign] error:', error);
    res.status(500).json({ error: error.message || 'Failed to assign trainer.' });
  } finally {
    client.release();
  }
};

// =============================================
// TRAINER SUBMITS COMPLETION REPORT & ATTENDANCE
// =============================================
exports.submitTrainerReport = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    let {
      assignmentId,
      conductedAt,
      completionDate,
      durationMinutes,
      durationHours,
      methodology,
      trainerReportText,
      summary
    } = req.body;

    const reportContent = (trainerReportText || summary || '').trim();
    if (!reportContent) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Training completion report findings are required.' });
    }

    const incRes = await client.query('SELECT reference_id FROM incidents WHERE id = $1', [id]);
    if (!incRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Incident not found.' });
    }
    const incident = incRes.rows[0];

    // Fallback assignment lookup if not provided
    if (!assignmentId) {
      const fallbackAssign = await client.query(
        `SELECT id, trainer_id FROM incident_trainers
         WHERE incident_id = $1 AND (trainer_id = $2 OR status = 'assigned')
         ORDER BY created_at DESC LIMIT 1`,
        [id, req.user.id]
      );
      if (fallbackAssign.rows.length) {
        assignmentId = fallbackAssign.rows[0].id;
      }
    }

    if (!assignmentId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Active training assignment ID could not be identified.' });
    }

    // Check trainer authorization
    const assignCheck = await client.query(
      `SELECT * FROM incident_trainers WHERE id = $1 AND incident_id = $2`,
      [assignmentId, id]
    );
    if (!assignCheck.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Training assignment not found.' });
    }
    const assignment = assignCheck.rows[0];

    if (assignment.trainer_id !== req.user.id && !req.user.is_system_admin && !req.user.is_imc_lead) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only the assigned trainer can submit this completion report.' });
    }

    const file = req.file || (req.files && req.files[0]);
    let attachmentId = null;
    if (file) {
      const attRes = await client.query(
        `INSERT INTO attachments (incident_id, uploader_id, stage, original_filename, stored_filename, file_size, mime_type)
         VALUES ($1, $2, 'trainer_report', $3, $4, $5, $6)
         RETURNING id`,
        [id, req.user.id, file.originalname, file.filename || file.key, file.size, file.mimetype]
      );
      attachmentId = attRes.rows[0]?.id;
    }

    let calculatedMinutes = durationMinutes ? parseInt(durationMinutes, 10) : null;
    if (!calculatedMinutes && durationHours) {
      calculatedMinutes = Math.round(parseFloat(durationHours) * 60);
    }

    // Update assignment to completed
    await client.query(
      `UPDATE incident_trainers
       SET status = 'completed', conducted_at = $1, duration_minutes = $2,
           methodology = $3, trainer_report_text = $4,
           trainer_attachment_id = COALESCE($5, trainer_attachment_id),
           updated_at = NOW()
       WHERE id = $6`,
      [
        conductedAt || completionDate || new Date(),
        calculatedMinutes,
        methodology || 'Practical demonstration and protocol review',
        reportContent,
        attachmentId,
        assignmentId
      ]
    );

    // Update incident status to pending_imc_training_review
    await client.query(
      `UPDATE incidents
       SET status = 'pending_imc_training_review', updated_at = NOW()
       WHERE id = $1`,
      [id]
    );

    await client.query('COMMIT');

    // Notify IMC Convenor
    const imcMembers = await query("SELECT id FROM users WHERE role = 'imc' OR is_imc_lead = TRUE");
    for (const m of imcMembers.rows) {
      await createNotification(
        m.id,
        id,
        'Training Report Submitted',
        `Trainer ${req.user.full_name} has submitted the completion report for incident ${incident.reference_id}. Quality review required.`,
        'trainer_report_submitted'
      );
    }

    await auditLog(req.user.id, 'TRAINER_REPORT_SUBMITTED', id, {
      trainerName: req.user.full_name,
      assignmentId
    }, req.ip);

    if (req.io) {
      req.io.emit('incident_updated', { id, status: 'pending_imc_training_review' });
    }

    res.json({
      success: true,
      message: 'Training completion report and evidence submitted successfully. Awaiting IMC verification.'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[POST /incidents/:id/trainers/submit-report] error:', error);
    res.status(500).json({ error: error.message || 'Failed to submit trainer report.' });
  } finally {
    client.release();
  }
};

// =============================================
// IMC VERIFIES TRAINING & FORWARDS TO MANAGEMENT
// =============================================
exports.imcVerifyTraining = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const { assignmentId, action, reviewNotes } = req.body; // action: 'VERIFY' | 'REWORK'

    const assignRes = await client.query(
      `SELECT * FROM incident_trainers WHERE id = $1 AND incident_id = $2`,
      [assignmentId, id]
    );
    if (!assignRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Training assignment not found.' });
    }
    const assignment = assignRes.rows[0];

    const incRes = await client.query('SELECT reference_id FROM incidents WHERE id = $1', [id]);
    const refId = incRes.rows[0]?.reference_id || 'Incident';

    if (action === 'REWORK') {
      await client.query(
        `UPDATE incident_trainers
         SET status = 'rework_requested', imc_review_notes = $1, updated_at = NOW()
         WHERE id = $2`,
        [reviewNotes || 'Additional practical session required.', assignmentId]
      );

      await client.query(
        `UPDATE incidents
         SET status = 'training_in_progress', updated_at = NOW()
         WHERE id = $1`,
        [id]
      );

      await client.query('COMMIT');

      await createNotification(
        assignment.trainer_id,
        id,
        'Training Rework Requested',
        `IMC Convenor requested further training review for incident ${refId}: "${reviewNotes || 'Please conduct follow-up demonstration'}".`,
        'training_assigned'
      );

      await auditLog(req.user.id, 'IMC_TRAINING_REWORK_REQUESTED', id, { assignmentId, reviewNotes }, req.ip);

      if (req.io) {
        req.io.emit('incident_updated', { id, status: 'training_in_progress' });
      }

      return res.json({ success: true, message: 'Returned to Trainer for follow-up session.' });
    }

    // ACTION === 'VERIFY'
    await client.query(
      `UPDATE incident_trainers
       SET status = 'verified_by_imc', imc_review_notes = $1,
           imc_verified_by = $2, imc_verified_at = NOW(), updated_at = NOW()
       WHERE id = $3`,
      [reviewNotes || 'Training verified and endorsed by IMC.', req.user.id, assignmentId]
    );

    // Forward to Executive Management
    await client.query(
      `UPDATE incidents
       SET status = 'with_head_management', updated_at = NOW()
       WHERE id = $1`,
      [id]
    );

    await client.query('COMMIT');

    // Notify Management
    const mgmtUsers = await query("SELECT id FROM users WHERE role = 'head_management'");
    for (const mgmt of mgmtUsers.rows) {
      await createNotification(
        mgmt.id,
        id,
        'Training Verified — Ready for Closure',
        `Corrective training for incident ${refId} has been completed and verified by IMC. Please perform final review and close the incident.`,
        'management_action'
      );
    }

    await auditLog(req.user.id, 'IMC_TRAINING_VERIFIED', id, {
      assignmentId,
      traineeName: assignment.trainee_name
    }, req.ip);

    if (req.io) {
      req.io.emit('incident_updated', { id, status: 'with_head_management' });
    }

    res.json({
      success: true,
      message: 'Training verified by IMC and forwarded to Executive Management for closure.'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[POST /incidents/:id/trainers/imc-verify] error:', error);
    res.status(500).json({ error: error.message || 'Failed to verify training.' });
  } finally {
    client.release();
  }
};

// =============================================
// MANAGEMENT APPROVES TRAINING & CLOSES INCIDENT
// =============================================
exports.managementCloseTraining = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const { closureNotes } = req.body;

    const incRes = await client.query('SELECT * FROM incidents WHERE id = $1', [id]);
    if (!incRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Incident not found.' });
    }
    const incident = incRes.rows[0];

    // Update training assignment status to closed
    await client.query(
      `UPDATE incident_trainers
       SET status = 'closed', updated_at = NOW()
       WHERE incident_id = $1`,
      [id]
    );

    // Mark responsible employees as completed
    await client.query(
      `UPDATE incident_responsible_employees
       SET training_completed = TRUE, training_verified_by = $1, training_verified_at = NOW()
       WHERE incident_id = $2`,
      [req.user.id, id]
    );

    // Close incident
    await client.query(
      `UPDATE incidents
       SET status = 'closed', management_notes = COALESCE($1, management_notes),
           resolved_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [closureNotes ? `Training confirmed and closed: ${closureNotes.trim()}` : null, id]
    );

    await client.query('COMMIT');

    // Send notifications to reporter and staff
    await createNotification(
      incident.reporter_id,
      id,
      'Incident Concluded & Closed',
      `Corrective training was successfully delivered and incident ${incident.reference_id} is officially closed.`,
      'incident_closed'
    );

    const imcMembers = await query("SELECT id FROM users WHERE role = 'imc' OR is_imc_lead = TRUE");
    for (const m of imcMembers.rows) {
      await createNotification(
        m.id,
        id,
        'Incident Closed by Management',
        `Management confirmed training completion and officially closed incident ${incident.reference_id}.`,
        'incident_closed'
      );
    }

    await auditLog(req.user.id, 'MANAGEMENT_TRAINING_CLOSED', id, {
      closureNotes
    }, req.ip);

    if (req.io) {
      req.io.emit('incident_updated', { id, status: 'closed' });
    }

    res.json({
      success: true,
      message: 'Management has confirmed training completion. Incident is officially CLOSED.'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[POST /incidents/:id/trainers/management-close] error:', error);
    res.status(500).json({ error: error.message || 'Failed to close incident.' });
  } finally {
    client.release();
  }
};

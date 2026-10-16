const { query, getClient } = require('../config/database');
const { auditLog } = require('../middleware/auth');
const { createNotification } = require('../utils/notifications');
const { sendEmail } = require('../utils/emailService');
const { generateIncidentQrCode, getIncidentUrl } = require('../utils/qrCodeService');
const { buildTrainerAppointmentLetterData, formatDate } = require('../utils/letterTemplates');

// =============================================
// GET PERSONAL TRAINER ASSIGNMENTS
// =============================================
exports.getMyTrainingAssignments = async (req, res) => {
  try {
    const result = await query(
      `SELECT t.*,
              i.reference_id,
              i.status as incident_status,
              i.description as incident_description,
              i.incident_date,
              i.severity as incident_severity,
              u_assign.full_name as assigned_by_name
       FROM incident_trainers t
       JOIN incidents i ON i.id = t.incident_id
       LEFT JOIN users u_assign ON u_assign.id = t.assigned_by
       WHERE t.trainer_id = $1
       ORDER BY t.created_at DESC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('[GET /trainers/my-assignments] error:', error);
    res.status(500).json({ error: 'Failed to fetch personal trainer assignments.' });
  }
};

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
              att.file_size as report_file_size,
              l.reference_number as letter_reference_number,
              l.letter_date as letter_date,
              l.subject as letter_subject,
              l.salutation as letter_salutation,
              l.body_text as letter_body_text,
              l.qr_code_url as letter_qr_code_url,
              l.cc_recipients as letter_cc_recipients
       FROM incident_trainers t
       LEFT JOIN users u_trainer ON u_trainer.id = t.trainer_id
       LEFT JOIN users u_assign ON u_assign.id = t.assigned_by
       LEFT JOIN users u_verify ON u_verify.id = t.imc_verified_by
       LEFT JOIN attachments att ON att.id = t.trainer_attachment_id
       LEFT JOIN incident_letters l ON l.id = t.appointment_letter_id
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
      'SELECT id, employee_id, full_name, email, department, designation FROM users WHERE id::text = $1 OR employee_id = $1',
      [trainerIdInput]
    );
    if (!trainerUserRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Selected trainer not found in staff directory.' });
    }
    const trainerUser = trainerUserRes.rows[0];
    const trainerId = trainerUser.id;

    // Gather trainees roster for the letter
    const traineeIdList = Array.isArray(req.body.traineeIds) && req.body.traineeIds.length > 0
      ? req.body.traineeIds
      : (traineeEmployeeId ? [traineeEmployeeId] : []);

    let traineesRoster = [];
    if (traineeIdList.length > 0) {
      const traineesDb = await client.query(
        `SELECT u.id, u.employee_id, u.full_name as name, u.department, u.designation 
         FROM users u
         WHERE u.id::text = ANY($1::text[]) OR u.employee_id = ANY($1::text[])`,
        [traineeIdList]
      );
      traineesRoster = traineesDb.rows;
    }
    if (traineesRoster.length === 0 && traineeName) {
      traineesRoster = [{
        name: traineeName,
        department: traineeDepartment || '',
        designation: traineeDesignation || ''
      }];
    }

    // Calculate sequential trainer letter number for the current year
    const currentYear = new Date().getFullYear();
    const countRes = await client.query(
      `SELECT COUNT(*) FROM incident_letters WHERE template_type LIKE '%trainer%' AND EXTRACT(YEAR FROM letter_date) = $1`,
      [currentYear]
    );
    const seq = String(parseInt(countRes.rows[0]?.count || '0', 10) + 1).padStart(3, '0');

    // Generate letter data & verified QR code
    const letterData = buildTrainerAppointmentLetterData({
      trainer: trainerUser,
      incident,
      trainingTopic,
      trainingInstructions,
      targetDate,
      trainees: traineesRoster,
      yearSeq: seq
    });

    const qrCodeUrl = await generateIncidentQrCode(id);

    // Insert official appointment letter directly with status 'dispatched'
    const letterRes = await client.query(
      `INSERT INTO incident_letters (
         incident_id, employee_id, recipient_name, recipient_emp_no,
         recipient_department, recipient_designation, recipient_email,
         template_type, reference_number, letter_date, subject,
         salutation, body_text, cc_recipients, qr_code_url,
         status, drafted_by, drafted_at, approved_by, approved_at,
         dispatched_at, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_DATE, $10, $11, $12, $13, $14, 'dispatched', $15, NOW(), $15, NOW(), NOW(), NOW(), NOW())
       RETURNING *`,
      [
        id,
        trainerUser.employee_id || String(trainerUser.id),
        letterData.recipientName,
        letterData.recipientEmpNo,
        letterData.recipientDepartment,
        letterData.recipientDesignation,
        letterData.recipientEmail,
        'trainer_appointment_letter',
        letterData.referenceNumber,
        letterData.subject,
        letterData.salutation,
        letterData.bodyText,
        JSON.stringify(letterData.ccRecipients),
        qrCodeUrl,
        req.user.id
      ]
    );

    const appointmentLetter = letterRes.rows[0];

    // Insert assignment linked to the appointment letter
    const insertRes = await client.query(
      `INSERT INTO incident_trainers (
         incident_id, trainee_employee_id, trainee_name, trainee_department,
         trainee_designation, trainer_id, assigned_by, training_topic,
         training_instructions, target_date, status, assigned_at,
         appointment_letter_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'assigned', NOW(), $11)
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
        targetDate || null,
        appointmentLetter.id
      ]
    );

    // Flag trainees in incident_responsible_employees
    for (const tId of traineeIdList) {
      await client.query(
        `UPDATE incident_responsible_employees
         SET needs_training = TRUE
         WHERE incident_id = $1 AND employee_id = $2`,
        [id, tId]
      );
    }

    // Update incident status:
    // If pending_trainer_assignment, advance to training_in_progress
    // If pending_letter_generation or pending_management_letter_approval, preserve status so letter drafting can finish!
    let nextIncidentStatus = incident.status;
    if (incident.status === 'pending_trainer_assignment') {
      nextIncidentStatus = 'training_in_progress';
      await client.query(
        `UPDATE incidents
         SET status = 'training_in_progress', needs_training = TRUE, updated_at = NOW()
         WHERE id = $1`,
        [id]
      );
    } else {
      await client.query(
        `UPDATE incidents
         SET needs_training = TRUE, updated_at = NOW()
         WHERE id = $1`,
        [id]
      );
    }

    await client.query('COMMIT');

    // Notify assigned trainer
    await createNotification(
      trainerId,
      id,
      'Trainer Appointment Letter Dispatched',
      `You have been appointed as the Designated Trainer for incident ${incident.reference_id} regarding: "${trainingTopic}". Formal Appointment Letter ${letterData.referenceNumber} has been issued.`,
      'training_assigned'
    );

    const incidentUrl = getIncidentUrl(id);
    const trainerEmailHtml = `
      <div style="max-width: 680px; margin: 0 auto; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #ffffff; color: #1e293b;">
        <div style="background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%); color: #ffffff; padding: 24px; text-align: center;">
          <h1 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">JAIPRAKASH HOSPITALS & RESEARCH CENTRE</h1>
          <p style="margin: 4px 0 0; font-size: 12px; color: #93c5fd; text-transform: uppercase; letter-spacing: 1px;">Incident Management Committee — Quality & Patient Safety</p>
        </div>
        <div style="padding: 28px; line-height: 1.6;">
          <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #f1f5f9; padding-bottom: 12px; margin-bottom: 20px;">
            <div><strong>Ref No:</strong> ${letterData.referenceNumber}</div>
            <div style="text-align: right;"><strong>Date:</strong> ${formatDate(letterData.letterDate)}</div>
          </div>
          <div style="margin-bottom: 16px;">
            <div><strong>To:</strong></div>
            <div style="font-size: 15px; font-weight: 600; color: #1e3a8a;">${trainerUser.full_name}</div>
            <div style="font-size: 13px; color: #64748b;">${trainerUser.designation || 'Designated Trainer'} — ${trainerUser.department || 'Hospital Operations'}</div>
          </div>
          <div style="font-weight: 700; margin-bottom: 16px; color: #0f172a;">Subject: ${letterData.subject}</div>
          <p>${letterData.salutation}</p>
          <div style="white-space: pre-wrap; font-size: 13.5px; color: #334155; margin-bottom: 24px;">${letterData.bodyText}</div>
          <div style="background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 16px; margin-bottom: 20px; text-align: center;">
            <div style="font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 8px;">VERIFIED APPOINTMENT RECORD</div>
            <img src="${qrCodeUrl}" alt="Verification QR Code" style="width: 110px; height: 110px; border: 1px solid #e2e8f0; padding: 4px; border-radius: 6px; background: #ffffff;" />
            <div style="font-size: 11px; color: #64748b; margin-top: 6px;">Scan to view verified incident file in JPHRC IMS</div>
          </div>
          <div style="text-align: center; margin-top: 24px;">
            <a href="${incidentUrl}" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 10px 24px; border-radius: 6px; font-size: 13px; font-weight: 600;">Access Training Record on IMS</a>
          </div>
        </div>
      </div>
    `;

    if (trainerUser.email) {
      sendEmail(trainerUser.email, {
        subject: `${letterData.subject} - Ref: ${letterData.referenceNumber}`,
        text: `${letterData.subject}\n\nRef: ${letterData.referenceNumber}\nDate: ${formatDate(letterData.letterDate)}\n\nTo:\n${trainerUser.full_name} (${trainerUser.employee_id || ''})\n${trainerUser.department || ''} - ${trainerUser.designation || ''}\n\n${letterData.bodyText}\n\nVerify incident at: ${incidentUrl}`,
        html: trainerEmailHtml
      }).catch(err => console.error('[Trainer Email] failed:', err));
    }

    // CC recipients
    for (const cc of letterData.ccRecipients) {
      if (cc.email) {
        sendEmail(cc.email, {
          subject: `[CC] ${letterData.subject} - Ref: ${letterData.referenceNumber}`,
          text: `[CARBON COPY]\n\n${letterData.subject}\n\nRef: ${letterData.referenceNumber}\n\n${letterData.bodyText}\n\nIncident URL: ${incidentUrl}`,
          html: trainerEmailHtml
        }).catch(err => console.error('[Trainer CC Email] failed:', err));
      }
    }

    await auditLog(req.user.id, 'TRAINER_ASSIGNED', id, {
      trainerName: trainerUser.full_name,
      traineeName,
      trainingTopic,
      letterRef: letterData.referenceNumber
    }, req.ip);

    if (req.io) {
      req.io.emit('incident_updated', { id, status: nextIncidentStatus });
    }

    res.json({
      success: true,
      message: `Trainer ${trainerUser.full_name} assigned successfully. Appointment letter ${letterData.referenceNumber} dispatched.`,
      assignment: {
        ...insertRes.rows[0],
        appointment_letter: appointmentLetter
      }
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
      summary,
      venue,
      preAssessment,
      postAssessment,
      capaRecommendations
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

    const fullReportSummary = [
      venue ? `[Venue / Location: ${venue}]` : null,
      preAssessment ? `[Pre-Training Evaluation: ${preAssessment}]` : null,
      postAssessment ? `[Post-Training Competency: ${postAssessment}]` : null,
      reportContent ? `\nSummary of Session & Findings:\n${reportContent}` : null,
      capaRecommendations ? `\nCorrective & Preventive Action (CAPA) Recommendation:\n${capaRecommendations}` : null
    ].filter(Boolean).join('\n');

    // Update assignment to completed
    await client.query(
      `UPDATE incident_trainers
       SET status = 'completed', conducted_at = $1, duration_minutes = $2,
           methodology = $3, trainer_report_text = $4,
           venue = $5, pre_assessment = $6, post_assessment = $7, capa_recommendations = $8,
           trainer_attachment_id = COALESCE($9, trainer_attachment_id),
           updated_at = NOW()
       WHERE id = $10`,
      [
        conductedAt || completionDate || new Date(),
        calculatedMinutes,
        methodology || 'Practical demonstration and protocol review',
        fullReportSummary,
        venue || null,
        preAssessment || null,
        postAssessment || null,
        capaRecommendations || null,
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

      await client.query(
        `INSERT INTO feedbacks (incident_id, author_id, role, feedback_text, stage)
         VALUES ($1, $2, 'imc', $3, 'training_rework_request')`,
        [id, req.user.id, `IMC Training Rework Request:\n${(reviewNotes || 'Additional practical session required.').trim()}`]
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

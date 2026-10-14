const { query, getClient } = require('../config/database');
const { auditLog } = require('../middleware/auth');
const { createNotification } = require('../utils/notifications');
const { sendEmail } = require('../utils/emailService');
const { generateIncidentQrCode, getIncidentUrl } = require('../utils/qrCodeService');
const { buildInitialLetterData, TEMPLATE_DEFINITIONS, formatDate } = require('../utils/letterTemplates');
const { numberToWords } = require('../utils/numberToWords');

/**
 * Helper to normalize template keys between frontend and database check constraints
 */
function normalizeTemplateType(t) {
  if (!t) return 'warning_letter';
  const str = String(t).toLowerCase().trim();
  const map = {
    'warning': 'warning_letter',
    'warning_letter': 'warning_letter',
    'advisory': 'advisory_letter',
    'advisory_letter': 'advisory_letter',
    'suggestion': 'suggestion_letter',
    'suggestion_letter': 'suggestion_letter',
    'warning_penalty': 'warning_penalty_letter',
    'warning_penalty_letter': 'warning_penalty_letter',
    'penalty': 'warning_penalty_letter',
    'penalty_letter': 'warning_penalty_letter',
    'salary_deduction': 'warning_penalty_letter',
    'salary_deduction_letter': 'warning_penalty_letter',
    'training': 'training_letter',
    'training_letter': 'training_letter',
    'custom': 'custom_letter',
    'custom_letter': 'custom_letter',
    'counselling': 'training_letter',
    'counselling_letter': 'training_letter',
  };
  return map[str] || (str.endsWith('_letter') ? str : `${str}_letter`);
}

// =============================================
// GET LETTERS FOR AN INCIDENT
// =============================================
exports.getIncidentLetters = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT l.*,
              l.recipient_name as employee_name,
              l.recipient_emp_no as employee_code,
              l.recipient_department as employee_department,
              l.recipient_designation as employee_designation,
              l.reference_number as ref_number,
              l.template_type as letter_type,
              l.body_text as body_content,
              l.cc_recipients as cc_list,
              l.qr_code_url as qr_code_data,
              u_draft.full_name as drafted_by_name,
              u_app.full_name as approved_by_name
       FROM incident_letters l
       LEFT JOIN users u_draft ON u_draft.id = l.drafted_by
       LEFT JOIN users u_app ON u_app.id = l.approved_by
       WHERE l.incident_id = $1 
         AND l.template_type NOT IN ('trainer_appointment', 'trainer_appointment_letter')
       ORDER BY l.created_at ASC`,
      [id]
    );

    // Ensure qr_code_url is fresh/valid for each letter
    const lettersWithQr = await Promise.all(result.rows.map(async (letter) => {
      if (!letter.qr_code_url) {
        letter.qr_code_url = await generateIncidentQrCode(id);
      }
      letter.qr_code_data = letter.qr_code_url;
      return letter;
    }));

    res.json(lettersWithQr);
  } catch (error) {
    console.error('[GET /incidents/:id/letters] error:', error);
    res.status(500).json({ error: 'Failed to fetch incident letters.' });
  }
};

// =============================================
// GET DEFAULT TEMPLATE PRE-FILL DATA
// =============================================
exports.getLetterTemplateDefaults = async (req, res) => {
  try {
    const { id } = req.params;
    const employeeId = req.query.employeeId;
    const rawType = req.query.templateType || req.query.letterType;

    if (!employeeId || !rawType) {
      return res.status(400).json({ error: 'employeeId and templateType (or letterType) are required.' });
    }

    const templateType = normalizeTemplateType(rawType);

    // Get incident details
    const incRes = await query('SELECT * FROM incidents WHERE id = $1', [id]);
    if (!incRes.rows.length) return res.status(404).json({ error: 'Incident not found.' });
    const incident = incRes.rows[0];

    // Find employee in master_employees or users
    let emp = null;
    const mRes = await query(
      'SELECT id, employee_id, name, email, phone, department, designation FROM master_employees WHERE id::text = $1 OR employee_id = $1',
      [employeeId]
    );
    if (mRes.rows.length) {
      emp = mRes.rows[0];
    } else {
      const uRes = await query(
        'SELECT id, employee_id, full_name as name, email, phone, department, designation FROM users WHERE id::text = $1 OR employee_id = $1',
        [employeeId]
      );
      if (uRes.rows.length) emp = uRes.rows[0];
    }

    if (!emp) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    // Calculate sequential letter number for current year
    const currentYear = new Date().getFullYear();
    const countRes = await query(
      `SELECT COUNT(*) FROM incident_letters WHERE EXTRACT(YEAR FROM letter_date) = $1`,
      [currentYear]
    );
    const seq = String(parseInt(countRes.rows[0]?.count || '0', 10) + 1).padStart(3, '0');

    // If financial penalty, use penalty_amount from query if provided, or from employee's specific record, or incident
    let empPenaltyAmount = null;
    if (emp) {
      const respEmp = await query(
        `SELECT penalty_amount FROM incident_responsible_employees WHERE incident_id = $1 AND employee_id = $2`,
        [id, emp.id]
      );
      if (respEmp.rows.length && respEmp.rows[0].penalty_amount) {
        empPenaltyAmount = respEmp.rows[0].penalty_amount;
      }
    }

    const penaltyAmount = (req.query.penaltyAmount !== undefined && req.query.penaltyAmount !== '')
      ? req.query.penaltyAmount
      : (empPenaltyAmount || incident.penalty_amount || null);

    const initialData = buildInitialLetterData({
      templateType,
      employee: emp,
      incident,
      yearSeq: seq,
      penaltyAmount
    });

    const qrCodeUrl = await generateIncidentQrCode(id);

    res.json({
      ...initialData,
      qrCodeUrl,
      qrCodeData: qrCodeUrl,
      incidentUrl: getIncidentUrl(id)
    });
  } catch (error) {
    console.error('[GET /incidents/:id/letters/defaults] error:', error);
    res.status(500).json({ error: 'Failed to generate letter defaults.' });
  }
};

// =============================================
// DRAFT / SAVE A LETTER (IMC)
// =============================================
exports.saveLetterDraft = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      letterId,
      employeeId,
      recipientName,
      recipientEmpNo,
      recipientDepartment,
      recipientDesignation,
      recipientEmail,
      templateType,
      letterType,
      referenceNumber,
      refNumber,
      letterDate,
      subject,
      salutation,
      bodyText,
      bodyContent,
      penaltyAmount,
      penaltyAmountWords,
      ccRecipients,
      ccList
    } = req.body;

    const finalTemplateType = normalizeTemplateType(templateType || letterType);
    const finalRefNumber = referenceNumber || refNumber || `JPHRC/IMC/${new Date().getFullYear()}/001`;
    const finalBodyText = bodyText || bodyContent || '';
    const finalCcRecipients = ccRecipients || ccList || [];

    if (!employeeId || !finalBodyText) {
      return res.status(400).json({ error: 'Please provide employeeId and letter body content.' });
    }

    let finalEmpName = recipientName;
    let finalEmpNo = recipientEmpNo;
    let finalEmpDept = recipientDepartment;
    let finalEmpDesig = recipientDesignation;
    let finalEmpEmail = recipientEmail;

    if (!finalEmpName) {
      const mRes = await query(
        'SELECT id, employee_id, name, email, department, designation FROM master_employees WHERE id::text = $1 OR employee_id = $1',
        [employeeId]
      );
      if (mRes.rows.length) {
        finalEmpName = mRes.rows[0].name;
        finalEmpNo = mRes.rows[0].employee_id;
        finalEmpDept = mRes.rows[0].department;
        finalEmpDesig = mRes.rows[0].designation;
        finalEmpEmail = mRes.rows[0].email;
      } else {
        const uRes = await query(
          'SELECT id, employee_id, full_name, email, department, designation FROM users WHERE id::text = $1 OR employee_id = $1',
          [employeeId]
        );
        if (uRes.rows.length) {
          finalEmpName = uRes.rows[0].full_name;
          finalEmpNo = uRes.rows[0].employee_id;
          finalEmpDept = uRes.rows[0].department;
          finalEmpDesig = uRes.rows[0].designation;
          finalEmpEmail = uRes.rows[0].email;
        }
      }
    }

    if (!finalEmpName) {
      finalEmpName = 'Staff Member';
    }

    const qrCodeUrl = await generateIncidentQrCode(id);
    const pAmt = (penaltyAmount !== undefined && penaltyAmount !== null && penaltyAmount !== '')
      ? Number(penaltyAmount)
      : null;
    const finalPenaltyWords = penaltyAmountWords || (pAmt ? numberToWords(pAmt) : null);

    let savedLetter = null;
    if (letterId) {
      // Update existing draft
      const updateRes = await query(
        `UPDATE incident_letters
         SET template_type = $1, reference_number = $2, letter_date = $3,
             subject = $4, salutation = $5, body_text = $6, penalty_amount = $7,
             penalty_amount_words = $8, cc_recipients = $9, qr_code_url = $10,
             status = 'drafted', updated_at = NOW()
         WHERE id = $11 AND incident_id = $12
         RETURNING *`,
        [
          finalTemplateType,
          finalRefNumber,
          letterDate || new Date(),
          subject || 'Official Communication Notice',
          salutation || 'Dear Staff,',
          finalBodyText,
          pAmt,
          finalPenaltyWords,
          JSON.stringify(finalCcRecipients),
          qrCodeUrl,
          letterId,
          id
        ]
      );
      savedLetter = updateRes.rows[0];
    } else {
      // Insert new draft
      const insertRes = await query(
        `INSERT INTO incident_letters (
           incident_id, employee_id, recipient_name, recipient_emp_no,
           recipient_department, recipient_designation, recipient_email,
           template_type, reference_number, letter_date, subject,
           salutation, body_text, penalty_amount, penalty_amount_words,
           cc_recipients, qr_code_url, status, drafted_by, drafted_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'drafted', $18, NOW())
         RETURNING *`,
        [
          id,
          employeeId,
          finalEmpName,
          finalEmpNo || null,
          finalEmpDept || null,
          finalEmpDesig || null,
          finalEmpEmail || null,
          finalTemplateType,
          finalRefNumber,
          letterDate || new Date(),
          subject || 'Official Communication Notice',
          salutation || 'Dear Staff,',
          finalBodyText,
          pAmt,
          finalPenaltyWords,
          JSON.stringify(finalCcRecipients),
          qrCodeUrl,
          req.user.id
        ]
      );
      savedLetter = insertRes.rows[0];
    }

    await auditLog(req.user.id, 'LETTER_DRAFTED', id, {
      letterId: savedLetter.id,
      templateType,
      recipientName
    }, req.ip);

    if (req.io) {
      req.io.emit('incident_updated', { id });
    }

    res.json({
      success: true,
      message: 'Letter saved successfully.',
      letter: savedLetter
    });
  } catch (error) {
    console.error('[POST /incidents/:id/letters/draft] error:', error);
    res.status(500).json({ error: error.message || 'Failed to save letter draft.' });
  }
};

// =============================================
// DELETE A LETTER DRAFT (IMC)
// =============================================
exports.deleteLetterDraft = async (req, res) => {
  try {
    const { id, letterId } = req.params;
    const delRes = await query(
      `DELETE FROM incident_letters WHERE id = $1 AND incident_id = $2 AND status = 'drafted' RETURNING id`,
      [letterId, id]
    );
    if (!delRes.rows.length) {
      return res.status(400).json({ error: 'Letter could not be deleted or is already submitted.' });
    }

    if (req.io) {
      req.io.emit('incident_updated', { id });
    }

    res.json({ success: true, message: 'Draft letter deleted.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete draft letter.' });
  }
};

// =============================================
// SUBMIT DRAFTED LETTERS TO MANAGEMENT (IMC)
// =============================================
exports.submitLettersToManagement = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { id } = req.params;

    // Check that at least one letter has been drafted
    const lettersRes = await client.query(
      `SELECT * FROM incident_letters 
       WHERE incident_id = $1 AND template_type NOT IN ('trainer_appointment', 'trainer_appointment_letter')`,
      [id]
    );
    if (!lettersRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Please draft at least one letter before submitting to Management.' });
    }

    // Mark all employee letters as submitted_to_management
    await client.query(
      `UPDATE incident_letters
       SET status = 'submitted_to_management', updated_at = NOW()
       WHERE incident_id = $1 AND template_type NOT IN ('trainer_appointment', 'trainer_appointment_letter')`,
      [id]
    );

    // Update incident status
    await client.query(
      `UPDATE incidents
       SET status = 'pending_management_letter_approval', updated_at = NOW()
       WHERE id = $1`,
      [id]
    );

    await client.query('COMMIT');

    const incRes = await query('SELECT reference_id FROM incidents WHERE id = $1', [id]);
    const refId = incRes.rows[0]?.reference_id || 'Incident';

    // Notify Management
    const mgmtUsers = await query("SELECT id, email, full_name FROM users WHERE role = 'head_management'");
    for (const mgmt of mgmtUsers.rows) {
      await createNotification(
        mgmt.id,
        id,
        'Formal Letters Awaiting Approval',
        `IMC has submitted ${lettersRes.rows.length} letter(s) for incident ${refId}. Your final approval is required for dispatch.`,
        'management_action'
      );
    }

    await auditLog(req.user.id, 'LETTERS_SUBMITTED_TO_MANAGEMENT', id, {
      letterCount: lettersRes.rows.length
    }, req.ip);

    if (req.io) {
      req.io.emit('incident_updated', { id, status: 'pending_management_letter_approval' });
    }

    res.json({
      success: true,
      message: `Successfully forwarded ${lettersRes.rows.length} letter(s) to Management for approval.`
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[POST /incidents/:id/letters/submit-to-management] error:', error);
    res.status(500).json({ error: error.message || 'Failed to submit letters to Management.' });
  } finally {
    client.release();
  }
};

// =============================================
// MANAGEMENT DECISION ON LETTERS (APPROVE & DISPATCH / REVISE)
// =============================================
exports.submitManagementLetterDecision = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const { action, revisionNotes } = req.body; // action: 'APPROVE' | 'REJECT_REVISION'

    const incRes = await client.query('SELECT * FROM incidents WHERE id = $1', [id]);
    if (!incRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Incident not found.' });
    }
    const incident = incRes.rows[0];

    const lettersRes = await client.query(
      `SELECT * FROM incident_letters 
       WHERE incident_id = $1 
         AND template_type NOT IN ('trainer_appointment', 'trainer_appointment_letter')`,
      [id]
    );
    if (!lettersRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No employee disciplinary letters found to process.' });
    }

    if (action === 'REJECT_REVISION') {
      if (!revisionNotes || !revisionNotes.trim()) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Please provide revision feedback for IMC.' });
      }

      await client.query(
        `UPDATE incident_letters
         SET status = 'rejected', revision_notes = $1, updated_at = NOW()
         WHERE incident_id = $2
           AND template_type NOT IN ('trainer_appointment', 'trainer_appointment_letter')`,
        [revisionNotes.trim(), id]
      );

      await client.query(
        `UPDATE incidents
         SET status = 'pending_letter_generation', updated_at = NOW()
         WHERE id = $1`,
        [id]
      );

      await client.query('COMMIT');

      // Notify IMC
      const imcUsers = await query("SELECT id FROM users WHERE role = 'imc' OR is_imc_lead = TRUE");
      for (const imc of imcUsers.rows) {
        await createNotification(
          imc.id,
          id,
          'Letters Returned for Revision',
          `Management requested letter revisions for incident ${incident.reference_id}: "${revisionNotes.trim()}".`,
          'management_action'
        );
      }

      await auditLog(req.user.id, 'LETTERS_REJECTED_FOR_REVISION', id, { revisionNotes }, req.ip);

      if (req.io) {
        req.io.emit('incident_updated', { id, status: 'pending_letter_generation' });
      }

      return res.json({ success: true, message: 'Returned to IMC for letter revision.' });
    }

    // ACTION === 'APPROVE' -> DISPATCH LETTERS & CLOSE INCIDENT OR ADVANCE TO TRAINING
    await client.query(
      `UPDATE incident_letters
       SET status = 'approved', approved_by = $1, approved_at = NOW(),
           dispatched_at = NOW(), updated_at = NOW()
       WHERE incident_id = $2
         AND template_type NOT IN ('trainer_appointment', 'trainer_appointment_letter')`,
      [req.user.id, id]
    );

    // Check if training remains to be scheduled or completed for involved staff
    const trainingCheck = await client.query(
      `SELECT COUNT(*) FROM incident_responsible_employees WHERE incident_id = $1 AND needs_training = TRUE AND (training_completed IS NULL OR training_completed = FALSE)`,
      [id]
    );
    const incNeedsTrainingRes = await client.query(
      `SELECT needs_training FROM incidents WHERE id = $1`,
      [id]
    );
    const hasRemainingTraining = (parseInt(trainingCheck.rows[0]?.count || '0', 10) > 0) || Boolean(incNeedsTrainingRes.rows[0]?.needs_training);

    let nextStatus = 'closed';
    if (hasRemainingTraining) {
      // Check if trainer is already assigned
      const trainerAssignRes = await client.query(
        `SELECT status FROM incident_trainers WHERE incident_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [id]
      );
      if (trainerAssignRes.rows.length > 0) {
        const tStatus = trainerAssignRes.rows[0].status;
        if (tStatus === 'completed') {
          nextStatus = 'pending_imc_training_review';
        } else if (tStatus === 'verified' || tStatus === 'verified_by_imc') {
          nextStatus = 'with_head_management';
        } else {
          nextStatus = 'training_in_progress';
        }
      } else {
        nextStatus = 'pending_trainer_assignment';
      }
    }

    const resolvedAt = (nextStatus === 'closed') ? new Date() : null;
    await client.query(
      `UPDATE incidents
       SET status = $1, resolved_at = $2, updated_at = NOW()
       WHERE id = $3`,
      [nextStatus, resolvedAt, id]
    );

    await client.query('COMMIT');

    // DISPATCH EMAILS IN BACKGROUND (Multi-recipient delivery to employee & CCs)
    const incidentUrl = getIncidentUrl(id);
    for (const letter of lettersRes.rows) {
      const qrCodeDataUrl = letter.qr_code_url || await generateIncidentQrCode(id);
      const emailHtml = buildLetterEmailHtml(letter, incident, incidentUrl, qrCodeDataUrl);

      // 1. Send to Recipient Employee
      if (letter.recipient_email) {
        sendEmail(letter.recipient_email, {
          subject: `${letter.subject} - Ref: ${letter.reference_number}`,
          html: emailHtml,
          text: `${letter.subject}\n\nRef: ${letter.reference_number}\nDate: ${formatDate(letter.letter_date)}\n\nTo:\n${letter.recipient_name} (${letter.recipient_emp_no || ''})\n${letter.recipient_department} - ${letter.recipient_designation}\n\n${letter.body_text}\n\nVerify incident at: ${incidentUrl}`
        }).catch(err => console.error('[Letter Dispatch] Email to employee failed:', err));
      }

      // 2. Send to CC Recipients
      const ccList = Array.isArray(letter.cc_recipients) ? letter.cc_recipients : [];
      for (const cc of ccList) {
        if (cc.email) {
          sendEmail(cc.email, {
            subject: `[CC] ${letter.subject} - Ref: ${letter.reference_number}`,
            html: emailHtml,
            text: `[CARBON COPY]\n\n${letter.subject}\n\nRef: ${letter.reference_number}\nDate: ${formatDate(letter.letter_date)}\n\nTo: ${letter.recipient_name}\n\n${letter.body_text}\n\nIncident URL: ${incidentUrl}`
          }).catch(err => console.error('[Letter Dispatch] CC email failed:', err));
        }
      }
    }

    // Notifications
    const imcMembers = await query("SELECT id FROM users WHERE role = 'imc' OR is_imc_lead = TRUE");
    if (hasRemainingTraining) {
      for (const m of imcMembers.rows) {
        await createNotification(
          m.id,
          id,
          'Letters Dispatched — Proceed with Training',
          `Management approved and dispatched ${lettersRes.rows.length} disciplinary letter(s) for incident ${incident.reference_id}. File remains active for Mandatory Training.`,
          'management_action'
        );
      }
    } else {
      await createNotification(
        incident.reporter_id,
        id,
        'Incident Concluded & Closed',
        `Management has approved formal directives and officially closed incident ${incident.reference_id}.`,
        'incident_closed'
      );

      for (const m of imcMembers.rows) {
        await createNotification(
          m.id,
          id,
          'Incident Closed by Management',
          `Management has approved and dispatched letters for incident ${incident.reference_id}. File is officially closed.`,
          'incident_closed'
        );
      }
    }

    await auditLog(req.user.id, hasRemainingTraining ? 'LETTERS_DISPATCHED_TRAINING_ACTIVE' : 'LETTERS_DISPATCHED_AND_CLOSED', id, {
      letterCount: lettersRes.rows.length,
      approver: req.user.full_name,
      nextStatus
    }, req.ip);

    if (req.io) {
      req.io.emit('incident_updated', { id, status: nextStatus });
    }

    res.json({
      success: true,
      message: hasRemainingTraining
        ? `Approved ${lettersRes.rows.length} letter(s). Dispatched to employee(s) and CC recipients. Incident remains ACTIVE for Mandatory Training.`
        : `Approved ${lettersRes.rows.length} letter(s). Dispatched to employee(s) and CC recipients. Incident is officially CLOSED.`
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[POST /incidents/:id/letters/management-decision] error:', error);
    res.status(500).json({ error: error.message || 'Failed to process management letter decision.' });
  } finally {
    client.release();
  }
};

/**
 * Helper to build an official branded HTML email for dispatched letters
 */
function buildLetterEmailHtml(letter, incident, incidentUrl, qrCodeDataUrl) {
  const ccRows = (Array.isArray(letter.cc_recipients) ? letter.cc_recipients : [])
    .map((cc, i) => `<li style="margin-bottom: 4px;">${i + 1}. ${cc.label || cc.name || ''}</li>`)
    .join('');

  return `
    <div style="max-width: 680px; margin: 0 auto; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #ffffff; color: #1e293b; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
      <!-- Hospital Header Banner -->
      <div style="background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%); color: #ffffff; padding: 24px; text-align: center;">
        <h1 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">JAIPRAKASH HOSPITALS & RESEARCH CENTRE</h1>
        <p style="margin: 4px 0 0; font-size: 12px; color: #93c5fd; text-transform: uppercase; letter-spacing: 1px;">Incident Management Committee</p>
      </div>

      <!-- Letterhead Body -->
      <div style="padding: 32px 28px; line-height: 1.6;">
        <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #f1f5f9; padding-bottom: 12px; margin-bottom: 20px;">
          <div><strong>Ref No:</strong> ${letter.reference_number}</div>
          <div style="text-align: right;"><strong>Date:</strong> ${formatDate(letter.letter_date)}</div>
        </div>

        <div style="margin-bottom: 20px; background: #f8fafc; padding: 14px 18px; border-radius: 8px; border-left: 4px solid #3b82f6;">
          <div style="font-weight: 700; font-size: 14px; color: #0f172a;">To,</div>
          <div style="font-size: 14px; font-weight: 600; color: #1e293b;">${letter.recipient_name}</div>
          ${letter.recipient_emp_no ? `<div style="font-size: 12px; color: #475569;">Emp. No.: ${letter.recipient_emp_no}</div>` : ''}
          <div style="font-size: 12px; color: #475569;">Dept.: ${letter.recipient_department || ''}${letter.recipient_designation ? `, ${letter.recipient_designation}` : ''}</div>
        </div>

        <div style="margin-bottom: 16px;">
          <strong style="color: #0f172a; font-size: 15px;">Subject: ${letter.subject}</strong>
        </div>

        <div style="font-weight: 600; margin-bottom: 12px; color: #334155;">
          ${letter.salutation || 'Dear Staff,'}
        </div>

        <div style="font-size: 13.5px; color: #334155; white-space: pre-line; margin-bottom: 24px; text-align: justify;">
${letter.body_text}
        </div>

        <!-- Signature Block -->
        <div style="margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
          <p style="margin: 0; font-weight: 700; color: #0f172a;">By Order of,</p>
          <p style="margin: 2px 0 0; font-size: 13px; color: #475569;">Incident Management Committee & Executive Management</p>
          <p style="margin: 2px 0 0; font-size: 12px; color: #64748b;">Jaiprakash Hospitals & Research Centre</p>
        </div>

        <!-- CC & QR Code Footer -->
        <div style="margin-top: 28px; padding-top: 16px; border-top: 1px dashed #cbd5e1; display: flex; justify-content: space-between; align-items: flex-start; gap: 20px;">
          <div style="flex: 1;">
            <div style="font-weight: 700; font-size: 12px; text-transform: uppercase; color: #475569; margin-bottom: 6px;">CC To:</div>
            <ul style="margin: 0; padding-left: 0; list-style-type: none; font-size: 11px; color: #64748b; line-height: 1.5;">
              ${ccRows}
            </ul>
          </div>
          ${qrCodeDataUrl ? `
            <div style="text-align: center; width: 130px; flex-shrink: 0;">
              <img src="${qrCodeDataUrl}" alt="Incident QR Code" style="width: 100px; height: 100px; border-radius: 6px; border: 1px solid #cbd5e1; padding: 2px; background: #fff;" />
              <div style="font-size: 9px; color: #64748b; margin-top: 4px; line-height: 1.2;">
                Scan to view incident dossier in IMS
              </div>
            </div>
          ` : ''}
        </div>

        <div style="margin-top: 20px; text-align: center; font-size: 11px; color: #94a3b8;">
          <a href="${incidentUrl}" target="_blank" style="color: #2563eb; text-decoration: underline;">Click here to access incident record directly in IMS</a>
        </div>
      </div>
    </div>
  `;
}

const nodemailer = require('nodemailer');
const { query } = require('../config/database');

// ─── Transporter ──────────────────────────────────────────────────────────────
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: { rejectUnauthorized: false },
  });
};

// ─── Base HTML Template ───────────────────────────────────────────────────────
const baseTemplate = (content, title = 'JPHRC Incident Management System') => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0; padding:0; background:#f1f5f9; font-family: 'Segoe UI', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9; padding: 30px 0;">
    <tr>
      <td align="center">
        <table width="620" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:12px; overflow:hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
          <!-- HEADER -->
          <tr>
            <td style="background: linear-gradient(135deg, #064e3b 0%, #065f46 100%); padding: 28px 36px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <p style="margin:0; color:#6ee7b7; font-size:11px; font-weight:600; letter-spacing:2px; text-transform:uppercase;">Jaiprakash Hospital & Research Centre</p>
                    <h1 style="margin:4px 0 0; color:#ffffff; font-size:20px; font-weight:700;">Incident Management System</h1>
                  </td>
                  <td align="right">
                    <div style="background:rgba(255,255,255,0.15); border-radius:8px; padding:8px 12px; display:inline-block;">
                      <span style="color:#a7f3d0; font-size:11px; font-weight:700;">IMS NOTIFICATION</span>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- BODY -->
          <tr>
            <td style="padding: 32px 36px;">
              ${content}
            </td>
          </tr>
          <!-- FOOTER -->
          <tr>
            <td style="background:#f8fafc; border-top:1px solid #e2e8f0; padding: 20px 36px;">
              <p style="margin:0; color:#94a3b8; font-size:12px; line-height:1.6;">
                This is an automated notification from <strong>JPHRC Incident Management System</strong>.<br />
                Do not reply to this email. For assistance, contact <a href="mailto:admin@jaiprakashhospital.com" style="color:#059669; text-decoration:none;">admin@jaiprakashhospital.com</a>
              </p>
              <p style="margin:8px 0 0; color:#cbd5e1; font-size:11px;">
                © ${new Date().getFullYear()} Jaiprakash Hospital & Research Centre. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

// ─── Reusable components ──────────────────────────────────────────────────────
const statusBadge = (status) => {
  const colors = {
    submitted: '#3b82f6', with_hod: '#f59e0b', with_imc: '#8b5cf6',
    with_head_management: '#0ea5e9', resolved: '#10b981',
    redirect_requested: '#f97316', withdrawn: '#6b7280',
    pending_training: '#d97706',
  };
  const bg = colors[status] || '#64748b';
  return `<span style="display:inline-block; background:${bg}; color:#fff; font-size:11px; font-weight:700; padding:3px 10px; border-radius:20px; text-transform:uppercase; letter-spacing:0.5px;">${status.replace(/_/g, ' ')}</span>`;
};

const incidentCard = (referenceId, type, severity, status) => `
<div style="background:#f8fafc; border:1px solid #e2e8f0; border-left:4px solid #059669; border-radius:8px; padding:16px 20px; margin:20px 0;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td>
        <p style="margin:0; color:#94a3b8; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:1px;">Incident Reference</p>
        <p style="margin:4px 0 0; color:#064e3b; font-size:18px; font-weight:800; font-family: monospace;">${referenceId}</p>
      </td>
      <td align="right" valign="top">
        ${statusBadge(status)}
      </td>
    </tr>
    <tr>
      <td colspan="2" style="padding-top:12px; border-top:1px solid #e2e8f0; margin-top:12px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="width:50%; padding-top:12px;">
              <p style="margin:0; color:#94a3b8; font-size:11px;">Type</p>
              <p style="margin:3px 0 0; color:#1e293b; font-size:13px; font-weight:600;">${type}</p>
            </td>
            <td style="width:50%; padding-top:12px;">
              <p style="margin:0; color:#94a3b8; font-size:11px;">Severity</p>
              <p style="margin:3px 0 0; color:#1e293b; font-size:13px; font-weight:600;">${severity}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>
`;

const actionButton = (text, url = '#') => `
<a href="${url}" style="display:inline-block; background:linear-gradient(135deg,#059669,#047857); color:#ffffff; text-decoration:none; font-size:14px; font-weight:700; padding:12px 28px; border-radius:8px; margin-top:20px;">${text} →</a>
`;

// ─── Email Templates ──────────────────────────────────────────────────────────

const templates = {

  // ── 1. Incident Submitted (to reporter) ──────────────────────────────────
  incidentSubmitted: (incident, reporter) => ({
    subject: `[JPHRC IMS] Incident Submitted – ${incident.reference_id}`,
    html: baseTemplate(`
      <p style="margin:0 0 6px; color:#64748b; font-size:13px;">Hello ${reporter.full_name},</p>
      <h2 style="margin:0 0 20px; color:#0f172a; font-size:22px;">Your incident has been submitted</h2>
      <p style="color:#475569; font-size:14px; line-height:1.7;">Your incident report has been successfully submitted to the JPHRC Incident Management System. The relevant Head of Department will review it within the stipulated SLA period.</p>
      ${incidentCard(incident.reference_id, incident.incident_type, incident.severity, 'submitted')}
      <p style="color:#475569; font-size:14px; line-height:1.7;">You will receive email notifications as the incident progresses through the review process. Please retain your reference ID for tracking purposes.</p>
      <div style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:8px; padding:14px 18px; margin:20px 0;">
        <p style="margin:0; color:#065f46; font-size:13px; font-weight:600;">📋 What happens next?</p>
        <p style="margin:6px 0 0; color:#047857; font-size:13px;">The concerned department HOD will review and provide feedback within 7 days.</p>
      </div>
    `)
  }),

  // ── 2. New Incident for HOD ───────────────────────────────────────────────
  newIncidentHod: (incident, hod) => ({
    subject: `[JPHRC IMS] Action Required: New Incident ${incident.reference_id} – HOD Review`,
    html: baseTemplate(`
      <p style="margin:0 0 6px; color:#64748b; font-size:13px;">Dear ${hod.full_name},</p>
      <h2 style="margin:0 0 20px; color:#0f172a; font-size:22px;">New incident requires your review</h2>
      <p style="color:#475569; font-size:14px; line-height:1.7;">A new incident has been reported for your department and is awaiting your review and feedback.</p>
      ${incidentCard(incident.reference_id, incident.incident_type, incident.severity, 'with_hod')}
      <div style="background:#fffbeb; border:1px solid #fcd34d; border-radius:8px; padding:14px 18px; margin:20px 0;">
        <p style="margin:0; color:#92400e; font-size:13px; font-weight:600;">⏱ SLA Reminder</p>
        <p style="margin:6px 0 0; color:#b45309; font-size:13px;">You have <strong>7 days</strong> to provide your feedback. Reminders will be sent after Day 5.</p>
      </div>
      <p style="color:#475569; font-size:14px; line-height:1.7;">Please log in to the IMS portal to review the incident details and provide your department feedback.</p>
    `)
  }),

  // ── 3. HOD SLA Reminder (Day 5) ──────────────────────────────────────────
  hodSlaReminder: (incident, hod, daysElapsed) => ({
    subject: `[JPHRC IMS] ⚠️ SLA Reminder: Incident ${incident.reference_id} Awaits Your Feedback`,
    html: baseTemplate(`
      <p style="margin:0 0 6px; color:#64748b; font-size:13px;">Dear ${hod.full_name},</p>
      <h2 style="margin:0 0 20px; color:#b45309; font-size:22px;">⚠️ Feedback Pending – Day ${daysElapsed} of 7</h2>
      <p style="color:#475569; font-size:14px; line-height:1.7;">This is an automated reminder that the following incident is still awaiting your feedback. Please action it at the earliest to avoid an SLA breach.</p>
      ${incidentCard(incident.reference_id, incident.incident_type, incident.severity, 'with_hod')}
      <div style="background:#fef2f2; border:1px solid #fca5a5; border-radius:8px; padding:14px 18px; margin:20px 0;">
        <p style="margin:0; color:#991b1b; font-size:13px; font-weight:600;">🚨 SLA Alert</p>
        <p style="margin:6px 0 0; color:#dc2626; font-size:13px;">Day ${daysElapsed}/7 – Only <strong>${7 - daysElapsed} day(s) remaining</strong> before this incident breaches SLA.</p>
      </div>
      <p style="color:#475569; font-size:14px; line-height:1.7;">Failure to respond within the SLA window will trigger an escalation to the IMC and Management.</p>
    `)
  }),

  // ── 4. Incident Forwarded to IMC ─────────────────────────────────────────
  incidentToImc: (incident, imcMember) => ({
    subject: `[JPHRC IMS] Incident ${incident.reference_id} – Now in IMC Queue`,
    html: baseTemplate(`
      <p style="margin:0 0 6px; color:#64748b; font-size:13px;">Dear ${imcMember.full_name},</p>
      <h2 style="margin:0 0 20px; color:#0f172a; font-size:22px;">Incident added to IMC Review Queue</h2>
      <p style="color:#475569; font-size:14px; line-height:1.7;">An incident has completed the HOD review stage and has been forwarded to the IMC for quality review and further action.</p>
      ${incidentCard(incident.reference_id, incident.incident_type, incident.severity, 'with_imc')}
    `)
  }),

  // ── 5. Redirect Requested (to IMC) ───────────────────────────────────────
  redirectRequested: (incident, imcMember, fromDept, reason) => ({
    subject: `[JPHRC IMS] Redirect Request: Incident ${incident.reference_id}`,
    html: baseTemplate(`
      <p style="margin:0 0 6px; color:#64748b; font-size:13px;">Dear ${imcMember.full_name},</p>
      <h2 style="margin:0 0 20px; color:#0f172a; font-size:22px;">HOD has requested a department redirect</h2>
      <p style="color:#475569; font-size:14px; line-height:1.7;">The HOD of <strong>${fromDept}</strong> has submitted a redirection request for the following incident, indicating it may be misrouted.</p>
      ${incidentCard(incident.reference_id, incident.incident_type, incident.severity, 'redirect_requested')}
      <div style="background:#fff7ed; border:1px solid #fed7aa; border-radius:8px; padding:14px 18px; margin:20px 0;">
        <p style="margin:0; color:#9a3412; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">Redirection Reason</p>
        <p style="margin:8px 0 0; color:#7c2d12; font-size:13px; font-style:italic;">"${reason}"</p>
      </div>
      <p style="color:#475569; font-size:14px;">Please log in to the IMS portal to review and action this redirect request.</p>
    `)
  }),

  // ── 6. Redirect Approved/Rejected (to original HOD) ─────────────────────
  redirectDecision: (incident, hod, approved, newDept, imcReason) => ({
    subject: `[JPHRC IMS] Redirect ${approved ? 'Approved' : 'Rejected'}: Incident ${incident.reference_id}`,
    html: baseTemplate(`
      <p style="margin:0 0 6px; color:#64748b; font-size:13px;">Dear ${hod.full_name},</p>
      <h2 style="margin:0 0 20px; color:#0f172a; font-size:22px;">Redirect Request ${approved ? 'Approved ✓' : 'Rejected ✗'}</h2>
      ${incidentCard(incident.reference_id, incident.incident_type, incident.severity, approved ? 'with_hod' : 'with_hod')}
      <div style="background:${approved ? '#ecfdf5' : '#fef2f2'}; border:1px solid ${approved ? '#a7f3d0' : '#fca5a5'}; border-radius:8px; padding:14px 18px; margin:20px 0;">
        <p style="margin:0; color:${approved ? '#065f46' : '#991b1b'}; font-size:13px;">
          ${approved
            ? `✅ IMC has approved the redirect. The incident has been forwarded to <strong>${newDept}</strong>.`
            : `❌ IMC has rejected the redirect request. The incident has been returned to your queue for action.`
          }
        </p>
        ${imcReason ? `<p style="margin:8px 0 0; color:#475569; font-size:12px; font-style:italic;">"${imcReason}"</p>` : ''}
      </div>
    `)
  }),

  // ── 7. Incident Forwarded to Management ──────────────────────────────────
  incidentToManagement: (incident, mgmtUser) => ({
    subject: `[JPHRC IMS] Decision Required: Incident ${incident.reference_id}`,
    html: baseTemplate(`
      <p style="margin:0 0 6px; color:#64748b; font-size:13px;">Dear ${mgmtUser.full_name},</p>
      <h2 style="margin:0 0 20px; color:#0f172a; font-size:22px;">Incident requires Management Decision</h2>
      <p style="color:#475569; font-size:14px; line-height:1.7;">The following incident has completed IMC review and has been forwarded to Management for a final decision.</p>
      ${incidentCard(incident.reference_id, incident.incident_type, incident.severity, 'with_head_management')}
    `)
  }),

  // ── 8. Incident Resolved (to reporter) ───────────────────────────────────
  incidentResolved: (incident, reporter) => ({
    subject: `[JPHRC IMS] Incident Resolved – ${incident.reference_id}`,
    html: baseTemplate(`
      <p style="margin:0 0 6px; color:#64748b; font-size:13px;">Dear ${reporter.full_name},</p>
      <h2 style="margin:0 0 20px; color:#065f46; font-size:22px;">✅ Your Incident Has Been Resolved</h2>
      <p style="color:#475569; font-size:14px; line-height:1.7;">Your incident report has been reviewed by the Hospital Management and a final decision has been issued. The incident is now closed.</p>
      ${incidentCard(incident.reference_id, incident.incident_type, incident.severity, 'resolved')}
      <p style="color:#475569; font-size:14px; line-height:1.7;">You can view the final report, corrective actions, and the full resolution details in the IMS portal.</p>
    `)
  }),

  // ── 9. Training Required (to responsible person) ──────────────────────────
  trainingRequired: (incident, employee) => ({
    subject: `[JPHRC IMS] Mandatory Training Required – ${incident.reference_id}`,
    html: baseTemplate(`
      <p style="margin:0 0 6px; color:#64748b; font-size:13px;">Dear ${employee.full_name},</p>
      <h2 style="margin:0 0 20px; color:#b45309; font-size:22px;">⚠️ Mandatory Training Has Been Assigned</h2>
      <p style="color:#475569; font-size:14px; line-height:1.7;">Hospital Management has determined that mandatory corrective training is required in connection with the following incident.</p>
      ${incidentCard(incident.reference_id, incident.incident_type, incident.severity, 'pending_training')}
      <div style="background:#fffbeb; border:1px solid #fcd34d; border-radius:8px; padding:14px 18px; margin:20px 0;">
        <p style="margin:0; color:#92400e; font-size:13px; font-weight:600;">Required Action</p>
        <p style="margin:6px 0 0; color:#b45309; font-size:13px;">Please complete the assigned training modules at the earliest. Upon completion, your HOD or the IMC will verify and close the incident.</p>
      </div>
    `)
  }),

  // ── 10. Training Verified (to reporter) ───────────────────────────────────
  trainingVerified: (incident, reporter) => ({
    subject: `[JPHRC IMS] Training Verified & Incident Closed – ${incident.reference_id}`,
    html: baseTemplate(`
      <p style="margin:0 0 6px; color:#64748b; font-size:13px;">Dear ${reporter.full_name},</p>
      <h2 style="margin:0 0 20px; color:#065f46; font-size:22px;">✅ Training Verified & Incident Closed</h2>
      <p style="color:#475569; font-size:14px; line-height:1.7;">The mandatory training associated with your incident has been completed and verified by the IMC. The incident is now officially closed.</p>
      ${incidentCard(incident.reference_id, incident.incident_type, incident.severity, 'resolved')}
    `)
  }),


  // ── 12. Priority Escalated ────────────────────────────────────────────────
  priorityEscalated: (incident, notifyUser, escalatedBy) => ({
    subject: `[JPHRC IMS] 🔴 Priority Escalated – Incident ${incident.reference_id}`,
    html: baseTemplate(`
      <p style="margin:0 0 6px; color:#64748b; font-size:13px;">Dear ${notifyUser.full_name},</p>
      <h2 style="margin:0 0 20px; color:#991b1b; font-size:22px;">🔴 Incident Priority Has Been Escalated</h2>
      <p style="color:#475569; font-size:14px; line-height:1.7;">The priority of the following incident has been escalated by <strong>${escalatedBy}</strong>. Please review this incident with urgency.</p>
      ${incidentCard(incident.reference_id, incident.incident_type, incident.severity, incident.status)}
    `)
  }),

  // ── 13. HOD Feedback Reminder (Manual or Automated from IMC/Management) ───
  hodFeedbackReminder: (incident, hod, remindedBy) => ({
    subject: `[JPHRC IMS] 🔔 Reminder: Incident ${incident.reference_id} Awaits Your Feedback`,
    html: baseTemplate(`
      <p style="margin:0 0 6px; color:#64748b; font-size:13px;">Dear ${hod.full_name},</p>
      <h2 style="margin:0 0 20px; color:#b45309; font-size:22px;">🔔 Feedback Requested by ${remindedBy}</h2>
      <p style="color:#475569; font-size:14px; line-height:1.7;">This is a reminder from <strong>${remindedBy}</strong> regarding Incident <strong>${incident.reference_id}</strong>. Your departmental review and feedback have not yet been submitted for this incident.</p>
      ${incidentCard(incident.reference_id, incident.incident_type, incident.severity, incident.status)}
      <div style="background:#fffbeb; border:1px solid #fcd34d; border-radius:8px; padding:14px 18px; margin:20px 0;">
        <p style="margin:0; color:#92400e; font-size:13px; font-weight:600;">Action Required</p>
        <p style="margin:6px 0 0; color:#b45309; font-size:13px;">Please log in to the IMS portal and submit your review as Head of Department at the earliest to facilitate timely incident resolution.</p>
      </div>
    `)
  }),

};

// ─── Send Email Helper ────────────────────────────────────────────────────────
const sendEmail = async (to, templateData) => {
  if (
    !to ||
    !process.env.SMTP_USER ||
    !process.env.SMTP_PASS ||
    process.env.SMTP_USER === 'your-gmail@gmail.com' ||
    process.env.SMTP_PASS === 'xxxx-xxxx-xxxx-xxxx'
  ) {
    console.log(`\n=================== [DEV EMAIL PREVIEW] ===================`);
    console.log(`To: ${to}`);
    console.log(`Subject: ${templateData.subject}`);
    console.log(`Note: SMTP not configured with real credentials in .env. Email simulated.`);
    console.log(`===========================================================\n`);
    
    try {
      const userRes = await query('SELECT id FROM users WHERE email = $1 LIMIT 1', [to]);
      await query(
        `INSERT INTO communication_logs (user_id, recipient_contact, type, subject, status)
         VALUES ($1, $2, 'EMAIL', $3, 'SENT')`,
        [userRes.rows[0]?.id || null, to, templateData.subject]
      );
    } catch (dbErr) {
      console.warn('[Email Log Error]', dbErr.message);
    }
    
    return true;
  }

  try {
    const transporter = createTransporter();
    const info = await transporter.sendMail({
      from: process.env.FROM_EMAIL || `"JPHRC IMS" <${process.env.SMTP_USER}>`,
      to,
      subject: templateData.subject,
      html: templateData.html,
    });
    console.log(`[Email SENT] To: ${to} | Subject: ${templateData.subject} | ID: ${info.messageId}`);
    
    try {
      const userRes = await query('SELECT id FROM users WHERE email = $1 LIMIT 1', [to]);
      await query(
        `INSERT INTO communication_logs (user_id, recipient_contact, type, subject, status)
         VALUES ($1, $2, 'EMAIL', $3, 'SENT')`,
        [userRes.rows[0]?.id || null, to, templateData.subject]
      );
    } catch (dbErr) {
      console.warn('[Email Log Error]', dbErr.message);
    }

    return true;
  } catch (err) {
    console.error(`[Email FAILED] To: ${to} | Error: ${err.message}`);
    
    try {
      const userRes = await query('SELECT id FROM users WHERE email = $1 LIMIT 1', [to]);
      await query(
        `INSERT INTO communication_logs (user_id, recipient_contact, type, subject, status, error_message)
         VALUES ($1, $2, 'EMAIL', $3, 'FAILED', $4)`,
        [userRes.rows[0]?.id || null, to, templateData.subject, err.message]
      );
    } catch (dbErr) {
      console.warn('[Email Log Error]', dbErr.message);
    }

    return false;
  }
};

// ─── Bulk send helper ─────────────────────────────────────────────────────────
const sendBulkEmail = async (recipients, templateFn) => {
  const results = await Promise.allSettled(
    recipients.map(r => sendEmail(r.email, templateFn(r)))
  );
  const failed = results.filter(r => r.status === 'rejected').length;
  if (failed > 0) console.warn(`[Email] ${failed}/${recipients.length} emails failed.`);
};

module.exports = { sendEmail, sendBulkEmail, templates };

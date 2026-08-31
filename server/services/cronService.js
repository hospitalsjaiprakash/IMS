const cron = require('node-cron');
const { query } = require('../config/database');
const { sendEmail } = require('../utils/emailService');

async function processHodEscalations() {
  console.log('[CRON] Starting HOD Escalation check...');
  try {
    // 1. Fetch thresholds from system config
    const configRes = await query('SELECT key, value FROM system_config');
    const config = {};
    configRes.rows.forEach(r => config[r.key] = parseInt(r.value, 10) || 0);

    const reminder1 = config['hod_reminder_1_days'] || 5;
    const reminder2 = config['hod_reminder_2_days'] || 7;
    const escalation1 = config['hod_escalation_1_days'] || 14;
    const escalation2 = config['hod_escalation_2_days'] || 21;
    const escalation3 = config['hod_escalation_3_days'] || 28;

    const thresholds = [
      { day: escalation3, level: 'esc3' },
      { day: escalation2, level: 'esc2' },
      { day: escalation1, level: 'esc1' },
      { day: reminder2, level: 'rem2' },
      { day: reminder1, level: 'rem1' }
    ].sort((a, b) => b.day - a.day); // Check highest threshold first

    // 2. Fetch pending incidents
    const incidentsRes = await query(`
      SELECT 
        i.id as incident_id,
        i.reference_id,
        i.last_reminder_day,
        FLOOR(EXTRACT(EPOCH FROM (NOW() - i.created_at)) / 86400) as days_elapsed,
        d.name as department_name,
        u_hod.id as hod_id,
        u_hod.email as hod_email,
        u_hod.full_name as hod_name
      FROM incidents i
      JOIN incident_departments idp ON i.id = idp.incident_id
      JOIN departments d ON idp.department_id = d.id
      JOIN users u_hod ON d.hod_user_id = u_hod.id
      WHERE i.status IN ('with_hod', 'with_hod_and_imc')
    `);

    // 3. Process each incident
    for (const incident of incidentsRes.rows) {
      const { incident_id, reference_id, last_reminder_day, days_elapsed, hod_id, hod_email, hod_name, department_name } = incident;
      
      let matchedThreshold = null;
      for (const t of thresholds) {
        if (days_elapsed >= t.day && last_reminder_day < t.day) {
          matchedThreshold = t;
          break; // Stop at highest eligible threshold
        }
      }

      if (matchedThreshold) {
        let subject = '';
        let message = '';
        let notifyImc = false;
        let notifyMgmt = false;

        switch (matchedThreshold.level) {
          case 'rem1':
            subject = `Reminder: Pending Feedback for Incident ${reference_id}`;
            message = `Dear ${hod_name},\n\nYou have 2 days left to provide feedback on incident ${reference_id} for the ${department_name} department. Please submit your feedback.`;
            break;
          case 'rem2':
            subject = `ACTION REQUIRED: Last Day for Feedback on ${reference_id}`;
            message = `Dear ${hod_name},\n\nToday is the LAST DAY to provide feedback on incident ${reference_id}.`;
            break;
          case 'esc1':
            subject = `Overdue Feedback: Incident ${reference_id}`;
            message = `Dear ${hod_name},\n\nYour feedback for incident ${reference_id} is overdue by 7 days.`;
            break;
          case 'esc2':
            subject = `ESCALATION: Incident ${reference_id} feedback pending for 21 days`;
            message = `Dear ${hod_name},\n\nIncident ${reference_id} has been pending your feedback for 21 days.\n\nThis incident has been escalated to the IMC.`;
            notifyImc = true;
            break;
          case 'esc3':
            subject = `URGENT ESCALATION: Incident ${reference_id} feedback pending for 28 days`;
            message = `Dear ${hod_name},\n\nIncident ${reference_id} has been pending your feedback for 28 days.\n\nThis incident has been escalated to Management and the IMC.`;
            notifyImc = true;
            notifyMgmt = true;
            break;
        }

        // Send to HOD
        await query(`INSERT INTO notifications (user_id, incident_id, title, message, type) VALUES ($1, $2, $3, $4, 'reminder')`, [hod_id, incident_id, subject, message]);
        if (hod_email) {
          sendEmail(hod_email, subject, message).catch(err => console.error('Email failed:', err));
        }

        // Send to IMC if escalated
        if (notifyImc) {
          const imcRes = await query(`SELECT id, email FROM users WHERE role = 'imc' OR is_imc_member = TRUE`);
          for (const u of imcRes.rows) {
            await query(`INSERT INTO notifications (user_id, incident_id, title, message, type) VALUES ($1, $2, $3, $4, 'escalation')`, 
              [u.id, incident_id, subject, `The HOD for ${department_name} has not provided feedback on ${reference_id} for ${matchedThreshold.day} days.`]);
            if (u.email) {
              sendEmail(u.email, subject, `The HOD for ${department_name} has not provided feedback on ${reference_id} for ${matchedThreshold.day} days.`).catch(console.error);
            }
          }
        }

        // Send to Management if escalated
        if (notifyMgmt) {
          const mgmtRes = await query(`SELECT id, email FROM users WHERE role = 'head_management' OR is_management_member = TRUE`);
          for (const u of mgmtRes.rows) {
            await query(`INSERT INTO notifications (user_id, incident_id, title, message, type) VALUES ($1, $2, $3, $4, 'escalation')`, 
              [u.id, incident_id, subject, `The HOD for ${department_name} has not provided feedback on ${reference_id} for ${matchedThreshold.day} days.`]);
            if (u.email) {
              sendEmail(u.email, subject, `The HOD for ${department_name} has not provided feedback on ${reference_id} for ${matchedThreshold.day} days.`).catch(console.error);
            }
          }
        }

        // Log to communication_logs
        await query(`
          INSERT INTO communication_logs (user_id, incident_id, recipient_contact, type, subject, content, status)
          VALUES ($1, $2, $3, 'EMAIL', $4, $5, 'SENT')
        `, [hod_id, incident_id, hod_email || 'System-InApp', subject, message]);

        // Update incident last reminder
        await query(`UPDATE incidents SET last_reminder_day = $1, reminder_last_sent = NOW() WHERE id = $2`, [matchedThreshold.day, incident_id]);
      }
    }
  } catch (error) {
    console.error('[CRON] Error processing HOD escalations:', error);
  }
}

// Start cron job (Runs every day at 8:00 AM)
cron.schedule('0 8 * * *', () => {
  processHodEscalations();
});

module.exports = { processHodEscalations };

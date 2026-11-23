const cron = require('node-cron');
const { query } = require('../config/database');
const { sendEmail, templates } = require('../utils/emailService');

const isEscalationsEnabled = () =>
  String(process.env.ESCALATIONS_ENABLED || 'true').toLowerCase() !== 'false';

async function processHodEscalations() {
  if (!isEscalationsEnabled()) {
    return;
  }
  console.log('[CRON] Starting Category/Department Escalation check...');
  try {
    // 1. Fetch thresholds from system config
    const configRes = await query('SELECT key, value FROM system_config');
    const config = {};
    configRes.rows.forEach(r => { config[r.key] = parseInt(r.value, 10) || 0; });

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

    // 2. Fetch pending incidents via BOTH category mappings and legacy department mappings
    const incidentsRes = await query(`
      SELECT DISTINCT
        i.id as incident_id,
        i.reference_id,
        i.incident_type,
        i.severity,
        i.last_reminder_day,
        FLOOR(EXTRACT(EPOCH FROM (NOW() - i.created_at)) / 86400)::int as days_elapsed,
        ic.name as scope_name,
        u.id as reviewer_id,
        u.email as reviewer_email,
        u.full_name as reviewer_name
      FROM incidents i
      JOIN incident_category_links icl ON i.id = icl.incident_id
      JOIN incident_categories ic ON ic.id = icl.category_id
      JOIN category_feedback_assignees cfa ON cfa.category_id = ic.id AND cfa.is_active = TRUE
      JOIN users u ON u.id = cfa.user_id AND u.is_active = TRUE
      WHERE i.status IN ('with_hod', 'with_hod_and_imc')
        AND NOT EXISTS (
          SELECT 1 FROM feedbacks f
          WHERE f.incident_id = i.id
            AND f.role = 'hod'
            AND (f.category_id = ic.id OR f.author_id = u.id)
        )
      UNION
      SELECT DISTINCT
        i.id as incident_id,
        i.reference_id,
        i.incident_type,
        i.severity,
        i.last_reminder_day,
        FLOOR(EXTRACT(EPOCH FROM (NOW() - i.created_at)) / 86400)::int as days_elapsed,
        d.name as scope_name,
        u.id as reviewer_id,
        u.email as reviewer_email,
        u.full_name as reviewer_name
      FROM incidents i
      JOIN incident_departments idp ON i.id = idp.incident_id
      JOIN departments d ON idp.department_id = d.id
      JOIN users u ON (
        COALESCE(d.assigned_user_id, d.hod_user_id) = u.id
        OR EXISTS (SELECT 1 FROM department_reviewers dr WHERE dr.department_id = d.id AND dr.user_id = u.id AND dr.is_active = TRUE)
      ) AND u.is_active = TRUE
      WHERE i.status IN ('with_hod', 'with_hod_and_imc')
        AND NOT EXISTS (
          SELECT 1 FROM feedbacks f
          WHERE f.incident_id = i.id
            AND f.role = 'hod'
            AND (
              f.department_id = d.id
              OR f.author_id = u.id
              OR EXISTS (SELECT 1 FROM department_reviewers dr WHERE dr.department_id = d.id AND dr.user_id = f.author_id AND dr.is_active = TRUE)
            )
        )
    `);

    const updatedIncidents = new Map();

    // 3. Process each pending reviewer assignment
    for (const row of incidentsRes.rows) {
      const { incident_id, reference_id, incident_type, severity, last_reminder_day, days_elapsed, reviewer_id, reviewer_email, reviewer_name, scope_name } = row;

      let matchedThreshold = null;
      for (const t of thresholds) {
        if (days_elapsed >= t.day && (last_reminder_day || 0) < t.day) {
          matchedThreshold = t;
          break;
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
            message = `Dear ${reviewer_name},\n\nYou have ${Math.max(1, reminder2 - days_elapsed)} day(s) left to provide feedback on incident ${reference_id} (${scope_name}). Please submit your feedback.`;
            break;
          case 'rem2':
            subject = `ACTION REQUIRED: Last Day for Feedback on ${reference_id}`;
            message = `Dear ${reviewer_name},\n\nToday is the LAST DAY to provide feedback on incident ${reference_id} (${scope_name}).`;
            break;
          case 'esc1':
            subject = `Overdue Feedback: Incident ${reference_id}`;
            message = `Dear ${reviewer_name},\n\nYour feedback for incident ${reference_id} (${scope_name}) is overdue (${days_elapsed} days elapsed).`;
            break;
          case 'esc2':
            subject = `ESCALATION: Incident ${reference_id} feedback pending for ${days_elapsed} days`;
            message = `Dear ${reviewer_name},\n\nIncident ${reference_id} (${scope_name}) has been pending your feedback for ${days_elapsed} days.\n\nThis incident has been escalated to the IMC.`;
            notifyImc = true;
            break;
          case 'esc3':
            subject = `URGENT ESCALATION: Incident ${reference_id} feedback pending for ${days_elapsed} days`;
            message = `Dear ${reviewer_name},\n\nIncident ${reference_id} (${scope_name}) has been pending your feedback for ${days_elapsed} days.\n\nThis incident has been escalated to Management and the IMC.`;
            notifyImc = true;
            notifyMgmt = true;
            break;
        }

        await query(
          `INSERT INTO notifications (user_id, incident_id, title, message, type) VALUES ($1, $2, $3, $4, 'reminder')`,
          [reviewer_id, incident_id, subject, message]
        );
        if (reviewer_email) {
          const emailData = matchedThreshold.level === 'rem1'
            ? templates.hodSlaReminder({ reference_id, incident_type, severity }, { full_name: reviewer_name }, days_elapsed, reminder2)
            : templates.genericAlert(subject, message, reviewer_name);
          sendEmail(reviewer_email, emailData).catch(err => console.error('Email failed:', err));
        }

        if (!updatedIncidents.has(incident_id)) {
          updatedIncidents.set(incident_id, {
            day: matchedThreshold.day,
            subject,
            reference_id,
            scope_name,
            notifyImc,
            notifyMgmt
          });
        }
      }
    }

    for (const [incident_id, meta] of updatedIncidents.entries()) {
      const escMsg = `Assigned reviewer for ${meta.scope_name} has not provided feedback on ${meta.reference_id} for ${meta.day}+ days.`;
      if (meta.notifyImc) {
        const imcRes = await query(`SELECT id, email, full_name FROM users WHERE (role = 'imc' OR is_imc_member = TRUE OR is_imc_lead = TRUE) AND is_active = TRUE`);
        for (const u of imcRes.rows) {
          await query(`INSERT INTO notifications (user_id, incident_id, title, message, type) VALUES ($1, $2, $3, $4, 'escalation')`,
            [u.id, incident_id, meta.subject, escMsg]);
          if (u.email) {
            sendEmail(u.email, templates.genericAlert(meta.subject, escMsg, u.full_name)).catch(console.error);
          }
        }
      }

      if (meta.notifyMgmt) {
        const mgmtRes = await query(`SELECT id, email, full_name FROM users WHERE (role = 'head_management' OR is_management_member = TRUE) AND is_active = TRUE`);
        for (const u of mgmtRes.rows) {
          await query(`INSERT INTO notifications (user_id, incident_id, title, message, type) VALUES ($1, $2, $3, $4, 'escalation')`,
            [u.id, incident_id, meta.subject, escMsg]);
          if (u.email) {
            sendEmail(u.email, templates.genericAlert(meta.subject, escMsg, u.full_name)).catch(console.error);
          }
        }
      }

      await query(`UPDATE incidents SET last_reminder_day = $1, reminder_last_sent = NOW() WHERE id = $2`, [meta.day, incident_id]);
    }
  } catch (error) {
    console.error('[CRON] Error processing escalations:', error);
  }
}

/**
 * Automatically escalate incidents pending resolution for more than 21 days
 */
async function checkAndAutoEscalate21Days() {
  if (!isEscalationsEnabled()) {
    return;
  }
  try {
    const overdueRes = await query(`
      SELECT
        i.id,
        i.reference_id,
        i.incident_type,
        i.severity,
        i.status,
        FLOOR(EXTRACT(EPOCH FROM (NOW() - i.created_at)) / 86400)::int as days_elapsed
      FROM incidents i
      WHERE i.status NOT IN ('resolved', 'closed', 'withdrawn')
        AND i.priority_escalated_at IS NULL
        AND (NOW() - i.created_at) >= INTERVAL '21 days'
    `);

    for (const inc of overdueRes.rows) {
      await query(`
        UPDATE incidents
        SET priority_escalated_by = 'Automated System (21+ Days Overdue)',
            priority_escalated_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
      `, [inc.id]);

      const reviewersRes = await query(`
        SELECT DISTINCT u.id, u.email, u.full_name
        FROM incident_category_links icl
        JOIN category_feedback_assignees cfa ON cfa.category_id = icl.category_id AND cfa.is_active = TRUE
        JOIN users u ON u.id = cfa.user_id AND u.is_active = TRUE
        WHERE icl.incident_id = $1
        UNION
        SELECT DISTINCT u.id, u.email, u.full_name
        FROM incident_departments idp
        JOIN departments d ON d.id = idp.department_id
        JOIN users u ON (
          COALESCE(d.assigned_user_id, d.hod_user_id) = u.id
          OR EXISTS (SELECT 1 FROM department_reviewers dr WHERE dr.department_id = d.id AND dr.user_id = u.id AND dr.is_active = TRUE)
        ) AND u.is_active = TRUE
        WHERE idp.incident_id = $1
      `, [inc.id]);

      const imcRes = await query(`SELECT id, email, full_name FROM users WHERE (role = 'imc' OR is_imc_member = TRUE OR is_imc_lead = TRUE) AND is_active = TRUE`);
      const mgmtRes = await query(`SELECT id, email, full_name FROM users WHERE (role = 'head_management' OR is_management_member = TRUE) AND is_active = TRUE`);

      const title = `🔴 Automated Escalation: Incident ${inc.reference_id}`;
      const msg = `Incident ${inc.reference_id} has been pending resolution for ${inc.days_elapsed || 21} days and has been automatically escalated.`;

      for (const r of reviewersRes.rows) {
        await query(`INSERT INTO notifications (user_id, incident_id, title, message, type) VALUES ($1, $2, $3, $4, 'escalation')`, [r.id, inc.id, title, msg]);
        if (r.email) sendEmail(r.email, templates.genericAlert(title, msg, r.full_name)).catch(() => {});
      }

      for (const u of imcRes.rows) {
        await query(`INSERT INTO notifications (user_id, incident_id, title, message, type) VALUES ($1, $2, $3, $4, 'escalation')`, [u.id, inc.id, title, msg]);
        if (u.email) sendEmail(u.email, templates.genericAlert(title, msg, u.full_name)).catch(() => {});
      }

      for (const m of mgmtRes.rows) {
        await query(`INSERT INTO notifications (user_id, incident_id, title, message, type) VALUES ($1, $2, $3, $4, 'escalation')`, [m.id, inc.id, title, msg]);
        if (m.email) sendEmail(m.email, templates.genericAlert(title, msg, m.full_name)).catch(() => {});
      }

      console.log(`[Auto-Escalation] Incident ${inc.reference_id} automatically escalated after ${inc.days_elapsed} days.`);
    }
  } catch (error) {
    console.error('[CRON] Error in checkAndAutoEscalate21Days:', error);
  }
}

/**
 * Scheduled HRMS delta reconciliation cron (default: every 4 hours on Production;
 * disabled when HRMS_CRON_ENABLED=false such as on Staging to conserve shared quota)
 */
async function scheduleHrmsDeltaSync() {
  if (String(process.env.HRMS_CRON_ENABLED || 'true').toLowerCase() === 'false') {
    return;
  }
  try {
    const { syncDeltaChanges, getConfig } = require('./officePortalService');
    const config = await getConfig();
    if (config.clientId && config.clientSecret) {
      console.log('[CRON] Executing scheduled HRMS delta change feed sync...');
      const result = await syncDeltaChanges();
      console.log(`[CRON] HRMS delta sync completed: fetched ${result.totalFetched}, inserted ${result.totalInserted}, updated ${result.totalUpdated}, deactivated ${result.totalDeactivated}`);
    }
  } catch (err) {
    console.error('[CRON] Error during scheduled HRMS delta sync:', err.message);
  }
}

/**
 * Nightly webhook PII retention job:
 * - Redacts raw employee PII from PROCESSED hrms_webhook_events.payload older than 30 days
 * - Prunes PROCESSED hrms_webhook_events rows older than 180 days
 */
async function runWebhookPiiRetention() {
  try {
    const { cleanupWebhookPiiRetention } = require('./officePortalService');
    const result = await cleanupWebhookPiiRetention();
    if (result.redactedCount > 0 || result.prunedCount > 0) {
      console.log(`[CRON] Webhook PII retention complete: redacted ${result.redactedCount} payload(s), pruned ${result.prunedCount} old row(s).`);
    }
    return result;
  } catch (err) {
    console.error('[CRON] Error during webhook PII retention cleanup:', err.message);
    return { redactedCount: 0, prunedCount: 0 };
  }
}

// Start daily escalations cron job (Runs every day at 8:00 AM unless ESCALATIONS_ENABLED=false)
if (isEscalationsEnabled()) {
  cron.schedule('0 8 * * *', () => {
    processHodEscalations();
    checkAndAutoEscalate21Days();
  });
}

// Nightly webhook PII retention job (Runs every day at 3:00 AM IST)
cron.schedule('0 3 * * *', () => {
  runWebhookPiiRetention();
}, { timezone: process.env.APP_TIMEZONE || 'Asia/Kolkata' });

// Change Feed delta sync every 4 hours (costing ~6 API calls/day on Production)
if (String(process.env.HRMS_CRON_ENABLED || 'true').toLowerCase() !== 'false') {
  const hrmsSchedule = process.env.HRMS_SYNC_CRON || '0 */4 * * *';
  cron.schedule(hrmsSchedule, () => {
    scheduleHrmsDeltaSync();
  });
}

module.exports = { processHodEscalations, checkAndAutoEscalate21Days, scheduleHrmsDeltaSync, runWebhookPiiRetention };



const { query } = require('../config/database');
const { sendEmail, templates } = require('./emailService');

// Notification Tiering Policy: Only major action-required milestones trigger outgoing emails.
// Routine queue movements and intermediate transitions remain In-App (Socket.IO + notifications table).
const EMAIL_ELIGIBLE_TEMPLATES = new Set([
  'newIncidentHod',        // Action required for HOD
  'hodSlaReminder',        // Critical SLA deadline warning
  'incidentToManagement',  // Decision required by Executive Management
  'priorityEscalated',     // Urgent severity escalation
  'incidentResolved',      // Final resolution closure directive
  'trainingRequired',      // Mandatory training order
  'hodFeedbackReminder'    // Direct reminder from leadership
]);

/**
 * Create an in-app notification and conditionally dispatch an email for major milestones.
 * @param {string} userId - recipient user UUID
 * @param {string|null} incidentId - incident UUID (may be null)
 * @param {string} title - notification title
 * @param {string} message - notification body
 * @param {string} type - notification type key
 * @param {Object|null} emailPayload - { incident, user } data for email template
 * @param {string|null} emailTemplateKey - key from emailService.templates
 */
const createNotification = async (
  userId, incidentId, title, message, type,
  emailPayload = null, emailTemplateKey = null
) => {
  try {
    // 1. Persist in-app notification
    const result = await query(
      `INSERT INTO notifications (user_id, incident_id, title, message, type)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [userId, incidentId || null, title, message, type]
    );

    // Log to communication_logs
    try {
      await query(
        `INSERT INTO communication_logs (user_id, recipient_contact, type, subject, content, status)
         VALUES ($1, 'IN_APP', 'IN_APP_NOTIFICATION', $2, $3, 'DELIVERED')`,
        [userId, title, message]
      );
    } catch (logErr) {
      console.warn('[Notification Log Error]', logErr.message);
    }

    // 1b. Emit real-time socket event
    try {
      const { io } = require('../index');
      if (io) {
        io.to(`user_${userId}`).emit('new_notification', result.rows[0]);
      }
    } catch (socketErr) {
      console.warn('[Socket] Failed to emit notification:', socketErr.message);
    }

    // 2. Dispatch email ONLY if template is eligible under Notification Tiering Policy
    if (emailTemplateKey && emailPayload && templates[emailTemplateKey]) {
      if (!EMAIL_ELIGIBLE_TEMPLATES.has(emailTemplateKey)) {
        // Routine operational transition: retained strictly as In-App notification
        return;
      }

      const userResult = await query('SELECT email, full_name FROM users WHERE id = $1', [userId]);
      const user = userResult.rows[0];
      if (user?.email) {
        // Build template args dynamically based on key
        const templateData = templates[emailTemplateKey](
          emailPayload.incident,
          { ...user, ...emailPayload.user },
          ...(emailPayload.extra || [])
        );
        // Dispatch asynchronously with backoff retries — non-blocking for HTTP response
        sendEmail(user.email, templateData).catch(e =>
          console.warn('[Email] Non-critical send failure:', e.message)
        );
      }
    }
  } catch (err) {
    console.error('Notification creation error:', err.message);
  }
};

const getUnreadCount = async (userId) => {
  const result = await query(
    'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = FALSE',
    [userId]
  );
  return parseInt(result.rows[0].count);
};

module.exports = { createNotification, getUnreadCount };

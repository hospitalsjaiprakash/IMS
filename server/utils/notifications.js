const { query } = require('../config/database');
const { sendEmail, templates } = require('./emailService');

/**
 * Create an in-app notification and optionally send an email.
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

    // 2. Send email if template + payload available
    if (emailTemplateKey && emailPayload && templates[emailTemplateKey]) {
      const userResult = await query('SELECT email, full_name FROM users WHERE id = $1', [userId]);
      const user = userResult.rows[0];
      if (user?.email) {
        // Build template args dynamically based on key
        const templateData = templates[emailTemplateKey](
          emailPayload.incident,
          { ...user, ...emailPayload.user },
          ...(emailPayload.extra || [])
        );
        // Fire and forget — do not await to avoid slowing down request
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

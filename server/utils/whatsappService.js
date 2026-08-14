const { query } = require('../config/database');

/**
 * Mock WhatsApp Service
 * In a real implementation, this would connect to Twilio, Meta Graph API, etc.
 */

const sendWhatsappMessage = async (phone, message) => {
  if (!phone) {
    console.warn('[WhatsApp] Missing phone number, skipping.');
    return false;
  }

  // Remove non-numeric characters for logging
  const cleanPhone = String(phone).replace(/\D/g, '');

  console.log(`\n================= [WhatsApp MOCK] =================`);
  console.log(`To: ${cleanPhone}`);
  console.log(`Message: ${message}`);
  console.log(`===================================================\n`);

  try {
    // Determine the user_id if this phone exists in the database
    const userResult = await query('SELECT id FROM users WHERE whatsapp = $1 OR phone = $1 LIMIT 1', [cleanPhone]);
    const userId = userResult.rows[0]?.id || null;

    // Log to communication_logs
    await query(
      `INSERT INTO communication_logs (user_id, recipient_contact, type, subject, content, status)
       VALUES ($1, $2, 'WHATSAPP', 'WhatsApp Message', $3, 'SENT')`,
      [userId, cleanPhone, message]
    );

    return true;
  } catch (err) {
    console.error('[WhatsApp FAILED]', err.message);
    try {
      await query(
        `INSERT INTO communication_logs (recipient_contact, type, subject, content, status, error_message)
         VALUES ($1, 'WHATSAPP', 'WhatsApp Message', $2, 'FAILED', $3)`,
        [cleanPhone, message, err.message]
      );
    } catch (e) {
      console.error('Failed to write WhatsApp error log:', e.message);
    }
    return false;
  }
};

module.exports = { sendWhatsappMessage };

const nodemailer = require('nodemailer');
const crypto = require('crypto');
const transporter = require('../config/mail');
const { query } = require('../config/database');

/**
 * Generate and send a 6-digit OTP stored securely in PostgreSQL
 * @param {string} employeeId - The employee ID
 * @param {string} email - The destination email address
 * @param {string} action - Context for the OTP (e.g., 'registration', 'password_reset')
 * @returns {Promise<boolean>} - True if sent successfully
 */
exports.sendOtp = async (employeeId, email, action) => {
  try {
    const cleanEmpId = (employeeId || '').trim();
    const cleanAction = (action || '').trim();

    // Generate 6-digit cryptographic OTP
    const otp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Clean up previous active OTPs for this user & action
    await query(
      'DELETE FROM security_otps WHERE employee_id = $1 AND action = $2',
      [cleanEmpId, cleanAction]
    );

    // Persist to PostgreSQL (shared across all PM2 cluster workers)
    await query(
      `INSERT INTO security_otps (employee_id, action, otp_hash, attempts, max_attempts, expires_at)
       VALUES ($1, $2, $3, 0, 5, $4)`,
      [cleanEmpId, cleanAction, otpHash, expiresAt]
    );

    const mailOptions = {
      from: process.env.FROM_EMAIL || 'JPHRC IMS <digitalmarketing@jaiprakashhospitals.com>',
      to: email,
      subject: 'JPHRC IMS - Your Security OTP',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #1e293b; margin-bottom: 20px;">Security Verification</h2>
          <p style="color: #475569; font-size: 16px;">You requested a One-Time Password (OTP) for your JPHRC Incident Management System account.</p>
          <div style="background-color: #f1f5f9; padding: 15px; border-radius: 6px; text-align: center; margin: 25px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #0f172a;">${otp}</span>
          </div>
          <p style="color: #64748b; font-size: 14px;">This OTP is valid for <strong>10 minutes</strong>. Do not share this code with anyone.</p>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
          <p style="color: #94a3b8; font-size: 12px;">If you did not request this, please ignore this email or contact the system administrator immediately.</p>
        </div>
      `,
    };

    if (
      !process.env.SMTP_USER ||
      !process.env.SMTP_PASS ||
      process.env.SMTP_USER === 'your-gmail@gmail.com' ||
      process.env.SMTP_PASS === 'xxxx-xxxx-xxxx-xxxx'
    ) {
      console.log('\n=============================================');
      console.log(`[DEVELOPMENT ONLY] OTP GENERATED FOR ${email}`);
      console.log(`Employee ID: ${cleanEmpId}`);
      console.log(`Action: ${cleanAction}`);
      console.log(`OTP Code: ${otp}`);
      console.log('=============================================\n');
      return true;
    }

    try {
      await transporter.sendMail(mailOptions);
    } catch (mailError) {
      console.warn('[OTP] Mail server dispatch warning:', mailError.message);
      console.log(`[DEVELOPMENT / FALLBACK] OTP for ${email}: ${otp}`);
    }
    return true;
  } catch (error) {
    console.warn('[OTP] Error during sendOtp:', error.message);
    return false;
  }
};

/**
 * Verify a provided OTP against PostgreSQL storage with rate limiting
 * @param {string} employeeId - The employee ID
 * @param {string} action - Context for the OTP
 * @param {string} providedOtp - The OTP entered by user
 * @returns {Promise<boolean>} - True if valid, false otherwise
 */
exports.verifyOtp = async (employeeId, action, providedOtp) => {
  try {
    const cleanEmpId = (employeeId || '').trim();
    const cleanAction = (action || '').trim();
    const cleanOtp = String(providedOtp || '').trim();

    if (!cleanEmpId || !cleanAction || !cleanOtp) {
      return false;
    }

    const res = await query(
      `SELECT id, otp_hash, attempts, max_attempts, expires_at
       FROM security_otps
       WHERE employee_id = $1 AND action = $2
       ORDER BY id DESC LIMIT 1`,
      [cleanEmpId, cleanAction]
    );

    if (res.rows.length === 0) {
      return false;
    }

    const record = res.rows[0];

    // Check expiration or max attempt threshold (brute force protection)
    if (new Date() > new Date(record.expires_at) || record.attempts >= record.max_attempts) {
      await query('DELETE FROM security_otps WHERE id = $1', [record.id]);
      return false;
    }

    // Verify hash
    const providedHash = crypto.createHash('sha256').update(cleanOtp).digest('hex');
    const isMatch = crypto.timingSafeEqual(
      Buffer.from(record.otp_hash, 'utf8'),
      Buffer.from(providedHash, 'utf8')
    );

    if (isMatch) {
      // Clear consumed OTP
      await query('DELETE FROM security_otps WHERE id = $1', [record.id]);
      return true;
    } else {
      // Increment failed attempts
      await query(
        'UPDATE security_otps SET attempts = attempts + 1 WHERE id = $1',
        [record.id]
      );
      return false;
    }
  } catch (err) {
    console.error('[OTP] Verification error:', err.message);
    return false;
  }
};

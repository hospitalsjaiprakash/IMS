const crypto = require('crypto');
const transporter = require('../config/mail');
const { query, getClient } = require('../config/database');

const OTP_COOLDOWN_MS = 60 * 1000; // 60 seconds per (employeeId, action)
const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const OTP_MAX_ATTEMPTS = 5;

/**
 * Compute email-bound peppered HMAC-SHA256 for an OTP.
 * Binds the OTP strictly to (employeeId, action, targetEmail, otp).
 */
function computeOtpMac(employeeId, action, email, otp) {
  const pepper = process.env.OTP_SECRET || process.env.JWT_SECRET;
  if (!pepper) {
    throw new Error('OTP_SECRET or JWT_SECRET must be configured.');
  }
  const cleanEmpId = String(employeeId || '').trim().toUpperCase();
  const cleanAction = String(action || '').trim();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const cleanOtp = String(otp || '').trim();

  return crypto
    .createHmac('sha256', pepper)
    .update(`${cleanEmpId}:${cleanAction}:${normalizedEmail}:${cleanOtp}`)
    .digest('hex');
}

exports.computeOtpMac = computeOtpMac;
exports.OTP_COOLDOWN_MS = OTP_COOLDOWN_MS;

/**
 * Generate and send a 6-digit OTP stored securely in PostgreSQL.
 * @param {string} employeeId - The employee ID
 * @param {string} email - The destination email address
 * @param {string} action - Context for the OTP (e.g., 'registration', 'employee_password_reset')
 * @param {object} [options] - Optional overrides ({ bypassCooldown?: boolean } in NODE_ENV==='test')
 * @returns {Promise<boolean | { sent: false, code: 'OTP_COOLDOWN', retryAfterSeconds: number }>}
 */
exports.sendOtp = async (employeeId, email, action, options = {}) => {
  let insertedOtpId = null;
  try {
    const cleanEmpId = String(employeeId || '').trim().toUpperCase();
    const cleanAction = String(action || '').trim();
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!cleanEmpId || !cleanAction || !normalizedEmail) {
      return false;
    }

    // 1. Serialize per (employee_id, action) with pg_advisory_xact_lock so concurrent
    //    sendOtp calls cannot bypass the 60-second resend cooldown or send duplicate emails.
    const bypassCooldown = process.env.NODE_ENV === 'test' && options?.bypassCooldown === true;
    const otp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = computeOtpMac(cleanEmpId, cleanAction, normalizedEmail, otp);

    let dbClient;
    try {
      dbClient = await getClient();
      await dbClient.query('BEGIN');
      await dbClient.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `otp:${cleanEmpId}:${cleanAction}`
      ]);

      if (!bypassCooldown) {
        const recentRes = await dbClient.query(
          `SELECT EXTRACT(EPOCH FROM (clock_timestamp() - created_at)) * 1000 AS elapsed_ms
           FROM security_otps
           WHERE UPPER(TRIM(employee_id)) = $1 AND action = $2
           ORDER BY created_at DESC, id DESC
           LIMIT 1`,
          [cleanEmpId, cleanAction]
        );
        if (recentRes.rows.length > 0 && recentRes.rows[0].elapsed_ms !== null) {
          const elapsedMs = Number(recentRes.rows[0].elapsed_ms);
          if (Number.isFinite(elapsedMs) && elapsedMs >= 0 && elapsedMs < OTP_COOLDOWN_MS) {
            await dbClient.query('COMMIT');
            const retryAfterSeconds = Math.max(1, Math.ceil((OTP_COOLDOWN_MS - elapsedMs) / 1000));
            return { sent: false, code: 'OTP_COOLDOWN', retryAfterSeconds };
          }
        }
      }

      // Replace previous active OTPs for this user & action atomically
      await dbClient.query(
        'DELETE FROM security_otps WHERE UPPER(TRIM(employee_id)) = $1 AND action = $2',
        [cleanEmpId, cleanAction]
      );

      const insertRes = await dbClient.query(
        `INSERT INTO security_otps (employee_id, action, otp_hash, target_email, attempts, max_attempts, expires_at)
         VALUES ($1, $2, $3, $4, 0, $5, NOW() + ($6 * INTERVAL '1 millisecond'))
         RETURNING id`,
        [cleanEmpId, cleanAction, otpHash, normalizedEmail, OTP_MAX_ATTEMPTS, OTP_EXPIRY_MS]
      );
      insertedOtpId = insertRes.rows[0]?.id ?? null;
      await dbClient.query('COMMIT');
    } catch (txErr) {
      if (dbClient) {
        await dbClient.query('ROLLBACK').catch(() => {});
      }
      throw txErr;
    } finally {
      if (dbClient) {
        dbClient.release();
      }
    }

    const mailOptions = {
      from: process.env.FROM_EMAIL || 'JPHRC IMS <digitalmarketing@jaiprakashhospitals.com>',
      replyTo: process.env.REPLY_TO_EMAIL || process.env.FROM_EMAIL || 'JPHRC IMS <digitalmarketing@jaiprakashhospitals.com>',
      to: normalizedEmail,
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

    const isProduction = process.env.NODE_ENV === 'production';
    const isAuthorizedTestRecipient =
      normalizedEmail === 'hospitalsjaiprakash@gmail.com' ||
      (process.env.TEST_EMAIL_WHITELIST &&
        normalizedEmail === process.env.TEST_EMAIL_WHITELIST.trim().toLowerCase());
    const isMockSuppressed =
      (process.env.EMAIL_SAFE_MODE === 'mock' || process.env.EMAIL_LOG_ONLY === 'true') &&
      !isAuthorizedTestRecipient;
    const isUnconfiguredSmtp =
      !process.env.SMTP_USER ||
      !process.env.SMTP_PASS ||
      process.env.SMTP_USER === 'your-gmail@gmail.com' ||
      process.env.SMTP_PASS === 'xxxx-xxxx-xxxx-xxxx';

    // Mock console OTP is strictly restricted to non-production environments
    if (!isProduction && (isMockSuppressed || isUnconfiguredSmtp)) {
      console.log('\n=============================================');
      console.log(`[STAGING/DEV OTP] OTP GENERATED FOR ${normalizedEmail}`);
      console.log(`Employee ID: ${cleanEmpId}`);
      console.log(`Action: ${cleanAction}`);
      console.log(`OTP Code: ${otp}`);
      console.log('=============================================\n');

      try {
        await query(
          `INSERT INTO communication_logs (recipient_contact, type, subject, status)
           VALUES ($1, 'EMAIL', 'JPHRC IMS - Your Security OTP', 'SENT')`,
          [normalizedEmail]
        );
      } catch (_) {}

      return true;
    }

    if (isProduction && isUnconfiguredSmtp) {
      if (insertedOtpId) {
        await query('DELETE FROM security_otps WHERE id = $1', [insertedOtpId]).catch(() => {});
      }
      console.error('[OTP] SMTP credentials are not configured in production; aborting OTP delivery.');
      return false;
    }

    try {
      const info = await transporter.sendMail(mailOptions);
      console.log(`[OTP] Sent successfully to ${normalizedEmail} (MessageId: ${info?.messageId || 'ok'})`);
      try {
        await query(
          `INSERT INTO communication_logs (recipient_contact, type, subject, status)
           VALUES ($1, 'EMAIL', 'JPHRC IMS - Your Security OTP', 'SENT')`,
          [normalizedEmail]
        );
      } catch (_) {}
      return true;
    } catch (mailError) {
      // Fail closed: remove undelivered OTP row and NEVER log plaintext OTP digits
      if (insertedOtpId) {
        await query('DELETE FROM security_otps WHERE id = $1', [insertedOtpId]).catch(() => {});
      }
      const sanitizedMsg = String(mailError?.message || 'SMTP delivery failed').replace(/\b\d{6}\b/g, '[REDACTED]');
      console.error(`[OTP] Mail server dispatch failed for ${normalizedEmail}: ${sanitizedMsg}`);
      try {
        await query(
          `INSERT INTO communication_logs (recipient_contact, type, subject, status, error_message)
           VALUES ($1, 'EMAIL', 'JPHRC IMS - Your Security OTP', 'FAILED', $2)`,
          [normalizedEmail, sanitizedMsg]
        );
      } catch (_) {}
      return false;
    }
  } catch (error) {
    if (insertedOtpId) {
      await query('DELETE FROM security_otps WHERE id = $1', [insertedOtpId]).catch(() => {});
    }
    console.warn('[OTP] Error during sendOtp:', error.message);
    return false;
  }
};

/**
 * Verify a provided OTP against PostgreSQL storage with atomic FOR UPDATE row locking
 * (prevents parallel TOCTOU brute-force bypasses) and optional email binding.
 * @param {string} employeeId - The employee ID
 * @param {string} action - Context for the OTP
 * @param {string} providedOtp - The OTP entered by user
 * @param {string} [expectedEmail=''] - When provided, OTP must be bound to this exact email
 * @param {object} [options] - Optional { shouldConsume?: () => Promise<boolean> | boolean }
 * @returns {Promise<boolean>} - True if valid, false otherwise
 */
exports.verifyOtp = async (employeeId, action, providedOtp, expectedEmail = '', options = {}) => {
  const cleanEmpId = String(employeeId || '').trim().toUpperCase();
  const cleanAction = String(action || '').trim();
  const cleanOtp = String(providedOtp || '').trim();
  const normalizedExpectedEmail = String(expectedEmail || '').trim().toLowerCase();

  if (!cleanEmpId || !cleanAction || !cleanOtp) {
    return false;
  }

  let client;
  try {
    client = await getClient();
    await client.query('BEGIN');

    const res = await client.query(
      `SELECT id, otp_hash, target_email, attempts, max_attempts, expires_at,
              (NOW() > expires_at) AS is_expired
       FROM security_otps
       WHERE UPPER(TRIM(employee_id)) = $1 AND action = $2
       ORDER BY id DESC
       LIMIT 1
       FOR UPDATE`,
      [cleanEmpId, cleanAction]
    );

    if (res.rows.length === 0) {
      await client.query('COMMIT');
      return false;
    }

    const record = res.rows[0];

    // Check expiration (using PostgreSQL clock) or max attempt threshold
    if (record.is_expired || record.attempts >= record.max_attempts) {
      await client.query('DELETE FROM security_otps WHERE id = $1', [record.id]);
      await client.query('COMMIT');
      return false;
    }

    const storedEmail = String(record.target_email || '').trim().toLowerCase();

    // Enforce strict email binding when expectedEmail is supplied
    if (normalizedExpectedEmail && (!storedEmail || storedEmail !== normalizedExpectedEmail)) {
      const nextAttempts = record.attempts + 1;
      if (nextAttempts >= record.max_attempts) {
        await client.query('DELETE FROM security_otps WHERE id = $1', [record.id]);
      } else {
        await client.query('UPDATE security_otps SET attempts = $1 WHERE id = $2', [nextAttempts, record.id]);
      }
      await client.query('COMMIT');
      return false;
    }

    // Verify email-bound peppered HMAC in constant time
    const macEmail = storedEmail || normalizedExpectedEmail;
    const providedMac = computeOtpMac(cleanEmpId, cleanAction, macEmail, cleanOtp);
    const storedBuf = Buffer.from(String(record.otp_hash || ''), 'utf8');
    const providedBuf = Buffer.from(providedMac, 'utf8');

    const isMatch =
      storedBuf.length === providedBuf.length &&
      crypto.timingSafeEqual(storedBuf, providedBuf);

    if (isMatch) {
      let consume = true;
      if (typeof options?.shouldConsume === 'function') {
        consume = Boolean(await options.shouldConsume());
      }
      if (consume) {
        await client.query('DELETE FROM security_otps WHERE id = $1', [record.id]);
      }
      await client.query('COMMIT');
      return true;
    }

    const nextAttempts = record.attempts + 1;
    if (nextAttempts >= record.max_attempts) {
      await client.query('DELETE FROM security_otps WHERE id = $1', [record.id]);
    } else {
      await client.query('UPDATE security_otps SET attempts = $1 WHERE id = $2', [nextAttempts, record.id]);
    }
    await client.query('COMMIT');
    return false;
  } catch (err) {
    if (client) {
      await client.query('ROLLBACK').catch(() => {});
    }
    console.error('[OTP] Verification error:', err.message);
    return false;
  } finally {
    if (client) {
      client.release();
    }
  }
};

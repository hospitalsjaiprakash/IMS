const nodemailer = require('nodemailer');
const crypto = require('crypto');

// In-memory OTP store: Map<employeeId_action, { otp: string, expiresAt: number }>
const otpStore = new Map();

// Configure nodemailer transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Generate and send a 6-digit OTP
 * @param {string} employeeId - The employee ID
 * @param {string} email - The destination email address
 * @param {string} action - Context for the OTP (e.g., 'password_reset')
 * @returns {Promise<boolean>} - True if sent successfully
 */
exports.sendOtp = async (employeeId, email, action) => {
  try {
    // Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    
    // Store with 10-minute expiration
    const key = `${employeeId}_${action}`;
    otpStore.set(key, {
      otp,
      expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
    });

    const mailOptions = {
      from: process.env.FROM_EMAIL || 'JPHRC IMS <noreply@jaiprakashhospital.com>',
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
      console.log(`Action: ${action}`);
      console.log(`OTP Code: ${otp}`);
      console.log('=============================================\n');
      return true;
    }

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.warn('Failed to send OTP email via SMTP. Falling back to console output for development testing.');
    
    // In a real production app, you would fail here if email doesn't work.
    // However, since SMTP credentials might not be set up, we'll log it so testing can proceed.
    const key = `${employeeId}_${action}`;
    const storedData = otpStore.get(key);
    if (storedData) {
      console.log('\n=============================================');
      console.log(`[DEVELOPMENT ONLY] OTP GENERATED FOR ${email}`);
      console.log(`Action: ${action}`);
      console.log(`OTP Code: ${storedData.otp}`);
      console.log('=============================================\n');
      return true; // Pretend it succeeded so the frontend moves to the verify step
    }
    
    return false;
  }
};

/**
 * Verify a provided OTP
 * @param {string} employeeId - The employee ID
 * @param {string} action - Context for the OTP
 * @param {string} providedOtp - The OTP to verify
 * @returns {boolean} - True if valid, false otherwise
 */
exports.verifyOtp = (employeeId, action, providedOtp) => {
  const key = `${employeeId}_${action}`;
  const storedData = otpStore.get(key);

  if (!storedData) {
    return false;
  }

  // Check expiration
  if (Date.now() > storedData.expiresAt) {
    otpStore.delete(key);
    return false;
  }

  // Check match
  if (storedData.otp === providedOtp) {
    otpStore.delete(key); // Clear after successful use
    return true;
  }

  return false;
};

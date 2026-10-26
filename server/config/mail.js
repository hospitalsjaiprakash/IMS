const path = require('path');
const nodemailer = require('nodemailer');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const isSmtpConfigured = () => {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  return Boolean(
    user &&
    pass &&
    user !== 'your-gmail@gmail.com' &&
    pass !== 'xxxx-xxxx-xxxx-xxxx' &&
    user !== 'test@example.com'
  );
};

// Enterprise-grade pooled SMTP transporter with rate limiting & connection reuse
const transporter = nodemailer.createTransport({
  pool: true,
  maxConnections: 3,
  maxMessages: 100,
  rateLimit: 5, // max 5 messages per second to avoid relay throttling
  host: process.env.SMTP_HOST || '127.0.0.1',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  connectionTimeout: 10000, // 10s
  greetingTimeout: 5000,    // 5s
  socketTimeout: 30000,     // 30s
  tls: {
    rejectUnauthorized: false, // Prevents certificate altname mismatch drops on corporate relays
    minVersion: 'TLSv1.2',
  },
});

// Non-blocking verification when SMTP is configured
if (process.env.NODE_ENV !== 'test' && isSmtpConfigured()) {
  transporter.verify()
    .then(() => {
      console.log('[SMTP] Connection pool established and ready to dispatch messages');
    })
    .catch((error) => {
      console.warn('[SMTP] Initial connection warning (will retry on dispatch):', error.message);
    });
}

transporter.on('error', (err) => {
  console.warn('[SMTP Pool Error]:', err.message);
});

module.exports = transporter;
module.exports.isSmtpConfigured = isSmtpConfigured;
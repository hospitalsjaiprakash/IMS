const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Verify SMTP connection/configuration
transporter.verify()
  .then(() => {
    console.log('[SMTP] Server is ready to accept messages');
  })
  .catch((error) => {
    console.error('[SMTP] Verification failed:', error.message);
  });

module.exports = transporter;
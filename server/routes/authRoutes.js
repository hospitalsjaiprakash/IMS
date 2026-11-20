const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate, authorize } = require('../middleware/auth');
const {
  authLimiter,
  loginLimiter,
  otpAccountLimiter,
  otpIpLimiter,
  otpVerifyLimiter
} = require('../middleware/rateLimiter');

// Apply base rate limiter to all auth endpoints
router.use(authLimiter);

router.post('/register-otp', otpAccountLimiter, otpIpLimiter, authController.requestRegistrationOtp);
router.post('/register', otpVerifyLimiter, authController.register);
router.post('/login', loginLimiter, authController.login);
router.post('/logout', authenticate, authController.logout);
router.post('/committee-login', loginLimiter, authController.committeeLogin);
router.post('/switch-role', authenticate, authController.switchRole);
router.post('/forgot-password', otpAccountLimiter, otpIpLimiter, authController.forgotPasswordRequest);
router.post('/reset-password', otpVerifyLimiter, authController.resetPassword);
router.post('/employee-forgot-password', otpAccountLimiter, otpIpLimiter, authController.requestEmployeePasswordReset);
router.post('/employee-reset-password', otpVerifyLimiter, authController.resetEmployeePassword);
router.post('/change-password-otp', authenticate, otpAccountLimiter, otpIpLimiter, authController.requestChangePasswordOtp);
router.post('/admin-email-otp', authenticate, authorize('system_admin'), otpAccountLimiter, otpIpLimiter, authController.requestAdminEmailChangeOtp);
router.get('/me', authenticate, authController.getMe);
router.get('/committee-members', authenticate, authorize('imc', 'head_management', 'system_admin'), authController.getCommitteeMembers);
router.post('/leave-role', authenticate, authController.leaveRole);
router.put('/contact-info', authenticate, otpVerifyLimiter, authController.updateContactInfo);

module.exports = router;

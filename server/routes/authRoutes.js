const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { authLimiter, loginLimiter, otpLimiter } = require('../middleware/rateLimiter');

// Apply base rate limiter to all auth endpoints
router.use(authLimiter);

router.post('/register-otp', otpLimiter, authController.requestRegistrationOtp);
router.post('/register', authController.register);
router.post('/login', loginLimiter, authController.login);
router.post('/committee-login', loginLimiter, authController.committeeLogin);
router.post('/switch-role', authenticate, authController.switchRole);
router.post('/forgot-password', otpLimiter, authController.forgotPasswordRequest);
router.post('/reset-password', authController.resetPassword);
router.post('/employee-forgot-password', otpLimiter, authController.requestEmployeePasswordReset);
router.post('/employee-reset-password', authController.resetEmployeePassword);
router.post('/change-password-otp', authenticate, otpLimiter, authController.requestChangePasswordOtp);
router.get('/me', authenticate, authController.getMe);
router.get('/committee-members', authenticate, authController.getCommitteeMembers);
router.post('/leave-role', authenticate, authController.leaveRole);
router.put('/contact-info', authenticate, authController.updateContactInfo);

module.exports = router;

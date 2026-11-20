const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = rateLimit;

// Rate limiting for general auth routes
const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP, please try again after 5 minutes' }
});

// Strict login rate limiter: 10 failed attempts per 15 minutes per IP + Employee ID / Username
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const ipKey = ipKeyGenerator(req.ip || 'unknown');
    const accountKey = String(req.body?.employeeId || req.body?.username || '')
      .trim()
      .toUpperCase();
    return `${ipKey}:${accountKey}`;
  },
  message: { error: 'Too many failed login attempts. Please try again after 15 minutes.' }
});

// Dual-layer OTP request limiters (hospital NAT-safe):
// 1. Per-account cap: 5 OTP requests per 15 minutes per Employee ID (or authenticated user)
const otpAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const accountKey = String(
      req.body?.employeeId || req.user?.employee_id || req.user?.id || ''
    )
      .trim()
      .toUpperCase();
    if (accountKey) {
      return `otp-acct:${accountKey}`;
    }
    return `otp-ip-fallback:${ipKeyGenerator(req.ip || 'unknown')}`;
  },
  message: {
    error: 'Too many OTP requests for this account. Please try again after 15 minutes.',
    code: 'OTP_RATE_LIMITED'
  }
});

// 2. NAT-safe per-IP cap: 40 OTP requests per 15 minutes per outbound IP
const otpIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `otp-ip:${ipKeyGenerator(req.ip || 'unknown')}`,
  message: {
    error: 'Too many OTP requests from this network. Please try again after 15 minutes.',
    code: 'OTP_IP_RATE_LIMITED'
  }
});

// OTP verification limiter: 10 attempts per 15 minutes per IP + Employee ID
const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const ipKey = ipKeyGenerator(req.ip || 'unknown');
    const accountKey = String(
      req.body?.employeeId || req.user?.employee_id || req.user?.id || ''
    )
      .trim()
      .toUpperCase();
    return `otp-verify:${ipKey}:${accountKey}`;
  },
  message: {
    error: 'Too many OTP verification attempts. Please try again after 15 minutes.',
    code: 'OTP_VERIFY_RATE_LIMITED'
  }
});

// Backward-compatible alias (used by retired admin routes if referenced)
const otpLimiter = otpAccountLimiter;

// Dedicated public webhook limiter: 120 deliveries per minute per IP
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Webhook rate limit exceeded. Please retry shortly.' }
});

// Global API limiter: 300 requests per minute per IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many API requests from this IP. Please try again in a minute.' }
});

module.exports = {
  authLimiter,
  loginLimiter,
  otpLimiter,
  otpAccountLimiter,
  otpIpLimiter,
  otpVerifyLimiter,
  webhookLimiter,
  apiLimiter
};

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

// Strict OTP rate limiter: 5 requests per 15 minutes per IP
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many OTP requests. Please try again after 15 minutes.' }
});

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
  webhookLimiter,
  apiLimiter
};

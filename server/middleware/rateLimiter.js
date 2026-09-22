const rateLimit = require('express-rate-limit');

// Rate limiting for general auth routes
const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes window
  max: 50, // Limit each IP to 50 requests per windowMs
  message: { error: 'Too many requests from this IP, please try again after 5 minutes' }
});

// Stricter rate limiting for login attempts
const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes window
  max: 50,
  message: { error: 'Too many login attempts from this IP, please try again after 5 minutes' }
});

module.exports = {
  authLimiter,
  loginLimiter
};

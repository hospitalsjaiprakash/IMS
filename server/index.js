const path = require('path');
const initialNodeEnv = process.env.NODE_ENV;
require('dotenv').config({ path: path.resolve(__dirname, '.env'), override: true });
if (initialNodeEnv === 'test') {
  process.env.NODE_ENV = 'test';
}

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required.");
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { Server } = require('socket.io');
const http = require('http');
const AppError = require('./utils/AppError');
const { verifyJwtAndLoadActiveUser } = require('./middleware/auth');
const { apiLimiter } = require('./middleware/rateLimiter');
// Only run cron on instance 0 in PM2 cluster to prevent duplicate execution (skip in test environment)
if (process.env.NODE_ENV !== 'test' && (!process.env.NODE_APP_INSTANCE || process.env.NODE_APP_INSTANCE === '0')) {
  require('./services/cronService'); // Initialize cron jobs
}

const isProduction = process.env.NODE_ENV === 'production';

const devOnlyOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'https://jpims.vercel.app'
];

const extraAllowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const allowedOrigins = Array.from(new Set([
  ...(isProduction ? [] : devOnlyOrigins),
  'https://ims.jaiprakashhospitals.com',
  process.env.CLIENT_URL,
  ...extraAllowedOrigins
].filter(Boolean)));

const app = express();
app.disable('x-powered-by');
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true
  }
});

// Attach socket io to req object
app.use((req, res, next) => {
  req.io = io;
  next();
});
const PORT = parseInt(process.env.PORT || '5000', 10);
const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0');

// Trust the reverse proxy (Render, Vercel, Apache, etc) so rate limiters use the real client IP
app.set('trust proxy', 1);

// ─── MIDDLEWARE ───────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  frameguard: { action: 'sameorigin' }
}));

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
}));

// Redact sensitive query parameters before writing access logs
morgan.token('safe-url', (req) => {
  const raw = req.originalUrl || req.url || '';
  const qIndex = raw.indexOf('?');
  if (qIndex === -1) return raw;
  const base = raw.slice(0, qIndex);
  try {
    const params = new URLSearchParams(raw.slice(qIndex + 1));
    for (const k of Array.from(params.keys())) {
      if (/^(token|key|secret|otp|password|access_token|auth)$/i.test(k)) {
        params.set(k, '[REDACTED]');
      }
    }
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  } catch (_) {
    return `${base}?[REDACTED]`;
  }
});

app.use(morgan(':remote-addr - :remote-user [:date[clf]] ":method :safe-url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"'));

// Enforce strict 2 MB payload limit on public webhook endpoints before global JSON parser
const webhookJsonParser = express.json({
  limit: '2mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
});
app.use('/webhooks', webhookJsonParser);
app.use('/api/webhooks', webhookJsonParser);

app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// NOTE: Static /uploads mount is intentionally removed — Cloudflare R2 is mandatory and
// all attachments are served exclusively via authorized short-lived presigned URLs.

// ─── ROUTES ───────────────────────────────────────
// Health check handler (verifies DB connection)
const healthHandler = async (req, res) => {
  let dbStatus = 'connected';
  try {
    const { pool } = require('./config/database');
    await pool.query('SELECT 1');
  } catch (err) {
    dbStatus = `disconnected: ${err.message}`;
  }

  const isHealthy = dbStatus === 'connected';
  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'ok' : 'degraded',
    service: 'JPHRC IMS API',
    database: dbStatus,
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    instance: process.env.NODE_APP_INSTANCE || '0'
  });
};

app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

app.use('/webhooks', require('./routes/webhookRoutes'));
// Global API rate limiter (300/min per IP); webhook routes use their own dedicated webhookLimiter
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/webhooks')) return next();
  return apiLimiter(req, res, next);
});
app.use('/api', require('./routes/index'));

// Root route for API ping
app.get('/', (req, res) => {
  res.status(200).send('IMS API is running!');
});

// Keep-alive ping endpoint (called by client on load to wake up the server)
app.get('/ping', (req, res) => {
  res.json({ alive: true, ts: Date.now() });
});

// ─── ERROR HANDLER ────────────────────────────────
app.all('*', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

app.use((err, req, res, next) => {
  // Handle oversized JSON/webhook payloads cleanly
  if (err.type === 'entity.too.large' || err.status === 413) {
    return res.status(413).json({ status: 'error', error: 'Request payload exceeds maximum allowed size.' });
  }
  // Handle Multer upload errors
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ status: 'error', error: 'File size exceeds maximum allowed limit of 2MB per file.' });
    }
    return res.status(400).json({ status: 'error', error: err.message });
  }
  if (err.statusCode === 400 || (err.message && (err.message.includes('not allowed') || err.message.includes('not permitted')))) {
    return res.status(400).json({ status: 'error', error: err.message });
  }

  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    console.error('Unhandled error:', err);
    res.status(err.statusCode).json({
      status: err.status,
      error: err,
      message: err.message,
      stack: err.stack
    });
  } else {
    // Production
    if (err.isOperational) {
      res.status(err.statusCode).json({
        status: err.status,
        error: err.message
      });
    } else {
      console.error('ERROR 💥', err);
      res.status(500).json({
        status: 'error',
        error: 'Something went very wrong!'
      });
    }
  }
});

// ─── START ────────────────────────────────────────
// Authenticate every Socket.IO connection via verified HS256 JWT (never trust query.userId)
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth && typeof socket.handshake.auth.token === 'string'
      ? socket.handshake.auth.token.trim()
      : null;

    if (!token) {
      return next(new Error('UNAUTHORIZED'));
    }

    const user = await verifyJwtAndLoadActiveUser(token);
    socket.user = user;
    return next();
  } catch (err) {
    const code =
      err.code === 'ACCOUNT_DISABLED'
        ? 'ACCOUNT_DISABLED'
        : err.code === 'SESSION_REVOKED'
          ? 'SESSION_REVOKED'
          : 'UNAUTHORIZED';
    return next(new Error(code));
  }
});

io.on('connection', (socket) => {
  if (socket.user && socket.user.id) {
    socket.join(`user_${socket.user.id}`);
  }
  socket.on('disconnect', () => {
  });
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    // ─── Self-ping to prevent Render free-tier cold starts ───
    // Render shuts down free services after 15 min of inactivity.
    // We ping ourselves every 14 min to stay warm.
    if (process.env.RENDER_EXTERNAL_URL || process.env.SELF_PING_URL) {
      const selfUrl = (process.env.RENDER_EXTERNAL_URL || process.env.SELF_PING_URL).replace(/\/$/, '');
      const pingInterval = 14 * 60 * 1000; // 14 minutes
      setInterval(async () => {
        try {
          const http = require('https');
          http.get(`${selfUrl}/ping`, (res) => {
            console.log(`[keep-alive] Self-ping OK (status ${res.statusCode})`);
          }).on('error', (err) => {
            console.warn('[keep-alive] Self-ping failed:', err.message);
          });
        } catch (e) {
          // Silently ignore ping errors
        }
      }, pingInterval);
      console.log(`[keep-alive] Self-ping enabled every 14 min → ${selfUrl}/ping`);
    }
    console.log(`
  ╔══════════════════════════════════════════════════╗
  ║   JPHRC Incident Management System - API         ║
  ║   Running on http://${HOST}:${PORT}               ║
  ║   Environment: ${(process.env.NODE_ENV || 'development').padEnd(32)}║
  ╚══════════════════════════════════════════════════╝
    `);
  });
}

module.exports = { app, server, io };

require('dotenv').config();

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required.");
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');
const http = require('http');
const AppError = require('./utils/AppError');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174', 'https://jpims.vercel.app', process.env.CLIENT_URL].filter(Boolean),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true
  }
});

// Attach socket io to req object
app.use((req, res, next) => {
  req.io = io;
  next();
});
const PORT = process.env.PORT || 5000;

// Trust the reverse proxy (Render, Vercel, etc) so rate limiters use the real client IP
app.set('trust proxy', 1);

// ─── MIDDLEWARE ───────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174', 'https://jpims.vercel.app', process.env.CLIENT_URL].filter(Boolean),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
}));

app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Uploads directory
const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(path.resolve(uploadDir)));

// ─── ROUTES ───────────────────────────────────────
app.use('/api', require('./routes/index'));

// Root route for Render health checks
app.get('/', (req, res) => {
  res.status(200).send('IMS API is running!');
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'JPHRC IMS API',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
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
io.on('connection', (socket) => {
  const userId = socket.handshake.query.userId;
  if (userId) {
    socket.join(`user_${userId}`);
  }
  socket.on('disconnect', () => {
  });
});

server.listen(PORT, () => {
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
  ║   Running on http://localhost:${PORT}               ║
  ║   Environment: ${(process.env.NODE_ENV || 'development').padEnd(32)}║
  ╚══════════════════════════════════════════════════╝
  `);
});

module.exports = { app, server, io };

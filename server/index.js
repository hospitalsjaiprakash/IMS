require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

// ─── MIDDLEWARE ───────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174', process.env.CLIENT_URL].filter(Boolean),
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

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'JPHRC IMS API',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// ─── ERROR HANDLER ────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message
  });
});

// ─── 404 ──────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── START ────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════════════╗
  ║   JPHRC Incident Management System - API         ║
  ║   Running on http://localhost:${PORT}               ║
  ║   Environment: ${(process.env.NODE_ENV || 'development').padEnd(32)}║
  ╚══════════════════════════════════════════════════╝
  `);
});

module.exports = app;

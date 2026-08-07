require('dotenv').config();
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
    origin: ['http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174', process.env.CLIENT_URL].filter(Boolean),
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  }
});

// Attach socket io to req object
app.use((req, res, next) => {
  req.io = io;
  next();
});
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
  console.log('Client connected to socket:', socket.id);
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════════════╗
  ║   JPHRC Incident Management System - API         ║
  ║   Running on http://localhost:${PORT}               ║
  ║   Environment: ${(process.env.NODE_ENV || 'development').padEnd(32)}║
  ╚══════════════════════════════════════════════════╝
  `);
});

module.exports = { app, server, io };

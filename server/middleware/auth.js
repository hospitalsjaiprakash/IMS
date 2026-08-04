const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const result = await query(
      'SELECT id, employee_id, full_name, email, role, department, designation, is_imc_lead FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    next(error);
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
    }
    next();
  };
};

const auditLog = async (userId, action, incidentId, details, ipAddress) => {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, incident_id, action, details, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, incidentId || null, action, JSON.stringify(details || {}), ipAddress]
    );
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
};

module.exports = { authenticate, authorize, auditLog };

const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const { isEmployeeLockedOut } = require('../services/officePortalService');

const authenticate = async (req, res, next) => {
  try {
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.query && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const result = await query(
      `SELECT u.id, u.employee_id, u.full_name, u.email, u.role, u.department, u.designation,
              u.is_active, u.is_imc_lead, u.is_imc_member, u.is_management_member, u.is_system_admin,
              me.status AS hrms_status, me.portal_access_disable_date
       FROM users u
       LEFT JOIN master_employees me ON me.employee_id = u.employee_id
       WHERE u.id = $1`,
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const userRow = result.rows[0];
    const empCodeUpper = String(userRow.employee_id || '').trim().toUpperCase();
    const isGenericSystem = ['00000', 'SYS_IMC', 'SYS_MGMT'].includes(empCodeUpper);

    if (!isGenericSystem) {
      const hrmsBlocked = isEmployeeLockedOut(
        userRow.hrms_status,
        userRow.portal_access_disable_date
      );

      if (userRow.is_active === false || hrmsBlocked) {
        return res.status(403).json({
          error: 'Access denied. Your account has been disabled or deactivated in HRMS.',
          code: 'ACCOUNT_DISABLED'
        });
      }
    }

    req.user = userRow;
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
    if (!req.user) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const userRole = req.user.role;
    const isAllowed = roles.some(role => {
      if (role === userRole) return true;
      if (role === 'imc' && (req.user.is_imc_member || req.user.is_imc_lead || userRole === 'imc')) return true;
      if (role === 'system_admin' && (req.user.is_system_admin || userRole === 'system_admin')) return true;
      if (role === 'head_management' && (req.user.is_management_member || userRole === 'head_management')) return true;
      return false;
    });

    if (!isAllowed) {
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

const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const { isEmployeeLockedOut } = require('../services/officePortalService');

/**
 * Atomically increment a user's token_version so all previously issued JWTs
 * are immediately rejected on HTTP and Socket.IO requests.
 */
const bumpUserTokenVersion = async (userId) => {
  if (!userId) return null;
  const res = await query(
    `UPDATE users
     SET token_version = COALESCE(token_version, 1) + 1,
         updated_at = NOW()
     WHERE id = $1
     RETURNING token_version`,
    [userId]
  );
  return res.rows[0]?.token_version ?? null;
};

/**
 * Verify a Bearer JWT (strictly HS256) and load the active user record from PostgreSQL,
 * enforcing token_version revocation and live HRMS lifecycle lockouts
 * (terminated/inactive/deleted/portalAccessDisableDate).
 * Shared by HTTP `authenticate` middleware and Socket.IO `io.use()` handshake authentication.
 */
const verifyJwtAndLoadActiveUser = async (token) => {
  if (!token || typeof token !== 'string') {
    const err = new Error('No token provided');
    err.statusCode = 401;
    err.code = 'NO_TOKEN';
    throw err;
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch (jwtErr) {
    const err = new Error(jwtErr.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token');
    err.statusCode = 401;
    err.code = jwtErr.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN';
    throw err;
  }

  const userId = decoded.userId || decoded.id;
  if (!userId) {
    const err = new Error('Invalid token');
    err.statusCode = 401;
    err.code = 'INVALID_TOKEN';
    throw err;
  }

  const result = await query(
    `SELECT u.id, u.employee_id, u.full_name, u.email, u.role, u.department, u.designation,
            u.is_active, u.is_imc_lead, u.is_imc_member, u.is_management_member, u.is_system_admin,
            u.token_version,
            me.status AS hrms_status, me.portal_access_disable_date
     FROM users u
     LEFT JOIN master_employees me ON me.employee_id = u.employee_id
     WHERE u.id = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    const err = new Error('User not found');
    err.statusCode = 401;
    err.code = 'USER_NOT_FOUND';
    throw err;
  }

  const userRow = result.rows[0];
  const currentTokenVersion = typeof userRow.token_version === 'number' ? userRow.token_version : 1;

  // Enforce server-side JWT revocation (legacy tokens without numeric `tv` are rejected cleanly)
  if (typeof decoded.tv !== 'number' || decoded.tv !== currentTokenVersion) {
    const err = new Error('Session has been revoked. Please log in again.');
    err.statusCode = 401;
    err.code = 'SESSION_REVOKED';
    throw err;
  }

  const empCodeUpper = String(userRow.employee_id || '').trim().toUpperCase();
  // Only root System Admin (00000) is exempt from HRMS directory lookup;
  // retired shared accounts (SYS_IMC, SYS_MGMT) are deactivated and blocked.
  const isRootAdmin = empCodeUpper === '00000';

  if (!isRootAdmin) {
    const hrmsBlocked = isEmployeeLockedOut(
      userRow.hrms_status,
      userRow.portal_access_disable_date
    );

    if (userRow.is_active === false || hrmsBlocked) {
      const err = new Error('Access denied. Your account has been disabled or deactivated in HRMS.');
      err.statusCode = 403;
      err.code = 'ACCOUNT_DISABLED';
      throw err;
    }
  }

  return userRow;
};

const authenticate = async (req, res, next) => {
  try {
    // Strictly accept JWT via Authorization: Bearer <token> only (no ?token= query string leaks)
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    }

    if (!token) {
      return res.status(401).json({ error: 'No token provided', code: 'NO_TOKEN' });
    }

    req.user = await verifyJwtAndLoadActiveUser(token);
    next();
  } catch (error) {
    if (error.statusCode === 401) {
      return res.status(401).json({
        error: error.message,
        code: error.code || 'UNAUTHORIZED'
      });
    }
    if (error.statusCode === 403) {
      return res.status(403).json({
        error: error.message,
        code: error.code || 'ACCOUNT_DISABLED'
      });
    }
    next(error);
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'No token provided', code: 'NO_TOKEN' });
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

module.exports = {
  authenticate,
  authorize,
  auditLog,
  verifyJwtAndLoadActiveUser,
  bumpUserTokenVersion
};

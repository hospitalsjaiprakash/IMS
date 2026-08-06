const { query } = require('../config/database');
const { auditLog } = require('../middleware/auth');

exports.getSystemConfig = async (req, res) => {
  try {
    const result = await query('SELECT * FROM system_config ORDER BY key');
    const config = {};
    result.rows.forEach(row => { config[row.key] = row.value; });
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch config' });
  }
};

exports.updateSystemConfig = async (req, res) => {
  try {
    const updates = req.body;
    for (const [key, value] of Object.entries(updates)) {
      await query(
        `INSERT INTO system_config (key, value, updated_by, updated_at) VALUES ($1, $2, $3, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
        [key, String(value), req.user.id]
      );
    }
    await auditLog(req.user.id, 'CONFIG_UPDATED', null, updates, req.ip);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update config' });
  }
};

exports.getImcMembers = async (req, res) => {
  try {
    const result = await query(
      `SELECT id, employee_id, full_name, email, department, designation, role, is_imc_lead, is_imc_member, last_sync
       FROM users WHERE role = 'imc' OR is_imc_member = TRUE ORDER BY full_name`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch IMC members' });
  }
};

const revokeCommitteeAccess = async (req, res, targetId, roleType) => {
  try {
    if (!targetId) {
      return res.status(400).json({ error: 'Target user ID or Employee ID is required.' });
    }

    const userResult = await query(
      'SELECT * FROM users WHERE id::text = $1 OR employee_id = $1',
      [String(targetId).trim()]
    );
    if (!userResult.rows.length) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    const user = userResult.rows[0];
    const prevRole = user.role;
    let newRole = user.role;
    let updateSql = '';
    let auditLabel = '';
    let actionName = '';

    if (roleType === 'imc') {
      newRole = user.role === 'imc' ? 'employee' : user.role;
      updateSql = `UPDATE users SET role = $1, is_imc_lead = FALSE, is_imc_member = FALSE, updated_at = NOW() WHERE id = $2`;
      auditLabel = 'employee (Revoked IMC Access)';
      actionName = 'IMC_ACCESS_STOPPED';
    } else if (roleType === 'head_management') {
      newRole = user.role === 'head_management' ? 'employee' : user.role;
      updateSql = `UPDATE users SET role = $1, is_management_member = FALSE, updated_at = NOW() WHERE id = $2`;
      auditLabel = 'employee (Revoked Management Access)';
      actionName = 'MANAGEMENT_ACCESS_STOPPED';
    } else {
      return res.status(400).json({ error: 'Invalid role access revocation requested.' });
    }

    await query(updateSql, [newRole, user.id]);

    await query(
      `INSERT INTO role_audit (employee_id, previous_role, new_role, changed_by)
       VALUES ($1, $2, $3, $4)`,
      [user.id, prevRole, auditLabel, req.user.id]
    );

    await auditLog(req.user.id, actionName, null, {
      targetEmployee: user.employee_id,
      prevRole,
      newRole
    }, req.ip);

    const roleDisplayName = roleType === 'imc' ? 'IMC' : 'Management';
    return res.json({
      success: true,
      message: `Successfully revoked ${roleDisplayName} access for ${user.full_name} (${user.employee_id}).`
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to revoke committee access.' });
  }
};

exports.assignImcRole = async (req, res) => {
  try {
    const { employeeId, isImcLead } = req.body;
    if (!employeeId) {
      return res.status(400).json({ error: 'Employee ID is required.' });
    }

    const userResult = await query(
      'SELECT * FROM users WHERE employee_id = $1 OR id::text = $1',
      [String(employeeId).trim()]
    );
    if (!userResult.rows.length) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    const user = userResult.rows[0];
    const prevRole = user.role;

    await query(
      `UPDATE users SET role = 'imc', is_imc_lead = $1, is_imc_member = TRUE, updated_at = NOW() WHERE id = $2`,
      [Boolean(isImcLead), user.id]
    );

    await query(
      `INSERT INTO role_audit (employee_id, previous_role, new_role, changed_by)
       VALUES ($1, $2, 'imc', $3)`,
      [user.id, prevRole, req.user.id]
    );

    await auditLog(req.user.id, 'ROLE_ASSIGNED_IMC', null, {
      targetEmployee: user.employee_id, prevRole, newRole: 'imc'
    }, req.ip);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to assign IMC role.' });
  }
};

exports.removeImcRole = async (req, res) => {
  return revokeCommitteeAccess(req, res, req.params.id || req.body.employeeId || req.body.id, 'imc');
};

exports.stopImcAccess = async (req, res) => {
  return revokeCommitteeAccess(req, res, req.body.employeeId || req.body.id || req.params.id, 'imc');
};

exports.assignUserRole = async (req, res) => {
  try {
    const { employeeId, targetRole, departmentId } = req.body;
    if (!employeeId || !targetRole) {
      return res.status(400).json({ error: 'Employee ID and Role are required.' });
    }

    const userResult = await query(
      'SELECT * FROM users WHERE employee_id = $1 OR id::text = $1',
      [String(employeeId).trim()]
    );
    if (!userResult.rows.length) {
      return res.status(404).json({ error: 'Employee not found in IMS users table. They must register first.' });
    }

    const user = userResult.rows[0];
    const prevRole = user.role;

    let updateSql = `UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2`;
    if (targetRole === 'imc') {
      updateSql = `UPDATE users SET role = $1, is_imc_member = TRUE, updated_at = NOW() WHERE id = $2`;
    } else if (targetRole === 'head_management') {
      updateSql = `UPDATE users SET role = $1, is_management_member = TRUE, updated_at = NOW() WHERE id = $2`;
    } else if (targetRole === 'system_admin') {
      updateSql = `UPDATE users SET role = $1, is_system_admin = TRUE, updated_at = NOW() WHERE id = $2`;
    }
    await query(updateSql, [targetRole, user.id]);

    if (targetRole === 'hod' && departmentId) {
      await query(`UPDATE departments SET hod_user_id = $1 WHERE id = $2`, [user.id, departmentId]);
      await query(`UPDATE users SET department = (SELECT name FROM departments WHERE id = $1) WHERE id = $2`, [departmentId, user.id]);
    }

    await query(
      `INSERT INTO role_audit (employee_id, previous_role, new_role, changed_by)
       VALUES ($1, $2, $3, $4)`,
      [user.id, prevRole, targetRole, req.user.id]
    );

    await auditLog(req.user.id, 'ROLE_ASSIGNED', null, {
      targetEmployee: user.employee_id, prevRole, newRole: targetRole, departmentId
    }, req.ip);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to assign role.' });
  }
};

exports.getAuditLogs = async (req, res) => {
  try {
    const { page = 1, limit = 50, action, dateFrom, dateTo } = req.query;
    const offset = (page - 1) * limit;

    let where = '1=1';
    const params = [];
    let idx = 1;

    if (action) { where += ` AND al.action = $${idx++}`; params.push(action); }
    if (dateFrom) { where += ` AND al.created_at >= $${idx++}`; params.push(dateFrom); }
    if (dateTo) { where += ` AND al.created_at <= $${idx++}`; params.push(dateTo); }

    const result = await query(
      `SELECT al.*, u.full_name, u.employee_id, i.reference_id
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       LEFT JOIN incidents i ON i.id = al.incident_id
       WHERE ${where}
       ORDER BY al.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    );

    const countResult = await query(
      `SELECT COUNT(*) FROM audit_logs al WHERE ${where}`,
      params
    );

    res.json({
      logs: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
};

exports.getSystemAnalytics = async (req, res) => {
  try {
    const [
      incidentsByMonth, avgResolutionTime, byDepartment,
      slaBreach, stalledIncidents, claimStats, kbCount
    ] = await Promise.all([
      query(`SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'Mon YYYY') as month,
        DATE_TRUNC('month', created_at) as month_date, COUNT(*) as count
        FROM incidents WHERE created_at >= NOW() - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', created_at) ORDER BY month_date`),

      query(`SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600) as avg_hours
        FROM incidents WHERE status = 'resolved' AND resolved_at IS NOT NULL`),

      query(`SELECT d.name, COUNT(DISTINCT i.id) as count
        FROM departments d
        JOIN incident_departments id ON id.department_id = d.id
        JOIN incidents i ON i.id = id.incident_id
        GROUP BY d.name ORDER BY count DESC LIMIT 15`),

      query(`SELECT COUNT(*) as sla_breach_count FROM incidents
        WHERE status NOT IN ('resolved','withdrawn')
        AND created_at < NOW() - INTERVAL '7 days'`),

      query(`SELECT status, COUNT(*) as count FROM incidents
        WHERE status NOT IN ('resolved','withdrawn')
        AND updated_at < NOW() - INTERVAL '7 days'
        GROUP BY status`),

      query(`SELECT COUNT(*) FILTER (WHERE is_active=TRUE) as active_claims,
        MAX(EXTRACT(EPOCH FROM (NOW()-claimed_at))/3600) as oldest_claim_hours
        FROM imc_claims`),

      query(`SELECT COUNT(*) as count FROM knowledge_base`)
    ]);

    res.json({
      incidentsByMonth: incidentsByMonth.rows,
      avgResolutionHours: parseFloat(avgResolutionTime.rows[0]?.avg_hours || 0).toFixed(1),
      byDepartment: byDepartment.rows,
      slaBreach: parseInt(slaBreach.rows[0]?.sla_breach_count || 0),
      stalledIncidents: stalledIncidents.rows,
      activeClaims: parseInt(claimStats.rows[0]?.active_claims || 0),
      oldestClaimHours: parseFloat(claimStats.rows[0]?.oldest_claim_hours || 0).toFixed(1),
      knowledgeBaseCount: parseInt(kbCount.rows[0]?.count || 0)
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const { search, role, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    let where = '1=1';
    const params = [];
    let idx = 1;

    if (search) {
      where += ` AND (full_name ILIKE $${idx} OR employee_id ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }
    if (role) {
      if (role === 'imc') {
        where += ` AND (role = 'imc' OR is_imc_member = TRUE)`;
      } else {
        where += ` AND role = $${idx++}`;
        params.push(role);
      }
    }

    const result = await query(
      `SELECT id, employee_id, full_name, email, phone, whatsapp, department, designation, role, is_imc_lead, is_imc_member, is_management_member, is_system_admin, last_sync, is_active
       FROM users WHERE ${where} ORDER BY full_name LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    );

    const countResult = await query(
      `SELECT COUNT(*) FROM users WHERE ${where}`, params
    );

    res.json({
      users: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

exports.toggleUserActiveStatus = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'User ID is required' });

    const userRes = await query('SELECT is_active FROM users WHERE id = $1', [id]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const newStatus = !userRes.rows[0].is_active;

    await query(
      'UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2',
      [newStatus, id]
    );

    await auditLog(req.user.id, newStatus ? 'USER_ACTIVATED' : 'USER_DEACTIVATED', null, { targetUserId: id }, req.ip);

    res.json({ success: true, is_active: newStatus, message: newStatus ? 'Account activated.' : 'Account deactivated.' });
  } catch (error) {
    console.error('Error toggling user status:', error);
    res.status(500).json({ error: 'Failed to toggle user status' });
  }
};

exports.getSystemAdmins = async (req, res) => {
  try {
    const result = await query(
      `SELECT id, employee_id, full_name, email, department, designation, role, is_system_admin, last_sync
       FROM users WHERE role = 'system_admin' OR is_system_admin = TRUE ORDER BY full_name`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch system admins' });
  }
};

exports.getRoleAudit = async (req, res) => {
  try {
    const result = await query(
      `SELECT ra.*, u.full_name as employee_name, u.employee_id,
        c.full_name as changed_by_name
       FROM role_audit ra
       JOIN users u ON u.id = ra.employee_id
       JOIN users c ON c.id = ra.changed_by
       ORDER BY ra.created_at DESC LIMIT 100`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch role audit' });
  }
};

const { sendOtp, verifyOtp } = require('../utils/otpService');

exports.requestPasswordChangeOtp = async (req, res) => {
  try {
    const userRes = await query('SELECT employee_id, email FROM users WHERE id = $1', [req.user.id]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    
    const user = userRes.rows[0];
    if (!user.email) return res.status(400).json({ error: 'No email registered for your account.' });

    const sent = await sendOtp(user.employee_id, user.email, 'admin_password_change');
    if (sent) {
      res.json({ success: true, message: 'OTP sent successfully.' });
    } else {
      res.status(500).json({ error: 'Failed to send OTP.' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.updateRoleCredentials = async (req, res) => {
  try {
    const { targetRole, otp, newPassword } = req.body;
    if (!targetRole || !otp || !newPassword) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    const userRes = await query('SELECT employee_id FROM users WHERE id = $1', [req.user.id]);
    const employeeId = userRes.rows[0].employee_id;

    const isValid = verifyOtp(employeeId, 'admin_password_change', otp);
    if (!isValid) return res.status(400).json({ error: 'Invalid or expired OTP.' });

    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash(newPassword, 10);

    await query(
      'UPDATE role_credentials SET password_hash = $1, updated_at = NOW() WHERE role = $2',
      [hash, targetRole]
    );

    await auditLog(req.user.id, 'ROLE_PASSWORD_UPDATED', null, { targetRole }, req.ip);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getManagementMembers = async (req, res) => {
  try {
    const result = await query(
      `SELECT id, employee_id, full_name, email, department, designation, role, is_management_member, last_sync
       FROM users WHERE role = 'head_management' OR is_management_member = TRUE ORDER BY full_name`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch management members' });
  }
};

exports.removeManagementRole = async (req, res) => {
  return revokeCommitteeAccess(req, res, req.params.id || req.body.employeeId || req.body.id, 'head_management');
};

exports.mapDepartmentLeader = async (req, res) => {
  try {
    const { departmentId, leaderType, employeeId } = req.body;
    if (!departmentId || !leaderType || !employeeId) {
      return res.status(400).json({ error: 'Department, Leader Type, and Employee ID are required.' });
    }

    const userResult = await query(
      'SELECT * FROM users WHERE employee_id = $1 OR id::text = $1',
      [String(employeeId).trim()]
    );
    if (!userResult.rows.length) {
      return res.status(404).json({ error: 'Employee not found in IMS users table. Please verify the Employee ID.' });
    }
    const user = userResult.rows[0];

    let column = 'hod_user_id';
    if (leaderType === 'incharge') {
      column = 'incharge_user_id';
    } else if (leaderType === 'asst_coo') {
      column = 'asst_coo_user_id';
    }

    await query(`UPDATE departments SET ${column} = $1 WHERE id = $2`, [user.id, departmentId]);

    const deptRes = await query('SELECT name FROM departments WHERE id = $1', [departmentId]);
    const deptName = deptRes.rows[0]?.name;

    if (leaderType === 'hod' || leaderType === 'incharge') {
      await query(`UPDATE users SET department = $1, role = CASE WHEN role = 'employee' THEN 'hod' ELSE role END, updated_at = NOW() WHERE id = $2`, [deptName, user.id]);
    } else if (leaderType === 'asst_coo') {
      await query(`UPDATE users SET role = 'head_management', is_management_member = TRUE, updated_at = NOW() WHERE id = $1`, [user.id]);
    }

    await auditLog(req.user.id, 'DEPARTMENT_LEADER_MAPPED', null, {
      departmentId, deptName, leaderType, targetEmployee: user.employee_id, targetName: user.full_name
    }, req.ip);

    res.json({ success: true, message: `Successfully mapped ${user.full_name} (${user.employee_id}) as ${leaderType.toUpperCase()} for ${deptName}.` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to map department leader.' });
  }
};

exports.getSystemHealth = async (req, res) => {
  try {
    const dbStart = Date.now();
    await query('SELECT 1');
    const dbLatency = Date.now() - dbStart;

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: { status: 'up', latencyMs: dbLatency },
        storage: { status: 'up', provider: 'Local / R2 Ready' },
        email: { status: process.env.SMTP_HOST ? 'configured' : 'mocked/console' },
        redis: { status: 'optional/fallback' }
      },
      system: {
        uptimeSeconds: Math.floor(process.uptime()),
        memoryUsageMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        nodeVersion: process.version
      }
    });
  } catch (error) {
    res.status(500).json({ status: 'degraded', error: error.message });
  }
};

exports.getMasterData = async (req, res) => {
  try {
    const [depts, mainLocs, subLocs, desigs] = await Promise.all([
      query('SELECT * FROM departments ORDER BY name'),
      query('SELECT * FROM main_locations ORDER BY name'),
      query('SELECT * FROM sub_locations ORDER BY name'),
      query('SELECT * FROM designations ORDER BY title')
    ]);
    res.json({
      departments: depts.rows,
      mainLocations: mainLocs.rows,
      subLocations: subLocs.rows,
      designations: desigs.rows
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch master data' });
  }
};

exports.searchEmployeeProfile = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ error: 'Search query (q) is required' });
    }

    const userResult = await query(
      `SELECT id, employee_id, full_name, email, phone, whatsapp, department, designation, role 
       FROM users 
       WHERE employee_id ILIKE $1 OR full_name ILIKE $2
       LIMIT 10`,
      [`%${q}%`, `%${q}%`]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Support returning just the first match deeply, or a list. Let's return the first match for deep details, 
    // but if the UI needs to pick from a list we should return the list.
    // The requirement says "single employee search ... through imc ... can see the incident details".
    // Let's assume the first match is the target if multiple, but returning the exact match is best.
    // We will return the first user's full details and their incidents.
    const user = userResult.rows[0];

    // Fetch reported incidents
    const incidentsResult = await query(
      `SELECT id, reference_id, incident_date, incident_type, severity, status, created_at 
       FROM incidents 
       WHERE reporter_id = $1 
       ORDER BY created_at DESC 
       LIMIT 50`,
      [user.id]
    );

    const countResult = await query(
      `SELECT COUNT(*) FROM incidents WHERE reporter_id = $1`,
      [user.id]
    );

    res.json({
      employees: userResult.rows, // Send all matches so UI can let user pick if needed
      selectedEmployee: {
        ...user,
        totalIncidentsReported: parseInt(countResult.rows[0].count),
        recentIncidents: incidentsResult.rows
      }
    });
  } catch (error) {
    console.error('Error searching employee:', error);
    res.status(500).json({ error: 'Failed to search employee' });
  }
};


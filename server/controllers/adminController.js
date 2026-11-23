const { query, getClient } = require('../config/database');
const { auditLog, bumpUserTokenVersion } = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const { isEmployeeLockedOut, extractCalendarDate, getTodayDateString } = require('../services/officePortalService');
const { SECRET_CONFIG_KEYS, encryptSecret, assertAllowedOfficePortalUrl } = require('../utils/secretCrypto');
const { isPrivilegedRole } = require('../utils/accessControl');
const { escapeCsvField } = require('../utils/csvSanitizer');

exports.getSystemConfig = async (req, res) => {
  try {
    const result = await query('SELECT * FROM system_config ORDER BY key');
    const config = {};
    result.rows.forEach(row => {
      if (SECRET_CONFIG_KEYS.has(row.key)) {
        const hasVal = Boolean(row.value && String(row.value).trim());
        if (row.key === 'officeportal_client_secret') {
          config.has_client_secret = hasVal;
          config.client_secret_masked = hasVal ? '••••••••' : '';
        } else if (row.key === 'officeportal_webhook_secret') {
          config.has_webhook_secret = hasVal;
          config.webhook_secret_masked = hasVal ? '••••••••' : '';
        } else if (row.key === 'officeportal_webhook_secret_previous') {
          config.has_webhook_secret_previous = hasVal;
          config.webhook_secret_previous_masked = hasVal ? '••••••••' : '';
        }
      } else {
        config[row.key] = row.value;
      }
    });
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch config' });
  }
};

exports.updateSystemConfig = async (req, res) => {
  try {
    const updates = req.body || {};
    const sanitizedForAudit = {};
    const validatedEntries = [];
    let touchedOfficePortal = false;

    // Validate all URLs upfront before writing any config rows
    for (const [key, value] of Object.entries(updates)) {
      // Ignore synthetic masked indicator fields sent back from settings forms
      if (key.startsWith('has_') || key.endsWith('_masked')) continue;

      if (SECRET_CONFIG_KEYS.has(key)) {
        // Never overwrite an existing secret with the UI mask placeholder
        if (value === '••••••••' || value === undefined) continue;
        const plainVal = value === null ? '' : String(value).trim();
        sanitizedForAudit[key] = plainVal ? '[REDACTED]' : '[CLEARED]';
        const storedVal = plainVal ? encryptSecret(plainVal) : '';
        validatedEntries.push([key, storedVal]);
      } else {
        let normalizedVal = value === null || value === undefined ? '' : String(value);
        if (key === 'officeportal_auth_url' && normalizedVal.trim()) {
          normalizedVal = assertAllowedOfficePortalUrl(normalizedVal.trim(), 'auth');
        } else if (key === 'officeportal_base_url' && normalizedVal.trim()) {
          normalizedVal = assertAllowedOfficePortalUrl(normalizedVal.trim().replace(/\/+$/, ''), 'api');
        }
        sanitizedForAudit[key] = normalizedVal;
        validatedEntries.push([key, normalizedVal]);
      }

      if (key.startsWith('officeportal_')) {
        touchedOfficePortal = true;
      }
    }

    for (const [key, storedValue] of validatedEntries) {
      await query(
        `INSERT INTO system_config (key, value, updated_by, updated_at) VALUES ($1, $2, $3, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
        [key, storedValue, req.user.id]
      );
    }

    if (touchedOfficePortal) {
      const officePortalService = require('../services/officePortalService');
      officePortalService.clearCaches();
    }

    await auditLog(req.user.id, 'CONFIG_UPDATED', null, sanitizedForAudit, req.ip);
    res.json({ success: true });
  } catch (error) {
    if (error.code === 'INVALID_OFFICEPORTAL_URL' || error.statusCode === 400) {
      return res.status(400).json({
        error: error.message,
        code: error.code || 'INVALID_OFFICEPORTAL_URL'
      });
    }
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

const getEmployeeBaseRole = async (user) => {
  if (!user) return 'employee';
  const desig = (user.designation || '').toUpperCase();
  if (
    desig === 'HOD' ||
    desig.includes('HEAD OF DEPARTMENT') ||
    desig.includes('HEAD OF DEPT') ||
    desig.startsWith('HEAD OF ') ||
    desig.includes('(HOD)')
  ) {
    return 'hod';
  }
  try {
    const deptCheck = await query(
      `SELECT 1 FROM departments WHERE assigned_user_id = $1 OR hod_user_id = $1
       UNION ALL
       SELECT 1 FROM department_reviewers WHERE user_id = $1 AND is_active = TRUE
       LIMIT 1`,
      [user.id]
    );
    if (deptCheck.rows.length > 0) return 'hod';
  } catch (err) {
    // ignore
  }
  return 'employee';
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
    if (String(user.employee_id).trim() === '00000' && roleType === 'system_admin') {
      return res.status(400).json({ error: 'The root System Administrator account (00000) cannot be revoked.' });
    }

    const prevRole = user.role;
    const baseRole = await getEmployeeBaseRole(user);
    let newRole = user.role;
    let updateSql = '';
    let auditLabel = '';
    let actionName = '';

    if (roleType === 'imc') {
      newRole = user.role === 'imc' ? baseRole : user.role;
      updateSql = `UPDATE users SET role = $1, is_imc_lead = FALSE, is_imc_member = FALSE, updated_at = NOW() WHERE id = $2`;
      auditLabel = `${newRole} (Revoked IMC Access)`;
      actionName = 'IMC_ACCESS_STOPPED';
    } else if (roleType === 'head_management') {
      newRole = user.role === 'head_management' ? baseRole : user.role;
      updateSql = `UPDATE users SET role = $1, is_management_member = FALSE, updated_at = NOW() WHERE id = $2`;
      auditLabel = `${newRole} (Revoked Management Access)`;
      actionName = 'MANAGEMENT_ACCESS_STOPPED';
    } else if (roleType === 'system_admin') {
      newRole = user.role === 'system_admin' ? baseRole : user.role;
      updateSql = `UPDATE users SET role = $1, is_system_admin = FALSE, updated_at = NOW() WHERE id = $2`;
      auditLabel = `${newRole} (Revoked System Admin Access)`;
      actionName = 'SYSTEM_ADMIN_ACCESS_STOPPED';
    } else {
      return res.status(400).json({ error: 'Invalid role access revocation requested.' });
    }

    await query(updateSql, [newRole, user.id]);
    // Immediately invalidate active JWTs for the user whose privileged role was revoked
    await bumpUserTokenVersion(user.id);
    await query(`UPDATE master_employees SET role = $1 WHERE employee_id = $2`, [newRole, user.employee_id]);

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

    const roleDisplayName = roleType === 'imc' ? 'IMC' : roleType === 'head_management' ? 'Management' : 'System Admin';
    return res.json({
      success: true,
      message: `Successfully revoked ${roleDisplayName} access for ${user.full_name} (${user.employee_id}).`
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to revoke committee access.' });
  }
};

async function getOrCreateUserFromMaster(employeeId, initialRole = 'employee') {
  const empIdStr = String(employeeId).trim();
  const userResult = await query(
    'SELECT * FROM users WHERE UPPER(employee_id) = UPPER($1) OR id::text = $1',
    [empIdStr]
  );
  if (userResult.rows.length > 0) {
    return userResult.rows[0];
  }

  // Not found in users table, check master_employees (by employee_id case-insensitively or UUID)
  const masterRes = await query(
    'SELECT * FROM master_employees WHERE UPPER(employee_id) = UPPER($1) OR id::text = $1',
    [empIdStr]
  );
  if (!masterRes.rows.length) {
    return null;
  }

  const masterEmp = masterRes.rows[0];
  const shouldBeActive = !isEmployeeLockedOut(masterEmp.status, masterEmp.portal_access_disable_date);

  // Provision skeleton account with password_hash = NULL so the employee must complete
  // OTP self-registration before logging in (never assign a default/hardcoded password).
  const inserted = await query(
    `INSERT INTO users (employee_id, full_name, email, department, designation, role, is_active, password_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)
     ON CONFLICT (employee_id) DO UPDATE SET
       full_name = EXCLUDED.full_name,
       department = EXCLUDED.department,
       designation = EXCLUDED.designation
     RETURNING *`,
    [
      masterEmp.employee_id,
      masterEmp.name,
      masterEmp.email || `${masterEmp.employee_id}@jphrc.org`,
      masterEmp.department,
      masterEmp.designation,
      initialRole,
      shouldBeActive
    ]
  );
  return inserted.rows[0];
}

exports.assignImcRole = async (req, res) => {
  try {
    const { employeeId, isImcLead } = req.body;
    if (!employeeId) {
      return res.status(400).json({ error: 'Employee ID is required.' });
    }

    const user = await getOrCreateUserFromMaster(employeeId, 'imc');
    if (!user) {
      return res.status(404).json({ error: 'Employee not found in hospital directory.' });
    }

    const prevRole = user.role;

    await query(
      `UPDATE users SET role = 'imc', is_imc_lead = $1, is_imc_member = TRUE, updated_at = NOW() WHERE id = $2`,
      [Boolean(isImcLead), user.id]
    );

    await query(`UPDATE master_employees SET role = 'imc' WHERE employee_id = $1`, [user.employee_id]);

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
    console.error('Failed to assign IMC role:', error);
    res.status(500).json({ error: 'Failed to assign IMC role.' });
  }
};

exports.removeImcRole = async (req, res) => {
  return revokeCommitteeAccess(req, res, req.params.id || req.body.employeeId || req.body.id, 'imc');
};

exports.stopImcAccess = async (req, res) => {
  return revokeCommitteeAccess(req, res, req.body.employeeId || req.body.id || req.params.id, 'imc');
};

exports.removeSystemAdminRole = async (req, res) => {
  return revokeCommitteeAccess(req, res, req.params.id || req.body.employeeId || req.body.id, 'system_admin');
};

exports.assignUserRole = async (req, res) => {
  try {
    const { employeeId, targetRole, departmentId } = req.body;
    if (!employeeId || !targetRole) {
      return res.status(400).json({ error: 'Employee ID and Role are required.' });
    }

    const VALID_ASSIGNABLE_ROLES = ['employee', 'hod', 'imc', 'imc_convenor', 'head_management', 'system_admin'];
    if (!VALID_ASSIGNABLE_ROLES.includes(targetRole)) {
      return res.status(400).json({ error: 'Invalid target role.' });
    }

    if (String(employeeId).trim() === '00000' && targetRole !== 'system_admin') {
      return res.status(400).json({ error: 'The root System Administrator account (00000) role cannot be changed.' });
    }

    const initialMasterRole = ['imc_convenor', 'imc'].includes(targetRole)
      ? 'imc'
      : targetRole === 'system_admin'
      ? 'employee'
      : targetRole;

    const user = await getOrCreateUserFromMaster(employeeId, initialMasterRole);
    if (!user) {
      return res.status(404).json({ error: 'Employee not found in hospital directory.' });
    }

    if (String(user.employee_id).trim() === '00000' && targetRole !== 'system_admin') {
      return res.status(400).json({ error: 'The root System Administrator account (00000) role cannot be changed.' });
    }

    const prevRole = user.role;
    const baseRole = await getEmployeeBaseRole(user);

    let updateSql = `UPDATE users SET role = $1, is_system_admin = FALSE, is_imc_member = FALSE, is_imc_lead = FALSE, is_management_member = FALSE, updated_at = NOW() WHERE id = $2`;
    let actualRole = targetRole;
    let auditNewRole = targetRole;

    if (targetRole === 'imc') {
      updateSql = `UPDATE users SET role = $1, is_imc_member = TRUE, is_imc_lead = FALSE, updated_at = NOW() WHERE id = $2`;
    } else if (targetRole === 'imc_convenor') {
      actualRole = 'imc';
      auditNewRole = 'imc_convenor';
      updateSql = `UPDATE users SET role = $1, is_imc_member = TRUE, is_imc_lead = TRUE, updated_at = NOW() WHERE id = $2`;
    } else if (targetRole === 'head_management') {
      updateSql = `UPDATE users SET role = $1, is_management_member = TRUE, updated_at = NOW() WHERE id = $2`;
    } else if (targetRole === 'system_admin') {
      if (String(user.employee_id).trim() === '00000') {
        actualRole = 'system_admin';
      } else {
        // Hospital employees assigned as Admin keep their personal Employee/Reviewer base role
        // while gaining is_system_admin = TRUE so they have both Employee and Admin dashboards.
        actualRole = ['imc', 'head_management'].includes(user.role) ? user.role : baseRole;
      }
      auditNewRole = 'system_admin';
      updateSql = `UPDATE users SET role = $1, is_system_admin = TRUE, updated_at = NOW() WHERE id = $2`;
    }
    await query(updateSql, [actualRole, user.id]);

    // Immediately invalidate existing JWTs when privileged access is actually downgraded/revoked
    const isRoleDowngrade =
      (user.is_system_admin && ['employee', 'hod'].includes(targetRole)) ||
      (user.is_imc_lead && targetRole === 'imc') ||
      (['employee', 'hod'].includes(targetRole) && ['system_admin', 'imc', 'head_management'].includes(prevRole));
    if (isRoleDowngrade) {
      await bumpUserTokenVersion(user.id);
    }

    // Also sync role in master_employees table
    await query(`UPDATE master_employees SET role = $1 WHERE employee_id = $2`, [actualRole, user.employee_id]);

    if (targetRole === 'hod' && departmentId) {
      await query(`UPDATE departments SET hod_user_id = $1 WHERE id = $2`, [user.id, departmentId]);
      await query(`UPDATE users SET department = (SELECT name FROM departments WHERE id = $1) WHERE id = $2`, [departmentId, user.id]);
    }

    await query(
      `INSERT INTO role_audit (employee_id, previous_role, new_role, changed_by)
       VALUES ($1, $2, $3, $4)`,
      [user.id, prevRole, auditNewRole, req.user.id]
    );

    await auditLog(req.user.id, 'ROLE_ASSIGNED', null, {
      targetEmployee: user.employee_id, prevRole, newRole: auditNewRole, targetRoleRequested: targetRole, departmentId
    }, req.ip);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to assign role.' });
  }
};

exports.getAuditActions = async (req, res) => {
  try {
    const result = await query(`SELECT DISTINCT action FROM audit_logs WHERE action IS NOT NULL ORDER BY action ASC`);
    res.json(result.rows.map(r => r.action));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch audit actions' });
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
    if (dateFrom) { where += ` AND al.created_at >= $${idx++}::date`; params.push(dateFrom); }
    if (dateTo) { where += ` AND al.created_at < ($${idx++}::date + INTERVAL '1 day')`; params.push(dateTo); }

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

exports.exportAuditLogs = async (req, res) => {
  try {
    const { action, dateFrom, dateTo } = req.query;

    let where = '1=1';
    const params = [];
    let idx = 1;

    if (action) { where += ` AND al.action = $${idx++}`; params.push(action); }
    if (dateFrom) { where += ` AND al.created_at >= $${idx++}::date`; params.push(dateFrom); }
    if (dateTo) { where += ` AND al.created_at < ($${idx++}::date + INTERVAL '1 day')`; params.push(dateTo); }

    const result = await query(
      `SELECT al.*, u.full_name, u.employee_id, i.reference_id
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       LEFT JOIN incidents i ON i.id = al.incident_id
       WHERE ${where}
       ORDER BY al.created_at DESC`
      , params
    );

    const logs = result.rows;

    let csvContent = 'Date,Time,User,Employee ID,Action,Incident Ref,IP Address,Details\n';
    
    logs.forEach(log => {
      const dateObj = new Date(log.created_at);
      const date = dateObj.toLocaleDateString();
      const time = dateObj.toLocaleTimeString();
      const user = log.full_name || 'System';
      const empId = log.employee_id || 'N/A';
      const actionStr = log.action || 'UNKNOWN';
      const refId = log.reference_id || 'N/A';
      const ip = log.ip_address || 'N/A';
      const details = log.details ? JSON.stringify(log.details) : '';

      csvContent += [
        escapeCsvField(date),
        escapeCsvField(time),
        escapeCsvField(user),
        escapeCsvField(empId),
        escapeCsvField(actionStr),
        escapeCsvField(refId),
        escapeCsvField(ip),
        escapeCsvField(details)
      ].join(',') + '\n';
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="audit_logs_${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csvContent);
  } catch (error) {
    console.error('Failed to export audit logs:', error);
    res.status(500).json({ error: 'Failed to export audit logs' });
  }
};

exports.getSystemAnalytics = async (req, res) => {
  try {
    const [
      incidentsByMonth, avgResolutionTime, byDepartment, byCategory,
      slaBreach, stalledIncidents, claimStats, kbCount,
      hodFeedbackStats
    ] = await Promise.all([
      query(`SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'Mon YYYY') as month,
        DATE_TRUNC('month', created_at) as month_date, COUNT(*) as count
        FROM incidents WHERE status != 'withdrawn' AND created_at >= NOW() - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', created_at) ORDER BY month_date`),

      query(`SELECT AVG(GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(resolved_at, updated_at) - created_at)) / 3600.0)) as avg_hours,
        COUNT(*) as completed_count
        FROM incidents WHERE status IN ('resolved', 'closed')`),

      query(`SELECT d.name, COUNT(DISTINCT i.id) as count
        FROM departments d
        JOIN incident_departments id ON id.department_id = d.id
        JOIN incidents i ON i.id = id.incident_id
        WHERE i.status != 'withdrawn'
        GROUP BY d.name ORDER BY count DESC LIMIT 15`),

      query(`SELECT COALESCE(ic.name, NULLIF(TRIM(i.incident_category), ''), 'Others') as name, COUNT(DISTINCT i.id) as count
        FROM incidents i
        LEFT JOIN incident_category_links icl ON icl.incident_id = i.id
        LEFT JOIN incident_categories ic ON ic.id = icl.category_id
        WHERE i.status != 'withdrawn'
        GROUP BY 1 ORDER BY count DESC LIMIT 15`),

      query(`SELECT COUNT(*) as sla_breach_count FROM incidents
        WHERE status NOT IN ('resolved', 'closed', 'withdrawn')
        AND created_at < NOW() - INTERVAL '7 days'`),

      query(`SELECT status, COUNT(*) as count FROM incidents
        WHERE status NOT IN ('resolved', 'closed', 'withdrawn')
        AND updated_at < NOW() - INTERVAL '7 days'
        GROUP BY status`),

      query(`SELECT COUNT(*) FILTER (WHERE is_active=TRUE) as active_claims,
        MAX(EXTRACT(EPOCH FROM (NOW()-claimed_at))/3600) FILTER (WHERE is_active=TRUE) as oldest_claim_hours
        FROM imc_claims`),

      query(`SELECT COUNT(*) as count FROM knowledge_base`),

      query(`
        SELECT
          COUNT(DISTINCT f.incident_id) FILTER (WHERE i.status != 'withdrawn') as given,
          (SELECT COUNT(*) FROM incidents i2
           WHERE i2.status NOT IN ('resolved', 'closed', 'withdrawn')
           AND NOT EXISTS (SELECT 1 FROM feedbacks f2 WHERE f2.incident_id = i2.id AND f2.role = 'hod')
          ) as pending
        FROM feedbacks f
        JOIN incidents i ON i.id = f.incident_id
        WHERE f.role = 'hod'
      `)
    ]);

    const completedCount = parseInt(avgResolutionTime.rows[0]?.completed_count || 0, 10);
    const rawAvgHours = avgResolutionTime.rows[0]?.avg_hours;
    const avgResolutionHours = completedCount > 0 && rawAvgHours !== null ? parseFloat(rawAvgHours).toFixed(1) : null;
    const rawOldestClaim = claimStats.rows[0]?.oldest_claim_hours;

    res.json({
      incidentsByMonth: incidentsByMonth.rows.map(r => ({ ...r, count: parseInt(r.count, 10) || 0 })),
      avgResolutionHours,
      byDepartment: byDepartment.rows.map(r => ({ ...r, count: parseInt(r.count, 10) || 0 })),
      byCategory: byCategory.rows.map(r => ({ ...r, count: parseInt(r.count, 10) || 0 })),
      slaBreach: parseInt(slaBreach.rows[0]?.sla_breach_count || 0, 10),
      stalledIncidents: stalledIncidents.rows.map(r => ({ ...r, count: parseInt(r.count, 10) || 0 })),
      activeClaims: parseInt(claimStats.rows[0]?.active_claims || 0, 10),
      oldestClaimHours: rawOldestClaim !== null && rawOldestClaim !== undefined ? parseFloat(rawOldestClaim).toFixed(1) : null,
      knowledgeBaseCount: parseInt(kbCount.rows[0]?.count || 0, 10),
      hodFeedbackPending: parseInt(hodFeedbackStats.rows[0]?.pending || 0, 10),
      hodFeedbackGiven: parseInt(hodFeedbackStats.rows[0]?.given || 0, 10)
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
      `SELECT id, employee_id, full_name, email, phone, department, designation, role, is_imc_lead, is_imc_member, is_management_member, is_system_admin, last_sync, is_active
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

    const userRes = await query('SELECT id, employee_id, is_active FROM users WHERE id = $1', [id]);
    if (!userRes.rows.length) return res.status(404).json({ error: 'User not found' });

    if (String(userRes.rows[0].employee_id).trim() === '00000') {
      return res.status(400).json({ error: 'The root System Administrator account (00000) cannot be deactivated.' });
    }

    const newStatus = !userRes.rows[0].is_active;

    if (newStatus === true) {
      const hrmsRes = await query(
        `SELECT status, portal_access_disable_date FROM master_employees WHERE employee_id = $1 LIMIT 1`,
        [userRes.rows[0].employee_id]
      );
      if (hrmsRes.rows.length > 0) {
        const { status, portal_access_disable_date } = hrmsRes.rows[0];
        const disableDateStr = extractCalendarDate(portal_access_disable_date);
        if (['terminated', 'inactive', 'deleted'].includes(status)) {
          return res.status(400).json({
            error: `Cannot activate user: HRMS status is currently "${status}". Update employment status in OfficePortal first.`
          });
        }
        if (disableDateStr && disableDateStr <= getTodayDateString()) {
          return res.status(400).json({
            error: `Cannot activate user: OfficePortal portal access was disabled on ${disableDateStr}.`
          });
        }
      }
    }

    await query('UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2', [newStatus, id]);

    if (newStatus === false) {
      await bumpUserTokenVersion(id);
    }

    await auditLog(req.user.id, 'USER_STATUS_TOGGLED', null, { targetUser: id, newStatus }, req.ip);

    res.json({ success: true, is_active: newStatus });
  } catch (error) {
    console.error('[POST /admin/users/:id/toggle-status] error:', error);
    res.status(500).json({ error: 'Failed to toggle status' });
  }
};

exports.getUserProfile = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate user exists
    const userRes = await query('SELECT * FROM users WHERE id = $1', [id]);
    if (!userRes.rows.length) {
      return res.status(404).json({ error: 'User not found' });
    }
    const user = userRes.rows[0];

    // Fetch reported incidents
    const reportedRes = await query(
      `SELECT id, reference_id, incident_date, status, severity, incident_type, created_at 
       FROM incidents WHERE reporter_id = $1 ORDER BY created_at DESC`,
      [id]
    );

    // Fetch responsible incidents (investigator or training required)
    const responsibleRes = await query(
      `SELECT i.id, i.reference_id, i.incident_date, i.status, i.severity, i.incident_type, 'Investigator' as role_type, i.created_at
       FROM incidents i JOIN investigators inv ON inv.incident_id = i.id WHERE inv.investigator_id = $1
       UNION
       SELECT i.id, i.reference_id, i.incident_date, i.status, i.severity, i.incident_type, 'Training Required' as role_type, i.created_at
       FROM incidents i JOIN training_records tr ON tr.incident_id = i.id WHERE tr.employee_id = $1
       ORDER BY created_at DESC`,
      [id]
    );

    // Fetch category-mapped and department-mapped incidents for reviewer / leader
    let departmentIncidents = [];
    let managedDepartments = [];
    let assignedCategories = [];

    const assignedCatRes = await query(
      `SELECT ic.id, ic.name
       FROM category_feedback_assignees cfa
       JOIN incident_categories ic ON ic.id = cfa.category_id
       WHERE cfa.user_id = $1 AND cfa.is_active = TRUE
       ORDER BY ic.name ASC`,
      [id]
    );
    assignedCategories = assignedCatRes.rows.map(r => r.name);

    const managedDeptRes = await query(
      `SELECT DISTINCT d.name
       FROM departments d
       LEFT JOIN department_reviewers dr ON dr.department_id = d.id AND dr.user_id = $1 AND dr.is_active = TRUE
       WHERE d.assigned_user_id = $1 OR d.hod_user_id = $1 OR d.incharge_user_id = $1 OR d.asst_coo_user_id = $1 OR dr.id IS NOT NULL`,
      [id]
    );
    managedDepartments = managedDeptRes.rows.map(r => r.name);

    if (assignedCategories.length > 0 || managedDepartments.length > 0 || user.role === 'hod' || user.role === 'head_management' || user.is_management_member) {
      const deptRes = await query(
        `SELECT DISTINCT i.id, i.reference_id, i.incident_date, i.status, i.severity, i.incident_type,
                COALESCE(ic.name, d.name, i.incident_category) as dept_name, i.created_at
         FROM incidents i
         LEFT JOIN incident_category_links icl ON icl.incident_id = i.id
         LEFT JOIN incident_categories ic ON ic.id = icl.category_id
         LEFT JOIN category_feedback_assignees cfa ON cfa.category_id = icl.category_id AND cfa.user_id = $1 AND cfa.is_active = TRUE
         LEFT JOIN incident_departments idp ON idp.incident_id = i.id
         LEFT JOIN departments d ON d.id = idp.department_id
         LEFT JOIN department_reviewers dr ON dr.department_id = d.id AND dr.user_id = $1 AND dr.is_active = TRUE
         WHERE cfa.id IS NOT NULL
            OR d.assigned_user_id = $1
            OR d.hod_user_id = $1
            OR d.incharge_user_id = $1
            OR d.asst_coo_user_id = $1
            OR dr.id IS NOT NULL
         ORDER BY i.created_at DESC`,
        [id]
      );
      departmentIncidents = deptRes.rows;
    }

    res.json({
      reportedIncidents: reportedRes.rows,
      responsibleIncidents: responsibleRes.rows,
      departmentIncidents,
      managedDepartments: [...new Set([...assignedCategories, ...managedDepartments])],
      assignedCategories
    });
  } catch (error) {
    console.error('[GET /admin/users/:id/profile] error:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
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

const SHARED_LOGIN_RETIRED_RESPONSE = {
  error: 'Shared committee logins have been retired. Please sign in with your individual Employee ID and switch roles.',
  code: 'SHARED_LOGIN_RETIRED'
};

exports.requestPasswordChangeOtp = async (req, res) => {
  return res.status(410).json(SHARED_LOGIN_RETIRED_RESPONSE);
};

exports.updateRoleCredentials = async (req, res) => {
  return res.status(410).json(SHARED_LOGIN_RETIRED_RESPONSE);
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

// =============================================
// INCIDENT CATEGORY -> CONCERNED STAFF MAPPING
// =============================================
exports.getCategoryMappings = async (req, res) => {
  try {
    const result = await query(`
      SELECT
        ic.id,
        ic.name,
        ic.is_active,
        COALESCE(
          json_agg(
            json_build_object(
              'mapping_id', cfa.id,
              'user_id', u.id,
              'employee_id', u.employee_id,
              'full_name', u.full_name,
              'designation', u.designation,
              'department', u.department,
              'email', u.email,
              'phone', u.phone,
              'is_active', u.is_active
            ) ORDER BY cfa.created_at ASC
          ) FILTER (WHERE cfa.id IS NOT NULL AND cfa.is_active = TRUE),
          '[]'::json
        ) as assignees
      FROM incident_categories ic
      LEFT JOIN category_feedback_assignees cfa ON cfa.category_id = ic.id AND cfa.is_active = TRUE
      LEFT JOIN users u ON u.id = cfa.user_id
      WHERE ic.is_active = TRUE
      GROUP BY ic.id, ic.name, ic.is_active
      ORDER BY ic.name ASC
    `);

    const rows = result.rows.map(row => {
      const primary = Array.isArray(row.assignees) && row.assignees.length > 0 ? row.assignees[0] : null;
      return {
        ...row,
        assigned_user_id: primary?.user_id || null,
        assigned_staff_name: primary?.full_name || null,
        assigned_employee_id: primary?.employee_id || null,
        assigned_designation: primary?.designation || null,
        assigned_department: primary?.department || null,
        assigned_email: primary?.email || null,
        assigned_phone: primary?.phone || null,
        mapping_id: primary?.mapping_id || null
      };
    });

    res.json(rows);
  } catch (error) {
    console.error('Error fetching category mappings:', error);
    res.status(500).json({ error: 'Failed to fetch incident category mappings.' });
  }
};

exports.mapCategoryFeedbackStaff = async (req, res) => {
  const client = await getClient();
  try {
    const { categoryId, categoryName, employeeId, replaceExisting = true } = req.body || {};
    if ((!categoryId && !categoryName) || !employeeId) {
      return res.status(400).json({ error: 'Incident category and Employee ID are required.' });
    }

    // Verify employee exists and is NOT terminated/inactive/deleted in HRMS
    const masterCheck = await query(
      `SELECT employee_id, name, status, portal_access_disable_date
       FROM master_employees
       WHERE UPPER(employee_id) = UPPER($1) OR id::text = $1
       LIMIT 1`,
      [String(employeeId).trim()]
    );
    if (masterCheck.rows.length > 0) {
      const m = masterCheck.rows[0];
      if (isEmployeeLockedOut(m.status, m.portal_access_disable_date)) {
        return res.status(400).json({
          error: `Cannot assign ${m.name} (${m.employee_id}): employment or portal access is marked inactive/terminated in HRMS.`
        });
      }
    }

    // Provision skeleton user if needed WITHOUT forcing role = 'hod' (any active staff can review)
    const user = await getOrCreateUserFromMaster(employeeId, 'employee');
    if (!user) {
      return res.status(404).json({ error: 'Employee not found in hospital directory. Please verify the Employee ID.' });
    }
    if (user.is_active === false) {
      return res.status(400).json({ error: `Cannot assign ${user.full_name} (${user.employee_id}): account is deactivated.` });
    }

    const catRes = categoryId
      ? await query(`SELECT id, name FROM incident_categories WHERE id = $1 AND is_active = TRUE`, [categoryId])
      : await query(`SELECT id, name FROM incident_categories WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) AND is_active = TRUE`, [categoryName]);
    if (!catRes.rows.length) {
      return res.status(404).json({ error: 'Incident category not found.' });
    }
    const category = catRes.rows[0];

    await client.query('BEGIN');

    if (replaceExisting !== false) {
      await client.query(
        `UPDATE category_feedback_assignees
         SET is_active = FALSE, updated_at = NOW()
         WHERE category_id = $1 AND user_id != $2 AND is_active = TRUE`,
        [category.id, user.id]
      );
    }

    const upsertRes = await client.query(
      `INSERT INTO category_feedback_assignees (category_id, user_id, assigned_by, is_active, updated_at)
       VALUES ($1, $2, $3, TRUE, NOW())
       ON CONFLICT (category_id, user_id)
       DO UPDATE SET is_active = TRUE, assigned_by = EXCLUDED.assigned_by, updated_at = NOW()
       RETURNING id`,
      [category.id, user.id, req.user.id]
    );

    await client.query('COMMIT');

    await auditLog(req.user.id, 'CATEGORY_FEEDBACK_STAFF_MAPPED', null, {
      categoryId: category.id,
      categoryName: category.name,
      mappingId: upsertRes.rows[0]?.id,
      targetEmployee: user.employee_id,
      targetName: user.full_name,
      replaceExisting: replaceExisting !== false
    }, req.ip);

    res.json({
      success: true,
      mappingId: upsertRes.rows[0]?.id,
      message: `Assigned ${user.full_name} (${user.employee_id}) to handle feedback for "${category.name}".`
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error in mapCategoryFeedbackStaff:', error);
    res.status(500).json({ error: 'Failed to assign feedback staff for incident category.' });
  } finally {
    client.release();
  }
};

exports.removeCategoryFeedbackStaff = async (req, res) => {
  try {
    const { id } = req.params;
    const { categoryId, userId } = req.query;

    let deletedRows = [];
    if (id && id !== 'by-category') {
      const delRes = await query(
        `DELETE FROM category_feedback_assignees WHERE id = $1 RETURNING id, category_id, user_id`,
        [id]
      );
      deletedRows = delRes.rows;
    } else if (categoryId && userId) {
      const delRes = await query(
        `DELETE FROM category_feedback_assignees WHERE category_id = $1 AND user_id = $2 RETURNING id, category_id, user_id`,
        [categoryId, userId]
      );
      deletedRows = delRes.rows;
    } else if (categoryId) {
      const delRes = await query(
        `DELETE FROM category_feedback_assignees WHERE category_id = $1 RETURNING id, category_id, user_id`,
        [categoryId]
      );
      deletedRows = delRes.rows;
    } else {
      return res.status(400).json({ error: 'Mapping ID or categoryId is required.' });
    }

    if (!deletedRows.length) {
      return res.status(404).json({ error: 'Category staff mapping not found.' });
    }

    await auditLog(req.user.id, 'CATEGORY_FEEDBACK_STAFF_REMOVED', null, {
      mappingId: id,
      categoryId: deletedRows[0].category_id,
      removedCount: deletedRows.length
    }, req.ip);

    res.json({ success: true, message: 'Removed assigned feedback staff from incident category.' });
  } catch (error) {
    console.error('Error in removeCategoryFeedbackStaff:', error);
    res.status(500).json({ error: 'Failed to remove feedback staff from incident category.' });
  }
};

exports.mapDepartmentLeader = async (req, res) => {
  const client = await getClient();
  try {
    const { departmentId, employeeId } = req.body;
    if (!departmentId || !employeeId) {
      return res.status(400).json({ error: 'Department and Employee ID are required.' });
    }

    const user = await getOrCreateUserFromMaster(employeeId, 'employee');
    if (!user) {
      return res.status(404).json({ error: 'Employee not found in hospital directory. Please verify the Employee ID.' });
    }

    const deptRes = await query(`SELECT id, name FROM departments WHERE id = $1`, [departmentId]);
    if (!deptRes.rows.length) {
      return res.status(404).json({ error: 'Department not found.' });
    }
    const deptName = deptRes.rows[0].name;

    await client.query('BEGIN');

    // Role elevation for legacy department leader endpoint
    if (user.role === 'employee') {
      await client.query(`UPDATE users SET role = 'hod', updated_at = NOW() WHERE id = $1`, [user.id]);
    }

    await client.query(
      `UPDATE departments
       SET assigned_user_id = $1, hod_user_id = $1, incharge_user_id = NULL, asst_coo_user_id = NULL
       WHERE id = $2`,
      [user.id, departmentId]
    );

    // Deactivate previous ghost department reviewers for this department before assigning the new one
    await client.query(
      `UPDATE department_reviewers
       SET is_active = FALSE, updated_at = NOW()
       WHERE department_id = $1 AND user_id != $2 AND is_active = TRUE`,
      [departmentId, user.id]
    );

    await client.query(`
      INSERT INTO department_reviewers (user_id, department_id, reviewer_role, is_active, assigned_by, updated_at)
      VALUES ($1, $2, 'Department Reviewer', true, $3, NOW())
      ON CONFLICT (user_id, department_id, reviewer_role)
      DO UPDATE SET is_active = true, updated_at = NOW()
    `, [user.id, departmentId, req.user.id]);

    await client.query('COMMIT');

    await auditLog(req.user.id, 'DEPARTMENT_FEEDBACK_STAFF_MAPPED', null, {
      departmentId, deptName, targetEmployee: user.employee_id, targetName: user.full_name
    }, req.ip);

    res.json({
      success: true,
      message: `Successfully assigned ${user.full_name} (${user.employee_id}) as department reviewer for ${deptName}.`
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error in mapDepartmentLeader:', error);
    res.status(500).json({ error: 'Failed to assign department feedback staff.' });
  } finally {
    client.release();
  }
};

exports.removeDepartmentLeader = async (req, res) => {
  const client = await getClient();
  try {
    const { departmentId } = req.body;
    if (!departmentId) {
      return res.status(400).json({ error: 'Department ID is required.' });
    }

    const deptRes = await query(
      `SELECT id, name, COALESCE(assigned_user_id, hod_user_id) as current_leader_id
       FROM departments WHERE id = $1`,
      [departmentId]
    );
    if (!deptRes.rows.length) {
      return res.status(404).json({ error: 'Department not found.' });
    }

    const deptName = deptRes.rows[0].name;
    const currentLeaderId = deptRes.rows[0].current_leader_id;

    if (!currentLeaderId) {
      return res.status(400).json({ error: `No staff member is currently mapped for ${deptName}.` });
    }

    await client.query('BEGIN');

    await client.query(
      `UPDATE departments
       SET assigned_user_id = NULL, hod_user_id = NULL, incharge_user_id = NULL, asst_coo_user_id = NULL
       WHERE id = $1`,
      [departmentId]
    );

    await client.query(
      `UPDATE department_reviewers
       SET is_active = FALSE, updated_at = NOW()
       WHERE department_id = $1 AND is_active = TRUE`,
      [departmentId]
    );

    await client.query('COMMIT');

    await auditLog(req.user.id, 'DEPARTMENT_FEEDBACK_STAFF_REMOVED', null, {
      departmentId, deptName
    }, req.ip);

    res.json({ success: true, message: `Successfully unassigned feedback staff from ${deptName}.` });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error in removeDepartmentLeader:', error);
    res.status(500).json({ error: 'Failed to remove department feedback staff.' });
  } finally {
    client.release();
  }
};

exports.createDepartment = async (req, res) => {
  return res.status(405).json({
    error: 'Manual department creation is disabled. Departments are synchronized exclusively from OfficePortal HRMS API.',
    code: 'HRMS_MANAGED_READ_ONLY'
  });
};

exports.deleteDepartment = async (req, res) => {
  try {
    const departmentId = req.params.id;
    if (!departmentId) {
      return res.status(400).json({ error: 'Department ID is required.' });
    }

    const deptRes = await query(`SELECT id, name, is_hrms_synced FROM departments WHERE id = $1`, [departmentId]);
    if (!deptRes.rows.length) {
      return res.status(404).json({ error: 'Department not found.' });
    }
    if (deptRes.rows[0].is_hrms_synced) {
      return res.status(405).json({
        error: 'Departments synchronized from OfficePortal HRMS cannot be deleted manually. Manage departments in OfficePortal HRMS.',
        code: 'HRMS_MANAGED_READ_ONLY'
      });
    }
    const deptName = deptRes.rows[0].name;

    // Check references across incidents, feedbacks, responsible persons, knowledge base
    const refCheck = await query(
      `SELECT 
         (SELECT COUNT(*) FROM incident_departments WHERE department_id = $1) as incident_count,
         (SELECT COUNT(*) FROM feedbacks WHERE department_id = $1) as feedback_count,
         (SELECT COUNT(*) FROM incident_responsible_employees WHERE department_id = $1) as resp_count,
         (SELECT COUNT(*) FROM knowledge_base WHERE department_id = $1) as kb_count`,
      [departmentId]
    );
    const incidentCount = parseInt(refCheck.rows[0]?.incident_count || 0, 10);
    const feedbackCount = parseInt(refCheck.rows[0]?.feedback_count || 0, 10);
    const respCount = parseInt(refCheck.rows[0]?.resp_count || 0, 10);
    const kbCount = parseInt(refCheck.rows[0]?.kb_count || 0, 10);
    const totalRefs = incidentCount + feedbackCount + respCount + kbCount;

    if (totalRefs > 0) {
      return res.status(400).json({
        error: `Cannot delete department "${deptName}" because it is linked to ${totalRefs} historical incident record(s). You can unassign its feedback staff instead to prevent future feedback authorization.`
      });
    }

    await query(`DELETE FROM departments WHERE id = $1`, [departmentId]);

    await auditLog(req.user.id, 'DEPARTMENT_DELETED', null, {
      departmentId,
      departmentName: deptName
    }, req.ip);

    res.json({
      success: true,
      message: `Department "${deptName}" has been successfully deleted.`
    });
  } catch (error) {
    console.error('Error in deleteDepartment:', error);
    res.status(500).json({ error: 'Failed to delete department.' });
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
    const [depts, mainLocs, subLocs, desigs, empTypes] = await Promise.all([
      query('SELECT * FROM departments WHERE is_hrms_synced = TRUE ORDER BY name'),
      query('SELECT * FROM main_locations ORDER BY name'),
      query('SELECT * FROM sub_locations ORDER BY name'),
      query(`
        SELECT DISTINCT name AS title
        FROM (
          SELECT TRIM(name) AS name FROM hrms_job_titles WHERE name IS NOT NULL AND TRIM(name) != ''
          UNION
          SELECT TRIM(designation) AS name FROM master_employees WHERE designation IS NOT NULL AND TRIM(designation) != '' AND office_portal_id IS NOT NULL
        ) t
        ORDER BY title ASC
      `),
      query('SELECT employment_type_id, name FROM hrms_employment_types WHERE name IS NOT NULL ORDER BY name ASC')
    ]);
    res.json({
      departments: depts.rows,
      mainLocations: mainLocs.rows,
      subLocations: subLocs.rows,
      designations: desigs.rows,
      employmentTypes: empTypes.rows
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch master data' });
  }
};

exports.searchEmployeeProfile = async (req, res) => {
  try {
    const term = (req.query.q || req.query.query || '').trim();
    if (!term) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const isPrivileged = isPrivilegedRole(req.user);
    // Strict least-privilege: only privileged governance/admin roles may query terminated staff
    const includeTerminated = isPrivileged && req.query.include_terminated === 'true';
    const statusCondition = includeTerminated
      ? ''
      : "AND COALESCE(m.status, 'active') NOT IN ('terminated', 'inactive', 'deleted')";

    // Search both master_employees and users using pg_trgm and indexes, prioritizing exact employee_id match
    const userResult = await query(
      `SELECT * FROM (
         SELECT DISTINCT ON (COALESCE(u.employee_id, m.employee_id))
           COALESCE(u.id::text, m.id::text) as id,
           COALESCE(u.employee_id, m.employee_id) as employee_id,
           COALESCE(u.full_name, m.name) as full_name,
           COALESCE(u.email, m.email) as email,
           COALESCE(u.phone, m.phone) as phone,
           COALESCE(u.department, m.department) as department,
           COALESCE(u.designation, m.designation) as designation,
           COALESCE(u.role, m.role, 'employee') as role,
           COALESCE(m.status, 'active') as status,
           m.office_location,
           m.employment_type_name,
           m.manager_id,
           mgr.name as manager_name,
           mgr.employee_id as manager_employee_id,
           m.notice_period_end_date,
           m.portal_access_disable_date,
           COALESCE(u.is_imc_member, false) as is_imc_member,
           COALESCE(u.is_imc_lead, false) as is_imc_lead,
           CASE WHEN u.id IS NOT NULL THEN true ELSE false END as is_registered
         FROM master_employees m
         FULL OUTER JOIN users u ON u.employee_id = m.employee_id
         LEFT JOIN master_employees mgr ON m.manager_id IS NOT NULL AND mgr.office_portal_id = m.manager_id::text
         WHERE (
           COALESCE(u.employee_id, m.employee_id) ILIKE $1 
           OR COALESCE(u.full_name, m.name) ILIKE $2
           OR COALESCE(u.department, m.department) ILIKE $3
         )
         ${statusCondition}
         ORDER BY COALESCE(u.employee_id, m.employee_id), COALESCE(u.full_name, m.name) ASC
       ) sub
       ORDER BY (LOWER(sub.employee_id) = LOWER($4)) DESC, sub.full_name ASC
       LIMIT 20`,
      [`%${term}%`, `%${term}%`, `%${term}%`, term]
    );

    if (userResult.rows.length === 0) {
      if (req.query.strict === 'true') {
        return res.status(404).json({ error: 'Employee not found' });
      }
      return res.json({ employees: [], selectedEmployee: null });
    }

    // Regular employees and HODs receive minimal directory fields only (no PII or incident history)
    if (!isPrivileged) {
      const minimalEmployees = userResult.rows.map((row) => ({
        id: row.id,
        employee_id: row.employee_id,
        full_name: row.full_name,
        department: row.department,
        designation: row.designation,
        status: row.status
      }));

      return res.json({
        employees: minimalEmployees,
        selectedEmployee: minimalEmployees[0] || null
      });
    }

    const user = userResult.rows[0];

    // Fetch reported incidents if user exists in users table (privileged roles only)
    let recentIncidents = [];
    let totalIncidents = 0;
    if (user.id && user.is_registered) {
      const incidentsResult = await query(
        `SELECT id, reference_id, incident_date, incident_category, incident_type, severity, status, created_at 
         FROM incidents 
         WHERE reporter_id = $1 
         ORDER BY created_at DESC 
         LIMIT 50`,
        [user.id]
      );
      recentIncidents = incidentsResult.rows;

      const countResult = await query(
        `SELECT COUNT(*) FROM incidents WHERE reporter_id = $1`,
        [user.id]
      );
      totalIncidents = parseInt(countResult.rows[0]?.count || 0);
    }

    res.json({
      employees: userResult.rows,
      selectedEmployee: {
        ...user,
        totalIncidentsReported: totalIncidents,
        recentIncidents
      }
    });
  } catch (error) {
    console.error('Error searching employee:', error);
    res.status(500).json({ error: 'Failed to search employee' });
  }
};


exports.getAllAttachments = async (req, res) => {
  try {
    const queryStr = `
      SELECT a.id, a.incident_id, a.uploader_id, a.stage, a.original_filename, a.stored_filename, a.file_size, a.mime_type, a.created_at, 
             i.reference_id, i.incident_date, u.full_name as uploader_name
      FROM attachments a
      JOIN incidents i ON a.incident_id = i.id
      LEFT JOIN users u ON a.uploader_id = u.id
      ORDER BY a.created_at DESC
    `;
    const result = await query(queryStr);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching attachments:', error);
    res.status(500).json({ error: 'Failed to fetch attachments' });
  }
};

exports.getCommunicationLogs = async (req, res) => {
  try {
    const { page = 1, limit = 50, type, status, search } = req.query;
    const offset = (page - 1) * limit;

    let where = '1=1';
    const params = [];
    let idx = 1;

    if (type) { where += ` AND cl.type = $${idx++}`; params.push(type); }
    if (status) { where += ` AND cl.status = $${idx++}`; params.push(status); }
    if (search) { 
      where += ` AND (cl.recipient_contact ILIKE $${idx} OR cl.subject ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }

    const result = await query(
      `SELECT cl.*, u.full_name, u.employee_id
       FROM communication_logs cl
       LEFT JOIN users u ON u.id = cl.user_id
       WHERE ${where}
       ORDER BY cl.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    );

    const countResult = await query(
      `SELECT COUNT(*) FROM communication_logs cl WHERE ${where}`,
      params
    );

    res.json({
      logs: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    });
  } catch (error) {
    console.error('Failed to fetch communication logs:', error);
    res.status(500).json({ error: 'Failed to fetch communication logs' });
  }
};

exports.broadcastNotification = async (req, res) => {
  try {
    const { title, message } = req.body;
    if (!title || !message) {
      return res.status(400).json({ error: 'Title and message are required.' });
    }

    let attachmentUrl = null;
    let attachmentName = null;

    if (req.file) {
      attachmentUrl = req.file.key || req.file.filename;
      attachmentName = req.file.originalname;
    }

    const result = await query(
      `INSERT INTO notifications (user_id, title, message, type, attachment_url, attachment_name)
       SELECT id, $1, $2, 'broadcast', $3, $4 FROM users WHERE is_active = TRUE`,
      [title, message, attachmentUrl, attachmentName]
    );

    // Also log to communication_logs so it shows up in past broadcasts
    await query(
      `INSERT INTO communication_logs (user_id, recipient_contact, type, subject, content, status, details)
       VALUES ($1, 'All Active Users', 'BROADCAST', $2, $3, 'SENT', $4)`,
      [
        req.user.id,
        title,
        message,
        JSON.stringify({ attachmentName, attachmentUrl, count: result.rowCount })
      ]
    );

    try {
      const { io } = require('../index');
      if (io) {
        io.emit('new_notification', {
          title,
          message,
          type: 'broadcast',
          attachment_url: attachmentUrl,
          attachment_name: attachmentName,
          created_at: new Date()
        });
      }
    } catch (socketErr) {
      console.warn('[Socket] Failed to emit broadcast notification:', socketErr.message);
    }

    await auditLog(req.user.id, 'BROADCAST_NOTIFICATION_SENT', null, {
      title, attachmentName, count: result.rowCount
    }, req.ip);

    res.json({ success: true, count: result.rowCount });
  } catch (error) {
    console.error('Error broadcasting notification:', error);
    res.status(500).json({ error: 'Failed to broadcast notification.' });
  }
};

exports.downloadBroadcastAttachment = async (req, res) => {
  try {
    const rawKey = req.query.key;
    if (typeof rawKey !== 'string' || !rawKey.trim()) {
      return res.status(400).json({ error: 'Key is required' });
    }

    const key = rawKey.trim();

    // Strict R2 key allowlist: broadcast/ or pending/broadcast/ (with optional staging/ prefix) only, zero path traversal or control chars
    if (
      key.includes('..') ||
      key.includes('\\') ||
      key.startsWith('/') ||
      /[\x00-\x1f\x7f]/.test(key) ||
      !/^(?:staging\/)?(?:pending\/)?broadcast\/[a-zA-Z0-9._-]+$/.test(key)
    ) {
      return res.status(400).json({ error: 'Invalid broadcast attachment key.' });
    }

    // Verify the requested key actually belongs to a recorded broadcast notification
    const broadcastCheck = await query(
      `SELECT 1 FROM notifications
       WHERE type = 'broadcast' AND attachment_url = $1
       LIMIT 1`,
      [key]
    );
    if (broadcastCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Broadcast attachment not found.' });
    }

    const { s3Client, isR2Configured } = require('../config/s3');
    if (!isR2Configured() || !s3Client || !process.env.S3_BUCKET_NAME) {
      return res.status(503).json({ error: 'Cloudflare R2 storage is not configured.' });
    }

    const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    const signedUrl = await getSignedUrl(s3Client, new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      ResponseContentDisposition: 'attachment',
    }), { expiresIn: 60 });
    return res.json({ url: signedUrl });
  } catch (error) {
    console.error('Failed to get broadcast attachment url:', error);
    res.status(500).json({ error: 'Failed to generate download link' });
  }
};

// =============================================
// SENIOR STAFF MULTI-DEPARTMENT REVIEWERS
// =============================================
exports.getDepartmentReviewers = async (req, res) => {
  try {
    const reviewersQuery = `
      SELECT 
        dr.id,
        dr.user_id,
        dr.department_id,
        dr.reviewer_role,
        dr.is_active,
        dr.created_at,
        u.employee_id,
        u.full_name,
        u.email,
        u.phone,
        u.designation,
        d.name as department_name
      FROM department_reviewers dr
      JOIN users u ON dr.user_id = u.id
      JOIN departments d ON dr.department_id = d.id
      WHERE dr.is_active = true
      ORDER BY u.full_name ASC, d.name ASC
    `;
    const result = await query(reviewersQuery);

    // Group by user for clean UI presentation
    const grouped = {};
    for (const row of result.rows) {
      if (!grouped[row.user_id]) {
        grouped[row.user_id] = {
          userId: row.user_id,
          employeeId: row.employee_id,
          fullName: row.full_name,
          email: row.email,
          phone: row.phone,
          designation: row.designation,
          reviewerRole: row.reviewer_role,
          departments: []
        };
      }
      grouped[row.user_id].departments.push({
        id: row.id,
        departmentId: row.department_id,
        departmentName: row.department_name,
        reviewerRole: row.reviewer_role,
        createdAt: row.created_at
      });
    }

    res.json({
      success: true,
      reviewers: Object.values(grouped),
      rawAssignments: result.rows
    });
  } catch (error) {
    console.error('Error fetching department reviewers:', error);
    res.status(500).json({ error: 'Failed to retrieve department reviewers.' });
  }
};

exports.assignDepartmentReviewer = async (req, res) => {
  try {
    const { employeeId, departmentIds, reviewerRole = 'Department Reviewer' } = req.body;
    if (!employeeId || !departmentIds || !Array.isArray(departmentIds) || departmentIds.length === 0) {
      return res.status(400).json({ error: 'Employee ID and at least one department ID are required.' });
    }

    const user = await getOrCreateUserFromMaster(employeeId, 'employee');
    if (!user) {
      return res.status(404).json({ error: 'Employee not found in hospital directory.' });
    }

    // Role promotion: if user is currently basic employee, elevate role to reviewer (hod)
    if (user.role === 'employee') {
      await query(`UPDATE users SET role = 'hod', updated_at = NOW() WHERE id = $1`, [user.id]);
    }

    const assigned = [];
    for (const deptId of departmentIds) {
      const insRes = await query(`
        INSERT INTO department_reviewers (user_id, department_id, reviewer_role, is_active, assigned_by, updated_at)
        VALUES ($1, $2, $3, true, $4, NOW())
        ON CONFLICT (user_id, department_id, reviewer_role) 
        DO UPDATE SET is_active = true, updated_at = NOW()
        RETURNING id, department_id
      `, [user.id, deptId, reviewerRole, req.user.id]);

      // Backwards compatibility sync for primary department
      await query(`
        UPDATE departments 
        SET assigned_user_id = COALESCE(assigned_user_id, $1),
            hod_user_id = COALESCE(hod_user_id, $1)
        WHERE id = $2
      `, [user.id, deptId]).catch(() => {});

      assigned.push(insRes.rows[0]);
    }

    await auditLog(req.user.id, 'DEPARTMENT_REVIEWER_MAPPED', null, {
      userId: user.id,
      employeeId: user.employee_id,
      fullName: user.full_name,
      departmentIds,
      reviewerRole
    }, req.ip);

    res.json({
      success: true,
      message: `Successfully mapped ${user.full_name} (${user.employee_id}) as ${reviewerRole} across ${assigned.length} department(s).`,
      assigned
    });
  } catch (error) {
    console.error('Error assigning department reviewer:', error);
    res.status(500).json({ error: 'Failed to assign department reviewer.' });
  }
};

exports.removeDepartmentReviewer = async (req, res) => {
  try {
    const { id } = req.params;
    const { departmentId, userId } = req.query;

    if (id && id !== 'by-dept') {
      await query(`DELETE FROM department_reviewers WHERE id = $1`, [id]);
    } else if (userId && departmentId) {
      await query(`DELETE FROM department_reviewers WHERE user_id = $1 AND department_id = $2`, [userId, departmentId]);
    } else {
      return res.status(400).json({ error: 'Mapping ID or both userId and departmentId required.' });
    }

    await auditLog(req.user.id, 'DEPARTMENT_REVIEWER_REMOVED', null, { id, userId, departmentId }, req.ip);

    res.json({ success: true, message: 'Department reviewer mapping removed.' });
  } catch (error) {
    console.error('Error removing department reviewer:', error);
    res.status(500).json({ error: 'Failed to remove department reviewer mapping.' });
  }
};

// =============================================
// HRMS WEBHOOK INGESTION LOGS
// =============================================
exports.getWebhookLogs = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '50', 10);
    const offset = parseInt(req.query.offset || '0', 10);

    const result = await query(`
      SELECT id, event_id, delivery_id, event_type, signature_verified, status, error_message, processed_at, received_at,
             COALESCE(occurred_at, (payload->>'occurredAt')::timestamptz, (payload->'events'->0->>'occurredAt')::timestamptz) as occurred_at,
             COALESCE(payload->'data'->>'employeeCode', payload->'events'->0->'data'->>'employeeCode') as employee_code,
             COALESCE(payload->'data'->>'fullName', payload->'events'->0->'data'->>'fullName') as full_name
      FROM hrms_webhook_events
      ORDER BY received_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    const countRes = await query(`SELECT COUNT(*) as total FROM hrms_webhook_events`);
    const total = parseInt(countRes.rows[0]?.total || '0', 10);

    res.json({
      success: true,
      logs: result.rows,
      total,
      limit,
      offset
    });
  } catch (error) {
    console.error('Error fetching webhook logs:', error);
    res.status(500).json({ error: 'Failed to retrieve webhook logs.' });
  }
};



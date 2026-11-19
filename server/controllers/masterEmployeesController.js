const { query } = require('../config/database');
const { auditLog } = require('../middleware/auth');

// GET master employees with pagination, advanced search, filtering, and sorting
exports.getAllEmployees = async (req, res) => {
  try {
    const { 
      page, 
      limit = 100, 
      search = '', 
      department = '', 
      is_registered, 
      status,
      sort_by = 'name', 
      sort_order = 'asc',
      all
    } = req.query;

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    // Industry-standard search matching name, employee_id, department, designation, email, phone
    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      conditions.push(`(
        m.name ILIKE $${paramIndex} OR 
        m.employee_id ILIKE $${paramIndex} OR 
        m.department ILIKE $${paramIndex} OR 
        m.designation ILIKE $${paramIndex} OR 
        m.email ILIKE $${paramIndex} OR 
        m.phone ILIKE $${paramIndex} OR
        u.email ILIKE $${paramIndex}
      )`);
      params.push(term);
      paramIndex++;
    }

    // Department filter
    if (department && department.trim() && department !== 'all') {
      conditions.push(`m.department = $${paramIndex}`);
      params.push(department.trim());
      paramIndex++;
    }

    // Employment status filter (active, noticePeriod, terminated)
    if (status && status.trim() && status !== 'all') {
      conditions.push(`m.status = $${paramIndex}`);
      params.push(status.trim());
      paramIndex++;
    }

    // Registered status filter
    if (is_registered !== undefined && is_registered !== '' && is_registered !== 'all') {
      if (is_registered === 'true' || is_registered === true) {
        conditions.push(`u.id IS NOT NULL`);
      } else if (is_registered === 'false' || is_registered === false) {
        conditions.push(`u.id IS NULL`);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Sorting
    const allowedSortFields = {
      name: 'm.name',
      employee_id: 'm.employee_id',
      department: 'm.department',
      designation: 'm.designation',
      status: 'm.status',
      is_registered: 'is_registered'
    };
    const sortColumn = allowedSortFields[sort_by] || 'm.name';
    const orderDirection = sort_order?.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    // Base query
    const baseQuery = `
      SELECT 
        m.id as master_id, 
        m.office_portal_id,
        m.employee_id, 
        m.name as full_name, 
        m.department, 
        m.designation, 
        m.office_location,
        m.employment_type_id,
        m.employment_type_name,
        m.manager_id,
        mgr.name as manager_name,
        mgr.employee_id as manager_employee_id,
        COALESCE(m.status, 'active') as status,
        m.date_of_joining,
        m.termination_date,
        m.notice_period_start_date,
        m.notice_period_end_date,
        m.portal_access_disable_date,
        m.role as master_role,
        m.phone as phone,
        CASE WHEN u.id IS NOT NULL THEN true ELSE false END as is_registered,
        u.id as id,
        COALESCE(u.email, m.email) as email,
        u.role,
        u.is_active,
        u.is_imc_member,
        u.is_imc_lead,
        u.is_system_admin,
        u.is_management_member
      FROM master_employees m
      LEFT JOIN users u ON m.employee_id = u.employee_id
      LEFT JOIN master_employees mgr ON m.manager_id IS NOT NULL AND mgr.office_portal_id = m.manager_id::text
      ${whereClause}
    `;

    // STRICT 100% API-driven departments list for filter dropdown
    const deptResult = await query(`
      SELECT name
      FROM departments
      WHERE is_hrms_synced = TRUE
      ORDER BY name ASC
    `);
    const departments = deptResult.rows.map(r => r.name);

    // If caller requests all without pagination (e.g. for user mapping dropdowns)
    if (all === 'true' && !page) {
      const result = await query(`${baseQuery} ORDER BY ${sortColumn} ${orderDirection}`, params);
      return res.json({
        success: true,
        data: result.rows,
        total: result.rows.length,
        departments
      });
    }

    // Count query for pagination
    const countSql = `
      SELECT COUNT(*) as total
      FROM master_employees m
      LEFT JOIN users u ON m.employee_id = u.employee_id
      ${whereClause}
    `;
    const countResult = await query(countSql, params);
    const total = parseInt(countResult.rows[0].total, 10);

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(200, parseInt(limit, 10) || 100)); // Default 100
    const offset = (pageNum - 1) * limitNum;

    const dataSql = `
      ${baseQuery}
      ORDER BY ${sortColumn} ${orderDirection}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    const dataParams = [...params, limitNum, offset];
    const dataResult = await query(dataSql, dataParams);

    res.json({
      success: true,
      data: dataResult.rows,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
      departments
    });
  } catch (error) {
    console.error('Error fetching master employees:', error);
    res.status(500).json({ error: 'Failed to fetch employees.' });
  }
};

// POST add a single employee
exports.addEmployee = async (req, res) => {
  try {
    const { employeeId, name, email, phone, department, designation, role } = req.body;
    
    if (!employeeId || !/^\d{4,10}$/.test(employeeId.toString().trim())) {
      return res.status(400).json({ error: 'Employee ID must be between 4 and 10 digits.' });
    }
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Employee Name is required.' });
    }
    if (phone && !/^\+?\d{10,14}$/.test(phone.toString().trim())) {
      return res.status(400).json({ error: 'Mobile number must be between 10 and 14 digits.' });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.toString().trim())) {
      return res.status(400).json({ error: 'Invalid email format.' });
    }

    const exists = await query(`SELECT name, employee_id FROM master_employees WHERE employee_id = $1`, [employeeId.trim()]);
    if (exists.rows.length > 0) {
      return res.status(409).json({ error: `Employee ${exists.rows[0].name} with ID ${exists.rows[0].employee_id} already exists in the system.` });
    }

    const result = await query(
      `INSERT INTO master_employees (employee_id, name, email, phone, department, designation, role)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [employeeId.trim(), name.trim(), email, phone, department, designation, role || 'employee']
    );

    await auditLog(req.user.id, 'EMPLOYEE_ADDED', null, {
      employeeId: employeeId.trim(),
      name: name.trim(),
      department,
      designation,
      role
    }, req.ip);

    res.status(201).json({
      success: true,
      message: 'Employee added successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error adding master employee:', error);
    res.status(500).json({ error: 'Failed to add employee.' });
  }
};

// POST bulk add via JSON array (from frontend CSV upload)
exports.bulkAddEmployees = async (req, res) => {
  try {
    const { employees } = req.body;
    
    if (!employees || !Array.isArray(employees) || employees.length === 0) {
      return res.status(400).json({ error: 'Valid employees array is required.' });
    }

    let addedCount = 0;
    let errorCount = 0;
    const alreadyExists = [];
    const invalidData = [];

    // Use a transaction or sequential inserts for simplicity
    for (const emp of employees) {
      if (!emp.employeeId || !emp.name) {
        errorCount++;
        continue;
      }
      
      try {
        const empIdStr = emp.employeeId.toString().trim();
        const phoneStr = emp.phone ? emp.phone.toString().trim() : null;
        const emailStr = emp.email ? emp.email.toString().trim() : null;

        if (!/^\d{4,10}$/.test(empIdStr)) {
          invalidData.push(`${emp.name} (Invalid ID: ${empIdStr})`);
          errorCount++;
          continue;
        }
        if (phoneStr && !/^\+?\d{10,14}$/.test(phoneStr)) {
          invalidData.push(`${emp.name} (Invalid Phone: ${phoneStr})`);
          errorCount++;
          continue;
        }
        if (emailStr && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr)) {
          invalidData.push(`${emp.name} (Invalid Email: ${emailStr})`);
          errorCount++;
          continue;
        }

        const existing = await query(`SELECT name, employee_id FROM master_employees WHERE employee_id = $1`, [empIdStr]);
        if (existing.rows.length > 0) {
           alreadyExists.push(`${existing.rows[0].name} (${existing.rows[0].employee_id})`);
           continue;
        }

        await query(
          `INSERT INTO master_employees (employee_id, name, email, phone, department, designation, role)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            empIdStr, 
            emp.name.trim(), 
            emp.email || null, 
            emp.phone ? emp.phone.toString().trim() : null, 
            emp.department || null, 
            emp.designation || null, 
            emp.role || 'employee'
          ]
        );
        addedCount++;
      } catch (err) {
        console.error('Failed to add row:', emp, err.message);
        errorCount++;
      }
    }

    await auditLog(req.user.id, 'EMPLOYEES_BULK_ADDED', null, {
      addedCount,
      errorCount,
      alreadyExistsCount: alreadyExists.length,
      invalidDataCount: invalidData.length
    }, req.ip);

    res.json({
      success: true,
      message: `Successfully processed ${addedCount} new employees. Errors: ${errorCount}.`,
      addedCount,
      errorCount,
      alreadyExists,
      invalidData
    });

  } catch (error) {
    console.error('Error in bulk add employees:', error);
    res.status(500).json({ error: 'Failed to process bulk upload.' });
  }
};

const { getHrmsSyncStatus } = require('../services/hrmsSyncService');
const officePortalService = require('../services/officePortalService');
const { assertAllowedOfficePortalUrl } = require('../utils/secretCrypto');

// POST on-demand sync from OfficePortal HRMS Public API v1
exports.syncFromHrms = async (req, res) => {
  try {
    const config = await officePortalService.getConfig();
    const isOfficePortal = Boolean(config.clientId && config.clientSecret);

    if (!isOfficePortal) {
      return res.status(400).json({
        error: 'OfficePortal API Key (Client Secret) is not configured yet. Please enter your API Key in the HRMS Sync & API Health tab first.',
        code: 'OFFICEPORTAL_NOT_CONFIGURED'
      });
    }

    const syncType = req.body?.type === 'delta' ? 'delta' : 'full';
    const result = syncType === 'delta'
      ? await officePortalService.syncDeltaChanges()
      : await officePortalService.syncFullDirectory();

    await auditLog(req.user.id, 'OFFICEPORTAL_SYNC_PERFORMED', null, {
      syncType,
      totalFetched: result.totalFetched,
      totalInserted: result.totalInserted,
      totalUpdated: result.totalUpdated,
      totalDeactivated: result.totalDeactivated,
      masterSummary: result.masterSummary || null
    }, req.ip);

    return res.json({
      success: true,
      source: 'OfficePortal HRMS Public API v1',
      syncType,
      message: syncType === 'delta'
        ? `Delta sync complete: fetched ${result.totalFetched} change(s) (${result.totalInserted} inserted, ${result.totalUpdated} updated, ${result.totalDeactivated} deactivated).`
        : `Full bootstrap sync complete: fetched ${result.totalFetched} employee(s) and ${result.masterSummary?.departments ?? 0} department(s) from OfficePortal HRMS.`,
      data: result
    });
  } catch (error) {
    console.error('[POST /master-employees/sync-hrms] error:', error.message);
    const status = error.code === 'CREDENTIALS_MISSING' ? 400 : 500;
    res.status(status).json({
      error: error.message || 'Failed to synchronize employees from OfficePortal HRMS API.',
      code: error.code || 'SYNC_FAILED'
    });
  }
};

// POST test OfficePortal OAuth connection & refresh live quota telemetry
exports.testConnection = async (req, res) => {
  try {
    const result = await officePortalService.testConnection();
    await auditLog(req.user.id, 'OFFICEPORTAL_CONNECTION_TESTED', null, {
      connected: result.connected,
      requestsToday: result.usage?.requestsToday,
      dailyRequestsRemaining: result.usage?.dailyRequestsRemaining,
      requestsRemaining: result.usage?.requestsRemaining
    }, req.ip);

    res.json({
      success: true,
      message: 'Connected to OfficePortal Public API v1 successfully and refreshed live quota.',
      data: result
    });
  } catch (error) {
    console.error('[POST /master-employees/test-connection] error:', error.message);
    const status = error.code === 'CREDENTIALS_MISSING' ? 400 : 502;
    res.status(status).json({
      success: false,
      error: error.message || 'Failed to connect to OfficePortal API.',
      code: error.code || 'CONNECTION_FAILED'
    });
  }
};

// PUT update/rotate OfficePortal credentials & webhook signing keys securely
exports.updateHrmsConfig = async (req, res) => {
  try {
    const {
      clientId,
      authUrl,
      baseUrl,
      clientSecret,
      webhookSecret,
      webhookSecretPrevious
    } = req.body || {};

    const updates = {};
    const auditPayload = {};

    if (typeof clientId === 'string' && clientId.trim()) {
      updates.officeportal_client_id = clientId.trim();
      auditPayload.officeportal_client_id = clientId.trim();
    }
    if (typeof authUrl === 'string' && authUrl.trim()) {
      const safeAuthUrl = assertAllowedOfficePortalUrl(authUrl.trim(), 'auth');
      updates.officeportal_auth_url = safeAuthUrl;
      auditPayload.officeportal_auth_url = safeAuthUrl;
    }
    if (typeof baseUrl === 'string' && baseUrl.trim()) {
      const safeBaseUrl = assertAllowedOfficePortalUrl(baseUrl.trim().replace(/\/+$/, ''), 'api');
      updates.officeportal_base_url = safeBaseUrl;
      auditPayload.officeportal_base_url = safeBaseUrl;
    }
    if (typeof clientSecret === 'string' && clientSecret.trim() && clientSecret.trim() !== '••••••••') {
      updates.officeportal_client_secret = clientSecret.trim();
      auditPayload.officeportal_client_secret = '[REDACTED]';
    }
    if (typeof webhookSecret === 'string' && webhookSecret.trim() && webhookSecret.trim() !== '••••••••') {
      updates.officeportal_webhook_secret = webhookSecret.trim();
      auditPayload.officeportal_webhook_secret = '[REDACTED]';
    }
    if (typeof webhookSecretPrevious === 'string' && webhookSecretPrevious.trim() !== '••••••••') {
      updates.officeportal_webhook_secret_previous = webhookSecretPrevious.trim();
      auditPayload.officeportal_webhook_secret_previous = webhookSecretPrevious.trim() ? '[REDACTED]' : '[CLEARED]';
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid HRMS configuration changes provided.' });
    }

    await officePortalService.setConfigValues(updates);
    officePortalService.clearCaches();

    await auditLog(req.user.id, 'OFFICEPORTAL_CONFIG_UPDATED', null, auditPayload, req.ip);

    res.json({
      success: true,
      message: 'OfficePortal HRMS configuration saved successfully.'
    });
  } catch (error) {
    if (error.code === 'INVALID_OFFICEPORTAL_URL' || error.statusCode === 400) {
      return res.status(400).json({
        error: error.message,
        code: error.code || 'INVALID_OFFICEPORTAL_URL'
      });
    }
    console.error('[PUT /master-employees/hrms-config] error:', error.message);
    res.status(500).json({ error: 'Failed to save OfficePortal configuration.' });
  }
};

// GET sync status, masked config, counts, and quota telemetry
exports.getSyncStatus = async (req, res) => {
  try {
    const config = await officePortalService.getConfig();
    const isOfficePortal = Boolean(config.clientId && config.clientSecret);

    const [syncLogsRes, webhookStatsRes, countsRes, sheetStatus] = await Promise.all([
      query(`
        SELECT id, sync_type, status, delta_cursor, last_changed_at, records_fetched, records_inserted,
               records_updated, records_deactivated, error_message, started_at, completed_at
        FROM hrms_sync_logs
        ORDER BY started_at DESC
        LIMIT 15
      `).catch(() => ({ rows: [] })),
      query(`
        SELECT 
          COUNT(*) as total_events,
          COUNT(CASE WHEN status = 'PROCESSED' THEN 1 END) as processed_events,
          COUNT(CASE WHEN status = 'FAILED' THEN 1 END) as failed_events,
          COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending_events
        FROM hrms_webhook_events
      `).catch(() => ({ rows: [{ total_events: 0, processed_events: 0, failed_events: 0, pending_events: 0 }] })),
      query(`
        SELECT
          (SELECT COUNT(*) FROM master_employees WHERE office_portal_id IS NOT NULL) AS synced_employees,
          (SELECT COUNT(*) FROM departments WHERE is_hrms_synced = TRUE) AS synced_departments,
          (SELECT COUNT(*) FROM hrms_job_titles) AS synced_job_titles,
          (SELECT COUNT(*) FROM hrms_employment_types) AS synced_employment_types
      `).catch(() => ({ rows: [{ synced_employees: 0, synced_departments: 0, synced_job_titles: 0, synced_employment_types: 0 }] })),
      getHrmsSyncStatus().catch(() => ({}))
    ]);

    const publicBase = (process.env.CLIENT_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
    const webhookUrl = `${publicBase}/api/webhooks/officeportal`;

    const counts = countsRes.rows[0] || {};
    res.json({
      success: true,
      data: {
        isOfficePortalConfigured: isOfficePortal,
        clientId: config.clientId,
        authUrl: config.authUrl,
        officePortalBaseUrl: config.baseUrl,
        baseUrl: config.baseUrl,
        webhookUrl,
        hasClientSecret: Boolean(config.clientSecret),
        hasWebhookSecret: Boolean(config.webhookSecret),
        hasWebhookSecretPrevious: Boolean(config.webhookSecretPrevious),
        lastChangedAt: config.lastChangedAt || null,
        syncCursor: config.syncCursor || null,
        syncStatus: config.syncStatus || 'READY',
        quota: {
          dailyLimit: Number(config.dailyLimit) || 500,
          dailyRemaining: config.dailyRemaining !== null ? Number(config.dailyRemaining) : null,
          dailyReset: config.dailyReset || null,
          monthlyQuota: Number(config.monthlyQuota) || 5000,
          monthlyRemaining: config.monthlyRemaining !== null ? Number(config.monthlyRemaining) : null,
          monthlyReset: config.monthlyReset || null,
          perMinuteLimit: 30
        },
        syncedCounts: {
          employees: parseInt(counts.synced_employees || '0', 10),
          departments: parseInt(counts.synced_departments || '0', 10),
          jobTitles: parseInt(counts.synced_job_titles || '0', 10),
          employmentTypes: parseInt(counts.synced_employment_types || '0', 10)
        },
        lastOfficePortalSync: syncLogsRes.rows[0] || null,
        recentSyncLogs: syncLogsRes.rows,
        webhookStats: webhookStatsRes.rows[0],
        legacySheetSync: sheetStatus
      }
    });
  } catch (error) {
    console.error('[GET /master-employees/sync-status] error:', error);
    res.status(500).json({ error: 'Failed to retrieve HRMS sync status.' });
  }
};


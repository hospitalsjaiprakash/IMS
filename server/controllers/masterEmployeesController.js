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
      is_registered: 'is_registered'
    };
    const sortColumn = allowedSortFields[sort_by] || 'm.name';
    const orderDirection = sort_order?.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    // Base query
    const baseQuery = `
      SELECT 
        m.id as master_id, 
        m.employee_id, 
        m.name as full_name, 
        m.department, 
        m.designation, 
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
      ${whereClause}
    `;

    // Distinct departments for filter dropdown
    const deptResult = await query(`
      SELECT DISTINCT department 
      FROM master_employees 
      WHERE department IS NOT NULL AND TRIM(department) != '' 
      ORDER BY department ASC
    `);
    const departments = deptResult.rows.map(r => r.department);

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

const { syncEmployeesFromHrms, getHrmsSyncStatus } = require('../services/hrmsSyncService');

// POST on-demand sync from Google Sheets HRMS API
exports.syncFromHrms = async (req, res) => {
  try {
    const result = await syncEmployeesFromHrms();
    await auditLog(req.user.id, 'HRMS_SYNC_PERFORMED', null, result, req.ip);

    res.json({
      success: true,
      message: `Successfully synchronized ${result.totalFetched} employees from HRMS Google Sheet.`,
      data: result
    });
  } catch (error) {
    console.error('[POST /master-employees/sync-hrms] error:', error);
    res.status(500).json({
      error: error.message || 'Failed to synchronize employees from HRMS API.'
    });
  }
};

// GET sync status
exports.getSyncStatus = async (req, res) => {
  try {
    const status = await getHrmsSyncStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    console.error('[GET /master-employees/sync-status] error:', error);
    res.status(500).json({ error: 'Failed to retrieve HRMS sync status.' });
  }
};


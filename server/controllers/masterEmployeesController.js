const { query } = require('../config/database');
const { auditLog } = require('../middleware/auth');

// GET all master employees and check if they have created an IMS account
exports.getAllEmployees = async (req, res) => {
  try {
    const result = await query(`
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
      ORDER BY m.name ASC
    `);

    res.json({
      success: true,
      data: result.rows
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
    
    if (!employeeId || !/^\d{5}$/.test(employeeId.toString().trim())) {
      return res.status(400).json({ error: 'Employee ID must be exactly 5 digits.' });
    }
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Employee Name is required.' });
    }
    if (phone && !/^\d{10}$/.test(phone.toString().trim())) {
      return res.status(400).json({ error: 'Mobile number must be exactly 10 digits.' });
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

        if (!/^\d{5}$/.test(empIdStr)) {
          invalidData.push(`${emp.name} (Invalid ID: ${empIdStr})`);
          errorCount++;
          continue;
        }
        if (phoneStr && !/^\d{10}$/.test(phoneStr)) {
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

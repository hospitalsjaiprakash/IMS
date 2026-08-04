const { query, getClient } = require('../config/database');
const { auditLog } = require('../middleware/auth');
const { createNotification } = require('../utils/notifications');
const { generateReferenceId } = require('../utils/referenceId');
const { sendEmail, templates } = require('../utils/emailService');

const categoryDepartmentMapping = {
  'Asset Related': 'Asset',
  'Billing Related': 'Finance and Accounts',
  'Security Related': 'Security Services',
  'Biomedical Related': 'Bio-Medical',
  'Blood Bank Related': 'Blood Centre',
  'Facility Related': 'Facility',
  'Doctor Related': 'Medical Services',
  'Consent Related': 'Medical Services',
  'CSSD Related': 'Nursing Services',
  'Food and Beverages': 'Food and Beverages',
  'General Maintenance related': 'General Maintenance',
  'Hospital Emergency Codes Related': 'Medical Services',
  'HR Related': 'Human Resource',
  'Housekeeping Related': 'Housekeeping',
  'Infection Control Related': 'Infection Control and Microbiology',
  'Lab Related': 'Lab Medicine',
  'Laundry and Linen related': 'Linen and Laundry',
  'Medication Related': 'Medical Services',
  'Nursing Care Related': 'Nursing Services',
  'Purchase Related': 'Purchase',
  'Radiology Related': 'Radiology',
  'Store Related': 'Stores',
  'Software/Hardware Related': 'Digital Communications',
  'Surgery or Procedure Related': 'Medical Services',
  'Nursing Document Related': 'Nursing Services',
  'Vehicle and Ambulance Related': 'Ambulance / Travel / Transport',
  'Accommodation Related': 'Facility'
};

// =============================================
// CREATE INCIDENT
// =============================================
exports.createIncident = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    let {
      departmentIds, incidentDate, incidentTime,
      mainLocationId, subLocationId,
      occurredTo, severity, incidentCategory, incidentType, description,
      hasResponsiblePerson, responsiblePersonName, incidentCategories
    } = req.body;

    if (typeof departmentIds === 'string') departmentIds = JSON.parse(departmentIds);
    if (typeof incidentCategories === 'string') incidentCategories = JSON.parse(incidentCategories);
    hasResponsiblePerson = hasResponsiblePerson === 'true' || hasResponsiblePerson === true;

    // Automatically derive departmentIds if missing
    if (!departmentIds || departmentIds.length === 0) {
      const catsToMap = incidentCategories && incidentCategories.length > 0 ? incidentCategories : (incidentCategory ? [incidentCategory] : []);
      const deptNames = [...new Set(catsToMap.map(c => categoryDepartmentMapping[c]).filter(Boolean))];
      
      if (deptNames.length > 0) {
        const deptQuery = await client.query('SELECT id FROM departments WHERE name = ANY($1)', [deptNames]);
        departmentIds = deptQuery.rows.map(r => r.id);
      }
    }

    if (!departmentIds || !departmentIds.length) {
      return res.status(400).json({ error: 'Could not determine the responsible department for the selected categories.' });
    }

    // Generate reference ID
    const refId = await generateReferenceId(client);

    // Duplicate detection
    const dupCheck = await client.query(
      `SELECT i.id, i.reference_id FROM incidents i
       JOIN incident_departments id ON id.incident_id = i.id
       WHERE id.department_id = ANY($1)
         AND i.incident_type = $2
         AND i.incident_date BETWEEN $3::date - INTERVAL '3 days' AND $3::date + INTERVAL '3 days'
         AND i.status NOT IN ('withdrawn', 'resolved')
         AND i.id != uuid_generate_v4()
       LIMIT 1`,
      [departmentIds, incidentType, incidentDate]
    );

    // Determine initial status
    let status = 'with_hod';
    const configResult = await client.query(
      "SELECT value FROM system_config WHERE key = 'parallel_grave_review'"
    );
    const parallelGrave = configResult.rows[0]?.value === 'true';
    if (severity === 'Grave' && parallelGrave) {
      status = 'with_hod_and_imc';
    }

    // Insert incident
    const incidentResult = await client.query(
      `INSERT INTO incidents (
        reference_id, year, seq_number, reporter_id,
        incident_date, incident_time, main_location_id, sub_location_id,
        occurred_to, severity, incident_category, incident_type, description,
        has_responsible_person, responsible_person_name, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING *`,
      [
        refId.referenceId, refId.year, refId.seqNumber, req.user.id,
        incidentDate, incidentTime, mainLocationId, subLocationId,
        occurredTo, severity, incidentCategory || 'Others', incidentType, description,
        hasResponsiblePerson, responsiblePersonName || null, status
      ]
    );

    const incident = incidentResult.rows[0];

    // Link departments
    for (const deptId of departmentIds) {
      await client.query(
        'INSERT INTO incident_departments (incident_id, department_id) VALUES ($1, $2)',
        [incident.id, deptId]
      );
    }

    // Mark potential duplicate
    if (dupCheck.rows.length > 0) {
      await client.query(
        'UPDATE incidents SET potential_duplicate_of = $1 WHERE id = $2',
        [dupCheck.rows[0].id, incident.id]
      );
    }

    // Insert attachments if any
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await client.query(
          `INSERT INTO attachments (incident_id, uploader_id, stage, original_filename, stored_filename, file_size, mime_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [incident.id, req.user.id, 'submission', file.originalname, file.filename, file.size, file.mimetype]
        );
      }
    }

    await client.query('COMMIT');

    // Get reporter info for email
    const reporterInfo = await query('SELECT email, full_name FROM users WHERE id = $1', [req.user.id]);
    const reporter = reporterInfo.rows[0];

    // Notify reporter (in-app + email)
    await createNotification(req.user.id, incident.id,
      'Incident Submitted',
      `Your incident ${refId.referenceId} has been submitted successfully.`,
      'incident_submitted'
    );
    if (reporter?.email) {
      sendEmail(reporter.email, templates.incidentSubmitted(incident, reporter)).catch(() => {});
    }

    // Notify HODs, Incharges, and Assistant COOs (in-app + email)
    const hodResult = await query(
      `SELECT DISTINCT u.id, u.email, u.full_name FROM users u
       LEFT JOIN departments d ON (d.hod_user_id = u.id OR d.incharge_user_id = u.id OR d.asst_coo_user_id = u.id OR LOWER(d.name) = LOWER(u.department))
       WHERE d.id = ANY($1) AND (u.role = 'hod' OR d.hod_user_id = u.id OR d.incharge_user_id = u.id OR d.asst_coo_user_id = u.id)`,
      [departmentIds]
    );
    for (const hod of hodResult.rows) {
      await createNotification(hod.id, incident.id,
        'New Incident Reported',
        `A new incident ${refId.referenceId} has been reported for your department.`,
        'new_incident_hod'
      );
      if (hod.email) {
        sendEmail(hod.email, templates.newIncidentHod(incident, hod)).catch(() => {});
      }
    }

    await auditLog(req.user.id, 'INCIDENT_CREATED', incident.id, {
      referenceId: refId.referenceId, severity, incidentType
    }, req.ip);

    res.status(201).json({
      success: true,
      incident: {
        id: incident.id,
        referenceId: incident.reference_id,
        status: incident.status
      },
      potentialDuplicate: dupCheck.rows[0] || null
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create Incident Error:', error);
    res.status(500).json({ error: 'Failed to create incident. Details: ' + error.message });
  } finally {
    client.release();
  }
};

// =============================================
// GET INCIDENTS (role-based)
// =============================================
exports.getIncidents = async (req, res) => {
  try {
    const { status, severity, incidentCategory, incidentType, dateFrom, dateTo, page = 1, limit = 10, departmentId, reviewStage, viewMode } = req.query;
    const offset = (page - 1) * limit;
    const { role, id: userId, department } = req.user;

    let whereClause = '1=1';
    const params = [];
    let paramIdx = 1;

    // Role-based filtering
    if (role === 'employee' || (role === 'hod' && viewMode === 'my_incidents')) {
      whereClause += ` AND i.reporter_id = $${paramIdx++}`;
      params.push(userId);
    } else if (role === 'hod') {
      const userDept = department || '';
      whereClause += ` AND EXISTS (
        SELECT 1 FROM incident_departments id2
        JOIN departments d ON d.id = id2.department_id
        WHERE id2.incident_id = i.id AND (
          d.hod_user_id = $${paramIdx} OR
          d.incharge_user_id = $${paramIdx} OR
          d.asst_coo_user_id = $${paramIdx} OR
          (LOWER(d.name) = LOWER($${paramIdx + 1}))
        )
      )`;
      params.push(userId, userDept);
      paramIdx += 2;
    }
    if (status === 'active') {
      whereClause += ` AND i.status NOT IN ('resolved', 'withdrawn')`;
    } else if (status) { whereClause += ` AND i.status = $${paramIdx++}`; params.push(status); }
    if (severity) { whereClause += ` AND i.severity = $${paramIdx++}`; params.push(severity); }
    if (incidentCategory) { whereClause += ` AND i.incident_category = $${paramIdx++}`; params.push(incidentCategory); }
    if (incidentType) { whereClause += ` AND i.incident_type = $${paramIdx++}`; params.push(incidentType); }
    if (dateFrom) { whereClause += ` AND i.incident_date >= $${paramIdx++}`; params.push(dateFrom); }
    if (dateTo) { whereClause += ` AND i.incident_date <= $${paramIdx++}`; params.push(dateTo); }
    if (departmentId) {
      whereClause += ` AND EXISTS (SELECT 1 FROM incident_departments id3 WHERE id3.incident_id = i.id AND id3.department_id = $${paramIdx++})`;
      params.push(departmentId);
    }

    if (reviewStage === 'hodGiven') {
      whereClause += ` AND EXISTS (SELECT 1 FROM feedbacks f WHERE f.incident_id = i.id AND f.role = 'hod')`;
    } else if (reviewStage === 'hodPending') {
      whereClause += ` AND NOT EXISTS (SELECT 1 FROM feedbacks f WHERE f.incident_id = i.id AND f.role = 'hod') AND i.status NOT IN ('resolved', 'withdrawn')`;
    } else if (reviewStage === 'imcGiven') {
      whereClause += ` AND EXISTS (SELECT 1 FROM feedbacks f WHERE f.incident_id = i.id AND f.role = 'imc')`;
    } else if (reviewStage === 'imcPending') {
      whereClause += ` AND NOT EXISTS (SELECT 1 FROM feedbacks f WHERE f.incident_id = i.id AND f.role = 'imc') AND i.status NOT IN ('resolved', 'withdrawn')`;
    } else if (reviewStage === 'mgmtGiven') {
      whereClause += ` AND EXISTS (SELECT 1 FROM feedbacks f WHERE f.incident_id = i.id AND f.role = 'head_management')`;
    } else if (reviewStage === 'mgmtPending') {
      whereClause += ` AND NOT EXISTS (SELECT 1 FROM feedbacks f WHERE f.incident_id = i.id AND f.role = 'head_management') AND i.status NOT IN ('resolved', 'withdrawn')`;
    } else if (reviewStage === 'trainingPending') {
      whereClause += ` AND (i.status = 'pending_training' OR (i.has_responsible_person = TRUE AND i.training_completed = FALSE AND i.status != 'withdrawn'))`;
    }

    // Exclude withdrawn for non-admin/non-MD/non-IMC/non-HOD unless they are the reporter
    if (role !== 'system_admin' && role !== 'head_management' && role !== 'imc' && role !== 'hod') {
      whereClause += ` AND (i.status != 'withdrawn' OR i.reporter_id = $${paramIdx++})`;
      params.push(userId);
    }

    const countResult = await query(
      `SELECT COUNT(*) FROM incidents i WHERE ${whereClause}`,
      params
    );

    const incidentsResult = await query(
      `SELECT i.*,
        u.full_name as reporter_name, u.department as reporter_department,
        u.employee_id as reporter_employee_id,
        ml.name as main_location_name, sl.name as sub_location_name,
        ARRAY_AGG(DISTINCT d.name) as departments,
        EXISTS(SELECT 1 FROM feedbacks f WHERE f.incident_id = i.id AND f.role = 'hod') as has_hod_feedback,
        EXISTS(SELECT 1 FROM feedbacks f WHERE f.incident_id = i.id AND f.role = 'imc') as has_imc_feedback,
        EXISTS(SELECT 1 FROM feedbacks f WHERE f.incident_id = i.id AND f.role = 'head_management') as has_management_feedback
       FROM incidents i
       LEFT JOIN users u ON u.id = i.reporter_id
       LEFT JOIN main_locations ml ON ml.id = i.main_location_id
       LEFT JOIN sub_locations sl ON sl.id = i.sub_location_id
       LEFT JOIN incident_departments id ON id.incident_id = i.id
       LEFT JOIN departments d ON d.id = id.department_id
       WHERE ${whereClause}
       GROUP BY i.id, u.full_name, u.department, u.employee_id, ml.name, sl.name
       ORDER BY i.created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, limit, offset]
    );

    let incidentsList = incidentsResult.rows;
    if (role === 'system_admin') {
      incidentsList = incidentsList.map(i => ({
        ...i,
        description: '[Protected Content — System Admin has metadata view only]'
      }));
    }

    res.json({
      incidents: incidentsList,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch incidents.' });
  }
};

// =============================================
// EXPORT INCIDENTS (Excel/Report Data)
// =============================================
exports.exportIncidents = async (req, res) => {
  try {
    const { dateFilter, startDate, endDate, status, severity, incidentType } = req.query;
    const { role, id: userId } = req.user;

    let whereClause = '1=1';
    const params = [];
    let paramIdx = 1;

    // Role filtering
    if (role === 'employee') {
      whereClause += ` AND i.reporter_id = $${paramIdx++}`;
      params.push(userId);
    } else if (role === 'hod') {
      const userDept = req.user.department || '';
      whereClause += ` AND EXISTS (
        SELECT 1 FROM incident_departments id2
        JOIN departments d ON d.id = id2.department_id
        WHERE id2.incident_id = i.id AND (
          d.hod_user_id = $${paramIdx} OR
          d.incharge_user_id = $${paramIdx} OR
          d.asst_coo_user_id = $${paramIdx} OR
          (LOWER(d.name) = LOWER($${paramIdx + 1}))
        )
      )`;
      params.push(userId, userDept);
      paramIdx += 2;
    }

    // Date range filtering
    if (dateFilter === 'last_30') {
      whereClause += ` AND i.incident_date >= CURRENT_DATE - INTERVAL '30 days'`;
    } else if (dateFilter === 'last_60') {
      whereClause += ` AND i.incident_date >= CURRENT_DATE - INTERVAL '60 days'`;
    } else if (dateFilter === 'last_90') {
      whereClause += ` AND i.incident_date >= CURRENT_DATE - INTERVAL '90 days'`;
    } else if (dateFilter === 'custom' && startDate && endDate) {
      whereClause += ` AND i.incident_date >= $${paramIdx++} AND i.incident_date <= $${paramIdx++}`;
      params.push(startDate, endDate);
    }

    if (status === 'active') {
      whereClause += ` AND i.status NOT IN ('resolved', 'withdrawn')`;
    } else if (status && status !== 'all') {
      whereClause += ` AND i.status = $${paramIdx++}`;
      params.push(status);
    }
    if (severity && severity !== 'all') {
      whereClause += ` AND i.severity = $${paramIdx++}`;
      params.push(severity);
    }
    if (incidentType && incidentType !== 'all') {
      whereClause += ` AND i.incident_type = $${paramIdx++}`;
      params.push(incidentType);
    }

    // Exclude withdrawn for non-admin/non-MD
    if (role !== 'system_admin' && role !== 'head_management') {
      whereClause += ` AND i.status != 'withdrawn'`;
    }

    const exportQuery = `
      SELECT 
        i.id,
        i.reference_id,
        i.status,
        i.severity,
        i.incident_category,
        i.incident_type,
        i.occurred_to,
        i.description,
        i.incident_date,
        i.incident_time,
        i.created_at,
        i.resolved_at,
        u.full_name as reporter_name,
        u.employee_id as reporter_employee_id,
        u.department as reporter_department,
        ml.name as main_location_name,
        sl.name as sub_location_name,
        ARRAY_AGG(DISTINCT d.name) FILTER (WHERE d.name IS NOT NULL) as departments,
        (SELECT feedback_text FROM feedbacks f WHERE f.incident_id = i.id AND f.role = 'hod' ORDER BY f.created_at ASC LIMIT 1) as hod_feedback,
        (SELECT created_at FROM feedbacks f WHERE f.incident_id = i.id AND f.role = 'hod' ORDER BY f.created_at ASC LIMIT 1) as hod_feedback_at,
        (SELECT feedback_text FROM feedbacks f WHERE f.incident_id = i.id AND f.role = 'imc' ORDER BY f.created_at ASC LIMIT 1) as imc_feedback,
        (SELECT created_at FROM feedbacks f WHERE f.incident_id = i.id AND f.role = 'imc' ORDER BY f.created_at ASC LIMIT 1) as imc_feedback_at,
        (SELECT feedback_text FROM feedbacks f WHERE f.incident_id = i.id AND f.role = 'head_management' ORDER BY f.created_at ASC LIMIT 1) as mgmt_feedback,
        (SELECT created_at FROM feedbacks f WHERE f.incident_id = i.id AND f.role = 'head_management' ORDER BY f.created_at ASC LIMIT 1) as mgmt_feedback_at
      FROM incidents i
      LEFT JOIN users u ON u.id = i.reporter_id
      LEFT JOIN main_locations ml ON ml.id = i.main_location_id
      LEFT JOIN sub_locations sl ON sl.id = i.sub_location_id
      LEFT JOIN incident_departments id ON id.incident_id = i.id
      LEFT JOIN departments d ON d.id = id.department_id
      WHERE ${whereClause}
      GROUP BY i.id, u.full_name, u.employee_id, u.department, ml.name, sl.name
      ORDER BY i.created_at DESC
    `;

    const result = await query(exportQuery, params);

    let incidentsList = result.rows;
    if (role === 'system_admin') {
      incidentsList = incidentsList.map(item => ({
        ...item,
        description: '[Protected Content — System Admin has metadata view only]'
      }));
    }

    res.json({
      success: true,
      count: incidentsList.length,
      incidents: incidentsList
    });
  } catch (error) {
    console.error('Export incidents error:', error);
    res.status(500).json({ error: 'Failed to export incidents.' });
  }
};

// =============================================
// GET SINGLE INCIDENT
// =============================================
exports.getIncident = async (req, res) => {
  try {
    const { id } = req.params;
    const { role, id: userId } = req.user;

    const result = await query(
      `SELECT i.*,
        u.full_name as reporter_name, u.department as reporter_department, u.designation as reporter_designation,
        u.employee_id as reporter_employee_id,
        ml.name as main_location_name, sl.name as sub_location_name
       FROM incidents i
       LEFT JOIN users u ON u.id = i.reporter_id
       LEFT JOIN main_locations ml ON ml.id = i.main_location_id
       LEFT JOIN sub_locations sl ON sl.id = i.sub_location_id
       WHERE i.id::text = $1 OR i.reference_id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    const incident = result.rows[0];

    // Access control for employees - can only see own
    if (role === 'employee' && incident.reporter_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get departments
    const depts = await query(
      `SELECT d.id, d.name FROM departments d
       JOIN incident_departments id ON id.department_id = d.id
       WHERE id.incident_id = $1`,
      [incident.id]
    );

    if (role === 'system_admin') {
      return res.json({
        incident: {
          id: incident.id,
          reference_id: incident.reference_id,
          reporter_id: incident.reporter_id,
          reporter_name: incident.reporter_name,
          reporter_employee_id: incident.reporter_employee_id,
          reporter_department: incident.reporter_department,
          departments: depts.rows,
          incident_type: incident.incident_type,
          incident_category: incident.incident_category,
          severity: incident.severity,
          status: incident.status,
          incident_date: incident.incident_date,
          incident_time: incident.incident_time,
          created_at: incident.created_at,
          description: '[Protected Content — System Admin has metadata view only]'
        },
        feedbacks: [],
        attachments: [],
        finalReport: null
      });
    }

    // Get feedbacks (role-based visibility)
    let feedbackQuery = `SELECT f.*, u.full_name, u.role, u.designation, d.name as dept_name
       FROM feedbacks f
       JOIN users u ON u.id = f.author_id
       LEFT JOIN departments d ON d.id = f.department_id
       WHERE f.incident_id = $1`;
    
    // Employees see feedbacks only after resolution
    if (role === 'employee' && incident.status !== 'resolved') {
      feedbackQuery += ` AND FALSE`; // hide all feedbacks
    }
    feedbackQuery += ` ORDER BY f.created_at ASC`;
    const feedbacks = await query(feedbackQuery, [incident.id]);

    // Get attachments
    const attachments = await query(
      `SELECT a.*, u.full_name as uploader_name FROM attachments a
       JOIN users u ON u.id = a.uploader_id
       WHERE a.incident_id = $1
       ORDER BY a.created_at ASC`,
      [incident.id]
    );

    // Get final report
    const finalReport = await query(
      `SELECT * FROM final_reports WHERE incident_id = $1 AND is_latest = TRUE`,
      [incident.id]
    );

    // Track HOD first view
    if (role === 'hod' && !incident.hod_first_viewed_at) {
      await query(
        'UPDATE incidents SET hod_first_viewed_at = NOW() WHERE id = $1',
        [incident.id]
      );
    }

    res.json({
      incident: { ...incident, departments: depts.rows },
      feedbacks: feedbacks.rows,
      attachments: attachments.rows,
      finalReport: finalReport.rows[0] || null
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch incident.' });
  }
};

// =============================================
// WITHDRAW INCIDENT
// =============================================
exports.withdrawIncident = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const result = await query(
      'SELECT * FROM incidents WHERE id = $1 AND reporter_id = $2',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    const incident = result.rows[0];

    if (!['submitted', 'with_hod'].includes(incident.status)) {
      return res.status(400).json({ error: 'Incident can only be withdrawn before IMC review.' });
    }

    await query(
      `UPDATE incidents SET status = 'withdrawn', withdrawn_at = NOW(), withdrawn_reason = $1, updated_at = NOW()
       WHERE id = $2`,
      [reason || null, id]
    );

    await auditLog(req.user.id, 'INCIDENT_WITHDRAWN', id, { reason }, req.ip);

    res.json({ success: true, message: 'Incident withdrawn successfully.' });

  } catch (error) {
    res.status(500).json({ error: 'Failed to withdraw incident' });
  }
};

// =============================================
// SUBMIT HOD FEEDBACK
// =============================================
exports.submitHodFeedback = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { id } = req.params;
    let { feedbackText, redirectToImc, redirectReason, acknowledged } = req.body;
    
    acknowledged = acknowledged === 'true' || acknowledged === true;

    if (!acknowledged) {
      return res.status(400).json({ error: 'HOD must acknowledge review before providing feedback.' });
    }

    const incidentResult = await client.query(
      'SELECT * FROM incidents WHERE id = $1',
      [id]
    );

    if (!incidentResult.rows.length) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    const incident = incidentResult.rows[0];

    // Get HOD's department
    const deptResult = await client.query(
      'SELECT id FROM departments WHERE hod_user_id = $1 OR incharge_user_id = $1 OR asst_coo_user_id = $1 OR LOWER(name) = LOWER($2)',
      [req.user.id, (req.user.department || '').trim()]
    );

    if (!deptResult.rows.length) {
      return res.status(403).json({ error: 'Not authorized as HOD' });
    }

    const deptId = deptResult.rows[0].id;

    // Check if HOD's dept is targeted
    const targetCheck = await client.query(
      'SELECT 1 FROM incident_departments WHERE incident_id = $1 AND department_id = $2',
      [id, deptId]
    );

    if (!targetCheck.rows.length) {
      return res.status(403).json({ error: 'This incident is not targeted at your department' });
    }

    // Insert feedback
    await client.query(
      `INSERT INTO feedbacks (incident_id, author_id, role, department_id, feedback_text, acknowledged_at)
       VALUES ($1, $2, 'hod', $3, $4, NOW())`,
      [id, req.user.id, deptId, feedbackText]
    );

    // Insert attachments if any
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await client.query(
          `INSERT INTO attachments (incident_id, uploader_id, stage, original_filename, stored_filename, file_size, mime_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [id, req.user.id, 'hod_feedback', file.originalname, file.filename, file.size, file.mimetype]
        );
      }
    }

    // Check if all HODs have responded
    const totalHods = await client.query(
      `SELECT COUNT(*) FROM incident_departments id
       JOIN departments d ON d.id = id.department_id
       WHERE id.incident_id = $1 AND (d.hod_user_id IS NOT NULL OR d.incharge_user_id IS NOT NULL OR d.asst_coo_user_id IS NOT NULL)`,
      [id]
    );

    const respondedHods = await client.query(
      `SELECT COUNT(*) FROM feedbacks WHERE incident_id = $1 AND role = 'hod'`,
      [id]
    );

    const allResponded = parseInt(respondedHods.rows[0].count) >= parseInt(totalHods.rows[0].count);

    // Update status
    if (redirectToImc) {
      await client.query(
        `UPDATE incidents SET status = 'redirect_requested', updated_at = NOW() WHERE id = $1`,
        [id]
      );
    } else if (allResponded || incident.status === 'with_hod') {
      const newStatus = incident.status === 'with_hod_and_imc' ? 'with_hod_and_imc' : 'with_imc';
      await client.query(
        `UPDATE incidents SET status = $1, updated_at = NOW() WHERE id = $2`,
        [newStatus, id]
      );
    }

    await client.query('COMMIT');

    // Notify IMC (in-app + email)
    const imcMembers = await query('SELECT id, email, full_name FROM users WHERE role = $1', ['imc']);
    for (const member of imcMembers.rows) {
      await createNotification(member.id, id,
        'Incident Ready for IMC Review',
        `Incident ${incident.reference_id} is now in the IMC queue.`,
        'incident_to_imc'
      );
      if (member.email) {
        sendEmail(member.email, templates.incidentToImc(incident, member)).catch(() => {});
      }
    }

    await auditLog(req.user.id, 'HOD_FEEDBACK_SUBMITTED', id, { redirectToImc }, req.ip);

    res.json({ success: true });

  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to submit feedback.' });
  } finally {
    client.release();
  }
};

// =============================================
// IMC CLAIM INCIDENT
// =============================================
exports.claimIncident = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { id } = req.params;

    // Check no active claim
    const existingClaim = await client.query(
      'SELECT * FROM imc_claims WHERE incident_id = $1 AND is_active = TRUE',
      [id]
    );

    if (existingClaim.rows.length > 0) {
      const claim = existingClaim.rows[0];
      if (new Date(claim.expires_at) > new Date()) {
        return res.status(409).json({ error: 'Incident is already claimed by another IMC member.' });
      }
      // Release expired claim
      await client.query(
        'UPDATE imc_claims SET is_active = FALSE, released_at = NOW() WHERE id = $1',
        [claim.id]
      );
    }

    // Get claim lock duration
    const configResult = await client.query(
      "SELECT value FROM system_config WHERE key = 'claim_lock_minutes'"
    );
    const lockMinutes = parseInt(configResult.rows[0]?.value || '30');

    const expiresAt = new Date(Date.now() + lockMinutes * 60 * 1000);

    await client.query(
      `INSERT INTO imc_claims (incident_id, claimed_by, expires_at) VALUES ($1, $2, $3)`,
      [id, req.user.id, expiresAt]
    );

    await client.query('COMMIT');

    await auditLog(req.user.id, 'IMC_CLAIM', id, { lockMinutes }, req.ip);

    res.json({ success: true, expiresAt });

  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to claim incident' });
  } finally {
    client.release();
  }
};

// =============================================
// IMC SUBMIT FEEDBACK
// =============================================
exports.submitImcFeedback = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { id } = req.params;
    let { feedbackText, forwardToMd } = req.body;
    
    forwardToMd = forwardToMd === 'true' || forwardToMd === true;

    const incidentResult = await client.query('SELECT * FROM incidents WHERE id = $1', [id]);
    if (!incidentResult.rows.length) return res.status(404).json({ error: 'Not found' });
    const incident = incidentResult.rows[0];

    await client.query(
      `INSERT INTO feedbacks (incident_id, author_id, role, feedback_text)
       VALUES ($1, $2, 'imc', $3)`,
      [id, req.user.id, feedbackText]
    );
    
    // Insert attachments if any
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await client.query(
          `INSERT INTO attachments (incident_id, uploader_id, stage, original_filename, stored_filename, file_size, mime_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [id, req.user.id, 'imc_feedback', file.originalname, file.filename, file.size, file.mimetype]
        );
      }
    }

    if (forwardToMd) {
      await client.query(
        `UPDATE incidents SET status = 'with_head_management', updated_at = NOW() WHERE id = $1`,
        [id]
      );

      // Notify MD (in-app + email)
      const mdUsers = await query('SELECT id, email, full_name FROM users WHERE role = $1', ['head_management']);
      for (const md of mdUsers.rows) {
        await createNotification(md.id, id,
          'Incident Forwarded for Decision',
          `Incident ${incident.reference_id} requires your final decision.`,
          'incident_to_md'
        );
        if (md.email) {
          sendEmail(md.email, templates.incidentToManagement(incident, md)).catch(() => {});
        }
      }
    }

    await client.query('COMMIT');
    await auditLog(req.user.id, 'IMC_FEEDBACK_SUBMITTED', id, { forwardToMd }, req.ip);

    res.json({ success: true });

  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to submit IMC feedback' });
  } finally {
    client.release();
  }
};

// =============================================
// MD FINAL DECISION & CLOSE
// =============================================
exports.submitMdDecision = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { id } = req.params;
    let { faultType, correctiveActions, requireTraining } = req.body;
    
    requireTraining = requireTraining === 'true' || requireTraining === true;

    const incidentResult = await client.query('SELECT * FROM incidents WHERE id = $1', [id]);
    if (!incidentResult.rows.length) return res.status(404).json({ error: 'Not found' });
    const incident = incidentResult.rows[0];

    // Insert MD feedback
    await client.query(
      `INSERT INTO feedbacks (incident_id, author_id, role, feedback_text)
       VALUES ($1, $2, 'head_management', $3)`,
      [id, req.user.id, correctiveActions]
    );

    // Create final report
    await client.query(
      `INSERT INTO final_reports (incident_id, generated_by, fault_type, corrective_actions)
       VALUES ($1, $2, $3, $4)`,
      [id, req.user.id, faultType, correctiveActions]
    );
    
    // Insert attachments if any
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await client.query(
          `INSERT INTO attachments (incident_id, uploader_id, stage, original_filename, stored_filename, file_size, mime_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [id, req.user.id, 'md_decision', file.originalname, file.filename, file.size, file.mimetype]
        );
      }
    }

    // Determine new status: pending_training or resolved
    const newStatus = (requireTraining && incident.has_responsible_person) ? 'pending_training' : 'resolved';
    const resolvedAt = newStatus === 'resolved' ? 'NOW()' : 'NULL';

    await client.query(
      `UPDATE incidents SET status = $1, resolved_at = ${resolvedAt === 'NULL' ? 'NULL' : 'NOW()'}, updated_at = NOW() WHERE id = $2`,
      [newStatus, id]
    );

    await client.query('COMMIT');

    // Get reporter info
    const reporterRes = await query('SELECT email, full_name FROM users WHERE id = $1', [incident.reporter_id]);
    const reporter = reporterRes.rows[0];

    if (newStatus === 'pending_training') {
      // Notify reporter of training requirement
      await createNotification(incident.reporter_id, id,
        'Mandatory Training Required',
        `Management has mandated training for incident ${incident.reference_id}.`,
        'training_required'
      );
      if (reporter?.email) {
        sendEmail(reporter.email, templates.trainingRequired(incident, reporter)).catch(() => {});
      }
      // Notify IMC to verify training
      const imcMembers = await query("SELECT id, email, full_name FROM users WHERE role = 'imc'");
      for (const m of imcMembers.rows) {
        await createNotification(m.id, id, 'Training Verification Required',
          `Incident ${incident.reference_id} requires training verification.`,
          'training_imc_action'
        );
      }
    } else {
      // Notify reporter of resolution
      await createNotification(incident.reporter_id, id,
        'Incident Resolved',
        `Your incident ${incident.reference_id} has been resolved. View the final report.`,
        'incident_resolved'
      );
      if (reporter?.email) {
        sendEmail(reporter.email, templates.incidentResolved(incident, reporter)).catch(() => {});
      }
    }

    await auditLog(req.user.id, newStatus === 'pending_training' ? 'TRAINING_ASSIGNED' : 'INCIDENT_RESOLVED', id, { faultType, requireTraining }, req.ip);

    res.json({ success: true });

  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to close incident.' });
  } finally {
    client.release();
  }
};


// =============================================
// DASHBOARD ANALYTICS
// =============================================
exports.getDashboardStats = async (req, res) => {
  try {
    const { role, id: userId, department } = req.user;

    let deptFilter = '';
    const params = [];

    if (role === 'hod') {
      deptFilter = `AND EXISTS (
        SELECT 1 FROM incident_departments id2
        JOIN departments d ON d.id = id2.department_id
        WHERE id2.incident_id = i.id AND (
          d.hod_user_id = $1 OR
          d.incharge_user_id = $1 OR
          d.asst_coo_user_id = $1 OR
          LOWER(d.name) = LOWER($2)
        )
      )`;
      params.push(userId, (department || '').trim());
    } else if (role === 'employee') {
      deptFilter = `AND i.reporter_id = $1`;
      params.push(userId);
    }

    const [totals, bySeverity, byType, byStatus, monthly] = await Promise.all([
      query(`SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status NOT IN ('resolved','withdrawn')) as active,
        COUNT(*) FILTER (WHERE status = 'resolved') as resolved,
        COUNT(*) FILTER (WHERE status = 'withdrawn') as withdrawn,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as this_month
        FROM incidents i WHERE 1=1 ${deptFilter}`, params),

      query(`SELECT severity, COUNT(*) as count FROM incidents i WHERE 1=1 ${deptFilter}
        GROUP BY severity`, params),

      query(`SELECT incident_type, COUNT(*) as count FROM incidents i WHERE 1=1 ${deptFilter}
        GROUP BY incident_type ORDER BY count DESC LIMIT 10`, params),

      query(`SELECT status, COUNT(*) as count FROM incidents i WHERE 1=1 ${deptFilter}
        GROUP BY status`, params),

      query(`SELECT
        TO_CHAR(DATE_TRUNC('month', created_at), 'Mon YYYY') as month,
        DATE_TRUNC('month', created_at) as month_date,
        COUNT(*) as count
        FROM incidents i WHERE created_at >= NOW() - INTERVAL '12 months' ${deptFilter}
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY month_date ASC`, params)
    ]);

    let hodReport = null;
    if (role === 'hod') {
      // Calculate myIncidents (incidents reported by the HOD)
      const myIncidentsRes = await query(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status NOT IN ('resolved','withdrawn')) as active,
          COUNT(*) FILTER (WHERE status = 'resolved') as resolved,
          COUNT(*) FILTER (WHERE status = 'withdrawn') as withdrawn,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as this_month
        FROM incidents WHERE reporter_id = $1
      `, [userId]);

      const feedbackRes = await query(`
        SELECT COUNT(DISTINCT incident_id) as feedback_given
        FROM feedbacks WHERE author_id = $1 AND role = 'hod'
      `, [userId]);

      const receivedCount = parseInt(totals.rows[0].total) - parseInt(totals.rows[0].withdrawn || 0);
      const feedbackGivenCount = parseInt(feedbackRes.rows[0].feedback_given || 0);

      hodReport = {
        received: receivedCount,
        active: parseInt(totals.rows[0].active || 0),
        resolved: parseInt(totals.rows[0].resolved || 0),
        withdrawn: parseInt(totals.rows[0].withdrawn || 0),
        feedbackGiven: feedbackGivenCount,
        feedbackPending: Math.max(0, receivedCount - feedbackGivenCount),
        myIncidents: {
          total: parseInt(myIncidentsRes.rows[0].total || 0),
          active: parseInt(myIncidentsRes.rows[0].active || 0),
          resolved: parseInt(myIncidentsRes.rows[0].resolved || 0),
          withdrawn: parseInt(myIncidentsRes.rows[0].withdrawn || 0),
          thisMonth: parseInt(myIncidentsRes.rows[0].this_month || 0)
        }
      };
    }

    res.json({
      totals: totals.rows[0],
      bySeverity: bySeverity.rows,
      byType: byType.rows,
      byStatus: byStatus.rows,
      monthly: monthly.rows,
      ...(hodReport && { hodReport })
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stats.' });
  }
};

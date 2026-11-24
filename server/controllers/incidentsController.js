const { query, getClient } = require('../config/database');
const { auditLog } = require('../middleware/auth');
const { createNotification } = require('../utils/notifications');
const { generateReferenceId } = require('../utils/referenceId');
const { sendEmail, templates } = require('../utils/emailService');
const { recordEvent } = require('../utils/incidentEvents');
const {
  isPrivilegedRole,
  canUserAccessIncident,
  getUserAssignedCategoriesForIncident,
  getUserManagedDepartmentsForIncident,
  canNonPrivilegedUserViewLetter,
  filterIncidentEventsForUser
} = require('../utils/accessControl');

// =============================================
// CREATE INCIDENT
// =============================================
exports.createIncident = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    let {
      departmentIds, derivedDepartments, incidentDate, incidentTime,
      mainLocationId, subLocationText,
      occurredTo, incidentCategory, incidentType, incidentTypes, categoryTypeMap, description,
      hasResponsiblePerson, responsiblePersonName, incidentCategories
    } = req.body;

    // Validate incident date (must be within past 14 days and not in the future)
    if (!incidentDate) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Incident date is required.' });
    }

    const dateParts = incidentDate.split('-').map(Number);
    const incDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const minAllowed = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 14, 0, 0, 0, 0);

    if (isNaN(incDate.getTime())) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid incident date format.' });
    }
    if (incDate > today) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Incident date cannot be in the future.' });
    }
    if (incDate < minAllowed) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Per hospital policy, an incident can only be reported if it occurred within the past 14 days. Incidents exceeding 14 days cannot be reported.' });
    }

    // Convert empty strings or 'null' from FormData to actual null for integer columns
    const mLoc = mainLocationId && mainLocationId !== 'null' && mainLocationId !== 'Select a location' ? parseInt(mainLocationId, 10) : null;
    
    let sLoc = null;
    if (mLoc && subLocationText && subLocationText.trim() !== '') {
      const subText = subLocationText.trim();
      const existSub = await client.query('SELECT id FROM sub_locations WHERE main_location_id = $1 AND name ILIKE $2', [mLoc, subText]);
      if (existSub.rows.length > 0) {
        sLoc = existSub.rows[0].id;
      } else {
        const newSub = await client.query('INSERT INTO sub_locations (main_location_id, name) VALUES ($1, $2) RETURNING id', [mLoc, subText]);
        sLoc = newSub.rows[0].id;
      }
    }

    const parseJsonArray = (val, fieldName) => {
      if (val === undefined || val === null || val === '') return [];
      if (Array.isArray(val)) return val;
      if (typeof val === 'string') {
        try {
          const parsed = JSON.parse(val);
          return Array.isArray(parsed) ? parsed : [];
        } catch (err) {
          const e = new Error(`Invalid JSON format for ${fieldName}.`);
          e.statusCode = 400;
          throw e;
        }
      }
      return [];
    };

    let parsedTypeMap = {};
    try {
      departmentIds = parseJsonArray(departmentIds, 'departmentIds');
      derivedDepartments = parseJsonArray(derivedDepartments, 'derivedDepartments');
      incidentCategories = parseJsonArray(incidentCategories, 'incidentCategories');
      incidentTypes = parseJsonArray(incidentTypes, 'incidentTypes');
      if (categoryTypeMap && typeof categoryTypeMap === 'string') {
        const parsed = JSON.parse(categoryTypeMap);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) parsedTypeMap = parsed;
      } else if (categoryTypeMap && typeof categoryTypeMap === 'object' && !Array.isArray(categoryTypeMap)) {
        parsedTypeMap = categoryTypeMap;
      }
    } catch (parseErr) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: parseErr.message });
    }
    hasResponsiblePerson = hasResponsiblePerson === 'true' || hasResponsiblePerson === true;

    // 1. Resolve Incident Categories (Primary Routing Mechanism)
    let rawCatNames = [];
    if (Array.isArray(incidentCategories) && incidentCategories.length > 0) {
      rawCatNames = incidentCategories
        .map(c => (typeof c === 'object' ? (c?.name || c?.category) : c))
        .map(c => String(c || '').trim())
        .filter(Boolean);
    }
    if (rawCatNames.length === 0 && incidentCategory && String(incidentCategory).trim()) {
      rawCatNames = String(incidentCategory).split(',').map(s => s.trim()).filter(Boolean);
    }
    rawCatNames = [...new Set(rawCatNames)];

    // Build order-independent category -> type map (falling back to positional incidentTypes / single incidentType)
    const normalizedTypeMap = new Map();
    for (const [k, v] of Object.entries(parsedTypeMap)) {
      const cleanKey = String(k || '').trim().toLowerCase();
      const cleanVal = String(v || '').trim();
      if (cleanKey && cleanVal) normalizedTypeMap.set(cleanKey, cleanVal);
    }
    const rawCatIndexMap = new Map();
    rawCatNames.forEach((cName, idx) => rawCatIndexMap.set(cName.toLowerCase(), idx));
    const resolveTypeForCategory = (catName) => {
      const key = String(catName || '').trim().toLowerCase();
      if (normalizedTypeMap.has(key)) return normalizedTypeMap.get(key);
      const pos = rawCatIndexMap.get(key);
      if (pos !== undefined && incidentTypes[pos]) return String(incidentTypes[pos]).trim();
      return String(incidentType || '').trim() || 'Others';
    };

    // Legacy optional department resolution (if explicitly passed by legacy API callers)
    let resolvedDeptIds = [];
    if (Array.isArray(departmentIds) && departmentIds.length > 0) {
      const numericIds = departmentIds.map((id) => parseInt(id, 10)).filter((n) => Number.isInteger(n) && n > 0);
      if (numericIds.length > 0) {
        const deptQuery = await client.query(
          `SELECT id FROM departments WHERE id = ANY($1::int[])`,
          [numericIds]
        );
        resolvedDeptIds = deptQuery.rows.map((r) => r.id);
      }
    }
    if (resolvedDeptIds.length === 0 && Array.isArray(derivedDepartments) && derivedDepartments.length > 0) {
      const cleanNames = [...new Set(derivedDepartments.map((d) => String(d || '').trim().toLowerCase()).filter(Boolean))];
      if (cleanNames.length > 0) {
        const deptQuery = await client.query(
          `SELECT id FROM departments WHERE LOWER(TRIM(name)) = ANY($1::text[])`,
          [cleanNames]
        );
        resolvedDeptIds = deptQuery.rows.map((r) => r.id);
      }
    }
    departmentIds = resolvedDeptIds;

    if (rawCatNames.length === 0 && departmentIds.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Please select at least one Incident Category.',
        code: 'CATEGORY_REQUIRED'
      });
    }

    // Resolve or ensure canonical rows in incident_categories
    let resolvedCategories = [];
    if (rawCatNames.length > 0) {
      const catRes = await client.query(
        `SELECT id, name FROM incident_categories
         WHERE is_active = TRUE AND LOWER(TRIM(name)) = ANY($1::text[])`,
        [rawCatNames.map(c => c.toLowerCase())]
      );
      resolvedCategories = catRes.rows;
    }

    const canonicalCategoryStr = resolvedCategories.length > 0
      ? resolvedCategories.map(c => c.name).join(', ')
      : (rawCatNames.join(', ') || incidentCategory || 'Others');

    const orderedCatNames = resolvedCategories.length > 0
      ? rawCatNames.filter(rn => resolvedCategories.some(rc => rc.name.toLowerCase() === rn.toLowerCase()))
      : rawCatNames;
    const resolvedTypesList = [
      ...orderedCatNames.map(resolveTypeForCategory),
      ...incidentTypes.map(t => String(t || '').trim()),
    ].filter(Boolean);
    const canonicalTypeStr = [...new Set(resolvedTypesList)].join(', ') || String(incidentType || '').trim() || 'Others';

    // Determine whether active feedback assignees exist for the selected categories (or legacy departments)
    let mappedAssignees = [];
    if (resolvedCategories.length > 0) {
      const catAssigneesRes = await client.query(
        `SELECT DISTINCT u.id, u.email, u.full_name
         FROM category_feedback_assignees cfa
         JOIN users u ON u.id = cfa.user_id
         WHERE cfa.category_id = ANY($1::int[]) AND cfa.is_active = TRUE AND u.is_active = TRUE`,
        [resolvedCategories.map(c => c.id)]
      );
      mappedAssignees = catAssigneesRes.rows;
    }

    if (departmentIds.length > 0) {
      const deptAssigneesRes = await client.query(
        `SELECT DISTINCT u.id, u.email, u.full_name FROM users u
         LEFT JOIN departments d ON (d.assigned_user_id = u.id OR (d.assigned_user_id IS NULL AND d.hod_user_id = u.id))
         LEFT JOIN department_reviewers dr ON (dr.user_id = u.id AND dr.is_active = true)
         WHERE (d.id = ANY($1) OR dr.department_id = ANY($1)) AND u.is_active = true`,
        [departmentIds]
      );
      const seen = new Set(mappedAssignees.map(a => a.id));
      for (const r of deptAssigneesRes.rows) {
        if (!seen.has(r.id)) {
          seen.add(r.id);
          mappedAssignees.push(r);
        }
      }
    }

    // Generate reference ID
    const refId = await generateReferenceId(client);

    // If active category/department reviewers are mapped, route to 'with_hod' (Initial Review);
    // if no reviewer is mapped yet, route straight to 'with_imc' so the incident never orphans.
    const status = (mappedAssignees.length > 0 || departmentIds.length > 0) ? 'with_hod' : 'with_imc';
    const severity = 'Pending';

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
        incidentDate, incidentTime, mLoc, sLoc,
        occurredTo, severity, canonicalCategoryStr, canonicalTypeStr, description,
        hasResponsiblePerson, responsiblePersonName || null, status
      ]
    );

    const incident = incidentResult.rows[0];

    // Link incident categories with their per-category incident type
    for (const cat of resolvedCategories) {
      const catType = resolveTypeForCategory(cat.name);
      await client.query(
        `INSERT INTO incident_category_links (incident_id, category_id, incident_type)
         VALUES ($1, $2, $3)
         ON CONFLICT (incident_id, category_id) DO UPDATE SET incident_type = EXCLUDED.incident_type`,
        [incident.id, cat.id, catType]
      );
    }

    // Link legacy departments if supplied
    for (const deptId of departmentIds) {
      await client.query(
        'INSERT INTO incident_departments (incident_id, department_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [incident.id, deptId]
      );
    }

    // Insert attachments if any
    if (req.files && req.files.length > 0) {
      const { s3Client } = require('../config/s3');
      const { CopyObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
      const bucket = process.env.S3_BUCKET_NAME;
      const safeRefId = incident.reference_id.replace(/\//g, '-'); // JPHRC-IMS-2026-00001

      for (const file of req.files) {
        let storedFilename = file.filename || file.key || '';

        // If R2 is active and the file was placed in pending/, move it to the proper folder
        if (s3Client && bucket && file.key && file.key.startsWith('pending/')) {
          const oldKey = file.key;
          const filename = oldKey.split('/').pop(); // just the filename part
          const newKey = `${safeRefId}/employee/${filename}`;

          try {
            await s3Client.send(new CopyObjectCommand({
              Bucket: bucket,
              CopySource: `${bucket}/${oldKey}`,
              Key: newKey,
            }));
            await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: oldKey }));
            storedFilename = newKey;
          } catch (moveErr) {
            console.error('[S3 Move] Failed to move file:', moveErr.message);
            storedFilename = oldKey; // keep original key on error
          }
        }

        await client.query(
          `INSERT INTO attachments (incident_id, uploader_id, stage, original_filename, stored_filename, file_size, mime_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [incident.id, req.user.id, 'submission', file.originalname, storedFilename, file.size, file.mimetype]
        );
      }
    }

    // Record immutable INCIDENT_CREATED event in journal
    const createdEvent = await recordEvent(client, {
      incidentId: incident.id,
      eventType: 'INCIDENT_CREATED',
      actor: req.user,
      roundNo: 1,
      statusBefore: null,
      statusAfter: incident.status,
      title: 'Incident Reported',
      summary: `Reported by ${req.user.full_name || 'Staff'} (${req.user.department || 'Hospital Staff'})`,
      payload: {
        reference_id: incident.reference_id,
        incident_date: incident.incident_date,
        incident_time: incident.incident_time,
        main_location_id: incident.main_location_id,
        sub_location_id: incident.sub_location_id,
        occurred_to: incident.occurred_to,
        reported_severity: incident.severity,
        incident_category: incident.incident_category,
        incident_type: incident.incident_type,
        category_types: resolvedCategories.map(c => ({
          category: c.name,
          type: resolveTypeForCategory(c.name)
        })),
        department_ids: departmentIds,
        description: incident.description,
        has_responsible_person: incident.has_responsible_person,
        responsible_person_name: incident.responsible_person_name
      },
      isSystemEvent: false
    });

    if (req.files && req.files.length > 0) {
      await client.query('UPDATE attachments SET event_id = $1 WHERE incident_id = $2', [createdEvent.id, incident.id]);
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

    // Notify assigned feedback staff (in-app + email), or IMC if no reviewer is mapped yet
    if (mappedAssignees.length > 0) {
      for (const reviewer of mappedAssignees) {
        await createNotification(reviewer.id, incident.id,
          'New Incident Reported',
          `A new incident ${refId.referenceId} (${canonicalCategoryStr}) has been assigned to you for feedback.`,
          'new_incident_hod'
        );
        if (reviewer.email) {
          sendEmail(reviewer.email, templates.newIncidentHod(incident, reviewer)).catch(() => {});
        }
      }
    } else if (status === 'with_imc') {
      const imcUsers = await query(
        "SELECT id, email, full_name FROM users WHERE (role = 'imc' OR is_imc_member = TRUE OR is_imc_lead = TRUE) AND is_active = TRUE"
      );
      for (const m of imcUsers.rows) {
        await createNotification(m.id, incident.id,
          'New Incident Routed to IMC',
          `Incident ${refId.referenceId} (${canonicalCategoryStr}) has no mapped category reviewer and was routed directly to IMC.`,
          'incident_to_imc'
        );
        if (m.email) {
          sendEmail(m.email, templates.incidentToImc(incident, m)).catch(() => {});
        }
      }
    }

    await auditLog(req.user.id, 'INCIDENT_CREATED', incident.id, {
      referenceId: refId.referenceId, severity, incidentType
    }, req.ip);

    // Emit lightweight socket invalidation signal (no incident PII/department payload)
    if (req.io) {
      req.io.emit('incident_created', { id: incident.id });
    }

    res.status(201).json({
      success: true,
      incident: {
        id: incident.id,
        referenceId: incident.reference_id,
        status: incident.status
      }
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
    const { status, severity, incidentCategory, incidentType, dateFrom, dateTo, page = 1, limit = 10, departmentId, reviewStage, viewMode, teamMemberId, teamMemberName, search } = req.query;
    const offset = (page - 1) * limit;
    const { role, id: userId, department } = req.user;

    let whereClause = '1=1';
    const params = [];
    let paramIdx = 1;

    const categoryReviewerPredicate = (idx) => `EXISTS (
      SELECT 1 FROM incident_category_links icl2
      JOIN category_feedback_assignees cfa2 ON cfa2.category_id = icl2.category_id
      WHERE icl2.incident_id = i.id AND cfa2.user_id = $${idx} AND cfa2.is_active = TRUE
    )`;

    // Role-based filtering
    if (role === 'employee' && viewMode !== 'dept_reviews') {
      whereClause += ` AND (
        i.reporter_id = $${paramIdx} 
        OR i.redirect_requested_by_user_id = $${paramIdx}
        OR EXISTS (
          SELECT 1 FROM investigators inv
          WHERE inv.incident_id = i.id AND inv.investigator_id = $${paramIdx}
        )
        OR EXISTS (
          SELECT 1 FROM incident_trainers tr
          WHERE tr.incident_id = i.id AND tr.trainer_id = $${paramIdx}
        )
        OR EXISTS (
          SELECT 1 FROM incident_responsible_employees ire
          WHERE ire.incident_id = i.id AND ire.employee_id = $${paramIdx}
        )
        OR EXISTS (
          SELECT 1
          FROM incident_letters l_cc
          WHERE l_cc.incident_id = i.id
            AND l_cc.status IN ('approved', 'dispatched')
            AND EXISTS (
              SELECT 1
              FROM jsonb_array_elements(
                CASE WHEN jsonb_typeof(COALESCE(l_cc.cc_recipients, '[]'::jsonb)) = 'array'
                     THEN COALESCE(l_cc.cc_recipients, '[]'::jsonb)
                     ELSE '[]'::jsonb END
              ) AS cc_item
              WHERE jsonb_typeof(cc_item) = 'object'
                AND (
                  cc_item->>'user_id' = $${paramIdx}::text
                  OR cc_item->>'id' = $${paramIdx}::text
                  OR ($${paramIdx + 1} <> '' AND LOWER(COALESCE(cc_item->>'employee_id', '')) = LOWER($${paramIdx + 1}))
                )
            )
        )
        OR ${categoryReviewerPredicate(paramIdx)}
        OR EXISTS (
          SELECT 1 FROM incident_departments id2
          JOIN departments d ON d.id = id2.department_id
          WHERE id2.incident_id = i.id AND (
            d.assigned_user_id = $${paramIdx} OR (d.assigned_user_id IS NULL AND d.hod_user_id = $${paramIdx})
            OR EXISTS (SELECT 1 FROM department_reviewers dr WHERE dr.department_id = d.id AND dr.user_id = $${paramIdx} AND dr.is_active = true)
          )
        )
      )`;
      params.push(userId, String(req.user.employee_id || '').trim());
      paramIdx += 2;
    } else if (role === 'employee' && viewMode === 'dept_reviews') {
      whereClause += ` AND (
        ${categoryReviewerPredicate(paramIdx)}
        OR EXISTS (
          SELECT 1 FROM incident_departments id2
          JOIN departments d ON d.id = id2.department_id
          WHERE id2.incident_id = i.id AND (
            d.assigned_user_id = $${paramIdx} OR (d.assigned_user_id IS NULL AND d.hod_user_id = $${paramIdx})
            OR EXISTS (SELECT 1 FROM department_reviewers dr WHERE dr.department_id = d.id AND dr.user_id = $${paramIdx} AND dr.is_active = true)
          )
        )
      )`;
      params.push(userId);
      paramIdx++;
    } else if (['hod', 'asst_coo', 'coo'].includes(role) && viewMode === 'my_incidents') {
      whereClause += ` AND (i.reporter_id = $${paramIdx} OR i.redirect_requested_by_user_id = $${paramIdx})`;
      params.push(userId);
      paramIdx++;
    } else if (['hod', 'asst_coo', 'coo'].includes(role) && viewMode === 'my_team') {
      const userDept = department || '';
      whereClause += ` AND EXISTS (
        SELECT 1 FROM incident_responsible_employees ire
        JOIN users ru ON ru.id = ire.employee_id
        LEFT JOIN departments d ON LOWER(d.name) = LOWER(ru.department) OR d.id = ire.department_id
        WHERE ire.incident_id = i.id AND (
          d.assigned_user_id = $${paramIdx} OR
          d.hod_user_id = $${paramIdx} OR
          EXISTS (SELECT 1 FROM department_reviewers dr WHERE dr.department_id = d.id AND dr.user_id = $${paramIdx} AND dr.is_active = true) OR
          (LOWER(d.name) = LOWER($${paramIdx + 1}))
        )
      )`;
      params.push(userId, userDept);
      paramIdx += 2;
    } else if (['hod', 'asst_coo', 'coo'].includes(role)) {
      const userDept = department || '';
      
      if (teamMemberId) {
        whereClause += ` AND EXISTS (
          SELECT 1 FROM users tm
          LEFT JOIN departments d ON LOWER(d.name) = LOWER(tm.department)
          WHERE tm.id = $${paramIdx} AND (
            d.assigned_user_id = $${paramIdx+1} OR
            d.hod_user_id = $${paramIdx+1} OR
            EXISTS (SELECT 1 FROM department_reviewers dr WHERE dr.department_id = d.id AND dr.user_id = $${paramIdx+1} AND dr.is_active = true) OR
            LOWER(tm.department) = LOWER($${paramIdx+2})
          )
        )`;
        params.push(teamMemberId, userId, userDept);
        paramIdx += 3;
      } else {
        whereClause += ` AND (
          ${categoryReviewerPredicate(paramIdx)}
          OR EXISTS (
            SELECT 1 FROM incident_departments id2
            JOIN departments d ON d.id = id2.department_id
            WHERE id2.incident_id = i.id AND (
              d.assigned_user_id = $${paramIdx} OR
              d.hod_user_id = $${paramIdx} OR
              EXISTS (SELECT 1 FROM department_reviewers dr WHERE dr.department_id = d.id AND dr.user_id = $${paramIdx} AND dr.is_active = true) OR
              (LOWER(d.name) = LOWER($${paramIdx + 1}))
            )
          )
          OR i.redirect_requested_by_user_id = $${paramIdx}
        )`;
        params.push(userId, userDept);
        paramIdx += 2;
      }
    }
    
    if (teamMemberId && teamMemberName) {
      whereClause += ` AND (
        i.reporter_id = $${paramIdx}
        OR EXISTS (SELECT 1 FROM incident_responsible_employees ire WHERE ire.incident_id = i.id AND ire.employee_id = $${paramIdx})
        OR i.responsible_person_name ILIKE $${paramIdx+1}
      )`;
      params.push(teamMemberId, `%${teamMemberName}%`);
      paramIdx += 2;
    }

    if (search && String(search).trim()) {
      const s = `%${String(search).trim()}%`;
      whereClause += ` AND (i.reference_id ILIKE $${paramIdx} OR i.incident_category ILIKE $${paramIdx} OR i.incident_type ILIKE $${paramIdx} OR i.description ILIKE $${paramIdx})`;
      params.push(s);
      paramIdx++;
    }

    if (status === 'active') {
      whereClause += ` AND i.status NOT IN ('resolved', 'withdrawn', 'closed')`;
    } else if (status === 'resolved') {
      whereClause += ` AND i.status IN ('resolved', 'closed')`;
    } else if (status) {
      whereClause += ` AND i.status = $${paramIdx++}`;
      params.push(status);
    }
    if (severity) { whereClause += ` AND i.severity = $${paramIdx++}`; params.push(severity); }
    if (incidentCategory) {
      whereClause += ` AND (
        LOWER(TRIM(COALESCE(i.incident_category, ''))) = LOWER(TRIM($${paramIdx}))
        OR EXISTS (
          SELECT 1 FROM incident_category_links icl3
          JOIN incident_categories ic3 ON ic3.id = icl3.category_id
          WHERE icl3.incident_id = i.id AND LOWER(TRIM(ic3.name)) = LOWER(TRIM($${paramIdx}))
        )
      )`;
      params.push(incidentCategory);
      paramIdx++;
    }
    if (incidentType) { whereClause += ` AND i.incident_type = $${paramIdx++}`; params.push(incidentType); }
    if (dateFrom) { whereClause += ` AND i.incident_date >= $${paramIdx++}`; params.push(dateFrom); }
    if (dateTo) { whereClause += ` AND i.incident_date <= $${paramIdx++}`; params.push(dateTo); }
    if (departmentId) {
      whereClause += ` AND EXISTS (SELECT 1 FROM incident_departments id3 WHERE id3.incident_id = i.id AND id3.department_id = $${paramIdx++})`;
      params.push(departmentId);
    }

    if (reviewStage === 'hodGiven') {
      whereClause += ` AND i.status != 'withdrawn' AND EXISTS (SELECT 1 FROM feedbacks f WHERE f.incident_id = i.id AND f.role = 'hod')`;
    } else if (reviewStage === 'hodPending') {
      whereClause += ` AND NOT EXISTS (SELECT 1 FROM feedbacks f WHERE f.incident_id = i.id AND f.role = 'hod') AND i.status NOT IN ('resolved', 'withdrawn', 'closed')`;
    } else if (reviewStage === 'imcGiven') {
      whereClause += ` AND i.status != 'withdrawn' AND EXISTS (SELECT 1 FROM feedbacks f WHERE f.incident_id = i.id AND f.role = 'imc')`;
    } else if (reviewStage === 'imcPending') {
      whereClause += ` AND NOT EXISTS (SELECT 1 FROM feedbacks f WHERE f.incident_id = i.id AND f.role = 'imc') AND i.status NOT IN ('resolved', 'withdrawn', 'closed')`;
    } else if (reviewStage === 'mgmtGiven') {
      whereClause += ` AND i.status != 'withdrawn' AND EXISTS (SELECT 1 FROM feedbacks f WHERE f.incident_id = i.id AND f.role = 'head_management')`;
    } else if (reviewStage === 'mgmtPending') {
      whereClause += ` AND i.status IN ('with_head_management', 'pending_management_letter_approval')`;
    } else if (reviewStage === 'trainingPending') {
      whereClause += ` AND i.status IN ('pending_training', 'pending_trainer_assignment', 'training_in_progress', 'pending_imc_training_review')`;
    }

    // Exclude withdrawn for non-privileged roles unless they are the reporter
    if (!['system_admin', 'head_management', 'imc', 'hod', 'asst_coo', 'coo'].includes(role)) {
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
        ARRAY_AGG(DISTINCT d.name) FILTER (WHERE d.name IS NOT NULL) as departments,
        ARRAY_AGG(DISTINCT ic.name) FILTER (WHERE ic.name IS NOT NULL) as incident_categories,
        (SELECT COUNT(*)::int FROM attachments a WHERE a.incident_id = i.id) as attachment_count,
        EXISTS(SELECT 1 FROM feedbacks f WHERE f.incident_id = i.id AND f.role = 'hod') as has_hod_feedback,
        EXISTS(SELECT 1 FROM feedbacks f WHERE f.incident_id = i.id AND f.role = 'imc') as has_imc_feedback,
        EXISTS(SELECT 1 FROM feedbacks f WHERE f.incident_id = i.id AND f.role = 'head_management') as has_management_feedback,
        (SELECT MIN(f.created_at) FROM feedbacks f WHERE f.incident_id = i.id AND f.role = 'hod') as hod_feedback_at,
        (SELECT MIN(f.created_at) FROM feedbacks f WHERE f.incident_id = i.id AND f.role = 'imc') as imc_feedback_at,
        (SELECT MIN(f.created_at) FROM feedbacks f WHERE f.incident_id = i.id AND f.role = 'head_management') as mgmt_feedback_at,
        (SELECT feedback_text FROM feedbacks f WHERE f.incident_id = i.id AND f.role = 'hod' ORDER BY f.created_at DESC LIMIT 1) as hod_feedback,
        (SELECT feedback_text FROM feedbacks f WHERE f.incident_id = i.id AND f.role = 'imc' ORDER BY f.created_at DESC LIMIT 1) as imc_feedback,
        (SELECT feedback_text FROM feedbacks f WHERE f.incident_id = i.id AND f.role = 'head_management' ORDER BY f.created_at DESC LIMIT 1) as management_feedback,
        (
          SELECT COALESCE(json_agg(
            json_build_object(
              'id', f.id,
              'feedback_text', f.feedback_text,
              'created_at', f.created_at,
              'author_name', u2.full_name,
              'department_name', COALESCE(icf.name, d2.name, u2.department),
              'designation', u2.designation
            ) ORDER BY f.created_at ASC
          ), '[]'::json)
          FROM feedbacks f
          LEFT JOIN users u2 ON u2.id = f.author_id
          LEFT JOIN incident_categories icf ON icf.id = f.category_id
          LEFT JOIN departments d2 ON d2.id = f.department_id
          WHERE f.incident_id = i.id AND f.role = 'hod'
        ) as hod_feedbacks,
        (
          SELECT COALESCE(json_agg(
            json_build_object(
              'id', f.id,
              'feedback_text', f.feedback_text,
              'created_at', f.created_at,
              'author_name', u2.full_name,
              'designation', u2.designation
            ) ORDER BY f.created_at ASC
          ), '[]'::json)
          FROM feedbacks f
          LEFT JOIN users u2 ON u2.id = f.author_id
          WHERE f.incident_id = i.id AND f.role = 'imc'
        ) as imc_feedbacks,
        (
          SELECT COALESCE(json_agg(
            json_build_object(
              'id', f.id,
              'feedback_text', f.feedback_text,
              'created_at', f.created_at,
              'author_name', u2.full_name,
              'designation', u2.designation
            ) ORDER BY f.created_at ASC
          ), '[]'::json)
          FROM feedbacks f
          LEFT JOIN users u2 ON u2.id = f.author_id
          WHERE f.incident_id = i.id AND f.role = 'head_management'
        ) as management_feedbacks
       FROM incidents i
       LEFT JOIN users u ON u.id = i.reporter_id
       LEFT JOIN main_locations ml ON ml.id = i.main_location_id
       LEFT JOIN sub_locations sl ON sl.id = i.sub_location_id
       LEFT JOIN incident_departments id ON id.incident_id = i.id
       LEFT JOIN departments d ON d.id = id.department_id
       LEFT JOIN incident_category_links icl ON icl.incident_id = i.id
       LEFT JOIN incident_categories ic ON ic.id = icl.category_id
       WHERE ${whereClause}
       GROUP BY i.id, u.full_name, u.department, u.employee_id, ml.name, sl.name
       ORDER BY i.created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, limit, offset]
    );

    let incidentsList = incidentsResult.rows;

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
    const { dateFilter, startDate, endDate, status, severity, incidentCategory, incidentType } = req.query;
    const { role, id: userId } = req.user;

    let whereClause = '1=1';
    const params = [];
    let paramIdx = 1;

    // Role filtering
    if (role === 'employee') {
      whereClause += ` AND (
        i.reporter_id = $${paramIdx}
        OR EXISTS (
          SELECT 1 FROM incident_category_links icl2
          JOIN category_feedback_assignees cfa2 ON cfa2.category_id = icl2.category_id
          WHERE icl2.incident_id = i.id AND cfa2.user_id = $${paramIdx} AND cfa2.is_active = TRUE
        )
      )`;
      params.push(userId);
      paramIdx++;
    } else if (role === 'hod') {
      const userDept = req.user.department || '';
      whereClause += ` AND (
        EXISTS (
          SELECT 1 FROM incident_category_links icl2
          JOIN category_feedback_assignees cfa2 ON cfa2.category_id = icl2.category_id
          WHERE icl2.incident_id = i.id AND cfa2.user_id = $${paramIdx} AND cfa2.is_active = TRUE
        )
        OR EXISTS (
          SELECT 1 FROM incident_departments id2
          JOIN departments d ON d.id = id2.department_id
          WHERE id2.incident_id = i.id AND (
            d.assigned_user_id = $${paramIdx} OR
            d.hod_user_id = $${paramIdx} OR
            d.incharge_user_id = $${paramIdx} OR
            d.asst_coo_user_id = $${paramIdx} OR
            EXISTS (SELECT 1 FROM department_reviewers dr WHERE dr.department_id = d.id AND dr.user_id = $${paramIdx} AND dr.is_active = true) OR
            (LOWER(d.name) = LOWER($${paramIdx + 1}))
          )
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
      whereClause += ` AND i.status NOT IN ('resolved', 'closed', 'withdrawn')`;
    } else if (status === 'resolved') {
      whereClause += ` AND i.status IN ('resolved', 'closed')`;
    } else if (status && status !== 'all') {
      whereClause += ` AND i.status = $${paramIdx++}`;
      params.push(status);
    }
    if (severity && severity !== 'all') {
      whereClause += ` AND i.severity = $${paramIdx++}`;
      params.push(severity);
    }
    if (incidentCategory && incidentCategory !== 'all') {
      whereClause += ` AND (
        LOWER(TRIM(COALESCE(i.incident_category, ''))) = LOWER(TRIM($${paramIdx}))
        OR EXISTS (
          SELECT 1 FROM incident_category_links icl3
          JOIN incident_categories ic3 ON ic3.id = icl3.category_id
          WHERE icl3.incident_id = i.id AND LOWER(TRIM(ic3.name)) = LOWER(TRIM($${paramIdx}))
        )
      )`;
      params.push(incidentCategory);
      paramIdx++;
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
    const { sanitizeCsvCell } = require('../utils/csvSanitizer');

    // Neutralize potential spreadsheet formula injection in exported text cells
    const incidentsList = result.rows.map((row) => ({
      ...row,
      reference_id: sanitizeCsvCell(row.reference_id),
      incident_category: sanitizeCsvCell(row.incident_category),
      incident_type: sanitizeCsvCell(row.incident_type),
      occurred_to: sanitizeCsvCell(row.occurred_to),
      description: sanitizeCsvCell(row.description),
      reporter_name: sanitizeCsvCell(row.reporter_name),
      reporter_employee_id: sanitizeCsvCell(row.reporter_employee_id),
      reporter_department: sanitizeCsvCell(row.reporter_department),
      main_location_name: sanitizeCsvCell(row.main_location_name),
      sub_location_name: sanitizeCsvCell(row.sub_location_name),
      departments: Array.isArray(row.departments)
        ? row.departments.map((d) => sanitizeCsvCell(d))
        : row.departments,
      hod_feedback: row.hod_feedback ? sanitizeCsvCell(row.hod_feedback) : row.hod_feedback,
      imc_feedback: row.imc_feedback ? sanitizeCsvCell(row.imc_feedback) : row.imc_feedback,
      mgmt_feedback: row.mgmt_feedback ? sanitizeCsvCell(row.mgmt_feedback) : row.mgmt_feedback
    }));

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

    // Centralized object-level authorization across all non-privileged roles (employees & HODs)
    const allowed = await canUserAccessIncident(req.user, incident.id);
    if (!allowed) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get assigned incident categories with per-category type and feedback status
    const cats = await query(
      `SELECT ic.id, ic.name, icl.incident_type,
         EXISTS (
           SELECT 1 FROM category_feedback_assignees cfa
           JOIN users u ON u.id = cfa.user_id
           WHERE cfa.category_id = ic.id AND cfa.is_active = TRUE AND u.is_active = TRUE
         ) AS has_active_assignee,
         EXISTS (
           SELECT 1 FROM feedbacks f
           WHERE f.incident_id = $1
             AND f.role = 'hod'
             AND (
               f.category_id = ic.id
               OR (
                 f.category_id IS NULL
                 AND EXISTS (
                   SELECT 1 FROM category_feedback_assignees cfa
                   WHERE cfa.category_id = ic.id AND cfa.user_id = f.author_id AND cfa.is_active = TRUE
                 )
               )
             )
         ) AS has_feedback
       FROM incident_categories ic
       JOIN incident_category_links icl ON icl.category_id = ic.id
       WHERE icl.incident_id = $1
       ORDER BY ic.name ASC`,
      [incident.id]
    );

    // Get legacy departments with per-department feedback status
    const depts = await query(
      `SELECT d.id, d.name, d.hod_user_id, COALESCE(d.assigned_user_id, d.hod_user_id) as assigned_user_id,
         EXISTS (
           SELECT 1 FROM feedbacks f
           LEFT JOIN users u ON u.id = f.author_id
           WHERE f.incident_id = $1 
             AND f.role = 'hod'
             AND (
               f.department_id = d.id 
               OR f.author_id = COALESCE(d.assigned_user_id, d.hod_user_id)
               OR f.author_id = d.hod_user_id 
               OR f.author_id = d.incharge_user_id 
               OR f.author_id = d.asst_coo_user_id
               OR EXISTS (SELECT 1 FROM department_reviewers dr WHERE dr.department_id = d.id AND dr.user_id = f.author_id AND dr.is_active = true)
               OR LOWER(u.department) = LOWER(d.name)
             )
         ) AS has_feedback
       FROM departments d
       JOIN incident_departments id ON id.department_id = d.id
       WHERE id.incident_id = $1`,
      [incident.id]
    );

    // Get feedbacks (role-based visibility)
    let feedbackQuery = `SELECT f.*, u.full_name, u.role, u.designation, COALESCE(ic.name, d.name, u.department) as dept_name
       FROM feedbacks f
       JOIN users u ON u.id = f.author_id
       LEFT JOIN incident_categories ic ON ic.id = f.category_id
       LEFT JOIN departments d ON d.id = f.department_id
       WHERE f.incident_id = $1`;
    
    // Employees can now see feedbacks at all times to track incident progress.
    feedbackQuery += ` ORDER BY f.created_at ASC`;
    const feedbacks = await query(feedbackQuery, [incident.id]);

    // Check reviewer completion across assigned categories (with active assignees) & legacy departments
    const activeMappedCats = cats.rows.filter(c => c.has_active_assignee);
    const pendingCats = activeMappedCats.filter(c => !c.has_feedback).map(c => c.name);
    const pendingDepts = depts.rows.filter(d => !d.has_feedback).map(d => d.name);
    const pendingHodDepartments = [...new Set([...pendingCats, ...pendingDepts])];
    const allHodFeedbackSubmitted = pendingHodDepartments.length === 0;
    const hasImcFeedback = feedbacks.rows.some(f => f.role === 'imc');

    // Check if current user has submitted feedback for ALL their assigned categories / legacy departments
    const userAssignedCats = await getUserAssignedCategoriesForIncident(req.user, incident.id);
    const myCatIds = new Set(userAssignedCats.map(c => c.id));
    const matchedCats = cats.rows.filter(c => myCatIds.has(c.id));

    const userDept = (req.user.department || '').trim().toLowerCase();
    const reviewerDeptsRes = await query(
      `SELECT department_id FROM department_reviewers WHERE user_id = $1 AND is_active = true`,
      [userId]
    );
    const reviewerDeptIds = new Set(reviewerDeptsRes.rows.map(r => r.department_id));

    const myDept = depts.rows.find(d => 
      d.assigned_user_id === userId ||
      d.hod_user_id === userId || 
      reviewerDeptIds.has(d.id) ||
      (d.name && userDept && d.name.toLowerCase() === userDept)
    );

    const pendingUserCats = matchedCats.filter(c => !c.has_feedback);
    const hasPendingLegacyDept = Boolean(myDept && !myDept.has_feedback);
    const hasAnyAssignedScope = matchedCats.length > 0 || Boolean(myDept);
    const userHodDeptSubmitted = hasAnyAssignedScope && pendingUserCats.length === 0 && !hasPendingLegacyDept;

    // Get attachments
    const attachments = await query(
      `SELECT a.*, u.full_name as uploader_name FROM attachments a
       JOIN users u ON u.id = a.uploader_id
       WHERE a.incident_id = $1
       ORDER BY a.created_at ASC`,
      [incident.id]
    );

    const invs = await query(
      `SELECT i.*, 
              u.full_name, u.email, u.employee_id, u.department, u.designation, u.role, 
              u.is_imc_member, u.is_imc_lead
       FROM investigators i 
       JOIN users u ON u.id = i.investigator_id 
       WHERE i.incident_id = $1 AND COALESCE(i.is_active, TRUE) = TRUE
       ORDER BY i.assigned_at ASC`,
      [incident.id]
    );
    incident.investigators = invs.rows;
    incident.all_investigators_submitted = invs.rows.length > 0 && invs.rows.every(i => i.status === 'completed');
    incident.pending_investigators_count = invs.rows.filter(i => i.status !== 'completed').length;
    incident.latest_investigation_report = feedbacks.rows.filter(f => f.role === 'investigator').pop() || null;
    incident.investigation_attachments = attachments.rows.filter(a => a.stage === 'investigator_report');

    const respEmps = await query(
      `SELECT r.*, 
              u.full_name, 
              u.employee_id as emp_id, 
              u.employee_id as employee_code, 
              u.designation, 
              d.name as department_name 
       FROM incident_responsible_employees r
       JOIN users u ON u.id = r.employee_id
       LEFT JOIN departments d ON d.id = r.department_id
       WHERE r.incident_id = $1`, [incident.id]
    );
    incident.responsible_employees = respEmps.rows;

    // Get formal letters
    const lettersRes = await query(
      `SELECT l.*, 
              l.recipient_name as employee_name,
              COALESCE(
                CASE WHEN l.recipient_emp_no ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN NULL ELSE l.recipient_emp_no END,
                u_recip.employee_id,
                l.recipient_emp_no
              ) as employee_code,
              l.recipient_department as employee_department,
              l.recipient_designation as employee_designation,
              l.reference_number as ref_number,
              l.template_type as letter_type,
              l.body_text as body_content,
              l.cc_recipients as cc_list,
              l.qr_code_url as qr_code_data,
              u_recip.employee_id as user_employee_id,
              u_recip.department as user_department,
              u_draft.full_name as created_by_name,
              u_app.full_name as approved_by_name
       FROM incident_letters l
       LEFT JOIN users u_draft ON u_draft.id = l.drafted_by
       LEFT JOIN users u_app ON u_app.id = l.approved_by
       LEFT JOIN users u_recip ON u_recip.id::text = l.employee_id::text OR u_recip.id::text = l.recipient_emp_no
       WHERE l.incident_id = $1
       ORDER BY l.created_at ASC`,
      [incident.id]
    );

    let visibleLetters = lettersRes.rows;
    if (!isPrivilegedRole(req.user)) {
      const managedDepts = await getUserManagedDepartmentsForIncident(req.user, incident.id);
      visibleLetters = visibleLetters.filter((letter) =>
        canNonPrivilegedUserViewLetter(req.user, letter, managedDepts)
      );
    }

    // Get training assignments and reports
    const trainersRes = await query(
      `SELECT t.*,
              u_trainer.full_name as trainer_name,
              u_trainer.employee_id as trainer_code,
              u_trainer.department as trainer_department,
              u_trainer.designation as trainer_designation,
              u_assign.full_name as assigned_by_name,
              u_verify.full_name as verified_by_name,
              t.training_instructions as instructions,
              t.target_date as target_completion_date,
              t.conducted_at as completion_date,
              t.duration_minutes,
              (CASE WHEN t.duration_minutes IS NOT NULL THEN ROUND(t.duration_minutes::numeric / 60.0, 1)::float ELSE NULL END) as duration_hours,
              t.trainer_report_text as summary,
              t.imc_verified_at as verified_at,
              t.imc_review_notes as verification_notes,
              att.stored_filename as report_file_name,
              att.original_filename as report_original_filename,
              att.file_size as report_file_size,
              COALESCE(
                (
                  SELECT json_agg(
                    json_build_object(
                      'id', a_tr.id,
                      'original_filename', a_tr.original_filename,
                      'stored_filename', a_tr.stored_filename,
                      'file_size', a_tr.file_size,
                      'mime_type', a_tr.mime_type,
                      'created_at', a_tr.created_at
                    ) ORDER BY a_tr.created_at ASC
                  )
                  FROM attachments a_tr
                  WHERE a_tr.trainer_assignment_id = t.id
                     OR (t.trainer_attachment_id IS NOT NULL AND a_tr.id = t.trainer_attachment_id)
                ),
                '[]'::json
              ) as report_attachments,
              l.reference_number as letter_reference_number,
              l.letter_date as letter_date,
              l.subject as letter_subject,
              l.salutation as letter_salutation,
              l.body_text as letter_body_text,
              l.qr_code_url as letter_qr_code_url,
              l.cc_recipients as letter_cc_recipients,
              l.status as letter_status
       FROM incident_trainers t
       LEFT JOIN users u_trainer ON u_trainer.id = t.trainer_id
       LEFT JOIN users u_assign ON u_assign.id = t.assigned_by
       LEFT JOIN users u_verify ON u_verify.id = t.imc_verified_by
       LEFT JOIN attachments att ON att.id = t.trainer_attachment_id
       LEFT JOIN incident_letters l ON l.id = t.appointment_letter_id
       WHERE t.incident_id = $1
       ORDER BY t.created_at ASC`,
      [incident.id]
    );

    // Get final report
    const finalReport = await query(
      `SELECT * FROM final_reports WHERE incident_id = $1 AND is_latest = TRUE`,
      [incident.id]
    );

    // Check if current user is authorized as an assigned staff reviewer for this incident
    let isTargetHod = false;
    const targetHodCheck = await query(
      `SELECT 1 FROM incident_category_links icl
       JOIN category_feedback_assignees cfa ON cfa.category_id = icl.category_id
       WHERE icl.incident_id = $1 AND cfa.user_id = $2 AND cfa.is_active = TRUE
       UNION ALL
       SELECT 1 FROM incident_departments id2
       JOIN departments d ON d.id = id2.department_id
       WHERE id2.incident_id = $1 AND (
         d.assigned_user_id = $2 OR (d.assigned_user_id IS NULL AND d.hod_user_id = $2)
         OR EXISTS (SELECT 1 FROM department_reviewers dr WHERE dr.department_id = d.id AND dr.user_id = $2 AND dr.is_active = true)
       )`,
       [incident.id, userId]
    );
    const isRejectedRedirectRequester = Boolean(
      incident.redirect_rejected_at &&
      incident.status !== 'redirect_requested' &&
      incident.redirect_requested_by_user_id === userId
    );
    isTargetHod = targetHodCheck.rows.length > 0 || isRejectedRedirectRequester;

    // Track reviewer first view
    if ((role === 'hod' || isTargetHod) && !incident.hod_first_viewed_at) {
      await query(
        'UPDATE incidents SET hod_first_viewed_at = NOW() WHERE id = $1',
        [incident.id]
      );
    }

    // Get audit logs for backwards compatibility
    const auditLogsRes = await query(
      `SELECT al.*, u.full_name, u.role, u.department as user_department, u.designation as user_designation
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE al.incident_id = $1
       ORDER BY al.created_at ASC`,
      [incident.id]
    );

    // Get comprehensive dynamic Case Story events from incident_events journal
    const eventsRes = await query(
      `SELECT ie.*,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', a.id,
                    'original_filename', a.original_filename,
                    'stored_filename', a.stored_filename,
                    'file_size', a.file_size,
                    'mime_type', a.mime_type,
                    'stage', a.stage
                  )
                ) FILTER (WHERE a.id IS NOT NULL),
                '[]'::json
              ) as attachments
       FROM incident_events ie
       LEFT JOIN attachments a ON a.event_id = ie.id
       WHERE ie.incident_id = $1
       GROUP BY ie.id
       ORDER BY ie.seq ASC`,
      [incident.id]
    );

    const visibleEvents = filterIncidentEventsForUser(req.user, eventsRes.rows);

    res.json({
      incident: {
        ...incident,
        departments: depts.rows,
        categories: cats.rows,
        incident_categories: cats.rows.map(c => c.name),
        is_target_hod: isTargetHod,
        is_target_reviewer: isTargetHod,
        all_hod_feedback_submitted: allHodFeedbackSubmitted,
        pending_hod_departments: pendingHodDepartments,
        pending_review_categories: pendingCats,
        user_hod_dept_submitted: userHodDeptSubmitted,
        has_imc_feedback: hasImcFeedback
      },
      feedbacks: feedbacks.rows,
      attachments: attachments.rows,
      finalReport: finalReport.rows[0] || null,
      letters: visibleLetters,
      trainers: trainersRes.rows,
      timelineEvents: auditLogsRes.rows,
      events: visibleEvents
    });

  } catch (error) {
    console.error('getIncident error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch incident.' });
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

    await recordEvent(query, {
      incidentId: id,
      eventType: 'INCIDENT_WITHDRAWN',
      actor: req.user,
      statusBefore: incident.status,
      statusAfter: 'withdrawn',
      title: 'Incident Withdrawn by Reporter',
      summary: reason ? `Reason: "${reason}"` : 'Reporter withdrew the incident before committee review.',
      payload: { reason }
    });

    await auditLog(req.user.id, 'INCIDENT_WITHDRAWN', id, { reason }, req.ip);

    if (req.io) {
      req.io.emit('incident_updated', { id });
    }

    res.json({ success: true, message: 'Incident withdrawn successfully.' });

  } catch (error) {
    res.status(500).json({ error: 'Failed to withdraw incident' });
  }
};



// =============================================
// DASHBOARD ANALYTICS (Exact SQL Aggregation Engine)
// =============================================
exports.getDashboardStats = async (req, res) => {
  try {
    const { role, id: userId, department } = req.user;
    const { viewMode, departmentId, category } = req.query;

    let scopeFilter = '';
    const params = [];
    let paramIdx = 1;

    const categoryReviewerSql = (idx) => `EXISTS (
      SELECT 1 FROM incident_category_links icl2
      JOIN category_feedback_assignees cfa2 ON cfa2.category_id = icl2.category_id
      WHERE icl2.incident_id = i.id AND cfa2.user_id = $${idx} AND cfa2.is_active = TRUE
    )`;

    if (viewMode === 'my_incidents' || (role === 'employee' && viewMode !== 'dept_reviews')) {
      scopeFilter = `AND i.reporter_id = $${paramIdx}`;
      params.push(userId);
      paramIdx++;
    } else if (role === 'hod' || (role === 'employee' && viewMode === 'dept_reviews')) {
      scopeFilter = `AND (
        ${categoryReviewerSql(paramIdx)}
        OR EXISTS (
          SELECT 1 FROM incident_departments id2
          JOIN departments d ON d.id = id2.department_id
          WHERE id2.incident_id = i.id AND (
            d.assigned_user_id = $${paramIdx} OR
            d.hod_user_id = $${paramIdx} OR
            d.incharge_user_id = $${paramIdx} OR
            d.asst_coo_user_id = $${paramIdx} OR
            EXISTS (SELECT 1 FROM department_reviewers dr WHERE dr.department_id = d.id AND dr.user_id = $${paramIdx} AND dr.is_active = true) OR
            ($${paramIdx + 1} <> '' AND LOWER(d.name) = LOWER($${paramIdx + 1}))
          )
        )
        OR i.redirect_requested_by_user_id = $${paramIdx}
      )`;
      params.push(userId, (department || '').trim());
      paramIdx += 2;
    }

    if (departmentId && departmentId !== 'all') {
      scopeFilter += ` AND EXISTS (SELECT 1 FROM incident_departments idf WHERE idf.incident_id = i.id AND idf.department_id = $${paramIdx++})`;
      params.push(parseInt(departmentId, 10));
    }

    if (category && category !== 'all') {
      scopeFilter += ` AND (
        LOWER(TRIM(COALESCE(i.incident_category, ''))) = LOWER(TRIM($${paramIdx}))
        OR EXISTS (
          SELECT 1 FROM incident_category_links iclf
          JOIN incident_categories icf ON icf.id = iclf.category_id
          WHERE iclf.incident_id = i.id AND LOWER(TRIM(icf.name)) = LOWER(TRIM($${paramIdx}))
        )
      )`;
      params.push(category);
      paramIdx++;
    }

    const [totals, bySeverity, byType, byStatus, monthly, durationMetricsRes] = await Promise.all([
      query(`SELECT
        COUNT(*) as total_all,
        COUNT(*) FILTER (WHERE i.status != 'withdrawn') as total_valid,
        COUNT(*) FILTER (WHERE i.status NOT IN ('resolved','withdrawn','closed')) as active,
        COUNT(*) FILTER (WHERE i.status IN ('resolved','closed')) as resolved,
        COUNT(*) FILTER (WHERE i.status = 'withdrawn') as withdrawn,
        COUNT(*) FILTER (WHERE i.status != 'withdrawn' AND DATE_TRUNC('month', i.created_at) = DATE_TRUNC('month', NOW())) as this_month,
        COUNT(*) FILTER (WHERE i.status != 'withdrawn' AND i.severity = 'Grave') as grave_count,
        COUNT(*) FILTER (WHERE i.status = 'redirect_requested') as redirect_count,
        COUNT(*) FILTER (WHERE i.status NOT IN ('resolved','closed','withdrawn') AND i.created_at < NOW() - INTERVAL '7 days') as overdue_count
        FROM incidents i WHERE 1=1 ${scopeFilter}`, params),

      query(`SELECT i.severity, COUNT(*) as count FROM incidents i WHERE i.status != 'withdrawn' ${scopeFilter}
        GROUP BY i.severity`, params),

      query(`SELECT i.incident_type, COUNT(*) as count FROM incidents i WHERE i.status != 'withdrawn' ${scopeFilter}
        GROUP BY i.incident_type ORDER BY count DESC LIMIT 10`, params),

      query(`SELECT i.status, COUNT(*) as count FROM incidents i WHERE 1=1 ${scopeFilter}
        GROUP BY i.status`, params),

      query(`SELECT
        TO_CHAR(DATE_TRUNC('month', i.created_at), 'Mon YYYY') as month,
        DATE_TRUNC('month', i.created_at) as month_date,
        COUNT(*) as count
        FROM incidents i WHERE i.status != 'withdrawn' AND i.created_at >= NOW() - INTERVAL '12 months' ${scopeFilter}
        GROUP BY DATE_TRUNC('month', i.created_at)
        ORDER BY month_date ASC`, params),

      query(`WITH inc_times AS (
        SELECT
          i.id,
          i.status,
          i.created_at,
          COALESCE(i.resolved_at, i.updated_at) AS completed_at,
          (SELECT MIN(f.created_at) FROM feedbacks f WHERE f.incident_id = i.id AND f.role = 'hod') AS hod_at,
          (SELECT MIN(f.created_at) FROM feedbacks f WHERE f.incident_id = i.id AND f.role = 'imc') AS imc_at,
          (SELECT MIN(f.created_at) FROM feedbacks f WHERE f.incident_id = i.id AND f.role = 'head_management') AS mgmt_at
        FROM incidents i
        WHERE i.status != 'withdrawn' ${scopeFilter}
      )
      SELECT
        ROUND(AVG(GREATEST(0, EXTRACT(EPOCH FROM (hod_at - created_at)) / 3600.0))::numeric, 1)::float AS avg_hod_hours,
        COUNT(hod_at)::int AS hod_sample_count,
        ROUND(AVG(GREATEST(0, EXTRACT(EPOCH FROM (imc_at - COALESCE(hod_at, created_at))) / 3600.0))::numeric, 1)::float AS avg_imc_hours,
        COUNT(imc_at)::int AS imc_sample_count,
        ROUND(AVG(GREATEST(0, EXTRACT(EPOCH FROM (completed_at - created_at)) / 3600.0)) FILTER (WHERE status IN ('resolved', 'closed'))::numeric, 1)::float AS avg_resolution_hours,
        COUNT(*) FILTER (WHERE status IN ('resolved', 'closed'))::int AS resolved_sample_count
      FROM inc_times`, params)
    ]);

    // Check if user is an assigned reviewer (either HOD or Category Reviewer)
    const reviewerCheckRes = await query(
      `SELECT 1 FROM category_feedback_assignees WHERE user_id = $1 AND is_active = TRUE
       UNION ALL
       SELECT 1 FROM departments WHERE assigned_user_id = $1 OR hod_user_id = $1
       UNION ALL
       SELECT 1 FROM department_reviewers WHERE user_id = $1 AND is_active = TRUE
       LIMIT 1`,
      [userId]
    );
    const isReviewerUser = role === 'hod' || reviewerCheckRes.rows.length > 0;

    let hodReport = null;
    if (isReviewerUser) {
      const reviewerScopeSql = `(
        EXISTS (
          SELECT 1 FROM incident_category_links icl2
          JOIN category_feedback_assignees cfa2 ON cfa2.category_id = icl2.category_id
          WHERE icl2.incident_id = i.id AND cfa2.user_id = $1 AND cfa2.is_active = TRUE
        )
        OR EXISTS (
          SELECT 1 FROM incident_departments id2
          JOIN departments d ON d.id = id2.department_id
          WHERE id2.incident_id = i.id AND (
            d.assigned_user_id = $1 OR d.hod_user_id = $1 OR d.incharge_user_id = $1 OR d.asst_coo_user_id = $1
            OR EXISTS (SELECT 1 FROM department_reviewers dr WHERE dr.department_id = d.id AND dr.user_id = $1 AND dr.is_active = true)
            OR ($2 <> '' AND LOWER(d.name) = LOWER($2))
          )
        )
      )`;

      const extraRevFilters = [];
      const revParams = [userId, (department || '').trim()];
      let revIdx = 3;
      const givenFilters = [];
      const givenParams = [userId];
      let givenIdx = 2;
      if (departmentId && departmentId !== 'all') {
        const depInt = parseInt(departmentId, 10);
        extraRevFilters.push(`EXISTS (SELECT 1 FROM incident_departments idf WHERE idf.incident_id = i.id AND idf.department_id = $${revIdx++})`);
        revParams.push(depInt);
        givenFilters.push(`EXISTS (SELECT 1 FROM incident_departments idf WHERE idf.incident_id = i.id AND idf.department_id = $${givenIdx++})`);
        givenParams.push(depInt);
      }
      if (category && category !== 'all') {
        const catClause = (idx) => `(
          LOWER(TRIM(COALESCE(i.incident_category, ''))) = LOWER(TRIM($${idx}))
          OR EXISTS (
            SELECT 1 FROM incident_category_links iclf
            JOIN incident_categories icf ON icf.id = iclf.category_id
            WHERE iclf.incident_id = i.id AND LOWER(TRIM(icf.name)) = LOWER(TRIM($${idx}))
          )
        )`;
        extraRevFilters.push(catClause(revIdx++));
        revParams.push(category);
        givenFilters.push(catClause(givenIdx++));
        givenParams.push(category);
      }
      const extraRevSql = extraRevFilters.length ? `AND ${extraRevFilters.join(' AND ')}` : '';
      const givenSql = givenFilters.length ? `AND ${givenFilters.join(' AND ')}` : '';

      const [myIncidentsRes, assignedScopeRes, feedbackGivenRes, feedbackPendingRes, redirectRejectedRes] = await Promise.all([
        query(`
          SELECT
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE status NOT IN ('resolved','closed','withdrawn')) as active,
            COUNT(*) FILTER (WHERE status IN ('resolved','closed')) as resolved,
            COUNT(*) FILTER (WHERE status = 'withdrawn') as withdrawn,
            COUNT(*) FILTER (WHERE status != 'withdrawn' AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())) as this_month
          FROM incidents WHERE reporter_id = $1
        `, [userId]),
        query(`
          SELECT
            COUNT(*) FILTER (WHERE i.status != 'withdrawn') as received,
            COUNT(*) FILTER (WHERE i.status NOT IN ('resolved','closed','withdrawn')) as active,
            COUNT(*) FILTER (WHERE i.status IN ('resolved','closed')) as resolved,
            COUNT(*) FILTER (WHERE i.status = 'withdrawn') as withdrawn
          FROM incidents i WHERE ${reviewerScopeSql} ${extraRevSql}
        `, revParams),
        query(`
          SELECT COUNT(DISTINCT f.incident_id) as feedback_given
          FROM feedbacks f
          JOIN incidents i ON i.id = f.incident_id
          WHERE f.author_id = $1 AND f.role = 'hod' AND i.status != 'withdrawn' ${givenSql}
        `, givenParams),
        query(`
          SELECT COUNT(*) as pending
          FROM incidents i
          WHERE i.status NOT IN ('resolved', 'closed', 'withdrawn')
            AND ${reviewerScopeSql} ${extraRevSql}
            AND NOT EXISTS (
              SELECT 1 FROM feedbacks f
              WHERE f.incident_id = i.id AND f.role = 'hod' AND f.author_id = $1
            )
        `, revParams),
        query(`
          SELECT COUNT(*) as count
          FROM incidents i
          WHERE i.redirect_rejected_at IS NOT NULL
            AND i.status NOT IN ('resolved', 'closed', 'withdrawn')
            AND NOT EXISTS (SELECT 1 FROM feedbacks f WHERE f.incident_id = i.id AND f.author_id = $1)
            AND (i.redirect_requested_by_user_id = $1 OR ${reviewerScopeSql})
        `, [userId, (department || '').trim()])
      ]);

      hodReport = {
        received: parseInt(assignedScopeRes.rows[0]?.received || 0, 10),
        active: parseInt(assignedScopeRes.rows[0]?.active || 0, 10),
        resolved: parseInt(assignedScopeRes.rows[0]?.resolved || 0, 10),
        withdrawn: parseInt(assignedScopeRes.rows[0]?.withdrawn || 0, 10),
        feedbackGiven: parseInt(feedbackGivenRes.rows[0]?.feedback_given || 0, 10),
        feedbackPending: parseInt(feedbackPendingRes.rows[0]?.pending || 0, 10),
        redirectRejectedCount: parseInt(redirectRejectedRes.rows[0]?.count || 0, 10),
        myIncidents: {
          total: parseInt(myIncidentsRes.rows[0]?.total || 0, 10),
          active: parseInt(myIncidentsRes.rows[0]?.active || 0, 10),
          resolved: parseInt(myIncidentsRes.rows[0]?.resolved || 0, 10),
          withdrawn: parseInt(myIncidentsRes.rows[0]?.withdrawn || 0, 10),
          thisMonth: parseInt(myIncidentsRes.rows[0]?.this_month || 0, 10)
        }
      };
    }

    const userRejectedRes = await query(`
      SELECT COUNT(*) as count
      FROM incidents i
      WHERE i.redirect_rejected_at IS NOT NULL
        AND i.redirect_requested_by_user_id = $1
        AND i.status NOT IN ('resolved', 'closed', 'withdrawn')
        AND NOT EXISTS (SELECT 1 FROM feedbacks f WHERE f.incident_id = i.id AND f.author_id = $1)
    `, [userId]);

    let pipelineStats = {};
    let managementReport = null;
    let categoryAnalytics = [];

    if (['system_admin', 'head_management', 'imc', 'coo', 'asst_coo'].includes(role) || isPrivilegedRole(req.user)) {
      const [pipelineRes, catAnalyticsRes] = await Promise.all([
        query(`
          SELECT
            (SELECT COUNT(DISTINCT f.incident_id) FROM feedbacks f JOIN incidents i ON i.id = f.incident_id WHERE f.role = 'hod' AND i.status != 'withdrawn') as hod_given,
            (SELECT COUNT(*) FROM incidents i WHERE i.status NOT IN ('resolved', 'withdrawn', 'closed') AND NOT EXISTS (SELECT 1 FROM feedbacks f WHERE f.incident_id = i.id AND f.role = 'hod')) as hod_pending,
            (SELECT COUNT(DISTINCT f.incident_id) FROM feedbacks f JOIN incidents i ON i.id = f.incident_id WHERE f.role = 'imc' AND i.status != 'withdrawn') as imc_given,
            (SELECT COUNT(*) FROM incidents i WHERE i.status NOT IN ('resolved', 'withdrawn', 'closed') AND NOT EXISTS (SELECT 1 FROM feedbacks f WHERE f.incident_id = i.id AND f.role = 'imc')) as imc_pending,
            (SELECT COUNT(DISTINCT f.incident_id) FROM feedbacks f JOIN incidents i ON i.id = f.incident_id WHERE f.role = 'head_management' AND i.status != 'withdrawn') as mgmt_given,
            (SELECT COUNT(*) FROM incidents i WHERE i.status IN ('with_head_management', 'pending_management_letter_approval')) as mgmt_pending,
            (SELECT COUNT(*) FROM incidents i WHERE i.status = 'pending_management_letter_approval') as pending_letters,
            (SELECT COUNT(*) FROM incidents i WHERE i.status = 'with_head_management') as pending_decisions,
            (SELECT COUNT(*) FROM incidents i WHERE i.status IN ('pending_training', 'pending_trainer_assignment', 'training_in_progress', 'pending_imc_training_review')) as training_pending
        `),
        query(`
          WITH all_cats AS (
            SELECT name FROM incident_categories WHERE is_active = TRUE
            UNION
            SELECT DISTINCT COALESCE(NULLIF(TRIM(incident_category), ''), 'Others') AS name
            FROM incidents
            WHERE status != 'withdrawn'
              AND POSITION(',' IN COALESCE(incident_category, '')) = 0
          ),
          inc_cat_map AS (
            SELECT DISTINCT
              i.id AS incident_id,
              i.status,
              i.created_at,
              COALESCE(i.resolved_at, i.updated_at) AS completed_at,
              COALESCE(ic.name, NULLIF(TRIM(i.incident_category), ''), 'Others') AS category_name,
              EXISTS (SELECT 1 FROM feedbacks f WHERE f.incident_id = i.id AND f.role = 'hod') AS has_hod,
              (SELECT MIN(f.created_at) FROM feedbacks f WHERE f.incident_id = i.id AND f.role = 'hod') AS hod_at,
              (SELECT MIN(f.created_at) FROM feedbacks f WHERE f.incident_id = i.id AND f.role = 'imc') AS imc_at
            FROM incidents i
            LEFT JOIN incident_category_links icl ON icl.incident_id = i.id
            LEFT JOIN incident_categories ic ON ic.id = icl.category_id
            WHERE i.status != 'withdrawn'
          )
          SELECT
            ac.name AS category,
            COUNT(DISTINCT icm.incident_id)::int AS received,
            COUNT(DISTINCT icm.incident_id) FILTER (WHERE icm.has_hod)::int AS feedback_given,
            COUNT(DISTINCT icm.incident_id) FILTER (WHERE NOT icm.has_hod)::int AS missing_feedback,
            COUNT(DISTINCT icm.incident_id) FILTER (WHERE icm.status IN ('resolved', 'closed'))::int AS solved,
            COUNT(DISTINCT icm.incident_id) FILTER (WHERE icm.status NOT IN ('resolved', 'closed'))::int AS open_count,
            ROUND(AVG(GREATEST(0, EXTRACT(EPOCH FROM (icm.hod_at - icm.created_at)) / 3600.0))::numeric, 1)::float AS avg_reviewer_hours,
            ROUND(AVG(GREATEST(0, EXTRACT(EPOCH FROM (icm.imc_at - COALESCE(icm.hod_at, icm.created_at))) / 3600.0))::numeric, 1)::float AS avg_imc_hours,
            ROUND(AVG(GREATEST(0, EXTRACT(EPOCH FROM (icm.completed_at - icm.created_at)) / 3600.0)) FILTER (WHERE icm.status IN ('resolved', 'closed'))::numeric, 1)::float AS avg_resolution_hours
          FROM all_cats ac
          LEFT JOIN inc_cat_map icm ON LOWER(TRIM(icm.category_name)) = LOWER(TRIM(ac.name))
          GROUP BY ac.name
          ORDER BY COUNT(DISTINCT icm.incident_id) DESC, ac.name ASC
        `)
      ]);

      const pr = pipelineRes.rows[0];
      pipelineStats = {
        hodGiven: parseInt(pr.hod_given || 0, 10),
        hodPending: parseInt(pr.hod_pending || 0, 10),
        imcGiven: parseInt(pr.imc_given || 0, 10),
        imcPending: parseInt(pr.imc_pending || 0, 10),
        mgmtGiven: parseInt(pr.mgmt_given || 0, 10),
        mgmtPending: parseInt(pr.mgmt_pending || 0, 10),
        pendingLettersApproval: parseInt(pr.pending_letters || 0, 10),
        pendingMgmtDecisions: parseInt(pr.pending_decisions || 0, 10),
        trainingPending: parseInt(pr.training_pending || 0, 10)
      };

      managementReport = {
        awaitingDecision: parseInt(pr.mgmt_pending || 0, 10),
        pendingLetters: parseInt(pr.pending_letters || 0, 10),
        pendingDecisions: parseInt(pr.pending_decisions || 0, 10)
      };

      categoryAnalytics = catAnalyticsRes.rows.map(r => ({
        category: r.category,
        received: r.received,
        feedbackGiven: r.feedback_given,
        missingFeedback: r.missing_feedback,
        pctFeedback: r.received > 0 ? Math.round((r.feedback_given / r.received) * 100) : 0,
        solved: r.solved,
        openCount: r.open_count,
        avgReviewerHours: r.avg_reviewer_hours ?? null,
        avgImcHours: r.avg_imc_hours ?? null,
        avgResolutionHours: r.avg_resolution_hours ?? null
      }));
    }

    const t = totals.rows[0];
    const dm = durationMetricsRes.rows[0] || {};
    const parsedTotals = {
      total: parseInt(t.total_valid || 0, 10),
      totalAll: parseInt(t.total_all || 0, 10),
      active: parseInt(t.active || 0, 10),
      resolved: parseInt(t.resolved || 0, 10),
      withdrawn: parseInt(t.withdrawn || 0, 10),
      this_month: parseInt(t.this_month || 0, 10),
      graveCount: parseInt(t.grave_count || 0, 10),
      redirectCount: parseInt(t.redirect_count || 0, 10),
      overdueCount: parseInt(t.overdue_count || 0, 10),
      redirectRejectedCount: parseInt(userRejectedRes.rows[0]?.count || 0, 10),
      ...pipelineStats
    };

    res.json({
      totals: parsedTotals,
      durationMetrics: {
        avgReviewerResponseHours: dm.avg_hod_hours ?? null,
        reviewerSampleCount: dm.hod_sample_count || 0,
        avgImcResponseHours: dm.avg_imc_hours ?? null,
        imcSampleCount: dm.imc_sample_count || 0,
        avgResolutionHours: dm.avg_resolution_hours ?? null,
        resolvedSampleCount: dm.resolved_sample_count || 0
      },
      bySeverity: bySeverity.rows.map(r => ({ ...r, count: parseInt(r.count, 10) || 0 })),
      byType: byType.rows.map(r => ({ ...r, count: parseInt(r.count, 10) || 0 })),
      byStatus: byStatus.rows.map(r => ({ ...r, count: parseInt(r.count, 10) || 0 })),
      monthly: monthly.rows.map(r => ({ ...r, count: parseInt(r.count, 10) || 0 })),
      categoryAnalytics,
      ...(hodReport && { hodReport }),
      ...(managementReport && { managementReport })
    });

  } catch (error) {
    console.error('getDashboardStats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats.' });
  }
};

// =============================================
// GET HOD TEAM
// =============================================
exports.getHodTeam = async (req, res) => {
  try {
    const { id: userId, department } = req.user;
    
    let deptNames = [];
    const deptCheck = await query(`
      SELECT DISTINCT d.name FROM departments d
      LEFT JOIN department_reviewers dr ON dr.department_id = d.id AND dr.user_id = $1 AND dr.is_active = true
      WHERE d.hod_user_id = $1 OR d.assigned_user_id = $1 OR d.incharge_user_id = $1 OR dr.id IS NOT NULL
    `, [userId]);

    if (deptCheck.rows.length > 0) {
      deptNames = deptCheck.rows.map(r => r.name);
    } else if (isPrivilegedRole(req.user) || req.user.role === 'hod') {
      if (department) deptNames = [department];
    } else {
      return res.status(403).json({ error: 'Access denied. Only designated department leaders or reviewers can view department team contacts.' });
    }

    if (deptNames.length === 0) {
      return res.status(400).json({ error: 'No department found for this user.' });
    }

    const result = await query(
      `SELECT id, employee_id, full_name, email, phone, department, designation, role 
       FROM users 
       WHERE LOWER(department) = ANY($1) AND is_active = true
       ORDER BY department, full_name`,
      [deptNames.map(d => d.toLowerCase())]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('getHodTeam error:', error);
    res.status(500).json({ error: 'Failed to fetch team members.' });
  }
};

// =============================================
// GET ASSIGNED DEPARTMENTS FOR REVIEWER / HOD
// =============================================
exports.getAssignedDepartments = async (req, res) => {
  try {
    const userId = req.user.id;
    const userDept = (req.user.department || '').trim();

    const [result, catResult] = await Promise.all([
      query(`
        SELECT DISTINCT d.id, d.name,
               CASE 
                 WHEN dr.reviewer_role IS NOT NULL THEN dr.reviewer_role
                 WHEN d.assigned_user_id = $1 THEN 'Assigned Feedback Staff'
                 WHEN d.hod_user_id = $1 THEN 'Assigned Reviewer'
                 ELSE 'Department Member'
               END as review_role,
               COALESCE(dr.is_active, true) as is_active
        FROM departments d
        LEFT JOIN department_reviewers dr ON dr.department_id = d.id AND dr.user_id = $1 AND dr.is_active = true
        WHERE dr.user_id = $1
           OR d.assigned_user_id = $1
           OR (d.assigned_user_id IS NULL AND d.hod_user_id = $1)
           OR (LOWER(d.name) = LOWER($2) AND $2 != '')
        ORDER BY d.name ASC
      `, [userId, userDept]),
      query(`
        SELECT DISTINCT ic.id, ic.name, 'Category Feedback Staff' as review_role, cfa.is_active
        FROM category_feedback_assignees cfa
        JOIN incident_categories ic ON ic.id = cfa.category_id
        WHERE cfa.user_id = $1 AND cfa.is_active = TRUE AND ic.is_active = TRUE
        ORDER BY ic.name ASC
      `, [userId])
    ]);

    res.json({
      success: true,
      departments: result.rows,
      categories: catResult.rows
    });
  } catch (error) {
    console.error('Error fetching assigned departments:', error);
    res.status(500).json({ error: 'Failed to fetch assigned review scope' });
  }
};


const { query, getClient } = require('../config/database');
const { auditLog } = require('../middleware/auth');
const { createNotification } = require('../utils/notifications');
const { sendEmail, templates } = require('../utils/emailService');
const { recordEvent } = require('../utils/incidentEvents');
const { isPrivilegedRole, getUserAssignedCategoriesForIncident, getUserManagedDepartmentsForIncident } = require('../utils/accessControl');

// ── UPDATE INCIDENT (employee, while submitted) ────────────────────────────
exports.updateIncident = async (req, res) => {
  try {
    const { id } = req.params;
    const { description, severity, occurredTo, incidentDate, incidentTime } = req.body;

    const result = await query(
      'SELECT * FROM incidents WHERE id = $1 AND reporter_id = $2',
      [id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found or access denied' });

    const incident = result.rows[0];
    if (incident.status !== 'submitted') {
      return res.status(400).json({ error: 'Incident can only be edited while in submitted status.' });
    }

    if (incidentDate) {
      const dateParts = incidentDate.split('-').map(Number);
      const incDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      const minAllowed = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 14, 0, 0, 0, 0);

      if (isNaN(incDate.getTime())) {
        return res.status(400).json({ error: 'Invalid incident date format.' });
      }
      if (incDate > today) {
        return res.status(400).json({ error: 'Incident date cannot be in the future.' });
      }
      if (incDate < minAllowed) {
        return res.status(400).json({ error: 'Per hospital policy, incidents must be reported within 14 days of occurrence. Incidents exceeding 14 days cannot be accepted.' });
      }
    }

    await query(
      `UPDATE incidents SET
        description = COALESCE($1, description),
        severity = COALESCE($2, severity),
        occurred_to = COALESCE($3, occurred_to),
        incident_date = COALESCE($4, incident_date),
        incident_time = COALESCE($5, incident_time),
        updated_at = NOW()
       WHERE id = $6`,
      [description, severity, occurredTo, incidentDate, incidentTime, id]
    );

    await auditLog(req.user.id, 'INCIDENT_EDITED', id, { fields: Object.keys(req.body) }, req.ip);

    await recordEvent(query, {
      incidentId: id,
      eventType: 'INCIDENT_EDITED',
      actor: req.user,
      title: 'Incident Details Edited',
      summary: `Updated by reporter: ${Object.keys(req.body).join(', ')}`,
      payload: { fields: Object.keys(req.body) }
    });

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update incident.' });
  }
};

// ── ESCALATE PRIORITY (IMC Convenor / Lead Only) ──────────────────────────
exports.escalatePriority = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.user.is_imc_lead) {
      return res.status(403).json({ error: 'Only the IMC Lead / Convenor can escalate incident priority.' });
    }

    const result = await query('SELECT * FROM incidents WHERE id = $1', [id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    const incident = result.rows[0];

    if (incident.priority_escalated_by) {
      return res.status(400).json({ error: 'Priority already escalated.' });
    }

    const escalatedBy = `${req.user.full_name} (IMC Convenor)`;

    await query(
      `UPDATE incidents SET priority_escalated_by = $1, priority_escalated_at = NOW(), updated_at = NOW() WHERE id = $2`,
      [escalatedBy, id]
    );

    // Notify all active IMC and Management members
    const notifyUsers = await query(
      `SELECT id, email, full_name FROM users
       WHERE (role IN ('imc','head_management') OR is_imc_member = TRUE OR is_imc_lead = TRUE OR is_management_member = TRUE)
         AND is_active = TRUE
         AND id != $1`,
      [req.user.id]
    );
    for (const u of notifyUsers.rows) {
      await createNotification(u.id, id, 'Priority Escalated',
        `Incident ${incident.reference_id} priority has been escalated by ${escalatedBy}.`,
        'priority_escalated');
      if (u.email) {
        sendEmail(u.email, templates.priorityEscalated(incident, u, escalatedBy)).catch(() => { });
      }
    }

    await auditLog(req.user.id, 'PRIORITY_ESCALATED', id, { escalatedBy }, req.ip);

    await recordEvent(query, {
      incidentId: id,
      eventType: 'PRIORITY_ESCALATED',
      actor: req.user,
      title: 'Priority Escalated',
      summary: `Incident priority escalated by ${escalatedBy}`,
      payload: { escalated_by: escalatedBy }
    });

    if (req.io) {
      req.io.emit('incident_updated', { id });
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to escalate priority.' });
  }
};

// ── REQUEST REDIRECT (Assigned Reviewer) ───────────────────────────────────
exports.requestRedirect = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason?.trim()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Redirect reason is required.' });
    }

    const incResult = await client.query('SELECT * FROM incidents WHERE id = $1', [id]);
    if (!incResult.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }
    const incident = incResult.rows[0];

    if (!['submitted', 'with_hod', 'with_hod_and_imc'].includes(incident.status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Incident is not currently in initial review status.' });
    }

    // Object-level authorization: assigned category reviewer OR legacy department reviewer/HOD OR privileged role
    const assignedCategories = await getUserAssignedCategoriesForIncident(req.user, id);
    const incidentDeptRes = await client.query(`
      SELECT d.id, d.name
      FROM incident_departments idp
      JOIN departments d ON d.id = idp.department_id
      LEFT JOIN department_reviewers dr ON dr.department_id = d.id AND dr.user_id = $2 AND dr.is_active = true
      WHERE idp.incident_id = $1
        AND (
          d.assigned_user_id = $2
          OR d.hod_user_id = $2
          OR d.incharge_user_id = $2
          OR d.asst_coo_user_id = $2
          OR dr.id IS NOT NULL
        )
      LIMIT 1
    `, [id, req.user.id]);

    if (!isPrivilegedRole(req.user) && assignedCategories.length === 0 && incidentDeptRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Access denied: You are not an assigned reviewer for this incident.' });
    }

    const sourceLabel = assignedCategories.length > 0
      ? assignedCategories.map(c => c.name).join(', ')
      : (incidentDeptRes.rows[0]?.name || incident.incident_category || req.user.department || 'Assigned Reviewer');

    const cleanReason = reason.trim();

    await client.query(
      `UPDATE incidents SET 
         status = 'redirect_requested', 
         redirect_reason = $1,
         redirect_requested_by_dept = $2,
         redirect_requested_by_category = $2,
         redirect_requested_by_user_id = $3,
         redirect_requested_at = NOW(), 
         redirect_rejected_reason = NULL,
         redirect_rejected_at = NULL,
         updated_at = NOW() 
       WHERE id = $4`,
      [cleanReason, sourceLabel, req.user.id, id]
    );

    await recordEvent(client, {
      incidentId: id,
      eventType: 'REDIRECT_REQUESTED',
      actor: req.user,
      statusBefore: incident.status,
      statusAfter: 'redirect_requested',
      title: 'Category Redirection Requested',
      summary: `Redirection requested by ${req.user.full_name} (${sourceLabel}).`,
      payload: { from_category: sourceLabel, from_department: sourceLabel, reason: cleanReason }
    });

    await client.query('COMMIT');

    // Notify active IMC members
    const imcMembers = await query(
      "SELECT id, email, full_name FROM users WHERE (role = 'imc' OR is_imc_member = TRUE OR is_imc_lead = TRUE) AND is_active = TRUE"
    );
    for (const m of imcMembers.rows) {
      await createNotification(m.id, id, 'Redirect Requested',
        `${req.user.full_name} (${sourceLabel}) requested redirection for incident ${incident.reference_id}. Reason: "${cleanReason}"`,
        'redirect_requested');
      if (m.email) {
        sendEmail(m.email, templates.redirectRequested(incident, m, sourceLabel, cleanReason)).catch(() => { });
      }
    }

    await auditLog(req.user.id, 'REDIRECT_REQUESTED', id, { reason: cleanReason, fromSource: sourceLabel }, req.ip);

    if (req.io) {
      req.io.emit('incident_updated', { id });
    }

    res.json({ success: true });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to request redirect.' });
  } finally {
    client.release();
  }
};

// ── APPROVE REDIRECT (IMC Convenor Only) ───────────────────────────────────
exports.approveRedirect = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const {
      targetCategories, targetCategory, retainedCategories,
      targetDepartment, targetDepartments, retainedDepartments, actionType
    } = req.body;

    if (!req.user.is_imc_lead && !req.user.is_system_admin) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only the IMC Convenor can approve redirection requests.' });
    }

    let categoryInputs = [];
    if (Array.isArray(targetCategories) && targetCategories.length > 0) {
      categoryInputs = [...new Set(targetCategories.map(c => String(c || '').trim()).filter(Boolean))];
    } else if (targetCategory) {
      categoryInputs = [String(targetCategory).trim()];
    }

    let deptNames = [];
    if (Array.isArray(targetDepartments) && targetDepartments.length > 0) {
      deptNames = [...new Set(targetDepartments.filter(Boolean))];
    } else if (targetDepartment) {
      deptNames = [targetDepartment];
    }

    if (!categoryInputs.length && !deptNames.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'At least one target incident category is required for redirection.' });
    }

    const incResult = await client.query('SELECT * FROM incidents WHERE id = $1', [id]);
    if (!incResult.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }
    const incident = incResult.rows[0];
    const newStatus = incident.severity === 'Grave' ? 'with_hod_and_imc' : 'with_hod';

    if (categoryInputs.length > 0) {
      const catRes = await client.query(
        `SELECT id, name FROM incident_categories
         WHERE is_active = TRUE AND (LOWER(TRIM(name)) = ANY($1::text[]) OR id::text = ANY($2::text[]))`,
        [categoryInputs.map(c => c.toLowerCase()), categoryInputs]
      );
      if (!catRes.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Selected target incident category not found.' });
      }
      const targetCats = catRes.rows;

      const existingCatsRes = await client.query(
        `SELECT category_id FROM incident_category_links WHERE incident_id = $1`,
        [id]
      );
      const existingCatIds = existingCatsRes.rows.map(r => r.category_id);

      let requestingCatIds = [];
      const reqCatLabel = incident.redirect_requested_by_category || incident.redirect_requested_by_dept;
      if (reqCatLabel) {
        const parts = reqCatLabel.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        if (parts.length > 0) {
          const rCatRes = await client.query(
            `SELECT id FROM incident_categories WHERE LOWER(TRIM(name)) = ANY($1::text[])`,
            [parts]
          );
          requestingCatIds = rCatRes.rows.map(r => r.id);
        }
      }

      const uninvolvedCatIds = existingCatIds.filter(cid => !requestingCatIds.includes(cid));
      let finalCatIds = [...new Set([...uninvolvedCatIds, ...targetCats.map(c => c.id)])];

      if (Array.isArray(retainedCategories) && retainedCategories.length > 0) {
        const retRes = await client.query(
          `SELECT id FROM incident_categories WHERE LOWER(TRIM(name)) = ANY($1::text[]) OR id::text = ANY($2::text[])`,
          [retainedCategories.map(c => String(c).trim().toLowerCase()), retainedCategories.map(String)]
        );
        finalCatIds = [...new Set([...finalCatIds, ...retRes.rows.map(c => c.id)])];
      } else if (actionType === 'partial' && requestingCatIds.length > 0) {
        finalCatIds = [...new Set([...finalCatIds, ...requestingCatIds])];
      }

      await client.query('DELETE FROM incident_category_links WHERE incident_id = $1', [id]);
      for (const cId of finalCatIds) {
        await client.query(
          'INSERT INTO incident_category_links (incident_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [id, cId]
        );
      }

      const finalNamesRes = await client.query(
        `SELECT name FROM incident_categories WHERE id = ANY($1::int[]) ORDER BY name ASC`,
        [finalCatIds]
      );
      const targetNames = targetCats.map(c => c.name);
      const updatedCategoryLabel = finalNamesRes.rows.map(r => r.name).join(', ') || targetNames.join(', ');

      await client.query(
        `UPDATE incidents SET
           incident_category = $1,
           status = $2,
           redirect_reason = NULL,
           redirect_requested_at = NULL,
           redirect_rejected_reason = NULL,
           redirect_rejected_at = NULL,
           updated_at = NOW()
         WHERE id = $3`,
        [updatedCategoryLabel, newStatus, id]
      );

      await recordEvent(client, {
        incidentId: id,
        eventType: 'REDIRECT_APPROVED',
        actor: req.user,
        statusBefore: incident.status,
        statusAfter: newStatus,
        title: 'Category Redirection Approved',
        summary: `IMC Convenor redirected incident to: ${targetNames.join(', ')}`,
        payload: {
          target_categories: targetNames,
          target_departments: targetNames,
          is_partial: actionType === 'partial'
        }
      });

      await client.query('COMMIT');

      const targetCatIds = targetCats.map(c => c.id);
      const newAssigneesRes = await query(
        `SELECT DISTINCT u.id, u.email, u.full_name
         FROM category_feedback_assignees cfa
         JOIN users u ON u.id = cfa.user_id
         WHERE cfa.category_id = ANY($1::int[]) AND cfa.is_active = TRUE AND u.is_active = TRUE`,
        [targetCatIds]
      );
      for (const reviewer of newAssigneesRes.rows) {
        await createNotification(reviewer.id, id, 'Incident Redirected to You',
          `Incident ${incident.reference_id} has been redirected to your assigned category by IMC.`,
          'incident_redirected');
        if (reviewer?.email) {
          sendEmail(reviewer.email, templates.newIncidentHod(incident, reviewer)).catch(() => { });
        }
      }

      const redirectedStr = targetNames.join(', ');
      if (incident.redirect_requested_by_user_id) {
        const origUserRes = await query('SELECT email, full_name FROM users WHERE id = $1', [incident.redirect_requested_by_user_id]);
        if (origUserRes.rows[0]?.email) {
          sendEmail(origUserRes.rows[0].email, templates.redirectDecision(incident, origUserRes.rows[0], true, redirectedStr, null)).catch(() => { });
        }
      }

      await auditLog(req.user.id, 'REDIRECT_APPROVED', id, { targetCategories: targetNames, isPartial: actionType === 'partial' }, req.ip);
      if (req.io) req.io.emit('incident_updated', { id });

      return res.json({ success: true, message: 'Redirect processed successfully.', targetCategories: targetNames });
    }

    // Legacy department-based redirect fallback
    const deptRes = await client.query('SELECT id, name, hod_user_id FROM departments WHERE name = ANY($1)', [deptNames]);
    if (!deptRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Selected target department(s) not found.' });
    }
    const targetDepts = deptRes.rows;

    const existingDeptsRes = await client.query('SELECT department_id FROM incident_departments WHERE incident_id = $1', [id]);
    const existingDeptIds = existingDeptsRes.rows.map(r => r.department_id);

    let requestingDeptId = null;
    if (incident.redirect_requested_by_dept) {
      const reqDeptRes = await client.query('SELECT id FROM departments WHERE name = $1', [incident.redirect_requested_by_dept]);
      if (reqDeptRes.rows.length) requestingDeptId = reqDeptRes.rows[0].id;
    }

    const uninvolvedDeptIds = existingDeptIds.filter(dId => dId !== requestingDeptId);
    let finalDeptIds = [...new Set([...uninvolvedDeptIds, ...targetDepts.map(d => d.id)])];

    if (Array.isArray(retainedDepartments) && retainedDepartments.length > 0) {
      const retainedRes = await client.query('SELECT id, name FROM departments WHERE name = ANY($1) OR id::text = ANY($1)', [retainedDepartments]);
      finalDeptIds = [...new Set([...finalDeptIds, ...retainedRes.rows.map(d => d.id)])];
    } else if (actionType === 'partial' && requestingDeptId) {
      finalDeptIds = [...new Set([...finalDeptIds, requestingDeptId])];
    }

    await client.query('DELETE FROM incident_departments WHERE incident_id = $1', [id]);
    for (const dId of finalDeptIds) {
      await client.query('INSERT INTO incident_departments (incident_id, department_id) VALUES ($1, $2)', [id, dId]);
    }

    await client.query(
      `UPDATE incidents SET 
         status = $1, 
         redirect_reason = NULL, 
         redirect_requested_at = NULL, 
         redirect_rejected_reason = NULL,
         redirect_rejected_at = NULL,
         updated_at = NOW() 
       WHERE id = $2`,
      [newStatus, id]
    );

    await recordEvent(client, {
      incidentId: id,
      eventType: 'REDIRECT_APPROVED',
      actor: req.user,
      statusBefore: incident.status,
      statusAfter: newStatus,
      title: 'Redirection Approved',
      summary: `IMC Convenor approved redirection to: ${deptNames.join(', ')}`,
      payload: { target_departments: deptNames, is_partial: actionType === 'partial' }
    });

    await client.query('COMMIT');

    const targetDeptIds = targetDepts.map(d => d.id);
    const newLeadersRes = await query(
      `SELECT DISTINCT u.id, u.email, u.full_name FROM users u
       JOIN departments d ON (COALESCE(d.assigned_user_id, d.hod_user_id) = u.id)
       WHERE d.id = ANY($1) AND u.is_active = TRUE
       UNION
       SELECT DISTINCT u.id, u.email, u.full_name FROM users u
       JOIN department_reviewers dr ON dr.user_id = u.id AND dr.is_active = TRUE
       WHERE dr.department_id = ANY($1) AND u.is_active = TRUE`,
      [targetDeptIds]
    );
    for (const leader of newLeadersRes.rows) {
      await createNotification(leader.id, id, 'Incident Redirected to You',
        `Incident ${incident.reference_id} has been redirected to your assigned scope by IMC.`,
        'incident_redirected');
      if (leader?.email) {
        sendEmail(leader.email, templates.newIncidentHod(incident, leader)).catch(() => { });
      }
    }

    const redirectedDeptNamesStr = targetDepts.map(d => d.name).join(', ');
    if (incident.redirect_requested_by_user_id) {
      const origUserRes = await query('SELECT email, full_name FROM users WHERE id = $1', [incident.redirect_requested_by_user_id]);
      if (origUserRes.rows[0]?.email) {
        sendEmail(origUserRes.rows[0].email, templates.redirectDecision(incident, origUserRes.rows[0], true, redirectedDeptNamesStr, null)).catch(() => { });
      }
    }

    await auditLog(req.user.id, 'REDIRECT_APPROVED', id, { targetDepartments: deptNames, isPartial: actionType === 'partial' }, req.ip);

    if (req.io) {
      req.io.emit('incident_updated', { id });
    }

    res.json({ success: true, message: 'Redirect processed successfully.', targetDepartments: deptNames });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to approve redirect.' });
  } finally {
    client.release();
  }
};

// ── REJECT REDIRECT (IMC Convenor Only) ────────────────────────────────────
exports.rejectRedirect = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const { reason } = req.body;

    if (!req.user.is_imc_lead && !req.user.is_system_admin) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only the IMC Convenor can reject redirection requests.' });
    }

    const incResult = await client.query('SELECT * FROM incidents WHERE id = $1', [id]);
    if (!incResult.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }
    const incident = incResult.rows[0];

    const newStatus = incident.severity === 'Grave' ? 'with_hod_and_imc' : 'with_hod';

    await client.query(
      `UPDATE incidents SET 
         status = $1, 
         redirect_rejected_reason = $2, 
         redirect_rejected_at = NOW(), 
         redirect_reason = NULL, 
         redirect_requested_at = NULL, 
         updated_at = NOW() 
       WHERE id = $3`,
      [newStatus, reason, id]
    );

    const requestedByScope = incident.redirect_requested_by_category || incident.redirect_requested_by_dept;

    await recordEvent(client, {
      incidentId: id,
      eventType: 'REDIRECT_REJECTED',
      actor: req.user,
      statusBefore: incident.status,
      statusAfter: newStatus,
      title: 'Redirection Rejected',
      summary: `IMC Convenor rejected redirection. Reason: "${reason}". Original assignee stays responsible.`,
      payload: { reason, requested_by_dept: requestedByScope, requested_by_category: requestedByScope }
    });

    await client.query('COMMIT');

    if (incident.redirect_requested_by_user_id) {
      await createNotification(
        incident.redirect_requested_by_user_id,
        id,
        'Redirect Request Rejected',
        `IMC has rejected the redirect request for incident ${incident.reference_id}. Reason: "${reason}". Please review and provide your feedback.`,
        'redirect_rejected'
      );
      const userRes = await query('SELECT id, email, full_name FROM users WHERE id = $1', [incident.redirect_requested_by_user_id]);
      if (userRes.rows[0]?.email) {
        sendEmail(userRes.rows[0].email, templates.redirectDecision(incident, userRes.rows[0], false, null, reason)).catch(() => { });
      }
    }

    await auditLog(req.user.id, 'REDIRECT_REJECTED', id, { reason, requestedByScope, requestedByUserId: incident.redirect_requested_by_user_id }, req.ip);

    if (req.io) {
      req.io.emit('incident_updated', { id });
    }

    res.json({ success: true, message: 'Redirect rejected successfully.' });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to reject redirect.' });
  } finally {
    client.release();
  }
};

// ── VERIFY EMPLOYEE TRAINING (HOD) ──────────────────────────────────────────
exports.verifyEmployeeTraining = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const { employeeId } = req.body;

    if (!employeeId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Employee ID is required.' });
    }

    const incResult = await client.query('SELECT * FROM incidents WHERE id = $1', [id]);
    if (!incResult.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }
    const incident = incResult.rows[0];

    // Check if employee is part of the incident and needs training
    const empCheck = await client.query('SELECT * FROM incident_responsible_employees WHERE incident_id = $1 AND employee_id = $2 AND needs_training = TRUE', [id, employeeId]);
    if (!empCheck.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Employee does not require training for this incident.' });
    }
    const emp = empCheck.rows[0];

    // Verify HOD / reviewer access (fail closed)
    if (!isPrivilegedRole(req.user)) {
      let authorized = false;
      if (emp.department_id) {
        const deptRes = await client.query(`
          SELECT d.*, dr.id as reviewer_mapping_id FROM departments d
          LEFT JOIN department_reviewers dr ON dr.department_id = d.id AND dr.user_id = $2 AND dr.is_active = true
          WHERE d.id = $1
        `, [emp.department_id, req.user.id]);
        if (deptRes.rows.length) {
          const d = deptRes.rows[0];
          authorized = Boolean(
            d.assigned_user_id === req.user.id ||
            d.hod_user_id === req.user.id ||
            d.incharge_user_id === req.user.id ||
            d.asst_coo_user_id === req.user.id ||
            d.reviewer_mapping_id
          );
        }
      } else {
        const managedCats = await getUserAssignedCategoriesForIncident(req.user, id);
        const managedDepts = await getUserManagedDepartmentsForIncident(req.user, id);
        authorized = managedCats.length > 0 || managedDepts.size > 0;
      }

      if (!authorized) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'You are not the designated reviewer for this employee or incident.' });
      }
    }

    await client.query(
      `UPDATE incident_responsible_employees 
       SET training_completed = TRUE, training_verified_at = NOW(), training_verified_by = $1
       WHERE incident_id = $2 AND employee_id = $3`,
      [req.user.id, id, employeeId]
    );

    const pendingTrainings = await client.query(
      'SELECT COUNT(*) FROM incident_responsible_employees WHERE incident_id = $1 AND needs_training = TRUE AND (training_completed IS NULL OR training_completed = FALSE)',
      [id]
    );

    await recordEvent(client, {
      incidentId: id,
      eventType: 'EMPLOYEE_TRAINING_VERIFIED',
      actor: req.user,
      title: 'Employee Training Verified',
      summary: `Assigned reviewer verified training completion for staff member`,
      payload: { employee_id: employeeId }
    });

    await client.query('COMMIT');

    if (parseInt(pendingTrainings.rows[0].count) === 0) {
      const imcMembers = await query("SELECT id FROM users WHERE role = 'imc' AND is_imc_lead = TRUE AND is_active = TRUE");
      for (const imc of imcMembers.rows) {
        await createNotification(imc.id, id, 'All Training Verified',
          `All mandated training for incident ${incident.reference_id} has been verified. You can now close the incident.`,
          'training_all_verified');
      }
    }

    await auditLog(req.user.id, 'EMPLOYEE_TRAINING_VERIFIED', id, { employeeId }, req.ip);
    res.json({ success: true, message: 'Employee training verified.' });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'Failed to verify employee training.' });
  } finally {
    client.release();
  }
};

// ── VERIFY TRAINING (Reviewer / IMC) ──────────────────────────────────────
exports.verifyTraining = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { id } = req.params;

    const incResult = await client.query('SELECT * FROM incidents WHERE id = $1', [id]);
    if (!incResult.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }
    const incident = incResult.rows[0];

    if (!isPrivilegedRole(req.user)) {
      const managedCats = await getUserAssignedCategoriesForIncident(req.user, id);
      const managedDepts = await getUserManagedDepartmentsForIncident(req.user, id);
      if (managedCats.length === 0 && managedDepts.size === 0) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Access denied: You are not assigned to review this incident.' });
      }
    }

    if (incident.status !== 'pending_training') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Incident is not in pending_training status.' });
    }

    await client.query(
      `UPDATE incidents SET
        status = 'resolved', training_completed = TRUE,
        training_completed_at = NOW(), training_verified_by = $1,
        resolved_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [req.user.id, id]
    );

    await client.query('COMMIT');

    // Notify reporter
    const reporterRes = await query('SELECT email, full_name FROM users WHERE id = $1', [incident.reporter_id]);
    const reporter = reporterRes.rows[0];
    await createNotification(incident.reporter_id, id, 'Training Verified & Incident Closed',
      `Training for incident ${incident.reference_id} has been verified. The incident is now resolved.`,
      'training_verified');
    if (reporter?.email) {
      sendEmail(reporter.email, templates.trainingVerified(incident, reporter)).catch(() => { });
    }

    await auditLog(req.user.id, 'TRAINING_VERIFIED', id, {}, req.ip);
    res.json({ success: true });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to verify training.' });
  } finally {
    client.release();
  }
};

// ── EDIT OWN FEEDBACK (HOD/IMC/Management) ────────────────────────────────
exports.editFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    const { feedbackType, feedbackText, feedbackId } = req.body;
    const role = req.user.role;

    if (!feedbackText?.trim()) return res.status(400).json({ error: 'Feedback text is required.' });

    // Locate the specific feedback
    let fbResult;
    if (feedbackId) {
      fbResult = await query(
        'SELECT * FROM feedbacks WHERE id = $1 AND incident_id = $2',
        [feedbackId, id]
      );
    } else {
      const roleMap = { hod: 'hod', imc: 'imc', head_management: 'head_management', management: 'head_management' };
      const fbRole = roleMap[feedbackType] || feedbackType;
      fbResult = await query(
        'SELECT * FROM feedbacks WHERE incident_id = $1 AND author_id = $2 AND role = $3 ORDER BY created_at DESC LIMIT 1',
        [id, req.user.id, fbRole]
      );
    }

    if (!fbResult.rows.length) {
      return res.status(404).json({ error: 'No matching feedback found to update.' });
    }

    const fb = fbResult.rows[0];

    // Rule: No one can edit the review/feedback given by any other person, except the person itself.
    if (fb.author_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only edit your own feedback.' });
    }

    // Check incident status
    const incRes = await query('SELECT status, management_decision FROM incidents WHERE id = $1', [id]);
    if (!incRes.rows.length) return res.status(404).json({ error: 'Incident not found.' });
    const incident = incRes.rows[0];

    if (['resolved', 'closed', 'withdrawn'].includes(incident.status)) {
      return res.status(403).json({ error: 'Feedbacks cannot be modified after the incident has been resolved or closed.' });
    }

    // Rule 1: Department/category feedback cannot be modified once IMC or Management has submitted feedback / decision
    if (fb.role === 'hod') {
      const upperCheck = await query(
        "SELECT 1 FROM feedbacks WHERE incident_id = $1 AND role IN ('imc', 'head_management') AND created_at >= $2",
        [id, fb.created_at]
      );
      if (upperCheck.rows.length > 0) {
        return res.status(403).json({ error: 'Department feedback cannot be modified after upper-level review (IMC/Management) has been submitted.' });
      }
    }

    // Rule 2: Investigator report cannot be modified once IMC review has been conducted or Management acted
    if (fb.role === 'investigator') {
      const upperCheck = await query(
        "SELECT 1 FROM feedbacks WHERE incident_id = $1 AND role IN ('imc', 'head_management') AND created_at >= $2",
        [id, fb.created_at]
      );
      if (upperCheck.rows.length > 0) {
        return res.status(403).json({ error: 'Investigation report cannot be modified after upper-level review has been conducted.' });
      }
    }

    // Rule 3: IMC feedback cannot be modified once Management has given their decision/feedback
    // (Until management gives feedback, e.g. even if forwarded to management, IMC can edit)
    if (fb.role === 'imc') {
      const upperCheck = await query(
        "SELECT 1 FROM feedbacks WHERE incident_id = $1 AND role = 'head_management' AND created_at >= $2",
        [id, fb.created_at]
      );
      if (upperCheck.rows.length > 0) {
        return res.status(403).json({ error: 'IMC feedback cannot be modified after Management has given their decision.' });
      }
    }

    // Rule 4: Management decision cannot be modified once final report is generated
    if (fb.role === 'head_management') {
      if (['pending_training', 'resolved', 'closed'].includes(incident.status)) {
        return res.status(403).json({ error: 'Management decision cannot be modified after final report generation.' });
      }
    }

    const result = await query(
      `UPDATE feedbacks SET feedback_text = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id`,
      [feedbackText, fb.id]
    );

    const roleLabel = fb.role === 'hod' ? 'Department' : fb.role === 'head_management' ? 'Management' : fb.role.toUpperCase();
    await recordEvent(query, {
      incidentId: id,
      eventType: 'FEEDBACK_EDITED',
      actor: req.user,
      title: 'Feedback Edited',
      summary: `${roleLabel} feedback updated`,
      payload: { feedback_id: fb.id, role: fb.role, previous_text: fb.feedback_text, new_text: feedbackText }
    });

    await auditLog(req.user.id, 'FEEDBACK_EDITED', id, { feedbackId: fb.id, role: fb.role }, req.ip);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to edit feedback.' });
  }
};

// ── REMIND ASSIGNED REVIEWERS TO SUBMIT FEEDBACK (IMC/Management) ──────────
exports.remindHod = async (req, res) => {
  try {
    const { id } = req.params;
    const role = req.user.role;
    const remindedBy = role === 'head_management' ? 'Management Authority' : 'IMC Committee';

    const incResult = await query('SELECT * FROM incidents WHERE id = $1', [id]);
    if (!incResult.rows.length) return res.status(404).json({ error: 'Incident not found' });
    const incident = incResult.rows[0];

    // Find active assigned reviewers (via incident_category_links or legacy incident_departments) who haven't submitted feedback yet
    const pendingReviewersRes = await query(
      `SELECT DISTINCT u.id, u.email, u.full_name
       FROM incident_category_links icl
       JOIN category_feedback_assignees cfa ON cfa.category_id = icl.category_id AND cfa.is_active = TRUE
       JOIN users u ON u.id = cfa.user_id AND u.is_active = TRUE
       WHERE icl.incident_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM feedbacks f
           WHERE f.incident_id = $1 AND f.role = 'hod' AND (f.category_id = icl.category_id OR f.author_id = u.id)
         )
       UNION
       SELECT DISTINCT u.id, u.email, u.full_name
       FROM incident_departments idp
       JOIN departments d ON d.id = idp.department_id
       JOIN users u ON (
         u.id = COALESCE(d.assigned_user_id, d.hod_user_id)
         OR EXISTS (SELECT 1 FROM department_reviewers dr WHERE dr.department_id = d.id AND dr.user_id = u.id AND dr.is_active = TRUE)
       ) AND u.is_active = TRUE
       WHERE idp.incident_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM feedbacks f
           WHERE f.incident_id = $1 AND f.role = 'hod' AND (f.author_id = u.id OR f.department_id = d.id)
         )`,
      [id]
    );

    const reviewerUsers = pendingReviewersRes.rows;

    if (!reviewerUsers.length) {
      return res.status(400).json({ error: 'All assigned reviewers have already submitted feedback (or no active feedback staff are mapped).' });
    }

    for (const rev of reviewerUsers) {
      await createNotification(
        rev.id,
        id,
        `🔔 Reminder: Feedback Required (${incident.reference_id})`,
        `You have been reminded by ${remindedBy} to submit your feedback for Incident ${incident.reference_id}.`,
        'hod_feedback_reminder'
      );
      if (rev.email) {
        sendEmail(rev.email, templates.hodFeedbackReminder(incident, rev, remindedBy)).catch(e =>
          console.warn('[RemindReviewer] Email failed:', e.message)
        );
      }
    }

    await recordEvent(query, {
      incidentId: id,
      eventType: 'HOD_REMINDER_SENT',
      actor: req.user,
      title: 'Feedback Reminder Sent',
      summary: `Reminder sent to ${reviewerUsers.length} assigned reviewer(s) by ${remindedBy}`,
      payload: { reminded_by: remindedBy, reviewer_count: reviewerUsers.length, hod_count: reviewerUsers.length },
      isSystemEvent: true
    });

    await auditLog(req.user.id, 'HOD_REMINDED', id, { remindedBy, reviewerCount: reviewerUsers.length }, req.ip);
    res.json({ success: true, count: reviewerUsers.length, message: `Reminder sent to ${reviewerUsers.length} assigned reviewer(s) via Mail and In-App Notification.` });
  } catch (e) {
    console.error('remindHod error:', e);
    res.status(500).json({ error: 'Failed to send reminder to assigned reviewer(s).' });
  }
};


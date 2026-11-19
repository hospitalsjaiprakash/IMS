const { query } = require('../config/database');
const { isPrivilegedRole, getUserManagedDepartmentsForIncident } = require('../utils/accessControl');

/**
 * Get training records filtered by user role/department
 */
exports.getTrainingRecords = async (req, res) => {
  try {
    const { role, id: userId } = req.user;
    let where = '1=1';
    const params = [];

    if (role === 'hod') {
      where = `u.department = (SELECT department FROM users WHERE id = $1)`;
      params.push(userId);
    } else if (role === 'employee') {
      where = `tr.employee_id = $1`;
      params.push(userId);
    }

    const result = await query(
      `SELECT tr.*, u.full_name as employee_name, u.department,
        i.reference_id, ab.full_name as assigned_by_name
       FROM training_records tr
       JOIN users u ON u.id = tr.employee_id
       JOIN incidents i ON i.id = tr.incident_id
       JOIN users ab ON ab.id = tr.assigned_by
       WHERE ${where}
       ORDER BY tr.assigned_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (e) {
    console.error('[GET /training] error:', e);
    res.status(500).json({ error: 'Failed to retrieve training records' });
  }
};

/**
 * Mark a training record as complete
 */
exports.completeTrainingRecord = async (req, res) => {
  try {
    const recRes = await query(
      `SELECT tr.id, tr.incident_id, tr.employee_id, u.department AS trainee_department
       FROM training_records tr
       JOIN users u ON u.id = tr.employee_id
       WHERE tr.id = $1`,
      [req.params.id]
    );
    if (!recRes.rows.length) {
      return res.status(404).json({ error: 'Training record not found.' });
    }
    const rec = recRes.rows[0];

    if (!isPrivilegedRole(req.user)) {
      const managedDepts = await getUserManagedDepartmentsForIncident(req.user, rec.incident_id);
      const traineeDeptLower = String(rec.trainee_department || '').trim().toLowerCase();
      const hodDeptLower = String(req.user.department || '').trim().toLowerCase();
      const ownsDept = (traineeDeptLower && managedDepts.has(traineeDeptLower))
        || (req.user.role === 'hod' && traineeDeptLower && hodDeptLower && traineeDeptLower === hodDeptLower);
      if (!ownsDept) {
        return res.status(403).json({ error: 'Access denied: You are not authorized to complete training records outside your department.' });
      }
    }

    await query(
      `UPDATE training_records SET completed = TRUE, completed_at = NOW(), completed_by = $1 WHERE id = $2`,
      [req.user.id, req.params.id]
    );
    res.json({ success: true });
  } catch (e) {
    console.error('[POST /training/:id/complete] error:', e);
    res.status(500).json({ error: 'Failed to complete training record' });
  }
};

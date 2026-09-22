const { query } = require('../config/database');

/**
 * Get paginated knowledge base entries with search & filters
 */
exports.getKnowledgeBase = async (req, res) => {
  try {
    const { search, incidentType, departmentId, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;
    let where = '1=1';
    const params = [];
    let idx = 1;

    if (search) {
      where += ` AND (kb.title ILIKE $${idx} OR kb.root_cause ILIKE $${idx} OR kb.tags ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }
    if (incidentType) {
      where += ` AND kb.incident_type = $${idx++}`;
      params.push(incidentType);
    }
    if (departmentId) {
      where += ` AND kb.department_id = $${idx++}`;
      params.push(departmentId);
    }

    const result = await query(
      `SELECT kb.*, u.full_name as created_by_name, d.name as department_name, i.reference_id
       FROM knowledge_base kb
       JOIN users u ON u.id = kb.created_by
       LEFT JOIN departments d ON d.id = kb.department_id
       LEFT JOIN incidents i ON i.id = kb.incident_id
       WHERE ${where}
       ORDER BY kb.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    );

    const countResult = await query(
      `SELECT COUNT(*) FROM knowledge_base kb WHERE ${where}`,
      params
    );

    res.json({
      entries: result.rows,
      total: parseInt(countResult.rows[0].count),
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    });
  } catch (e) {
    console.error('[GET /knowledge-base] error:', e);
    res.status(500).json({ error: 'Failed to retrieve knowledge base entries' });
  }
};

/**
 * Create a new knowledge base entry
 */
exports.createKnowledgeBase = async (req, res) => {
  try {
    const { incidentId, title, incidentType, departmentId, rootCause, preventiveActions, tags } = req.body;
    await query(
      `INSERT INTO knowledge_base (incident_id, created_by, title, incident_type, department_id, root_cause, preventive_actions, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [incidentId || null, req.user.id, title, incidentType, departmentId || null, rootCause, preventiveActions, tags]
    );
    res.status(201).json({ success: true });
  } catch (e) {
    console.error('[POST /knowledge-base] error:', e);
    res.status(500).json({ error: 'Failed to create knowledge base entry' });
  }
};

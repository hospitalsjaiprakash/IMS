const path = require('path');
const fs = require('fs');
const { query } = require('../config/database');
const { s3Client } = require('../config/s3');
const { uploadDir } = require('../middleware/upload');

/**
 * Get main and sub locations
 */
exports.getLocations = async (req, res) => {
  try {
    const [main, sub] = await Promise.all([
      query('SELECT * FROM main_locations ORDER BY name'),
      query('SELECT * FROM sub_locations ORDER BY name')
    ]);
    res.json({ mainLocations: main.rows, subLocations: sub.rows });
  } catch (e) {
    console.error('[GET /locations] error:', e);
    res.status(500).json({ error: 'Failed to retrieve locations' });
  }
};

/**
 * Get departments with leaders
 */
exports.getDepartments = async (req, res) => {
  try {
    const result = await query(
      `SELECT d.*, 
         COALESCE(d.assigned_user_id, d.hod_user_id) as assigned_user_id,
         u_assigned.full_name as assigned_staff_name,
         u_assigned.employee_id as assigned_employee_id,
         u_assigned.designation as assigned_designation,
         u_assigned.department as assigned_department,
         u_assigned.email as assigned_email,
         u_assigned.phone as assigned_phone,
         u1.full_name as hod_name, u1.employee_id as hod_employee_id,
         u2.full_name as incharge_name, u2.employee_id as incharge_employee_id,
         u3.full_name as asst_coo_name, u3.employee_id as asst_coo_employee_id
       FROM departments d
       LEFT JOIN users u_assigned ON u_assigned.id = COALESCE(d.assigned_user_id, d.hod_user_id)
       LEFT JOIN users u1 ON u1.id = d.hod_user_id
       LEFT JOIN users u2 ON u2.id = d.incharge_user_id
       LEFT JOIN users u3 ON u3.id = d.asst_coo_user_id
       ORDER BY d.name`
    );
    res.json(result.rows);
  } catch (e) {
    console.error('[GET /departments] error:', e);
    res.status(500).json({ error: 'Failed to retrieve departments' });
  }
};

async function canUserAccessIncidentAttachment(user, incidentId) {
  if (!user) return false;
  if (user.role === 'system_admin' || user.is_system_admin ||
      user.role === 'head_management' || user.is_management_member ||
      user.role === 'imc' || user.is_imc_member || user.is_imc_lead) {
    return true;
  }
  const incRes = await query('SELECT reporter_id FROM incidents WHERE id = $1', [incidentId]);
  if (!incRes.rows.length) return false;
  if (incRes.rows[0].reporter_id === user.id) return true;

  // Check trainer assignment
  const trRes = await query('SELECT 1 FROM incident_trainers WHERE incident_id = $1 AND trainer_id = $2', [incidentId, user.id]);
  if (trRes.rows.length) return true;

  // Check investigator
  const invRes = await query('SELECT 1 FROM investigators WHERE incident_id = $1 AND user_id = $2', [incidentId, user.id]);
  if (invRes.rows.length) return true;

  // Check department HOD / assigned reviewer
  const deptRes = await query(`
    SELECT 1 FROM incident_departments idp
    JOIN departments d ON idp.department_id = d.id
    WHERE idp.incident_id = $1
      AND (
        COALESCE(d.assigned_user_id, d.hod_user_id) = $2
        OR EXISTS (SELECT 1 FROM department_reviewers dr WHERE dr.department_id = d.id AND dr.user_id = $2 AND dr.is_active = true)
      )
  `, [incidentId, user.id]);
  if (deptRes.rows.length) return true;

  // Check responsible person
  const respRes = await query('SELECT 1 FROM incident_responsible_employees WHERE incident_id = $1 AND employee_id = $2', [incidentId, user.id]);
  if (respRes.rows.length) return true;

  return false;
}

/**
 * Download attachment via presigned S3 URL or local path (forces download attachment header)
 */
exports.downloadAttachment = async (req, res) => {
  try {
    const result = await query('SELECT * FROM attachments WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Attachment not found' });
    const att = result.rows[0];

    if (att.incident_id) {
      const allowed = await canUserAccessIncidentAttachment(req.user, att.incident_id);
      if (!allowed) return res.status(403).json({ error: 'Access denied: You are not authorized to access this attachment.' });
    }

    const storedFilename = att.stored_filename;

    if (s3Client && process.env.S3_BUCKET_NAME) {
      const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
      const { GetObjectCommand } = require('@aws-sdk/client-s3');
      const signedUrl = await getSignedUrl(s3Client, new GetObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: storedFilename,
        ResponseContentDisposition: `attachment; filename="${encodeURIComponent(att.original_filename)}"`,
      }), { expiresIn: 300 });
      return res.json({ url: signedUrl, filename: att.original_filename });
    } else {
      const filePath = path.resolve(uploadDir, storedFilename);
      if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });
      return res.json({ url: `/uploads/${storedFilename}`, filename: att.original_filename });
    }
  } catch (e) {
    console.error('[GET /attachments/:id/download] error:', e);
    res.status(500).json({ error: 'Failed to generate download link' });
  }
};

/**
 * Preview attachment inline via JSON endpoint (returns presigned inline URL or local URL)
 */
exports.previewAttachment = async (req, res) => {
  try {
    const result = await query('SELECT * FROM attachments WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Attachment not found' });
    const att = result.rows[0];

    if (att.incident_id) {
      const allowed = await canUserAccessIncidentAttachment(req.user, att.incident_id);
      if (!allowed) return res.status(403).json({ error: 'Access denied: You are not authorized to access this attachment.' });
    }

    const storedFilename = att.stored_filename;

    if (s3Client && process.env.S3_BUCKET_NAME) {
      const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
      const { GetObjectCommand } = require('@aws-sdk/client-s3');
      const signedUrl = await getSignedUrl(s3Client, new GetObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: storedFilename,
        ResponseContentDisposition: `inline; filename="${encodeURIComponent(att.original_filename)}"`,
        ResponseContentType: att.mime_type || undefined,
      }), { expiresIn: 3600 });
      return res.json({ url: signedUrl, mimeType: att.mime_type, filename: att.original_filename });
    } else {
      const filePath = path.resolve(uploadDir, storedFilename);
      if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });
      return res.json({ url: `/uploads/${storedFilename}`, mimeType: att.mime_type, filename: att.original_filename });
    }
  } catch (e) {
    console.error('[GET /attachments/:id/preview] error:', e);
    res.status(500).json({ error: 'Failed to generate preview link' });
  }
};

/**
 * Direct file view/stream endpoint (useful for <img> tags or direct links)
 */
exports.serveAttachmentFile = async (req, res) => {
  try {
    const result = await query('SELECT * FROM attachments WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).send('Attachment not found');
    const att = result.rows[0];

    if (att.incident_id) {
      const allowed = await canUserAccessIncidentAttachment(req.user, att.incident_id);
      if (!allowed) return res.status(403).send('Access denied: You are not authorized to view this attachment.');
    }

    const storedFilename = att.stored_filename;

    if (s3Client && process.env.S3_BUCKET_NAME) {
      const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
      const { GetObjectCommand } = require('@aws-sdk/client-s3');
      const signedUrl = await getSignedUrl(s3Client, new GetObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: storedFilename,
        ResponseContentDisposition: `inline; filename="${encodeURIComponent(att.original_filename)}"`,
        ResponseContentType: att.mime_type || undefined,
      }), { expiresIn: 3600 });
      return res.redirect(signedUrl);
    } else {
      const filePath = path.resolve(uploadDir, storedFilename);
      if (!fs.existsSync(filePath)) return res.status(404).send('File not found on disk');
      if (att.mime_type) res.setHeader('Content-Type', att.mime_type);
      return res.sendFile(filePath);
    }
  } catch (e) {
    console.error('[GET /attachments/:id/view] error:', e);
    res.status(500).send('Failed to serve attachment');
  }
};

const { query } = require('../config/database');
const { s3Client, isR2Configured } = require('../config/s3');
const { canUserAccessIncident, isPrivilegedRole } = require('../utils/accessControl');

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
 * Get active incident categories
 */
exports.getCategories = async (req, res) => {
  try {
    const result = await query(
      `SELECT id, name, is_active
       FROM incident_categories
       WHERE is_active = TRUE
       ORDER BY name ASC`
    );
    res.json(result.rows);
  } catch (e) {
    console.error('[GET /categories] error:', e);
    res.status(500).json({ error: 'Failed to retrieve incident categories' });
  }
};

/**
 * Get departments with leaders (STRICT: 100% API-driven — returns ONLY departments fetched via OfficePortal HRMS API)
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
       WHERE d.is_hrms_synced = TRUE
       ORDER BY d.name`
    );
    res.json(result.rows);
  } catch (e) {
    console.error('[GET /departments] error:', e);
    res.status(500).json({ error: 'Failed to retrieve departments' });
  }
};

/**
 * Get designations / job titles exclusively from synced OfficePortal HRMS records
 */
exports.getDesignations = async (req, res) => {
  try {
    const result = await query(`
      SELECT DISTINCT name
      FROM (
        SELECT TRIM(name) AS name FROM hrms_job_titles WHERE name IS NOT NULL AND TRIM(name) != ''
        UNION
        SELECT TRIM(designation) AS name FROM master_employees WHERE designation IS NOT NULL AND TRIM(designation) != '' AND office_portal_id IS NOT NULL
      ) t
      ORDER BY name ASC
    `);
    res.json(result.rows.map((r) => r.name));
  } catch (e) {
    console.error('[GET /departments/designations] error:', e);
    res.status(500).json({ error: 'Failed to retrieve designations' });
  }
};

/**
 * Get employment types synced from OfficePortal HRMS API
 */
exports.getEmploymentTypes = async (req, res) => {
  try {
    const result = await query(
      `SELECT employment_type_id, name, synced_at
       FROM hrms_employment_types
       WHERE name IS NOT NULL AND TRIM(name) != ''
       ORDER BY name ASC`
    );
    res.json(result.rows);
  } catch (e) {
    console.error('[GET /departments/employment-types] error:', e);
    res.status(500).json({ error: 'Failed to retrieve employment types' });
  }
};

/**
 * Download attachment via presigned S3 URL (forces download attachment header)
 */
exports.downloadAttachment = async (req, res) => {
  try {
    const result = await query('SELECT * FROM attachments WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Attachment not found' });
    const att = result.rows[0];

    if (att.incident_id) {
      const allowed = await canUserAccessIncident(req.user, att.incident_id);
      if (!allowed) return res.status(403).json({ error: 'Access denied: You are not authorized to access this attachment.' });
    } else if (!isPrivilegedRole(req.user) && att.uploader_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied: You are not authorized to access this attachment.' });
    }

    const storedFilename = att.stored_filename;

    if (isR2Configured() && s3Client && process.env.S3_BUCKET_NAME) {
      const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
      const { GetObjectCommand } = require('@aws-sdk/client-s3');
      const signedUrl = await getSignedUrl(s3Client, new GetObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: storedFilename,
        ResponseContentDisposition: `attachment; filename="${encodeURIComponent(att.original_filename)}"`,
      }), { expiresIn: 300 });
      return res.json({ url: signedUrl, filename: att.original_filename });
    }
    return res.status(503).json({ error: 'Cloudflare R2 storage is not configured.' });
  } catch (e) {
    console.error('[GET /attachments/:id/download] error:', e);
    res.status(500).json({ error: 'Failed to generate download link' });
  }
};

/**
 * Preview attachment inline via JSON endpoint (returns presigned inline URL)
 */
exports.previewAttachment = async (req, res) => {
  try {
    const result = await query('SELECT * FROM attachments WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Attachment not found' });
    const att = result.rows[0];

    if (att.incident_id) {
      const allowed = await canUserAccessIncident(req.user, att.incident_id);
      if (!allowed) return res.status(403).json({ error: 'Access denied: You are not authorized to access this attachment.' });
    } else if (!isPrivilegedRole(req.user) && att.uploader_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied: You are not authorized to access this attachment.' });
    }

    const storedFilename = att.stored_filename;

    if (isR2Configured() && s3Client && process.env.S3_BUCKET_NAME) {
      const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
      const { GetObjectCommand } = require('@aws-sdk/client-s3');
      const signedUrl = await getSignedUrl(s3Client, new GetObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: storedFilename,
        ResponseContentDisposition: `inline; filename="${encodeURIComponent(att.original_filename)}"`,
        ResponseContentType: att.mime_type || undefined,
      }), { expiresIn: 3600 });
      return res.json({ url: signedUrl, mimeType: att.mime_type, filename: att.original_filename });
    }
    return res.status(503).json({ error: 'Cloudflare R2 storage is not configured.' });
  } catch (e) {
    console.error('[GET /attachments/:id/preview] error:', e);
    res.status(500).json({ error: 'Failed to generate preview link' });
  }
};

/**
 * Direct file view/stream endpoint (redirects to authorized short-lived presigned R2 URL)
 */
exports.serveAttachmentFile = async (req, res) => {
  try {
    const result = await query('SELECT * FROM attachments WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).send('Attachment not found');
    const att = result.rows[0];

    if (att.incident_id) {
      const allowed = await canUserAccessIncident(req.user, att.incident_id);
      if (!allowed) return res.status(403).send('Access denied: You are not authorized to view this attachment.');
    } else if (!isPrivilegedRole(req.user) && att.uploader_id !== req.user.id) {
      return res.status(403).send('Access denied: You are not authorized to view this attachment.');
    }

    const storedFilename = att.stored_filename;

    if (isR2Configured() && s3Client && process.env.S3_BUCKET_NAME) {
      const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
      const { GetObjectCommand } = require('@aws-sdk/client-s3');
      const signedUrl = await getSignedUrl(s3Client, new GetObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: storedFilename,
        ResponseContentDisposition: `inline; filename="${encodeURIComponent(att.original_filename)}"`,
        ResponseContentType: att.mime_type || undefined,
      }), { expiresIn: 3600 });
      return res.redirect(signedUrl);
    }
    return res.status(503).send('Cloudflare R2 storage is not configured.');
  } catch (e) {
    console.error('[GET /attachments/:id/view] error:', e);
    res.status(500).send('Failed to serve attachment');
  }
};

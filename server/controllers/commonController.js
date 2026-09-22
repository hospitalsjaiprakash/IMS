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
         u1.full_name as hod_name, u1.employee_id as hod_employee_id,
         u2.full_name as incharge_name, u2.employee_id as incharge_employee_id,
         u3.full_name as asst_coo_name, u3.employee_id as asst_coo_employee_id
       FROM departments d
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

/**
 * Download attachment via presigned S3 URL or local path
 */
exports.downloadAttachment = async (req, res) => {
  try {
    const result = await query('SELECT * FROM attachments WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Attachment not found' });
    const att = result.rows[0];
    const storedFilename = att.stored_filename;

    if (s3Client && process.env.S3_BUCKET_NAME) {
      const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
      const { GetObjectCommand } = require('@aws-sdk/client-s3');
      const signedUrl = await getSignedUrl(s3Client, new GetObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: storedFilename,
        ResponseContentDisposition: `attachment; filename="${att.original_filename}"`,
      }), { expiresIn: 60 });
      return res.json({ url: signedUrl });
    } else {
      const filePath = path.resolve(uploadDir, storedFilename);
      if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });
      return res.json({ url: `/uploads/${storedFilename}` });
    }
  } catch (e) {
    console.error('[GET /attachments/:id/download] error:', e);
    res.status(500).json({ error: 'Failed to generate download link' });
  }
};

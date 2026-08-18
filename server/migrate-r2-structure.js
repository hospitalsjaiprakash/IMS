/**
 * R2 Migration Script
 * Moves existing flat-named attachments into structured folders:
 * {JPHRC-IMS-YYYY-NNNNN}/{stage}/{filename}
 *
 * Usage: node migrate-r2-structure.js
 */

require('dotenv').config();
const { query } = require('./config/database');
const { s3Client } = require('./config/s3');
const { CopyObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const BUCKET = process.env.S3_BUCKET_NAME;

const stageFolderMap = {
  submission: 'employee',
  hod_feedback: 'hod',
  imc_feedback: 'imc',
  md_decision: 'mgmt',
  investigator_report: 'investigator',
};

async function migrate() {
  if (!s3Client || !BUCKET) {
    console.error('S3 client or bucket not configured. Check your .env file.');
    process.exit(1);
  }

  console.log('Starting R2 migration for bucket: ' + BUCKET);

  const result = await query(`
    SELECT a.id, a.stored_filename, a.stage, a.original_filename,
           i.reference_id
    FROM attachments a
    JOIN incidents i ON i.id = a.incident_id
    ORDER BY i.reference_id, a.stage
  `);

  const attachments = result.rows;
  console.log('Found ' + attachments.length + ' attachments to process.');

  let moved = 0;
  let skipped = 0;
  let errors = 0;

  for (const att of attachments) {
    const oldKey = att.stored_filename;
    const folder = stageFolderMap[att.stage] || att.stage || 'misc';
    const safeRefId = att.reference_id.replace(/\//g, '-');

    const baseName = oldKey.split('/').pop();
    const newKey = safeRefId + '/' + folder + '/' + baseName;

    if (oldKey === newKey) {
      console.log('[SKIP] Already in correct location: ' + oldKey);
      skipped++;
      continue;
    }

    const parts = oldKey.split('/');
    if (parts.length >= 3 && parts[0].startsWith('JPHRC')) {
      console.log('[SKIP] Already structured: ' + oldKey);
      skipped++;
      continue;
    }

    try {
      console.log('Moving: ' + oldKey + ' -> ' + newKey);

      await s3Client.send(new CopyObjectCommand({
        Bucket: BUCKET,
        CopySource: BUCKET + '/' + oldKey,
        Key: newKey,
      }));

      await s3Client.send(new DeleteObjectCommand({
        Bucket: BUCKET,
        Key: oldKey,
      }));

      await query('UPDATE attachments SET stored_filename = $1 WHERE id = $2', [newKey, att.id]);

      console.log('[OK] Done');
      moved++;
    } catch (err) {
      console.error('[ERROR] Failed for ' + oldKey + ': ' + err.message);
      errors++;
    }
  }

  console.log('Migration Complete: Moved=' + moved + ' Skipped=' + skipped + ' Errors=' + errors);
  process.exit(errors > 0 ? 1 : 0);
}

migrate().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

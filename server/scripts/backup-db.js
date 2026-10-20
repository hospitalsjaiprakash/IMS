/**
 * JPHRC IMS - Database Backup to Cloudflare R2
 * 
 * Performs pg_dump of the local PostgreSQL database, compresses it with gzip,
 * and uploads it to the configured Cloudflare R2 bucket.
 * 
 * Can be run manually or as a daily cron job on the VPS.
 * 
 * Usage:
 *   node scripts/backup-db.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

async function main() {
  console.log('\n======================================================');
  console.log('       JPHRC IMS Database Backup to Cloudflare R2');
  console.log('======================================================\n');

  const dbHost = process.env.DB_HOST || 'localhost';
  const dbPort = process.env.DB_PORT || '5432';
  const dbName = process.env.DB_NAME || 'jaiprakash_ims';
  const dbUser = process.env.DB_USER || 'postgres';
  const dbPassword = process.env.DB_PASSWORD || '';

  const bucketName = process.env.S3_BUCKET_NAME || 'jp-ims-storage';
  const endpoint = process.env.S3_ENDPOINT_URL;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION || 'auto';

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    console.error('❌ Missing Cloudflare R2 credentials (S3_ENDPOINT_URL, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)');
    process.exit(1);
  }

  // Generate timestamp for filename
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  
  const tmpDir = process.platform === 'win32' ? path.resolve(__dirname, '../scratch') : '/tmp';
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  const dumpFilename = `ims_backup_${dbName}_${timestamp}.sql.gz`;
  const dumpFilePath = path.join(tmpDir, dumpFilename);

  console.log(`[1/3] Running pg_dump for database "${dbName}"...`);
  const startTime = Date.now();

  try {
    const env = { ...process.env, PGPASSWORD: dbPassword };
    
    // Command pipe to gzip
    const dumpCmd = `pg_dump -h "${dbHost}" -p "${dbPort}" -U "${dbUser}" "${dbName}" | gzip > "${dumpFilePath}"`;
    execSync(dumpCmd, { env, stdio: 'inherit' });

    const stats = fs.statSync(dumpFilePath);
    const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`  ✅ Dump created: ${dumpFilename} (${sizeMb} MB) in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

    console.log(`[2/3] Uploading dump to Cloudflare R2 (${bucketName})...`);
    const s3 = new S3Client({
      region,
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    const fileStream = fs.createReadStream(dumpFilePath);
    const r2Key = `backups/database/${dumpFilename}`;

    await s3.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: r2Key,
      Body: fileStream,
      ContentType: 'application/gzip',
      Metadata: {
        'database-name': dbName,
        'backup-date': now.toISOString(),
      },
    }));

    console.log(`  ✅ Upload complete! Stored at: ${r2Key}`);

    console.log('[3/3] Cleaning up temporary local file...');
    fs.unlinkSync(dumpFilePath);
    console.log('  ✅ Local cleanup complete.');

    console.log(`\n🎉 Backup finished successfully in ${((Date.now() - startTime) / 1000).toFixed(1)}s\n`);
  } catch (err) {
    console.error('❌ Backup failed:', err.message);
    if (fs.existsSync(dumpFilePath)) {
      try { fs.unlinkSync(dumpFilePath); } catch (_) {}
    }
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal backup error:', err);
  process.exit(1);
});

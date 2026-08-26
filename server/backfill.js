require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
});
async function run() {
  let r = await pool.query("SELECT * FROM audit_logs WHERE action='BROADCAST_NOTIFICATION_SENT'");
  
  for (const row of r.rows) {
    const details = row.details || {};
    await pool.query(
      `INSERT INTO communication_logs (user_id, recipient_contact, type, subject, content, status, details, created_at)
       VALUES ($1, 'All Active Users', 'BROADCAST', $2, 'Backfilled broadcast', 'SENT', $3, $4)`,
      [
        row.user_id,
        details.title || 'Untitled Broadcast',
        JSON.stringify({ attachmentName: details.attachmentName, count: details.count }),
        row.created_at
      ]
    );
  }
  console.log("Backfilled " + r.rows.length + " broadcasts");
  pool.end();
}
run();

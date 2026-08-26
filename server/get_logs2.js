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
  console.log("Audit logs:");
  let r1 = await pool.query("SELECT created_at FROM audit_logs WHERE action='BROADCAST_NOTIFICATION_SENT' ORDER BY created_at DESC LIMIT 3");
  console.log(r1.rows);
  console.log("Communication logs:");
  let r2 = await pool.query("SELECT created_at FROM communication_logs WHERE type='broadcast' ORDER BY created_at DESC LIMIT 3");
  console.log(r2.rows);
  pool.end();
}
run();

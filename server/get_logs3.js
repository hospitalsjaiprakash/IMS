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
  let r = await pool.query("SELECT action, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 5");
  console.log(r.rows);
  pool.end();
}
run();

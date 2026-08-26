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

async function check() {
  try {
    let r = await pool.query("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'communication_logs'");
    console.log("communication_logs", r.rows);
    let r2 = await pool.query("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'attachments'");
    console.log("attachments", r2.rows);
  } finally {
    pool.end();
  }
}
check();

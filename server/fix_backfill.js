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
  const result = await pool.query("SELECT message FROM notifications WHERE title='welcome' LIMIT 1");
  if (result.rows.length > 0) {
    const message = result.rows[0].message;
    await pool.query("UPDATE communication_logs SET content=$1 WHERE subject='welcome'", [message]);
    console.log("Updated message successfully.");
  }
  pool.end();
}
run();

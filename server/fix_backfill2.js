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
  const result = await pool.query("SELECT attachment_url, attachment_name FROM notifications WHERE title='welcome' AND attachment_url IS NOT NULL LIMIT 1");
  if (result.rows.length > 0) {
    const url = result.rows[0].attachment_url;
    const name = result.rows[0].attachment_name;
    
    // update communication logs details
    const cl = await pool.query("SELECT details FROM communication_logs WHERE subject='welcome' LIMIT 1");
    if (cl.rows.length > 0) {
      const details = cl.rows[0].details || {};
      details.attachmentUrl = url;
      details.attachmentName = name;
      await pool.query("UPDATE communication_logs SET details=$1 WHERE subject='welcome'", [JSON.stringify(details)]);
      console.log("Updated details with attachment URL:", url);
    }
  }
  pool.end();
}
run();

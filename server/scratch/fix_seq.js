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

async function main() {
  try {
    // 1. Fix the first one that had seq_number 9999
    await pool.query("UPDATE incidents SET seq_number = 1 WHERE reference_id = 'JPHRC/IMS/2026/0001'");
    console.log("Updated seq_number to 1 for JPHRC/IMS/2026/0001");

    // 2. Fix the one that generated as 10000
    await pool.query("UPDATE incidents SET seq_number = 2, reference_id = 'JPHRC/IMS/2026/0002' WHERE reference_id = 'JPHRC/IMS/2026/10000'");
    console.log("Updated JPHRC/IMS/2026/10000 to JPHRC/IMS/2026/0002 with seq_number 2");
    
    // Check results
    const result = await pool.query("SELECT reference_id, seq_number FROM incidents ORDER BY seq_number DESC LIMIT 5");
    console.log("Current max sequence numbers:", result.rows);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

main();

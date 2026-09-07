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
  const result = await pool.query('SELECT id, reference_id, seq_number, year FROM incidents ORDER BY seq_number DESC LIMIT 5');
  console.log(result.rows);
  process.exit(0);
}

main().catch(console.error);

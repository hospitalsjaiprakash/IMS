require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function run() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'jaiprakash_ims',
    user: process.env.DB_USER || 'ims_app_user',
    password: process.env.DB_PASSWORD,
  });

  try {
    const sql = fs.readFileSync(path.join(__dirname, 'migrations', '010_communication_logs.sql'), 'utf8');
    await pool.query(sql);
    console.log('Migration 010_communication_logs applied successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await pool.end();
  }
}
run();

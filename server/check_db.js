require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  try {
    console.log("Running migration...");
    await pool.query(`
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS attachment_url VARCHAR(255);
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS attachment_name VARCHAR(255);
    `);
    console.log("Migration successful!");
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
migrate();

const fs = require('fs');
const path = require('path');
const { query } = require('./config/database');

async function run() {
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'migrations', '009_user_deactivation.sql'), 'utf8');
    await query(sql);
    console.log('Migration 009 applied successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

run();

/**
 * JPHRC IMS - CLI HRMS Google Sheets Sync Script
 * Usage: node scripts/sync-hrms.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { syncEmployeesFromHrms } = require('../services/hrmsSyncService');

async function main() {
  try {
    console.log('--- Initializing HRMS Google Sheets Sync ---');
    const result = await syncEmployeesFromHrms();
    console.log('Sync Result:', JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('HRMS Sync failed:', err);
    process.exit(1);
  }
}

main();

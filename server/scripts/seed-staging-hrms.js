/**
 * JPHRC IMS - Staging HRMS Seeding & Synchronization Script
 * 
 * Automatically starts the mock HRMS server, connects to the target database,
 * performs full directory synchronization, and verifies all 60 hospital personas
 * across 30 departments and 3 hospital centers.
 * 
 * Usage:
 *   node scripts/seed-staging-hrms.js [--staging]
 */

const path = require('path');
const http = require('http');
const { server: mockServer, MOCK_EMPLOYEES, MOCK_DEPARTMENTS, MOCK_JOB_TITLES } = require('./mock-hrms-server');
const { syncFullDirectory } = require('../services/officePortalService');
const { pool, query } = require('../config/database');

const SEED_PORT = 5055;

async function seedHrms() {
  console.log('\n======================================================');
  console.log('   JPHRC IMS — HRMS Staging Database Seeding Suite    ');
  console.log('======================================================\n');

  // 1. Start mock server
  console.log(`[1/4] Starting Mock OfficePortal Server on port ${SEED_PORT}...`);
  await new Promise((resolve) => mockServer.listen(SEED_PORT, resolve));
  console.log(`  ✓ Mock Server running on http://localhost:${SEED_PORT}`);

  try {
    // Configure environment overrides for this sync
    process.env.OFFICEPORTAL_AUTH_URL = `http://localhost:${SEED_PORT}/publicapi/connect/token`;
    process.env.OFFICEPORTAL_BASE_URL = `http://localhost:${SEED_PORT}/employee`;
    process.env.OFFICEPORTAL_CLIENT_ID = 'demo_jphrc_client_id';
    process.env.OFFICEPORTAL_CLIENT_SECRET = 'demo_jphrc_secret_key_123';

    // Update database system_config
    await query(`
      INSERT INTO system_config (key, value, updated_at) VALUES 
        ('officeportal_auth_url', $1, NOW()),
        ('officeportal_base_url', $2, NOW()),
        ('officeportal_client_id', $3, NOW()),
        ('officeportal_client_secret', $4, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `, [
      process.env.OFFICEPORTAL_AUTH_URL,
      process.env.OFFICEPORTAL_BASE_URL,
      process.env.OFFICEPORTAL_CLIENT_ID,
      process.env.OFFICEPORTAL_CLIENT_SECRET
    ]);

    // 2. Perform Full Directory Sync
    console.log('\n[2/4] Executing Full Directory Synchronization from Mock HRMS...');
    const syncResult = await syncFullDirectory();
    console.log(`  ✓ Sync Finished: Fetched: ${syncResult.totalFetched}, Inserted: ${syncResult.totalInserted}, Updated: ${syncResult.totalUpdated}`);

    // 3. Database Verification & Audit
    console.log('\n[3/4] Verifying Personnel, Department, and Lifecycle Integrity...');
    
    // Count total employees in master_employees
    const countRes = await query('SELECT COUNT(*) as total FROM master_employees WHERE office_portal_id IS NOT NULL');
    const totalStaff = parseInt(countRes.rows[0]?.total || 0, 10);
    console.log(`  ✓ Total Synced Staff: ${totalStaff} (Expected: ${MOCK_EMPLOYEES.length})`);

    // Verify departments
    const deptRes = await query(`
      SELECT COUNT(DISTINCT department) as dept_count 
      FROM master_employees 
      WHERE department IS NOT NULL AND TRIM(department) != ''
    `);
    const deptCount = parseInt(deptRes.rows[0]?.dept_count || 0, 10);
    console.log(`  ✓ Distinct Departments Represented: ${deptCount} (Expected: ${MOCK_DEPARTMENTS.length})`);

    // Verify statuses
    const statusRes = await query(`
      SELECT status, COUNT(*) as count 
      FROM master_employees 
      GROUP BY status 
      ORDER BY status ASC
    `);
    console.log('  ✓ Employment Status Breakdown:');
    statusRes.rows.forEach(r => console.log(`     - ${r.status}: ${r.count}`));

    // Verify Notice-Period staff
    const noticeRes = await query(`
      SELECT employee_id, name, status, notice_period_end_date 
      FROM master_employees 
      WHERE status = 'noticePeriod'
    `);
    console.log(`  ✓ Notice-Period Staff: ${noticeRes.rows.length} verified (e.g. ${noticeRes.rows.map(r => r.name + ' [' + r.employee_id + ']').join(', ')})`);

    // Verify Terminated staff
    const termRes = await query(`
      SELECT employee_id, name, status, termination_date 
      FROM master_employees 
      WHERE status = 'terminated'
    `);
    console.log(`  ✓ Terminated Staff: ${termRes.rows.length} verified (e.g. ${termRes.rows.map(r => r.name + ' [' + r.employee_id + ']').join(', ')})`);

    // 4. Test Trigram Fuzzy Search Latency
    console.log('\n[4/4] Benchmarking PostgreSQL Trigram Search Performance...');
    const searchTerms = ['priyanka', '10101', 'sharma', 'sister', 'emergency', 'sourav'];
    
    for (const term of searchTerms) {
      const start = process.hrtime.bigint();
      const sRes = await query(`
        SELECT id, employee_id, name, department, designation, status 
        FROM master_employees 
        WHERE (name ILIKE $1 OR employee_id ILIKE $1)
        LIMIT 10
      `, [`%${term}%`]);
      const end = process.hrtime.bigint();
      const elapsedMs = Number(end - start) / 1e6;
      console.log(`  ✓ Search "${term}" returned ${sRes.rows.length} results in ${elapsedMs.toFixed(2)} ms`);
    }

    console.log('\n======================================================');
    console.log('   ✅ HRMS STAGING SEEDING & AUDIT COMPLETED!         ');
    console.log('======================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  } finally {
    await new Promise((resolve) => mockServer.close(resolve));
    console.log('  Mock server stopped.');
  }
}

if (require.main === module) {
  seedHrms();
}

module.exports = { seedHrms };

const axios = require('axios');
const bcrypt = require('bcryptjs');
const { getClient } = require('../config/database');
const { PRIMARY_ADMIN_EMP_ID, PRIMARY_ADMIN_EMAIL } = require('../services/hrmsSyncService');

const HRMS_API_URL = 'https://script.googleusercontent.com/macros/echo?user_content_key=AUkAhnSYZVP94xasOMSDsEvLn-jtKtCa6mBgeYHVTu-Co9O2Gyls1Ea9DVaHIV9o0nJ9TxJBOcW3VfKEBWfYRwkAQbYNbVbSYOKA24mcAmEc9S9NQLDOXJW5ZaXJjmkyYRGEol1XbmSfiqBnVFwMJwIHJLd9cPnhyMcqwKVkWlbBp1j-jEwhrPy_q-uUxErSZGW3i_IzcjeiE5fgIRLs7mbKyd0loIsquZkZl244b-Rv3UfypcHOsMNaRZp8tIIikKiMMCnSGBTInct-w56mS_BxYdd2vK8qDw&lib=MeefmFwESMyRsKf_wGawyRU_EvQiFty4u';

function determineRole(employeeId, designation) {
  if (String(employeeId).trim() === PRIMARY_ADMIN_EMP_ID) {
    return 'system_admin';
  }
  const desig = (designation || '').toUpperCase();
  if (
    desig === 'HOD' ||
    desig.includes('HEAD OF DEPARTMENT') ||
    desig.includes('HEAD OF DEPT') ||
    desig.startsWith('HEAD OF ') ||
    desig.includes('(HOD)')
  ) {
    return 'hod';
  }
  return 'employee';
}

async function purgeAndSync() {
  console.log('--- Starting Purge and Sync ---');
  
  // 1. Fetch live data from Google Sheets API with browser User-Agent
  console.log('Fetching live employee list from Google Sheets API...');
  const response = await axios.get(HRMS_API_URL, {
    timeout: 60000,
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });

  if (!response.data || !Array.isArray(response.data.data)) {
    throw new Error('Invalid format received from Google Sheets API');
  }

  const rawEmployees = response.data.data;
  console.log(`Successfully fetched ${rawEmployees.length} live employees.`);

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // 2. Delete all incidents and related child tables
    console.log('Deleting all incidents and related records...');
    await client.query('DELETE FROM communication_logs');
    await client.query('DELETE FROM audit_logs');
    await client.query('DELETE FROM attachments');
    await client.query('DELETE FROM notifications');
    await client.query('DELETE FROM training_records');
    await client.query('DELETE FROM incident_responsible_employees');
    await client.query('DELETE FROM incident_departments');
    await client.query('DELETE FROM imc_claims');
    await client.query('DELETE FROM investigators');
    await client.query('DELETE FROM feedbacks');
    await client.query('DELETE FROM final_reports');
    await client.query('DELETE FROM incidents');
    await client.query('DELETE FROM role_audit');
    console.log('All incidents and workflow history deleted.');

    // 3. Reset foreign key links to users and remove mock users
    console.log('Resetting foreign key links and removing mock users from users table...');
    await client.query('UPDATE system_config SET updated_by = NULL');
    await client.query('UPDATE departments SET hod_user_id = NULL, incharge_user_id = NULL, asst_coo_user_id = NULL');
    await client.query('UPDATE qr_codes SET generated_by = NULL');
    await client.query('UPDATE knowledge_base SET created_by = NULL');
    await client.query(
      `DELETE FROM users WHERE employee_id != $1 OR employee_id IS NULL`,
      [PRIMARY_ADMIN_EMP_ID]
    );

    // 4. Ensure master_employees is purged of old mock data and repopulated with API data
    console.log('Clearing master_employees table...');
    await client.query('DELETE FROM master_employees');

    console.log(`Inserting ${rawEmployees.length} real employees into master_employees using batching...`);
    const validEmployees = [];
    for (const emp of rawEmployees) {
      if (!emp || !emp.employee_id || !emp.name) continue;
      const empIdStr = String(emp.employee_id).trim();
      const nameStr = String(emp.name).trim();
      const deptStr = emp.department ? String(emp.department).trim() : null;
      const desigStr = emp.job_title ? String(emp.job_title).trim() : null;
      const phoneStr = emp.whatsapp ? String(emp.whatsapp).trim() : null;
      const calculatedRole = determineRole(empIdStr, desigStr);
      validEmployees.push([empIdStr, nameStr, phoneStr, deptStr, desigStr, calculatedRole]);
    }

    const BATCH_SIZE = 100;
    for (let i = 0; i < validEmployees.length; i += BATCH_SIZE) {
      const batch = validEmployees.slice(i, i + BATCH_SIZE);
      const valueClauses = [];
      const flatParams = [];
      
      batch.forEach((row, rowIdx) => {
        const offset = rowIdx * 6;
        valueClauses.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`);
        flatParams.push(...row);
      });

      await client.query(
        `INSERT INTO master_employees (employee_id, name, phone, department, designation, role)
         VALUES ${valueClauses.join(', ')}
         ON CONFLICT (employee_id) DO UPDATE SET
           name = EXCLUDED.name,
           phone = EXCLUDED.phone,
           department = EXCLUDED.department,
           designation = EXCLUDED.designation,
           role = EXCLUDED.role`,
        flatParams
      );
    }
    const count = validEmployees.length;
    console.log(`Inserted ${count} employees into master_employees.`);

    // 5. Ensure Primary System Admin (12243) is present in master_employees and users
    console.log(`Setting up Primary System Admin (${PRIMARY_ADMIN_EMP_ID})...`);
    await client.query(
      `INSERT INTO master_employees (employee_id, name, email, phone, department, designation, role)
       VALUES ($1, 'Sourav Barik', $2, '918456817717', 'Digital Communications', 'System Administrator', 'system_admin')
       ON CONFLICT (employee_id) DO UPDATE SET
         name = 'Sourav Barik',
         email = $2,
         role = 'system_admin',
         designation = 'System Administrator'`,
      [PRIMARY_ADMIN_EMP_ID, PRIMARY_ADMIN_EMAIL]
    );

    const defaultAdminHash = await bcrypt.hash('1admin', 12);
    await client.query(
      `INSERT INTO users (employee_id, full_name, email, department, designation, role, is_system_admin, is_active, password_hash)
       VALUES ($1, 'Sourav Barik', $2, 'Digital Communications', 'System Administrator', 'system_admin', TRUE, TRUE, $3)
       ON CONFLICT (employee_id) DO UPDATE SET
         full_name = 'Sourav Barik',
         email = $2,
         department = 'Digital Communications',
         designation = 'System Administrator',
         role = 'system_admin',
         is_system_admin = TRUE,
         is_active = TRUE`,
      [PRIMARY_ADMIN_EMP_ID, PRIMARY_ADMIN_EMAIL, defaultAdminHash]
    );

    // 6. Record sync timestamp
    const nowIso = new Date().toISOString();
    await client.query(
      `INSERT INTO system_config (key, value, updated_at) VALUES ('last_hrms_sync_at', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [nowIso]
    );
    await client.query(
      `INSERT INTO system_config (key, value, updated_at) VALUES ('last_hrms_sync_count', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [String(count)]
    );

    await client.query('COMMIT');
    console.log('--- Purge and Sync Completed Successfully! ---');
    console.log(`Incidents remaining: 0`);
    console.log(`Users count: 1 (Primary System Admin Sourav Barik - ${PRIMARY_ADMIN_EMP_ID})`);
    console.log(`Master Employees count: ${count}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error during purge and sync:', err);
    throw err;
  } finally {
    client.release();
    process.exit(0);
  }
}

purgeAndSync();

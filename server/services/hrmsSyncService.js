const axios = require('axios');
const bcrypt = require('bcryptjs');
const { query, getClient } = require('../config/database');

const DEFAULT_HRMS_SHEET_URL =
  process.env.HRMS_SHEET_API_URL ||
  'https://script.googleusercontent.com/macros/echo?user_content_key=AUkAhnSYZVP94xasOMSDsEvLn-jtKtCa6mBgeYHVTu-Co9O2Gyls1Ea9DVaHIV9o0nJ9TxJBOcW3VfKEBWfYRwkAQbYNbVbSYOKA24mcAmEc9S9NQLDOXJW5ZaXJjmkyYRGEol1XbmSfiqBnVFwMJwIHJLd9cPnhyMcqwKVkWlbBp1j-jEwhrPy_q-uUxErSZGW3i_IzcjeiE5fgIRLs7mbKyd0loIsquZkZl244b-Rv3UfypcHOsMNaRZp8tIIikKiMMCnSGBTInct-w56mS_BxYdd2vK8qDw&lib=MeefmFwESMyRsKf_wGawyRU_EvQiFty4u';

const PRIMARY_ADMIN_EMP_ID = '12243';
const PRIMARY_ADMIN_EMAIL = 'hospitalsjaiprakash@gmail.com';

/**
 * Determine initial role based on designation or primary admin ID
 */
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

/**
 * Fetch and sync all employees from the Google Sheets API into master_employees
 */
async function syncEmployeesFromHrms(overrideUrl = null) {
  const syncStartTime = new Date();
  
  // Check system_config for dynamically configured URL if overrideUrl not provided
  let targetUrl = overrideUrl || process.env.HRMS_SHEET_API_URL;
  if (!targetUrl) {
    try {
      const cfgRes = await query(`SELECT value FROM system_config WHERE key = 'hrms_sheet_url'`);
      if (cfgRes.rows[0]?.value) {
        targetUrl = cfgRes.rows[0].value.trim();
      }
    } catch (e) {
      // Ignore config table lookup failure
    }
  }
  if (!targetUrl) {
    targetUrl = DEFAULT_HRMS_SHEET_URL;
  }

  console.log(`[HRMS Sync] Starting sync from Google Sheets API at ${syncStartTime.toISOString()}...`);
  console.log(`[HRMS Sync] Target URL: ${targetUrl.substring(0, 80)}...`);

  let response;
  try {
    response = await axios.get(targetUrl, {
      timeout: 60000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      maxRedirects: 5
    });
  } catch (err) {
    if (err.response?.status === 404 && targetUrl.includes('/macros/echo')) {
      throw new Error(
        'The Google Apps Script URL appears to be an expired temporary redirect URL (/macros/echo). ' +
        'Please provide the permanent Web App URL ending with /exec (e.g. https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec) with access set to "Anyone".'
      );
    }
    throw new Error(`Failed to fetch from Google Sheets API: ${err.message}`);
  }

  if (!response.data || (!Array.isArray(response.data.data) && !Array.isArray(response.data))) {
    throw new Error('Invalid response format received from HRMS Google Sheets API. Expected JSON with an array of employees.');
  }

  const rawEmployees = Array.isArray(response.data.data) ? response.data.data : response.data;
  console.log(`[HRMS Sync] Received ${rawEmployees.length} employee records from API.`);

  const client = await getClient();
  let insertedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  try {
    await client.query('BEGIN');

    const validEmployees = [];
    for (const emp of rawEmployees) {
      if (!emp || !emp.employee_id || !emp.name) {
        skippedCount++;
        continue;
      }

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
           phone = COALESCE(NULLIF(EXCLUDED.phone, ''), master_employees.phone),
           department = COALESCE(EXCLUDED.department, master_employees.department),
           designation = COALESCE(EXCLUDED.designation, master_employees.designation),
           role = CASE 
             WHEN master_employees.role = 'system_admin' THEN 'system_admin'
             WHEN EXCLUDED.role = 'system_admin' THEN 'system_admin'
             ELSE EXCLUDED.role
           END`,
        flatParams
      );
    }
    insertedCount = validEmployees.length;

    // Ensure primary system admin (12243) is set up with email and admin flag
    const adminCheck = await client.query(
      `SELECT id, password_hash, email FROM users WHERE employee_id = $1`,
      [PRIMARY_ADMIN_EMP_ID]
    );

    if (adminCheck.rows.length === 0) {
      // Create user account for admin if not already present
      const defaultHash = await bcrypt.hash('1admin', 12);
      await client.query(
        `INSERT INTO users (employee_id, full_name, email, department, designation, role, is_system_admin, is_active, password_hash)
         VALUES ($1, 'Sourav Barik', $2, 'Digital Communications', 'System Administrator', 'system_admin', TRUE, TRUE, $3)
         ON CONFLICT (employee_id) DO UPDATE SET
           email = $2,
           role = 'system_admin',
           is_system_admin = TRUE,
           is_active = TRUE`,
        [PRIMARY_ADMIN_EMP_ID, PRIMARY_ADMIN_EMAIL, defaultHash]
      );
      console.log(`[HRMS Sync] Created primary System Admin user (Emp ID: ${PRIMARY_ADMIN_EMP_ID}).`);
    } else {
      // Ensure email and system_admin flags are intact
      await client.query(
        `UPDATE users SET 
           email = COALESCE(NULLIF($2, ''), email),
           role = 'system_admin',
           is_system_admin = TRUE,
           is_active = TRUE,
           updated_at = NOW()
         WHERE employee_id = $1`,
        [PRIMARY_ADMIN_EMP_ID, PRIMARY_ADMIN_EMAIL]
      );
    }

    // Record last sync metadata in system_config
    const syncTimeStr = syncStartTime.toISOString();
    await client.query(
      `INSERT INTO system_config (key, value, updated_at)
       VALUES ('last_hrms_sync_at', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [syncTimeStr]
    );
    await client.query(
      `INSERT INTO system_config (key, value, updated_at)
       VALUES ('last_hrms_sync_count', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [String(rawEmployees.length)]
    );

    await client.query('COMMIT');
    console.log(`[HRMS Sync] Successfully completed. Inserted: ${insertedCount}, Updated: ${updatedCount}, Skipped: ${skippedCount}`);

    return {
      success: true,
      totalFetched: rawEmployees.length,
      insertedCount,
      updatedCount,
      skippedCount,
      syncedAt: syncTimeStr
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[HRMS Sync] Error during employee sync:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get the latest sync status information
 */
async function getHrmsSyncStatus() {
  const result = await query(
    `SELECT key, value FROM system_config WHERE key IN ('last_hrms_sync_at', 'last_hrms_sync_count')`
  );
  const status = {};
  result.rows.forEach(r => { status[r.key] = r.value; });

  const totalEmployeesRes = await query('SELECT COUNT(*) FROM master_employees');
  status.totalInMaster = parseInt(totalEmployeesRes.rows[0]?.count || '0', 10);

  return status;
}

module.exports = {
  syncEmployeesFromHrms,
  getHrmsSyncStatus,
  PRIMARY_ADMIN_EMP_ID,
  PRIMARY_ADMIN_EMAIL
};

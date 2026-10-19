/**
 * OfficePortal HRMS Public API v1 Integration Service
 * 
 * Features:
 * - OAuth 2.0 client credentials token management with proactive in-memory caching
 * - Cryptographic HMAC-SHA256 signature verification for incoming webhooks
 * - Replay drift defense (300 seconds tolerance)
 * - Full directory synchronization (GET /api/v1/employees)
 * - Cursor-based incremental delta synchronization (GET /api/v1/employees/changes)
 * - Non-cascading lifecycle synchronization (active, noticePeriod, terminated)
 */

const axios = require('axios');
const { createHmac, timingSafeEqual } = require('node:crypto');
const { query, getClient } = require('../config/database');

// Default Endpoints & Configuration
const DEFAULT_AUTH_URL = 'https://accounts.awarious.com/publicapi/connect/token';
const DEFAULT_BASE_URL = 'https://publicapi.officeportal.io/employee';
const TOLERANCE_SECONDS = 300; // 5 minutes

// In-Memory Token Cache
let cachedToken = null;
let tokenExpiresAt = 0; // Unix timestamp in seconds
let tokenLockPromise = null;

/**
 * Get configured OfficePortal settings from environment or database system_config
 */
async function getConfig() {
  let dbConfig = {};
  try {
    const res = await query(`SELECT key, value FROM system_config WHERE key LIKE 'officeportal_%'`);
    for (const row of res.rows) {
      dbConfig[row.key] = row.value;
    }
  } catch (e) {
    // system_config query failure is non-fatal
  }

  return {
    authUrl: process.env.OFFICEPORTAL_AUTH_URL || dbConfig['officeportal_auth_url'] || DEFAULT_AUTH_URL,
    baseUrl: process.env.OFFICEPORTAL_BASE_URL || dbConfig['officeportal_base_url'] || DEFAULT_BASE_URL,
    clientId: process.env.OFFICEPORTAL_CLIENT_ID || dbConfig['officeportal_client_id'] || '',
    clientSecret: process.env.OFFICEPORTAL_CLIENT_SECRET || process.env.OFFICEPORTAL_API_KEY || dbConfig['officeportal_client_secret'] || '',
    webhookSecret: process.env.OFFICEPORTAL_WEBHOOK_KEY || process.env.OFFICEPORTAL_WEBHOOK_SECRET || dbConfig['officeportal_webhook_secret'] || '',
    webhookSecretPrevious: process.env.OFFICEPORTAL_WEBHOOK_KEY_PREVIOUS || dbConfig['officeportal_webhook_secret_previous'] || '',
  };
}

/**
 * Validate incoming webhook signature (X-Awarious-Signature)
 * Spec: t=timestamp,v1=signature
 * HMAC-SHA256 of `${t}.${rawBody}` using UTF-8 secret key
 * 
 * @param {string} header X-Awarious-Signature header string
 * @param {Buffer} rawBody Unparsed request buffer
 * @param {string[]} keys Array of secret keys (current and previous)
 * @param {number} nowSeconds Optional current Unix timestamp in seconds (for test vectors)
 * @returns {boolean}
 */
function isValidSignature(header, rawBody, keys, nowSeconds = Date.now() / 1000) {
  if (!header || !rawBody || !keys || keys.length === 0) {
    return false;
  }

  let timestamp = null;
  const signatures = [];

  for (const part of header.split(',')) {
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();

    if (name === 't' && /^\d+$/.test(value)) {
      timestamp = value;
    } else if (name === 'v1' && value) {
      signatures.push(Buffer.from(value, 'utf8'));
    }
  }

  if (timestamp === null || signatures.length === 0) {
    return false;
  }

  // Check 5-minute replay window tolerance
  if (Math.abs(nowSeconds - Number(timestamp)) > TOLERANCE_SECONDS) {
    return false;
  }

  // Signed payload is timestamp + "." + rawBody exactly as received
  const signedPayload = Buffer.concat([Buffer.from(`${timestamp}.`, 'utf8'), rawBody]);

  let valid = false;
  for (const key of keys) {
    if (!key) continue;
    const expected = Buffer.from(createHmac('sha256', key).update(signedPayload).digest('hex'), 'utf8');
    for (const signature of signatures) {
      if (signature.length === expected.length && timingSafeEqual(signature, expected)) {
        valid = true;
      }
    }
  }

  return valid;
}

/**
 * Fetch OAuth 2.0 access token with in-memory caching and proactive renewal
 */
async function getAccessToken(forceRefresh = false) {
  const now = Math.floor(Date.now() / 1000);

  // Return cached token if still valid for at least 180s (3 minutes)
  if (!forceRefresh && cachedToken && (tokenExpiresAt - now) > 180) {
    return cachedToken;
  }

  // Mutex lock to prevent duplicate concurrent requests under load
  if (tokenLockPromise) {
    return tokenLockPromise;
  }

  tokenLockPromise = (async () => {
    try {
      const config = await getConfig();
      if (!config.clientId || !config.clientSecret) {
        throw new Error('OfficePortal client_id or client_secret not configured.');
      }

      const params = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        scope: 'emp:read'
      });

      const res = await axios.post(config.authUrl, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        timeout: 30000
      });

      if (!res.data || !res.data.access_token) {
        throw new Error('Invalid token response received from OfficePortal auth server.');
      }

      cachedToken = res.data.access_token;
      const expiresIn = res.data.expires_in || 900;
      tokenExpiresAt = Math.floor(Date.now() / 1000) + expiresIn;

      return cachedToken;
    } finally {
      tokenLockPromise = null;
    }
  })();

  return tokenLockPromise;
}

/**
 * Upsert a single employee record from OfficePortal payload into master_employees
 */
async function upsertMasterEmployee(client, emp) {
  const portalId = emp.employeeId || null;
  const empCode = String(emp.employeeCode || emp.employee_id || '').trim();
  const firstName = emp.firstName || emp.first_name || '';
  const lastName = emp.lastName || emp.last_name || '';
  const fullName = emp.fullName || emp.name || `${firstName} ${lastName}`.trim() || empCode;
  const email = emp.workEmail || emp.email || null;
  const phone = emp.mobileNumber || emp.phone || null;
  const department = emp.departmentName || emp.department || 'General';
  const designation = emp.jobTitleName || emp.designation || 'Staff';
  const location = emp.officeLocationName || emp.office_location || null;
  const status = (emp.status && ['active', 'noticePeriod', 'terminated'].includes(emp.status)) 
    ? emp.status 
    : 'active';
  const dateOfJoining = emp.dateOfJoining ? new Date(emp.dateOfJoining) : null;
  const terminationDate = emp.terminationDate ? new Date(emp.terminationDate) : null;

  if (!empCode) {
    return { skipped: true, reason: 'Missing employee code' };
  }

  const res = await client.query(`
    INSERT INTO master_employees (
      office_portal_id, employee_id, name, first_name, last_name,
      email, phone, department, designation, office_location,
      status, date_of_joining, termination_date, raw_payload, synced_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9, $10,
      $11, $12, $13, $14, NOW(), NOW()
    )
    ON CONFLICT (employee_id) DO UPDATE SET
      office_portal_id = COALESCE(EXCLUDED.office_portal_id, master_employees.office_portal_id),
      name = EXCLUDED.name,
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      email = COALESCE(EXCLUDED.email, master_employees.email),
      phone = COALESCE(EXCLUDED.phone, master_employees.phone),
      department = COALESCE(EXCLUDED.department, master_employees.department),
      designation = COALESCE(EXCLUDED.designation, master_employees.designation),
      office_location = COALESCE(EXCLUDED.office_location, master_employees.office_location),
      status = EXCLUDED.status,
      date_of_joining = COALESCE(EXCLUDED.date_of_joining, master_employees.date_of_joining),
      termination_date = EXCLUDED.termination_date,
      raw_payload = EXCLUDED.raw_payload,
      synced_at = NOW(),
      updated_at = NOW()
    RETURNING id, (xmax = 0) AS is_inserted
  `, [
    portalId, empCode, fullName, firstName, lastName,
    email, phone, department, designation, location,
    status, dateOfJoining, terminationDate, JSON.stringify(emp)
  ]);

  const isInserted = res.rows[0]?.is_inserted;

  // Lifecycle check: if employee is terminated, deactivate their users table account
  if (status === 'terminated') {
    await client.query(`
      UPDATE users 
      SET is_active = false, updated_at = NOW() 
      WHERE employee_id = $1
    `, [empCode]).catch(() => {});
  }

  return { isInserted };
}

/**
 * Perform a full directory synchronization against OfficePortal GET /api/v1/employees
 */
async function syncFullDirectory() {
  const token = await getAccessToken();
  const config = await getConfig();
  const client = await getClient();

  const syncLogRes = await client.query(`
    INSERT INTO hrms_sync_logs (sync_type, status, started_at)
    VALUES ('full', 'IN_PROGRESS', NOW())
    RETURNING id
  `);
  const logId = syncLogRes.rows[0]?.id;

  let page = 1;
  const perPage = 100;
  let totalFetched = 0;
  let totalInserted = 0;
  let totalUpdated = 0;

  try {
    while (true) {
      const url = `${config.baseUrl}/api/v1/employees`;
      const res = await axios.get(url, {
        params: { page, perPage },
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        },
        timeout: 60000
      });

      const data = res.data?.data || (Array.isArray(res.data) ? res.data : []);
      if (data.length === 0) break;

      totalFetched += data.length;

      await client.query('BEGIN');
      for (const emp of data) {
        const result = await upsertMasterEmployee(client, emp);
        if (result.isInserted) totalInserted++;
        else totalUpdated++;
      }
      await client.query('COMMIT');

      const pagination = res.data?.pagination;
      if (pagination && page >= pagination.totalPages) {
        break;
      }
      page++;
    }

    await client.query(`
      UPDATE hrms_sync_logs
      SET status = 'SUCCESS',
          records_fetched = $1,
          records_inserted = $2,
          records_updated = $3,
          completed_at = NOW()
      WHERE id = $4
    `, [totalFetched, totalInserted, totalUpdated, logId]);

    return { success: true, totalFetched, totalInserted, totalUpdated };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    await client.query(`
      UPDATE hrms_sync_logs
      SET status = 'FAILED', error_message = $1, completed_at = NOW()
      WHERE id = $2
    `, [err.message, logId]).catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Perform incremental delta synchronization via GET /api/v1/employees/changes
 */
async function syncDeltaChanges() {
  const token = await getAccessToken();
  const config = await getConfig();
  const client = await getClient();

  // Find last saved cursor checkpoint
  const lastLogRes = await client.query(`
    SELECT delta_cursor FROM hrms_sync_logs 
    WHERE delta_cursor IS NOT NULL AND status = 'SUCCESS'
    ORDER BY id DESC LIMIT 1
  `);
  let cursor = lastLogRes.rows[0]?.delta_cursor || null;

  const syncLogRes = await client.query(`
    INSERT INTO hrms_sync_logs (sync_type, delta_cursor, status, started_at)
    VALUES ('delta', $1, 'IN_PROGRESS', NOW())
    RETURNING id
  `, [cursor]);
  const logId = syncLogRes.rows[0]?.id;

  let totalFetched = 0;
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalDeactivated = 0;

  try {
    let nextCursor = cursor;

    while (true) {
      const params = {};
      if (nextCursor) {
        params.token = nextCursor;
      } else {
        params.updatedAfter = '2000-01-01T00:00:00Z';
      }

      const url = `${config.baseUrl}/api/v1/employees/changes`;
      const res = await axios.get(url, {
        params,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        },
        timeout: 60000
      });

      const changes = res.data?.data || res.data?.changes || [];
      if (changes.length === 0) break;

      totalFetched += changes.length;

      await client.query('BEGIN');
      for (const change of changes) {
        const changeType = change.changeType || (change.deleted ? 'deleted' : 'upserted');
        const emp = change.employee || change.data || change;

        if (changeType === 'deleted') {
          const empId = change.employeeId || emp.employeeId || emp.employeeCode;
          if (empId) {
            await client.query(`
              UPDATE master_employees 
              SET status = 'terminated', termination_date = COALESCE(termination_date, NOW()), updated_at = NOW()
              WHERE office_portal_id = $1 OR employee_id = $1
            `, [empId]);

            await client.query(`
              UPDATE users 
              SET is_active = false, updated_at = NOW() 
              WHERE employee_id = (SELECT employee_id FROM master_employees WHERE office_portal_id = $1 OR employee_id = $1)
            `, [empId]).catch(() => {});

            totalDeactivated++;
          }
        } else {
          const result = await upsertMasterEmployee(client, emp);
          if (result.isInserted) totalInserted++;
          else totalUpdated++;
        }
      }
      await client.query('COMMIT');

      nextCursor = res.data?.nextCursor || null;
      if (!nextCursor) break;
    }

    await client.query(`
      UPDATE hrms_sync_logs
      SET status = 'SUCCESS',
          delta_cursor = $1,
          records_fetched = $2,
          records_inserted = $3,
          records_updated = $4,
          records_deactivated = $5,
          completed_at = NOW()
      WHERE id = $6
    `, [nextCursor, totalFetched, totalInserted, totalUpdated, totalDeactivated, logId]);

    return { success: true, totalFetched, totalInserted, totalUpdated, totalDeactivated, nextCursor };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    await client.query(`
      UPDATE hrms_sync_logs
      SET status = 'FAILED', error_message = $1, completed_at = NOW()
      WHERE id = $2
    `, [err.message, logId]).catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Ingest incoming webhook push delivery, verify signature, log into hrms_webhook_events,
 * and asynchronously process events.
 */
async function handleWebhookDelivery(headerSignature, rawBody, parsedPayload) {
  const config = await getConfig();
  const keys = [config.webhookSecret, config.webhookSecretPrevious].filter(Boolean);

  const isVerified = isValidSignature(headerSignature, rawBody, keys);
  if (!isVerified) {
    const error = new Error('Invalid or expired webhook signature (X-Awarious-Signature).');
    error.statusCode = 401;
    throw error;
  }

  const events = parsedPayload?.events || [];
  const client = await getClient();

  try {
    for (const evt of events) {
      const eventId = evt.eventId || evt.id;
      const eventTypes = evt.types || ['employee.unknown'];
      const eventType = Array.isArray(eventTypes) ? eventTypes.join(',') : String(eventTypes);

      if (!eventId) continue;

      // Idempotent insertion: ignore duplicate event deliveries
      const insertRes = await client.query(`
        INSERT INTO hrms_webhook_events (event_id, event_type, payload, signature_verified, status, received_at)
        VALUES ($1, $2, $3, true, 'PENDING', NOW())
        ON CONFLICT (event_id) DO NOTHING
        RETURNING id
      `, [eventId, eventType, JSON.stringify(evt)]);

      const recordId = insertRes.rows[0]?.id;
      if (!recordId) {
        // Duplicate delivery already processed or pending
        continue;
      }

      // Process event payload asynchronously
      setImmediate(async () => {
        const processClient = await getClient();
        try {
          const emp = evt.data || {};
          const isDeleted = eventType.includes('deleted') || emp.deletedAt;

          if (isDeleted) {
            const portalId = emp.employeeId || null;
            const empCode = emp.employeeCode || null;
            await processClient.query(`
              UPDATE master_employees 
              SET status = 'terminated', termination_date = COALESCE(termination_date, NOW()), updated_at = NOW()
              WHERE office_portal_id = $1 OR employee_id = $2
            `, [portalId, empCode]);

            await processClient.query(`
              UPDATE users 
              SET is_active = false, updated_at = NOW() 
              WHERE employee_id = $1
            `, [empCode]).catch(() => {});
          } else {
            await upsertMasterEmployee(processClient, emp);
          }

          await processClient.query(`
            UPDATE hrms_webhook_events 
            SET status = 'PROCESSED', processed_at = NOW() 
            WHERE id = $1
          `, [recordId]);
        } catch (procErr) {
          await processClient.query(`
            UPDATE hrms_webhook_events 
            SET status = 'FAILED', error_message = $1 
            WHERE id = $2
          `, [procErr.message, recordId]).catch(() => {});
        } finally {
          processClient.release();
        }
      });
    }

    return { success: true, processedEvents: events.length };
  } finally {
    client.release();
  }
}

module.exports = {
  isValidSignature,
  getAccessToken,
  upsertMasterEmployee,
  syncFullDirectory,
  syncDeltaChanges,
  handleWebhookDelivery,
  getConfig
};

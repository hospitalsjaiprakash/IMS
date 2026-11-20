/**
 * OfficePortal HRMS Public API v1 Integration Service
 *
 * Implements the official OfficePortal Employee Public API v1 & Platform Guide (15 Oct 2026):
 * - OAuth 2.0 Client Credentials token management with 14-min cache, mutex lock & 401 1x retry
 * - Resilient HTTP wrapper with Retry-After (429), quota circuit breakers (429 daily / 402 / 403),
 *   exponential backoff with jitter on 5xx/timeouts, and strict Axios error sanitization
 * - Cryptographic HMAC-SHA256 webhook signature verification (X-Awarious-Signature, whsec_* keys, 300s tolerance)
 * - 100% API-driven Departments, Job Titles, and Employment Types master synchronization
 * - Change Feed cursor + changedAt checkpointing (params.cursor, 90-day reset) & LWW conflict resolution
 * - Sequential in-order webhook batch worker (up to 200 events/delivery, no pool exhaustion or race conditions)
 * - Calendar-date safe parsing (YYYY-MM-DD, no timezone shift) & lifecycle lockouts
 *   (terminated, inactive, deleted, portalAccessDisableDate <= today) with HOD vacancy alerts
 */

const axios = require('axios');
const { createHmac, timingSafeEqual } = require('node:crypto');
const { query, getClient } = require('../config/database');
const {
  SECRET_CONFIG_KEYS,
  encryptSecret,
  decryptSecret,
  assertAllowedOfficePortalUrl
} = require('../utils/secretCrypto');

// Default Endpoints & Constants
const DEFAULT_AUTH_URL = 'https://accounts.awarious.com/publicapi/connect/token';
const DEFAULT_BASE_URL = 'https://publicapi.officeportal.io/employee';
const ZERO_GUID = '00000000-0000-0000-0000-000000000000';
const TOLERANCE_SECONDS = 300; // 5 minutes
const TOKEN_REFRESH_BUFFER_SECONDS = 60; // Refresh 60s prior to 900s expiry
const MAX_RETRY_ATTEMPTS = 4;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const MASTER_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // Refresh master lists at most once per 24h during delta sync
const HOSPITAL_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Kolkata';
const VALID_STATUSES = new Set(['active', 'noticePeriod', 'terminated', 'inactive', 'deleted']);
const LOCKOUT_STATUSES = new Set(['terminated', 'inactive', 'deleted']);
const FATAL_API_ERROR_CODES = new Set([
  'CREDENTIALS_MISSING',
  'QUOTA_DAILY_EXCEEDED',
  'QUOTA_MONTHLY_EXCEEDED',
  'SAMPLE_DATA_ACCOUNT',
  'FORBIDDEN'
]);

// In-Memory Config Cache (60-second TTL so invalid webhooks do not query PostgreSQL)
const CONFIG_CACHE_TTL_MS = 60 * 1000;
let cachedConfig = null;
let configExpiresAt = 0;

// In-Memory Token Cache (L1 Cache)
let cachedToken = null;
let tokenExpiresAt = 0; // Unix timestamp in seconds
let tokenLockPromise = null;

// In-Memory Master Data Caches (L1 Cache)
let cachedDepartments = null;
let departmentsExpiresAt = 0;
let cachedJobTitles = null;
let jobTitlesExpiresAt = 0;
let cachedEmploymentTypes = null;
let employmentTypesExpiresAt = 0;

// Sequential webhook worker chain (ensures deliveries & events never race)
let webhookWorkerTail = Promise.resolve();

/**
 * Clear in-memory caches (called on credential updates or tests)
 */
function clearCaches() {
  cachedConfig = null;
  configExpiresAt = 0;
  cachedToken = null;
  tokenExpiresAt = 0;
  tokenLockPromise = null;
  cachedDepartments = null;
  departmentsExpiresAt = 0;
  cachedJobTitles = null;
  jobTitlesExpiresAt = 0;
  cachedEmploymentTypes = null;
  employmentTypesExpiresAt = 0;
}

/**
 * Wait for any background webhook processing queue to finish (useful for tests & graceful shutdown)
 */
function waitForWebhookDrain() {
  return webhookWorkerTail;
}

/**
 * Extract date-only YYYY-MM-DD from an OfficePortal calendar date string without timezone conversion.
 * Per Employee API Guide Section 4.4: never convert calendar dates to local time zone.
 */
function extractCalendarDate(val) {
  if (!val) return null;
  if (val instanceof Date && !isNaN(val.getTime())) {
    return val.toISOString().slice(0, 10);
  }
  const str = String(val).trim();
  const match = str.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

/**
 * Current hospital-local calendar date as YYYY-MM-DD (default: Asia/Kolkata, matching PostgreSQL CURRENT_DATE).
 * Prevents the 5.5-hour midnight IST vs UTC lockout gap on portalAccessDisableDate.
 */
function getTodayDateString(now = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: HOSPITAL_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(now);
  } catch (e) {
    return now.toISOString().slice(0, 10);
  }
}

/**
 * Execute a non-critical SQL block inside a PostgreSQL SAVEPOINT when running inside an open
 * transaction (so a SQL error never causes SQLSTATE 25P02 transaction abort), or fall back
 * cleanly to autocommit try/catch if called outside an explicit BEGIN...COMMIT block (25P01).
 */
async function runInSavepoint(client, spName, fn) {
  const safeSp = String(spName).replace(/[^a-zA-Z0-9_]/g, '_');
  let savepointActive = false;
  try {
    await client.query(`SAVEPOINT ${safeSp}`);
    savepointActive = true;
  } catch (spErr) {
    if (spErr?.code !== '25P01') {
      return { ok: false, error: spErr };
    }
  }

  try {
    const result = await fn();
    if (savepointActive) {
      await client.query(`RELEASE SAVEPOINT ${safeSp}`);
    }
    return { ok: true, result };
  } catch (err) {
    if (savepointActive) {
      await client.query(`ROLLBACK TO SAVEPOINT ${safeSp}`).catch(() => {});
      await client.query(`RELEASE SAVEPOINT ${safeSp}`).catch(() => {});
    }
    return { ok: false, error: err };
  }
}

/**
 * Check if a GUID value is valid and non-zero
 */
function normalizeGuid(val) {
  if (!val) return null;
  const s = String(val).trim();
  if (!s || s === ZERO_GUID) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
    return null;
  }
  return s.toLowerCase();
}

/**
 * Check whether an employee's HRMS lifecycle state requires account lockout
 */
function isEmployeeLockedOut(status, portalAccessDisableDate, now = new Date()) {
  if (LOCKOUT_STATUSES.has(status)) return true;
  const disableDate = extractCalendarDate(portalAccessDisableDate);
  if (disableDate && disableDate <= getTodayDateString(now)) return true;
  return false;
}

/**
 * Sanitize Axios/network errors so Authorization headers and client_secret never appear in logs or DB
 */
function sanitizeError(err, fallbackMessage = 'OfficePortal API request failed') {
  const status = err?.response?.status || err?.statusCode || null;
  const problem = err?.response?.data;
  let detail = '';

  if (problem && typeof problem === 'object') {
    detail = problem.title || problem.detail || problem.error_description || problem.error || '';
    if (problem.errors && typeof problem.errors === 'object') {
      const firstErrKey = Object.keys(problem.errors)[0];
      const firstErrMsg = Array.isArray(problem.errors[firstErrKey])
        ? problem.errors[firstErrKey][0]
        : problem.errors[firstErrKey];
      if (firstErrMsg) detail = detail ? `${detail}: ${firstErrMsg}` : String(firstErrMsg);
    }
  } else if (typeof problem === 'string' && problem.length < 300 && !problem.includes('<html')) {
    detail = problem.trim();
  }

  let message = detail || err?.message || fallbackMessage;
  // Redact any accidental bearer tokens or secrets
  message = String(message)
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/client_secret=[^&\s]+/gi, 'client_secret=[REDACTED]');

  const clean = new Error(status ? `OfficePortal HTTP ${status}: ${message}` : message);
  if (status) clean.statusCode = status;
  if (err?.code) clean.code = err.code;
  if (problem && typeof problem === 'object' && problem.title) {
    clean.problemTitle = problem.title;
  }
  return clean;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get configured OfficePortal settings from environment or database system_config
 * - Cached in memory for 60s (cleared immediately on setConfigValues / clearCaches)
 * - Transparently decrypts AES-256-GCM secret values stored in system_config
 */
async function getConfig(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedConfig && now < configExpiresAt) {
    return cachedConfig;
  }

  let dbConfig = {};
  try {
    const res = await query(`SELECT key, value FROM system_config WHERE key LIKE 'officeportal_%'`);
    for (const row of res.rows) {
      dbConfig[row.key] = row.value;
    }
  } catch (e) {
    // system_config query failure is non-fatal
  }

  // Decrypt secret rows outside the query try/catch so ciphertext tampering fails closed
  const rawDbClientSecret = dbConfig['officeportal_client_secret'] ? decryptSecret(dbConfig['officeportal_client_secret']) : '';
  const rawDbWebhookSecret = dbConfig['officeportal_webhook_secret'] ? decryptSecret(dbConfig['officeportal_webhook_secret']) : '';
  const rawDbWebhookSecretPrev = dbConfig['officeportal_webhook_secret_previous'] ? decryptSecret(dbConfig['officeportal_webhook_secret_previous']) : '';

  const baseUrl = (process.env.OFFICEPORTAL_BASE_URL || dbConfig['officeportal_base_url'] || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const authUrl = (process.env.OFFICEPORTAL_AUTH_URL || dbConfig['officeportal_auth_url'] || DEFAULT_AUTH_URL).trim();

  const resolved = {
    authUrl,
    baseUrl,
    clientId: (process.env.OFFICEPORTAL_CLIENT_ID || dbConfig['officeportal_client_id'] || '').trim(),
    clientSecret: (process.env.OFFICEPORTAL_CLIENT_SECRET || process.env.OFFICEPORTAL_API_KEY || rawDbClientSecret || '').trim(),
    webhookSecret: (process.env.OFFICEPORTAL_WEBHOOK_KEY || process.env.OFFICEPORTAL_WEBHOOK_SECRET || rawDbWebhookSecret || '').trim(),
    webhookSecretPrevious: (process.env.OFFICEPORTAL_WEBHOOK_KEY_PREVIOUS || rawDbWebhookSecretPrev || '').trim(),
    syncCursor: dbConfig['officeportal_sync_cursor'] || '',
    lastChangedAt: dbConfig['officeportal_last_changed_at'] || dbConfig['officeportal_last_sync_timestamp'] || '',
    lastMasterSyncAt: dbConfig['officeportal_last_master_sync_at'] || '',
    dailyLimit: dbConfig['officeportal_daily_requests_limit'] || '500',
    dailyRemaining: dbConfig['officeportal_daily_requests_remaining'] || null,
    dailyReset: dbConfig['officeportal_daily_reset_time'] || null,
    monthlyQuota: dbConfig['officeportal_monthly_requests_quota'] || '5000',
    monthlyRemaining: dbConfig['officeportal_monthly_requests_remaining'] || null,
    monthlyReset: dbConfig['officeportal_monthly_reset_time'] || null,
    syncStatus: dbConfig['officeportal_sync_status'] || 'READY',
  };

  cachedConfig = resolved;
  configExpiresAt = now + CONFIG_CACHE_TTL_MS;
  return resolved;
}

/**
 * Persist key/value pairs in system_config
 * - Enforces OfficePortal URL allowlist before writing URL keys
 * - Encrypts secret keys at rest using AES-256-GCM
 * - Immediately invalidates in-memory getConfig() cache
 */
async function setConfigValues(entries, dbClient = null) {
  const runner = dbClient || { query };

  // Validate all URL values upfront before persisting any changes
  for (const [key, value] of Object.entries(entries)) {
    if (value === undefined || value === null || String(value).trim() === '') continue;
    if (key === 'officeportal_auth_url') {
      assertAllowedOfficePortalUrl(String(value), 'auth');
    } else if (key === 'officeportal_base_url') {
      assertAllowedOfficePortalUrl(String(value), 'api');
    }
  }

  for (const [key, value] of Object.entries(entries)) {
    if (value === undefined) continue;
    let storedValue = value === null ? '' : String(value);
    if (SECRET_CONFIG_KEYS.has(key) && storedValue) {
      storedValue = encryptSecret(storedValue);
    }
    await runner.query(
      `INSERT INTO system_config (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [key, storedValue]
    );
  }

  // Invalidate config cache immediately so subsequent calls read fresh values
  cachedConfig = null;
  configExpiresAt = 0;
}

/**
 * Validate incoming webhook signature (X-Awarious-Signature)
 * Spec (Platform Guide Section 10.5):
 *   Header: t=<unix_seconds>,v1=<hex_hmac_sha256>[,v1=<hex_hmac_sha256>]
 *   Signed payload: `${t}.${rawBody}` (exact raw bytes as received)
 *   Key: full UTF-8 string including `whsec_` prefix
 */
function isValidSignature(header, rawBody, keys, nowSeconds = Date.now() / 1000) {
  if (!header || !rawBody || !keys || keys.length === 0) {
    return false;
  }

  const rawBuf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8');

  let timestamp = null;
  const signatures = [];

  for (const part of String(header).split(',')) {
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

  // Signed payload is timestamp + "." + rawBody bytes
  const signedPayload = Buffer.concat([Buffer.from(`${timestamp}.`, 'utf8'), rawBuf]);

  for (const key of keys) {
    if (!key) continue;
    const expected = Buffer.from(
      createHmac('sha256', String(key)).update(signedPayload).digest('hex'),
      'utf8'
    );
    for (const signature of signatures) {
      if (signature.length === expected.length && timingSafeEqual(signature, expected)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Fetch OAuth 2.0 access token with in-memory caching (14-min TTL), mutex lock,
 * URLSearchParams encoding, and transient 5xx/network retry.
 */
async function getAccessToken(forceRefresh = false) {
  const now = Math.floor(Date.now() / 1000);

  if (!forceRefresh && cachedToken && (tokenExpiresAt - now) > TOKEN_REFRESH_BUFFER_SECONDS) {
    return cachedToken;
  }

  if (tokenLockPromise) {
    return tokenLockPromise;
  }

  tokenLockPromise = (async () => {
    try {
      const config = await getConfig();
      if (!config.clientId || !config.clientSecret) {
        const err = new Error('OfficePortal Client ID or API Key (client_secret) is not configured.');
        err.code = 'CREDENTIALS_MISSING';
        throw err;
      }

      // SSRF / credential-exfiltration guard: verify authUrl against strict host allowlist
      const safeAuthUrl = assertAllowedOfficePortalUrl(config.authUrl, 'auth');

      const params = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        scope: 'emp:read'
      });

      let lastErr = null;
      for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
        try {
          const res = await axios.post(safeAuthUrl, params.toString(), {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Accept': 'application/json'
            },
            timeout: 15000,
            maxRedirects: 0
          });

          if (!res.data || !res.data.access_token) {
            throw new Error('Invalid token response received from OfficePortal auth server.');
          }

          cachedToken = res.data.access_token;
          const expiresIn = Number(res.data.expires_in) || 900;
          tokenExpiresAt = Math.floor(Date.now() / 1000) + expiresIn;
          return cachedToken;
        } catch (err) {
          lastErr = err;
          const status = err?.response?.status;
          const isTransient = !status || status >= 500;
          if (!isTransient || attempt === MAX_RETRY_ATTEMPTS) {
            throw sanitizeError(err, 'Failed to obtain OfficePortal access token');
          }
          const maxWaitMs = Math.pow(2, attempt) * 1000;
          await sleep(Math.floor(Math.random() * maxWaitMs) + 200);
        }
      }
      throw sanitizeError(lastErr, 'Failed to obtain OfficePortal access token');
    } finally {
      tokenLockPromise = null;
    }
  })();

  return tokenLockPromise;
}

/**
 * Extract X-Quota-Requests-* headers and persist into system_config
 */
async function updateQuotaMetadata(headers) {
  if (!headers) return;
  const updates = {};
  if (headers['x-quota-requests-dailylimit'] !== undefined) {
    updates.officeportal_daily_requests_limit = headers['x-quota-requests-dailylimit'];
  }
  if (headers['x-quota-requests-dailyremaining'] !== undefined) {
    updates.officeportal_daily_requests_remaining = headers['x-quota-requests-dailyremaining'];
  }
  if (headers['x-quota-requests-dailyreset']) {
    updates.officeportal_daily_reset_time = headers['x-quota-requests-dailyreset'];
  }
  if (headers['x-quota-requests-monthlylimit'] !== undefined) {
    updates.officeportal_monthly_requests_quota = headers['x-quota-requests-monthlylimit'];
  }
  if (headers['x-quota-requests-monthlyremaining'] !== undefined) {
    updates.officeportal_monthly_requests_remaining = headers['x-quota-requests-monthlyremaining'];
  }
  if (headers['x-quota-requests-monthlyreset']) {
    updates.officeportal_monthly_reset_time = headers['x-quota-requests-monthlyreset'];
  }

  if (Object.keys(updates).length > 0) {
    await setConfigValues(updates).catch(() => {});
  }
}

/**
 * Resilient GET wrapper implementing Platform Guide Section 6.9 & Section 9.4:
 * - Automatic 1x token invalidation & retry on HTTP 401
 * - Retry-After wait on HTTP 429 per-minute rate limit (<= 60s)
 * - Immediate fail (circuit breaker) on daily 429, monthly 402, and sample-data 403
 * - Exponential backoff with jitter on 5xx / network timeouts (up to 4 attempts)
 */
async function requestWithRetry(path, options = {}) {
  const config = await getConfig();
  const rawUrl = path.startsWith('http') ? path : `${config.baseUrl}${path}`;
  // SSRF / Bearer-exfiltration guard: verify destination URL against strict host allowlist
  const url = assertAllowedOfficePortalUrl(rawUrl, 'api');
  const timeout = options.timeout || 30000;
  const params = options.params || undefined;

  let refreshedTokenOn401 = false;

  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    const token = await getAccessToken(false);
    try {
      const res = await axios.get(url, {
        params,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json'
        },
        timeout,
        maxRedirects: 0
      });

      await updateQuotaMetadata(res.headers);
      return res;
    } catch (err) {
      const status = err?.response?.status;
      const headers = err?.response?.headers || {};
      const body = err?.response?.data;
      const title = (body && typeof body === 'object' && body.title) ? String(body.title) : '';

      await updateQuotaMetadata(headers);

      // 401 Unauthorized -> invalidate cached token & retry once
      if (status === 401 && !refreshedTokenOn401) {
        refreshedTokenOn401 = true;
        cachedToken = null;
        tokenExpiresAt = 0;
        continue;
      }

      // 402 Monthly quota exceeded -> stop immediately
      if (status === 402) {
        await setConfigValues({ officeportal_sync_status: 'QUOTA_EXCEEDED' }).catch(() => {});
        const clean = sanitizeError(err, 'OfficePortal monthly request quota exceeded');
        clean.code = 'QUOTA_MONTHLY_EXCEEDED';
        throw clean;
      }

      // 403 Forbidden (sample-data refusal or missing scope) -> stop immediately
      if (status === 403) {
        const clean = sanitizeError(err, 'OfficePortal refused request (403 Forbidden)');
        clean.code = title.toLowerCase().includes('sample') ? 'SAMPLE_DATA_ACCOUNT' : 'FORBIDDEN';
        throw clean;
      }

      // 429 Rate Limit vs Daily Quota
      if (status === 429) {
        const isDailyLimit = title.toLowerCase().includes('daily');
        const retryAfterRaw = headers['retry-after'];
        const retryAfterSec = retryAfterRaw ? parseInt(retryAfterRaw, 10) : NaN;

        if (isDailyLimit || (!isNaN(retryAfterSec) && retryAfterSec > 60)) {
          await setConfigValues({ officeportal_sync_status: 'DAILY_LIMIT_EXCEEDED' }).catch(() => {});
          const clean = sanitizeError(err, 'OfficePortal daily request limit exceeded');
          clean.code = 'QUOTA_DAILY_EXCEEDED';
          throw clean;
        }

        if (attempt < MAX_RETRY_ATTEMPTS) {
          const waitSec = !isNaN(retryAfterSec) && retryAfterSec > 0 ? Math.min(retryAfterSec, 60) : 5;
          await sleep(waitSec * 1000);
          continue;
        }
      }

      // Transient 5xx or network error -> exponential backoff with jitter
      const isTransient = !status || status >= 500;
      if (isTransient && attempt < MAX_RETRY_ATTEMPTS) {
        const maxWaitMs = Math.pow(2, attempt) * 1000;
        await sleep(Math.floor(Math.random() * maxWaitMs) + 250);
        continue;
      }

      throw sanitizeError(err);
    }
  }
}

/**
 * Fetch hospital departments master list from GET /api/v1/departments
 */
async function getDepartmentsMaster(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedDepartments && now < departmentsExpiresAt) {
    return cachedDepartments;
  }

  const res = await requestWithRetry('/api/v1/departments');
  cachedDepartments = Array.isArray(res.data) ? res.data : (res.data?.data || []);
  departmentsExpiresAt = now + (60 * 60 * 1000);
  return cachedDepartments;
}

/**
 * Fetch job titles master list from GET /api/v1/job-titles
 */
async function getJobTitlesMaster(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedJobTitles && now < jobTitlesExpiresAt) {
    return cachedJobTitles;
  }

  const res = await requestWithRetry('/api/v1/job-titles');
  cachedJobTitles = Array.isArray(res.data) ? res.data : (res.data?.data || []);
  jobTitlesExpiresAt = now + (60 * 60 * 1000);
  return cachedJobTitles;
}

/**
 * Fetch employment types master list from GET /api/v1/employment-types
 */
async function getEmploymentTypesMaster(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedEmploymentTypes && now < employmentTypesExpiresAt) {
    return cachedEmploymentTypes;
  }

  const res = await requestWithRetry('/api/v1/employment-types');
  cachedEmploymentTypes = Array.isArray(res.data) ? res.data : (res.data?.data || []);
  employmentTypesExpiresAt = now + (60 * 60 * 1000);
  return cachedEmploymentTypes;
}

/**
 * Fetch live quota & usage stats from GET /api/v1/usage
 * (First 100 calls/UTC day are free per Platform Guide Section 8.8)
 */
async function getUsageStats() {
  const res = await requestWithRetry('/api/v1/usage');
  const usage = res.data || {};

  const updates = {};
  if (usage.dailyRequestLimit !== undefined) updates.officeportal_daily_requests_limit = usage.dailyRequestLimit;
  if (usage.dailyRequestsRemaining !== undefined) updates.officeportal_daily_requests_remaining = usage.dailyRequestsRemaining;
  if (usage.monthlyRequestQuota !== undefined) updates.officeportal_monthly_requests_quota = usage.monthlyRequestQuota;
  if (usage.requestsRemaining !== undefined) updates.officeportal_monthly_requests_remaining = usage.requestsRemaining;
  if (usage.periodEnd) updates.officeportal_monthly_reset_time = usage.periodEnd;
  if (Object.keys(updates).length > 0) {
    await setConfigValues(updates).catch(() => {});
  }

  return usage;
}

/**
 * Live lookup of a single employee by OfficePortal GUID
 */
async function getEmployeeById(employeeId) {
  const res = await requestWithRetry(`/api/v1/employees/${encodeURIComponent(employeeId)}`);
  return res.data;
}

/**
 * Live lookup of a single employee by organization employee code
 */
async function getEmployeeByCode(employeeCode) {
  const res = await requestWithRetry(`/api/v1/employees/by-code/${encodeURIComponent(String(employeeCode).trim())}`);
  return res.data;
}

/**
 * Test OfficePortal OAuth credentials and retrieve live quota telemetry
 */
async function testConnection() {
  clearCaches();
  const token = await getAccessToken(true);
  const usage = await getUsageStats();
  await setConfigValues({ officeportal_sync_status: 'CONNECTED' }).catch(() => {});
  return {
    connected: Boolean(token),
    tokenAcquired: Boolean(token),
    usage
  };
}

/**
 * STRICT 100% API-DRIVEN DEPARTMENT SYNC
 * Fetches GET /api/v1/departments and synchronizes exact verbatim OfficePortal department names.
 * - Zero hardcoded departments, zero hardcoded aliases.
 * - Preserves existing HOD / reviewer assignments if matched by office_portal_department_id or exact case-insensitive name.
 * - Marks any department not returned by OfficePortal as is_hrms_synced = FALSE so /api/departments ONLY returns API departments.
 */
async function syncDepartmentsMaster(existingClient = null) {
  const apiDepartments = await getDepartmentsMaster(true);
  const client = existingClient || (await getClient());
  const shouldRelease = !existingClient;

  let syncedCount = 0;
  const activePortalIds = [];

  try {
    if (shouldRelease) await client.query('BEGIN');

    for (const dept of apiDepartments) {
      const portalDeptId = normalizeGuid(dept.departmentId || dept.id);
      const deptName = dept.name ? String(dept.name).trim() : '';
      if (!portalDeptId || !deptName) continue;

      activePortalIds.push(portalDeptId);

      // 1. Check by office_portal_department_id first
      const byPortal = await client.query(
        `SELECT id, name FROM departments WHERE office_portal_department_id = $1`,
        [portalDeptId]
      );

      if (byPortal.rows.length > 0) {
        const currentRow = byPortal.rows[0];
        if (currentRow.name !== deptName) {
          // Guard against unique(name) collision with a legacy row or name-swap with another API department
          const nameCollision = await client.query(
            `SELECT id, name, office_portal_department_id
             FROM departments
             WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) AND id != $2
             LIMIT 1`,
            [deptName, currentRow.id]
          );
          if (nameCollision.rows.length > 0) {
            const other = nameCollision.rows[0];
            const tempName = other.office_portal_department_id
              ? `__hrms_swap_${other.id}_${Date.now()}`
              : `${other.name} (Legacy #${other.id})`;
            await client.query(
              `UPDATE departments SET name = $1, is_hrms_synced = FALSE WHERE id = $2`,
              [tempName, other.id]
            );
          }
        }
        await client.query(
          `UPDATE departments
           SET name = $1, is_hrms_synced = TRUE
           WHERE id = $2`,
          [deptName, currentRow.id]
        );
        syncedCount++;
        continue;
      }

      // 2. Check by exact case-insensitive name (preserves any existing HOD mapping or historical FK)
      const byName = await client.query(
        `SELECT id FROM departments WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) LIMIT 1`,
        [deptName]
      );

      if (byName.rows.length > 0) {
        await client.query(
          `UPDATE departments
           SET name = $1, office_portal_department_id = $2, is_hrms_synced = TRUE
           WHERE id = $3`,
          [deptName, portalDeptId, byName.rows[0].id]
        );
        syncedCount++;
      } else {
        await client.query(
          `INSERT INTO departments (name, office_portal_department_id, is_hrms_synced)
           VALUES ($1, $2, TRUE)`,
          [deptName, portalDeptId]
        );
        syncedCount++;
      }
    }

    // Mark any department NOT present in the current OfficePortal API response as not synced
    if (activePortalIds.length > 0) {
      await client.query(
        `UPDATE departments
         SET is_hrms_synced = FALSE
         WHERE office_portal_department_id IS NULL
            OR NOT (office_portal_department_id = ANY($1::uuid[]))`,
        [activePortalIds]
      );
    } else if (Array.isArray(apiDepartments) && apiDepartments.length === 0) {
      await client.query(`UPDATE departments SET is_hrms_synced = FALSE`);
    }

    if (shouldRelease) await client.query('COMMIT');
    return { syncedCount, totalFromApi: apiDepartments.length };
  } catch (err) {
    if (shouldRelease) await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    if (shouldRelease) client.release();
  }
}

/**
 * Sync job titles from GET /api/v1/job-titles into hrms_job_titles
 */
async function syncJobTitlesMaster(existingClient = null) {
  const jobTitles = await getJobTitlesMaster(true);
  const client = existingClient || (await getClient());
  const shouldRelease = !existingClient;

  let syncedCount = 0;
  try {
    if (shouldRelease) await client.query('BEGIN');
    for (const jt of jobTitles) {
      const id = Number(jt.jobTitleId ?? jt.id);
      const name = jt.name ? String(jt.name).trim() : null;
      if (!Number.isInteger(id) || id <= 0) continue;

      await client.query(
        `INSERT INTO hrms_job_titles (job_title_id, name, synced_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (job_title_id) DO UPDATE SET
           name = COALESCE(EXCLUDED.name, hrms_job_titles.name),
           synced_at = NOW()`,
        [id, name]
      );
      syncedCount++;
    }
    if (shouldRelease) await client.query('COMMIT');
    return { syncedCount };
  } catch (err) {
    if (shouldRelease) await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    if (shouldRelease) client.release();
  }
}

/**
 * Sync employment types from GET /api/v1/employment-types into hrms_employment_types
 */
async function syncEmploymentTypesMaster(existingClient = null) {
  const empTypes = await getEmploymentTypesMaster(true);
  const client = existingClient || (await getClient());
  const shouldRelease = !existingClient;

  let syncedCount = 0;
  try {
    if (shouldRelease) await client.query('BEGIN');
    for (const et of empTypes) {
      const id = Number(et.employmentTypeId ?? et.id);
      const name = et.name ? String(et.name).trim() : null;
      if (!Number.isInteger(id) || id <= 0) continue;

      await client.query(
        `INSERT INTO hrms_employment_types (employment_type_id, name, synced_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (employment_type_id) DO UPDATE SET
           name = COALESCE(EXCLUDED.name, hrms_employment_types.name),
           synced_at = NOW()`,
        [id, name]
      );
      syncedCount++;
    }
    if (shouldRelease) await client.query('COMMIT');
    return { syncedCount };
  } catch (err) {
    if (shouldRelease) await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    if (shouldRelease) client.release();
  }
}

function isFatalApiError(err) {
  if (!err) return false;
  if (FATAL_API_ERROR_CODES.has(err.code)) return true;
  if ([401, 402, 403].includes(err.statusCode)) return true;
  return false;
}

/**
 * Sync all OfficePortal master data lists (departments, job titles, employment types).
 * Immediately rethrows fatal/circuit-breaker errors (401/402/403/429 daily/missing creds)
 * so quota is never wasted on follow-up doomed calls.
 */
async function syncAllMasterLists() {
  const results = { departments: 0, jobTitles: 0, employmentTypes: 0 };

  try {
    const d = await syncDepartmentsMaster();
    results.departments = d.syncedCount;
  } catch (err) {
    if (isFatalApiError(err)) throw err;
    console.warn('[OfficePortal] syncDepartmentsMaster warning:', err.message);
  }

  try {
    const jt = await syncJobTitlesMaster();
    results.jobTitles = jt.syncedCount;
  } catch (err) {
    if (isFatalApiError(err)) throw err;
    console.warn('[OfficePortal] syncJobTitlesMaster warning:', err.message);
  }

  try {
    const et = await syncEmploymentTypesMaster();
    results.employmentTypes = et.syncedCount;
  } catch (err) {
    if (isFatalApiError(err)) throw err;
    console.warn('[OfficePortal] syncEmploymentTypesMaster warning:', err.message);
  }

  await setConfigValues({ officeportal_last_master_sync_at: new Date().toISOString() }).catch(() => {});
  return results;
}

/**
 * Notify System Admins and IMC Leads if a locked-out employee is currently an assigned Department HOD / Reviewer.
 * Wrapped in a SAVEPOINT so any notification failure never aborts the parent sync transaction.
 */
async function notifyIfDepartmentReviewerVacated(client, empCode, fullName, reason) {
  await runInSavepoint(client, 'sp_hod_vacancy_notify', async () => {
    const userRes = await client.query(
      `SELECT id FROM users WHERE employee_id = $1 LIMIT 1`,
      [empCode]
    );
    if (!userRes.rows.length) return;
    const userId = userRes.rows[0].id;

    const assignedDeptsRes = await client.query(
      `SELECT DISTINCT d.name
       FROM departments d
       LEFT JOIN department_reviewers dr ON dr.department_id = d.id AND dr.is_active = TRUE
       WHERE d.hod_user_id = $1 OR d.assigned_user_id = $1 OR dr.user_id = $1`,
      [userId]
    );

    if (!assignedDeptsRes.rows.length) return;
    const deptNames = assignedDeptsRes.rows.map((r) => r.name).join(', ');

    const recipients = await client.query(
      `SELECT id FROM users
       WHERE is_active = TRUE
         AND (role = 'system_admin' OR is_system_admin = TRUE OR is_imc_lead = TRUE)`
    );

    const title = `HRMS Alert: Department Reviewer Deactivated (${empCode})`;
    const message = `${fullName} (${empCode}), assigned as feedback reviewer for ${deptNames}, has been locked out due to HRMS status change (${reason}). Please assign a replacement reviewer in Dept Mapping.`;

    for (const r of recipients.rows) {
      await client.query(
        `INSERT INTO notifications (user_id, title, message, type)
         VALUES ($1, $2, $3, 'system')`,
        [r.id, title, message]
      );
    }
  });
}

/**
 * Upsert a single employee record into master_employees with Last-Write-Wins protection,
 * calendar-date safety, employeeCode rename handling, savepoint-safe user/department propagation,
 * and lifecycle lockout enforcement (preserving manual IMS admin deactivation).
 */
async function upsertMasterEmployee(client, emp, fallbackTimestamp = null) {
  const portalId = normalizeGuid(emp.employeeId || emp.office_portal_id) || (emp.employeeId ? String(emp.employeeId).trim() : null);
  const empCode = String(emp.employeeCode || emp.employee_id || '').trim().toUpperCase();
  const firstName = emp.firstName != null ? String(emp.firstName).trim() : (emp.first_name || '');
  const lastName = emp.lastName != null ? String(emp.lastName).trim() : (emp.last_name || '');
  const fullName = String(emp.fullName || emp.name || `${firstName} ${lastName}`.trim() || empCode).trim();
  const email = emp.workEmail != null ? String(emp.workEmail).trim() || null : (emp.email || null);
  const phone = emp.mobileNumber != null ? String(emp.mobileNumber).trim() || null : (emp.phone || null);

  // Strict: never inject a hardcoded 'General' department! Null resolves from synced departments or preserves existing.
  let department = emp.departmentName ? String(emp.departmentName).trim() : (emp.department ? String(emp.department).trim() : null);
  const designation = emp.jobTitleName ? String(emp.jobTitleName).trim() : (emp.designation ? String(emp.designation).trim() : null);
  const location = emp.officeLocationName ? String(emp.officeLocationName).trim() : (emp.office_location || null);

  const departmentId = normalizeGuid(emp.departmentId);
  const jobTitleId = Number.isInteger(Number(emp.jobTitleId)) && Number(emp.jobTitleId) > 0 ? Number(emp.jobTitleId) : null;
  const officeLocationId = Number.isInteger(Number(emp.officeLocationId)) && Number(emp.officeLocationId) > 0 ? Number(emp.officeLocationId) : null;
  const employmentTypeId = emp.employmentTypeId !== null && emp.employmentTypeId !== undefined && Number.isInteger(Number(emp.employmentTypeId))
    ? Number(emp.employmentTypeId)
    : null;
  const employmentTypeName = emp.employmentTypeName ? String(emp.employmentTypeName).trim() : null;
  const managerId = normalizeGuid(emp.managerId);

  const rawStatus = emp.status ? String(emp.status).trim() : 'active';
  const status = VALID_STATUSES.has(rawStatus) ? rawStatus : 'active';

  // Per Employee API Guide Section 4.4: extract calendar dates as YYYY-MM-DD (never convert to local TZ)
  const dateOfJoining = extractCalendarDate(emp.dateOfJoining);
  const terminationDate = extractCalendarDate(emp.terminationDate);
  const noticeStartDate = extractCalendarDate(emp.noticePeriodStartDate);
  const noticeEndDate = extractCalendarDate(emp.noticePeriodEndDate);
  const portalAccessDisableDate = extractCalendarDate(emp.portalAccessDisableDate);

  const vendorUpdatedAt = emp.updatedAt
    ? new Date(emp.updatedAt)
    : (fallbackTimestamp ? new Date(fallbackTimestamp) : new Date());

  if (!empCode) {
    return { isInserted: false, isUpdated: false, skipped: true, reason: 'Missing employee code' };
  }

  // If departmentId is set but departmentName is temporarily null (Guide Section 6 fill-in delay),
  // look up the synced department name by office_portal_department_id before falling back.
  if (departmentId && !department) {
    const deptLookup = await client.query(
      `SELECT name FROM departments WHERE office_portal_department_id = $1 LIMIT 1`,
      [departmentId]
    );
    if (deptLookup.rows.length > 0) {
      department = deptLookup.rows[0].name;
    }
  }

  // Capture prior HRMS lockout state (so manual admin deactivation in IMS is not overwritten by normal active syncs)
  let wasPreviouslyLockedOut = false;

  // Handle employeeCode change for an existing office_portal_id safely without unique constraint violations
  if (portalId) {
    const existingByPortal = await client.query(
      `SELECT id, employee_id, status, portal_access_disable_date, vendor_updated_at
       FROM master_employees WHERE office_portal_id = $1 LIMIT 1`,
      [portalId]
    );

    if (existingByPortal.rows.length > 0) {
      const existing = existingByPortal.rows[0];
      wasPreviouslyLockedOut = isEmployeeLockedOut(existing.status, existing.portal_access_disable_date);

      if (existing.vendor_updated_at && vendorUpdatedAt < new Date(existing.vendor_updated_at)) {
        return { isInserted: false, isUpdated: false, skipped: true, reason: 'Stale payload (LWW)' };
      }
      if (existing.employee_id !== empCode) {
        const codeConflict = await client.query(
          `SELECT id FROM master_employees WHERE employee_id = $1 AND id != $2 LIMIT 1`,
          [empCode, existing.id]
        );
        if (codeConflict.rows.length === 0) {
          await client.query(
            `UPDATE master_employees SET employee_id = $1 WHERE id = $2`,
            [empCode, existing.id]
          );
          await runInSavepoint(client, 'sp_cascade_emp_code', async () => {
            await client.query(
              `UPDATE users SET employee_id = $1, updated_at = NOW() WHERE employee_id = $2`,
              [empCode, existing.employee_id]
            );
          });
        }
      }
    }
  }

  if (!wasPreviouslyLockedOut) {
    const existingByCode = await client.query(
      `SELECT status, portal_access_disable_date FROM master_employees WHERE employee_id = $1 LIMIT 1`,
      [empCode]
    );
    if (existingByCode.rows.length > 0) {
      wasPreviouslyLockedOut = isEmployeeLockedOut(
        existingByCode.rows[0].status,
        existingByCode.rows[0].portal_access_disable_date
      );
    }
  }

  const res = await client.query(
    `INSERT INTO master_employees (
      office_portal_id, employee_id, name, first_name, last_name,
      email, phone, department, designation, office_location,
      department_id, job_title_id, office_location_id,
      employment_type_id, employment_type_name, manager_id,
      status, date_of_joining, termination_date, notice_period_start_date, notice_period_end_date,
      portal_access_disable_date, vendor_updated_at, raw_payload, synced_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9, $10,
      $11, $12, $13,
      $14, $15, $16,
      $17, $18, $19, $20, $21,
      $22, $23, $24, NOW(), NOW()
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
      department_id = COALESCE(EXCLUDED.department_id, master_employees.department_id),
      job_title_id = COALESCE(EXCLUDED.job_title_id, master_employees.job_title_id),
      office_location_id = COALESCE(EXCLUDED.office_location_id, master_employees.office_location_id),
      employment_type_id = EXCLUDED.employment_type_id,
      employment_type_name = CASE
        WHEN EXCLUDED.employment_type_id IS NULL THEN NULL
        ELSE COALESCE(EXCLUDED.employment_type_name, master_employees.employment_type_name)
      END,
      manager_id = EXCLUDED.manager_id,
      status = EXCLUDED.status,
      date_of_joining = COALESCE(EXCLUDED.date_of_joining, master_employees.date_of_joining),
      termination_date = EXCLUDED.termination_date,
      notice_period_start_date = EXCLUDED.notice_period_start_date,
      notice_period_end_date = EXCLUDED.notice_period_end_date,
      portal_access_disable_date = EXCLUDED.portal_access_disable_date,
      vendor_updated_at = EXCLUDED.vendor_updated_at,
      raw_payload = EXCLUDED.raw_payload,
      synced_at = NOW(),
      updated_at = NOW()
    WHERE EXCLUDED.vendor_updated_at >= master_employees.vendor_updated_at
       OR master_employees.vendor_updated_at IS NULL
    RETURNING id, (xmax = 0) AS is_inserted`,
    [
      portalId, empCode, fullName, firstName, lastName,
      email, phone, department, designation, location,
      departmentId, jobTitleId, officeLocationId,
      employmentTypeId, employmentTypeName, managerId,
      status, dateOfJoining, terminationDate, noticeStartDate, noticeEndDate,
      portalAccessDisableDate, vendorUpdatedAt, JSON.stringify(emp)
    ]
  );

  // If no row returned, LWW WHERE predicate skipped this stale payload
  if (res.rows.length === 0) {
    return { isInserted: false, isUpdated: false, skipped: true, reason: 'Stale payload (LWW)' };
  }

  const isInserted = Boolean(res.rows[0].is_inserted);
  const isUpdated = !isInserted;

  // Safely ensure API-reported department exists in departments table inside a SAVEPOINT
  // (handles renamed departmentId / name collisions without aborting the surrounding transaction)
  if (departmentId && department) {
    await runInSavepoint(client, 'sp_upsert_emp_dept', async () => {
      const byPortal = await client.query(
        `SELECT id, name FROM departments WHERE office_portal_department_id = $1 LIMIT 1`,
        [departmentId]
      );
      if (byPortal.rows.length > 0) {
        if (byPortal.rows[0].name !== department) {
          const nameTaken = await client.query(
            `SELECT id FROM departments WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) AND id != $2 LIMIT 1`,
            [department, byPortal.rows[0].id]
          );
          if (nameTaken.rows.length === 0) {
            await client.query(
              `UPDATE departments SET name = $1, is_hrms_synced = TRUE WHERE id = $2`,
              [department, byPortal.rows[0].id]
            );
          } else {
            await client.query(
              `UPDATE departments SET is_hrms_synced = TRUE WHERE id = $1`,
              [byPortal.rows[0].id]
            );
          }
        } else {
          await client.query(
            `UPDATE departments SET is_hrms_synced = TRUE WHERE id = $1`,
            [byPortal.rows[0].id]
          );
        }
      } else {
        const byName = await client.query(
          `SELECT id FROM departments WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) LIMIT 1`,
          [department]
        );
        if (byName.rows.length > 0) {
          await client.query(
            `UPDATE departments
             SET office_portal_department_id = COALESCE(office_portal_department_id, $1),
                 is_hrms_synced = TRUE
             WHERE id = $2`,
            [departmentId, byName.rows[0].id]
          );
        } else {
          await client.query(
            `INSERT INTO departments (name, office_portal_department_id, is_hrms_synced)
             VALUES ($1, $2, TRUE)`,
            [department, departmentId]
          );
        }
      }
    });
  }

  // Never alter root generic System Administrator (00000) via HRMS sync
  if (empCode !== '00000') {
    // Propagate latest demographic fields to registered IMS users (savepoint-protected)
    await runInSavepoint(client, 'sp_propagate_user_profile', async () => {
      await client.query(
        `UPDATE users
         SET full_name = $2,
             department = COALESCE($3, department),
             designation = COALESCE($4, designation),
             email = COALESCE($5, email),
             phone = COALESCE($6, phone),
             last_sync = NOW(),
             updated_at = NOW()
         WHERE employee_id = $1`,
        [empCode, fullName, department, designation, email, phone]
      );
    });

    // Account Lifecycle Enforcement (terminated, inactive, deleted, or portalAccessDisableDate <= today)
    const lockedOut = isEmployeeLockedOut(status, portalAccessDisableDate);
    if (lockedOut) {
      const spLock = await runInSavepoint(client, 'sp_lock_user', async () => {
        return client.query(
          `UPDATE users
           SET is_active = FALSE,
               token_version = COALESCE(token_version, 1) + 1,
               updated_at = NOW()
           WHERE employee_id = $1 AND is_active = TRUE
           RETURNING id`,
          [empCode]
        );
      });

      if (spLock.ok && spLock.result?.rows?.length > 0) {
        const reason = LOCKOUT_STATUSES.has(status)
          ? `status=${status}`
          : `portalAccessDisableDate=${portalAccessDisableDate}`;
        await notifyIfDepartmentReviewerVacated(client, empCode, fullName, reason);
      }
    } else if (wasPreviouslyLockedOut && status === 'active') {
      // Only auto-reactivate when transitioning BACK from an HRMS lockout state (rehire/re-enable),
      // so manual IMS admin deactivation of an active employee is respected.
      await runInSavepoint(client, 'sp_unlock_user', async () => {
        await client.query(
          `UPDATE users
           SET is_active = TRUE, updated_at = NOW()
           WHERE employee_id = $1 AND is_active = FALSE`,
          [empCode]
        );
      });
    }
  }

  return { isInserted, isUpdated, skipped: false };
}

/**
 * Apply a permanent employee deletion with LWW timestamp protection so older webhooks cannot resurrect it
 */
async function applyEmployeeDeletion(client, portalId, empCode, deletedAtRaw) {
  const deletedAt = deletedAtRaw ? new Date(deletedAtRaw) : new Date();
  const deletedDateStr = extractCalendarDate(deletedAt);
  const normPortalId = normalizeGuid(portalId) || (portalId ? String(portalId).trim() : null);
  const normEmpCode = empCode ? String(empCode).trim().toUpperCase() : null;

  if (!normPortalId && !normEmpCode) {
    return { deactivated: false };
  }

  const updateRes = await client.query(
    `UPDATE master_employees
     SET status = 'deleted',
         termination_date = COALESCE(termination_date, $3::date),
         vendor_updated_at = $4,
         synced_at = NOW(),
         updated_at = NOW()
     WHERE (office_portal_id = $1 OR ($2::text IS NOT NULL AND employee_id = $2))
       AND (vendor_updated_at IS NULL OR vendor_updated_at <= $4)
     RETURNING employee_id, name`,
    [normPortalId, normEmpCode, deletedDateStr, deletedAt]
  );

  const affectedEmpCode = updateRes.rows[0]?.employee_id || normEmpCode;
  const affectedName = updateRes.rows[0]?.name || affectedEmpCode || 'Unknown';

  if (affectedEmpCode && affectedEmpCode !== '00000') {
    const spLock = await runInSavepoint(client, 'sp_lock_deleted_user', async () => {
      return client.query(
        `UPDATE users
         SET is_active = FALSE,
             token_version = COALESCE(token_version, 1) + 1,
             updated_at = NOW()
         WHERE employee_id = $1 AND is_active = TRUE
         RETURNING id`,
        [affectedEmpCode]
      );
    });

    if (spLock.ok && spLock.result?.rows?.length > 0) {
      await notifyIfDepartmentReviewerVacated(client, affectedEmpCode, affectedName, 'status=deleted');
    }
  }

  return { deactivated: updateRes.rows.length > 0 };
}

/**
 * Process a single page of change feed entries inside a short-lived DB transaction,
 * updating the cursor & last_changed_at checkpoint atomically in the same transaction.
 */
async function applyChangeFeedPage(entries, nextCursor, lastChangedAt) {
  const client = await getClient();
  let inserted = 0;
  let updated = 0;
  let deactivated = 0;
  let latestChangedAt = lastChangedAt;

  try {
    await client.query('BEGIN');

    for (const change of entries) {
      if (change.changedAt) {
        latestChangedAt = change.changedAt;
      }
      const changeType = change.changeType || (change.deleted ? 'deleted' : 'upserted');
      const emp = change.employee || change.data || change;

      if (changeType === 'deleted') {
        const portalId = change.employeeId || emp?.employeeId || null;
        const empCode = emp?.employeeCode || null;
        const res = await applyEmployeeDeletion(client, portalId, empCode, change.changedAt || emp?.deletedAt);
        if (res.deactivated) deactivated++;
      } else if (changeType === 'upserted' && emp) {
        const res = await upsertMasterEmployee(client, emp, change.changedAt || null);
        if (res.isInserted) inserted++;
        else if (res.isUpdated) updated++;
      }
    }

    // Save checkpoint atomically in the same DB transaction (Guide Section 7.1 Step 3)
    const checkpointUpdates = {
      officeportal_sync_cursor: nextCursor || '',
      officeportal_sync_status: 'SYNCED'
    };
    if (latestChangedAt) {
      checkpointUpdates.officeportal_last_changed_at = latestChangedAt;
      checkpointUpdates.officeportal_last_sync_timestamp = latestChangedAt;
    }
    await setConfigValues(checkpointUpdates, client);

    await client.query('COMMIT');
    return { inserted, updated, deactivated, latestChangedAt };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Perform a full bootstrap directory synchronization:
 * 1. Creates hrms_sync_logs (IN_PROGRESS) BEFORE any network call so all failures are audited
 * 2. Syncs master lists (GET /api/v1/departments, /job-titles, /employment-types)
 * 3. Walks the Change Feed from 2000-01-01T00:00:00Z (limit=200) per Guide Section 7.1
 *    (with automatic fallback to GET /api/v1/employees?pageNumber=...&pageSize=200 if changes returns 404)
 * 4. Releases DB connections between HTTP requests
 */
async function syncFullDirectory() {
  const logRes = await query(
    `INSERT INTO hrms_sync_logs (sync_type, status, started_at)
     VALUES ('full', 'IN_PROGRESS', NOW())
     RETURNING id`
  );
  const logId = logRes.rows[0]?.id;

  let totalFetched = 0;
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalDeactivated = 0;
  let lastChangedAt = '2000-01-01T00:00:00Z';
  let finalCursor = null;

  try {
    // 1. Sync master lists first (100% API-driven departments, job titles, employment types)
    const masterSummary = await syncAllMasterLists();

    // 2. Walk Change Feed from 2000-01-01T00:00:00Z per Employee API Guide Section 7.1
    let useListFallback = false;
    let nextCursor = null;
    let firstCall = true;

    while (true) {
      const params = nextCursor
        ? { cursor: nextCursor, limit: 200 }
        : { updatedAfter: '2000-01-01T00:00:00Z', limit: 200 };

      let res;
      try {
        res = await requestWithRetry('/api/v1/employees/changes', { params, timeout: 60000 });
      } catch (err) {
        if (firstCall && err.statusCode === 404) {
          useListFallback = true;
          break;
        }
        throw err;
      }
      firstCall = false;

      const entries = res.data?.data || res.data?.changes || [];
      nextCursor = res.data?.nextCursor || null;
      finalCursor = nextCursor;

      if (entries.length > 0) {
        totalFetched += entries.length;
        const pageStats = await applyChangeFeedPage(entries, nextCursor, lastChangedAt);
        totalInserted += pageStats.inserted;
        totalUpdated += pageStats.updated;
        totalDeactivated += pageStats.deactivated;
        if (pageStats.latestChangedAt) lastChangedAt = pageStats.latestChangedAt;
      } else {
        await setConfigValues({
          officeportal_sync_cursor: nextCursor || '',
          officeportal_last_changed_at: lastChangedAt,
          officeportal_sync_status: 'SYNCED'
        });
      }

      if (!nextCursor) break;
    }

    // Fallback to paginated list endpoint ONLY if /changes returned 404
    if (useListFallback) {
      let pageNumber = 1;
      const pageSize = 200;
      while (true) {
        const res = await requestWithRetry('/api/v1/employees', {
          params: { pageNumber, pageSize },
          timeout: 60000
        });
        const data = res.data?.data || (Array.isArray(res.data) ? res.data : []);
        if (data.length === 0) break;

        totalFetched += data.length;
        const client = await getClient();
        try {
          await client.query('BEGIN');
          for (const emp of data) {
            const r = await upsertMasterEmployee(client, emp);
            if (r.isInserted) totalInserted++;
            else if (r.isUpdated) totalUpdated++;
            if (emp.updatedAt && emp.updatedAt > lastChangedAt) lastChangedAt = emp.updatedAt;
          }
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK').catch(() => {});
          throw err;
        } finally {
          client.release();
        }

        const pagination = res.data?.pagination;
        if (!pagination || pageNumber >= pagination.totalPages) break;
        pageNumber++;
      }

      await setConfigValues({
        officeportal_sync_cursor: '',
        officeportal_last_changed_at: lastChangedAt,
        officeportal_last_sync_timestamp: lastChangedAt,
        officeportal_sync_status: 'SYNCED'
      });
    }

    await query(
      `UPDATE hrms_sync_logs
       SET status = 'SUCCESS',
           delta_cursor = $1,
           last_changed_at = $2,
           records_fetched = $3,
           records_inserted = $4,
           records_updated = $5,
           records_deactivated = $6,
           completed_at = NOW()
       WHERE id = $7`,
      [finalCursor, lastChangedAt, totalFetched, totalInserted, totalUpdated, totalDeactivated, logId]
    );

    return {
      success: true,
      totalFetched,
      totalInserted,
      totalUpdated,
      totalDeactivated,
      lastChangedAt,
      masterSummary
    };
  } catch (err) {
    const cleanErr = sanitizeError(err, 'Full directory sync failed');
    await query(
      `UPDATE hrms_sync_logs
       SET status = 'FAILED', error_message = $1, completed_at = NOW()
       WHERE id = $2`,
      [cleanErr.message, logId]
    ).catch(() => {});
    throw cleanErr;
  }
}

/**
 * Perform incremental delta synchronization via GET /api/v1/employees/changes
 * - Sends params.cursor (NOT params.token) when cursor is present
 * - Resumes from updatedAfter = last_changed_at when cursor is null
 * - Resets to 2000-01-01T00:00:00Z if saved checkpoint is older than 90 days (Guide Section 7.1)
 * - Releases DB connections between HTTP requests
 */
async function syncDeltaChanges(options = {}) {
  const config = await getConfig();
  let cursor = config.syncCursor ? config.syncCursor.trim() : null;
  let lastChangedAt = config.lastChangedAt ? config.lastChangedAt.trim() : null;

  // Fallback to hrms_sync_logs if system_config has no checkpoint yet
  if (!cursor && !lastChangedAt) {
    const lastLogRes = await query(
      `SELECT delta_cursor, last_changed_at
       FROM hrms_sync_logs
       WHERE status = 'SUCCESS'
       ORDER BY id DESC LIMIT 1`
    );
    cursor = lastLogRes.rows[0]?.delta_cursor || null;
    lastChangedAt = lastLogRes.rows[0]?.last_changed_at
      ? new Date(lastLogRes.rows[0].last_changed_at).toISOString()
      : null;
  }

  // 90-day staleness guard per Employee API Guide Section 7.1
  if (lastChangedAt) {
    const checkpointMs = Date.parse(lastChangedAt);
    if (isNaN(checkpointMs) || (Date.now() - checkpointMs) > NINETY_DAYS_MS) {
      cursor = null;
      lastChangedAt = '2000-01-01T00:00:00Z';
    }
  } else {
    lastChangedAt = '2000-01-01T00:00:00Z';
  }

  const logRes = await query(
    `INSERT INTO hrms_sync_logs (sync_type, delta_cursor, last_changed_at, status, started_at)
     VALUES ('delta', $1, $2, 'IN_PROGRESS', NOW())
     RETURNING id`,
    [cursor, lastChangedAt]
  );
  const logId = logRes.rows[0]?.id;

  let totalFetched = 0;
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalDeactivated = 0;
  let nextCursor = cursor;
  let retriedInvalidCursor = false;

  try {
    // Quota optimization: refresh master lists during delta sync at most once per 24h
    // (or when explicitly requested / when 0 API departments exist yet) so 4-hour delta runs
    // consume ~1 API call per run instead of 4 calls per run.
    let shouldSyncMasters = Boolean(options.syncMasters);
    if (!shouldSyncMasters) {
      const lastMasterMs = config.lastMasterSyncAt ? Date.parse(config.lastMasterSyncAt) : NaN;
      if (isNaN(lastMasterMs) || (Date.now() - lastMasterMs) >= MASTER_SYNC_INTERVAL_MS) {
        shouldSyncMasters = true;
      } else {
        const deptCountRes = await query(`SELECT COUNT(*) AS cnt FROM departments WHERE is_hrms_synced = TRUE`).catch(() => ({ rows: [{ cnt: 1 }] }));
        if (parseInt(deptCountRes.rows[0]?.cnt || '0', 10) === 0) {
          shouldSyncMasters = true;
        }
      }
    }
    if (shouldSyncMasters) {
      await syncAllMasterLists();
    }

    while (true) {
      const params = nextCursor
        ? { cursor: nextCursor, limit: 200 }
        : { updatedAfter: lastChangedAt, limit: 200 };

      let res;
      try {
        res = await requestWithRetry('/api/v1/employees/changes', { params, timeout: 60000 });
      } catch (err) {
        // Self-heal once if OfficePortal rejects an invalid/stale cursor (Guide Section 5.4: HTTP 400)
        if (nextCursor && !retriedInvalidCursor && err.statusCode === 400 && String(err.message || '').toLowerCase().includes('cursor')) {
          retriedInvalidCursor = true;
          nextCursor = null;
          await setConfigValues({ officeportal_sync_cursor: '' }).catch(() => {});
          continue;
        }
        throw err;
      }
      const entries = res.data?.data || res.data?.changes || [];
      nextCursor = res.data?.nextCursor || null;

      if (entries.length > 0) {
        totalFetched += entries.length;
        const pageStats = await applyChangeFeedPage(entries, nextCursor, lastChangedAt);
        totalInserted += pageStats.inserted;
        totalUpdated += pageStats.updated;
        totalDeactivated += pageStats.deactivated;
        if (pageStats.latestChangedAt) lastChangedAt = pageStats.latestChangedAt;
      } else {
        await setConfigValues({
          officeportal_sync_cursor: nextCursor || '',
          officeportal_last_changed_at: lastChangedAt,
          officeportal_sync_status: 'SYNCED'
        });
      }

      if (!nextCursor) break;
    }

    await query(
      `UPDATE hrms_sync_logs
       SET status = 'SUCCESS',
           delta_cursor = $1,
           last_changed_at = $2,
           records_fetched = $3,
           records_inserted = $4,
           records_updated = $5,
           records_deactivated = $6,
           completed_at = NOW()
       WHERE id = $7`,
      [nextCursor, lastChangedAt, totalFetched, totalInserted, totalUpdated, totalDeactivated, logId]
    );

    return {
      success: true,
      totalFetched,
      totalInserted,
      totalUpdated,
      totalDeactivated,
      nextCursor,
      lastChangedAt
    };
  } catch (err) {
    const cleanErr = sanitizeError(err, 'Delta change feed sync failed');
    await query(
      `UPDATE hrms_sync_logs
       SET status = 'FAILED', error_message = $1, completed_at = NOW()
       WHERE id = $2`,
      [cleanErr.message, logId]
    ).catch(() => {});
    throw cleanErr;
  }
}

/**
 * Sequentially process a batch of newly ingested webhook events on a single DB connection
 */
async function processQueuedWebhookEvents(queuedItems) {
  if (!queuedItems || queuedItems.length === 0) return;

  const client = await getClient();
  try {
    for (const item of queuedItems) {
      const { recordId, evt, eventType } = item;
      try {
        await client.query('BEGIN');
        const emp = evt.data || {};
        const isDeleted =
          (Array.isArray(evt.types) && evt.types.includes('employee.deleted')) ||
          eventType.includes('deleted') ||
          Boolean(emp.deletedAt);

        if (isDeleted) {
          await applyEmployeeDeletion(
            client,
            emp.employeeId || null,
            emp.employeeCode || null,
            emp.deletedAt || evt.occurredAt
          );
        } else {
          await upsertMasterEmployee(client, emp, evt.occurredAt || null);
        }

        await client.query(
          `UPDATE hrms_webhook_events
           SET status = 'PROCESSED', processed_at = NOW(), error_message = NULL
           WHERE id = $1`,
          [recordId]
        );
        await client.query('COMMIT');
      } catch (procErr) {
        await client.query('ROLLBACK').catch(() => {});
        const cleanMsg = sanitizeError(procErr).message;
        await client.query(
          `UPDATE hrms_webhook_events
           SET status = 'FAILED', error_message = $1
           WHERE id = $2`,
          [cleanMsg, recordId]
        ).catch(() => {});
      }
    }
  } finally {
    client.release();
  }
}

/**
 * Ingest incoming OfficePortal webhook delivery:
 * 1. Verify X-Awarious-Signature against rawBody bytes using whsec_* keys
 * 2. Batch-insert up to 200 events into hrms_webhook_events (idempotent ON CONFLICT DO NOTHING)
 * 3. Release DB connection immediately so HTTP 200 OK returns fast (<5s per Platform Guide)
 * 4. Enqueue events onto the sequential single-connection worker to preserve delivery ordering
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

  const deliveryId = parsedPayload?.deliveryId || null;
  const events = Array.isArray(parsedPayload?.events) ? parsedPayload.events : [];
  const queued = [];

  if (events.length > 0) {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      for (const evt of events) {
        const eventId = evt.eventId || evt.id;
        if (!eventId) continue;

        const eventTypes = evt.types || ['employee.unknown'];
        const eventType = Array.isArray(eventTypes) ? eventTypes.join(',') : String(eventTypes);
        const occurredAt = evt.occurredAt ? new Date(evt.occurredAt) : null;

        const insertRes = await client.query(
          `INSERT INTO hrms_webhook_events
             (event_id, event_type, delivery_id, occurred_at, payload, signature_verified, status, received_at)
           VALUES ($1, $2, $3, $4, $5, true, 'PENDING', NOW())
           ON CONFLICT (event_id) DO NOTHING
           RETURNING id`,
          [eventId, eventType, deliveryId, occurredAt, JSON.stringify(evt)]
        );

        const recordId = insertRes.rows[0]?.id;
        if (recordId) {
          queued.push({ recordId, evt, eventType });
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  // Enqueue onto sequential background worker (preserves exact order: created -> updated)
  if (queued.length > 0) {
    webhookWorkerTail = webhookWorkerTail
      .then(() => processQueuedWebhookEvents(queued))
      .catch((err) => console.error('[OfficePortal Webhook Worker] error:', err.message));
  }

  return {
    success: true,
    deliveryId,
    processedEvents: events.length,
    queuedEvents: queued.length
  };
}

/**
 * 30-day rolling PII retention & 180-day audit row pruning for hrms_webhook_events:
 * 1. Redacts raw employee PII from `payload` on PROCESSED rows older than 30 days,
 *    preserving non-PII audit metadata (eventId, deliveryId, eventType, employeeCode, occurredAt).
 * 2. Deletes PROCESSED rows older than 180 days.
 */
async function cleanupWebhookPiiRetention() {
  const redactRes = await query(
    `UPDATE hrms_webhook_events
     SET payload = jsonb_build_object(
       'redacted', true,
       'redactedAt', NOW(),
       'eventId', event_id,
       'deliveryId', delivery_id,
       'eventType', event_type,
       'occurredAt', occurred_at,
       'employeeCode', COALESCE(payload->'data'->>'employeeCode', payload->>'employeeCode')
     )
     WHERE status = 'PROCESSED'
       AND received_at < NOW() - INTERVAL '30 days'
       AND COALESCE(payload->>'redacted', 'false') != 'true'`
  );

  const pruneRes = await query(
    `DELETE FROM hrms_webhook_events
     WHERE status = 'PROCESSED'
       AND received_at < NOW() - INTERVAL '180 days'`
  );

  return {
    redactedCount: redactRes.rowCount || 0,
    prunedCount: pruneRes.rowCount || 0
  };
}

module.exports = {
  isValidSignature,
  getAccessToken,
  getConfig,
  setConfigValues,
  clearCaches,
  waitForWebhookDrain,
  extractCalendarDate,
  getTodayDateString,
  isEmployeeLockedOut,
  sanitizeError,
  requestWithRetry,
  getDepartmentsMaster,
  getJobTitlesMaster,
  getEmploymentTypesMaster,
  getUsageStats,
  getEmployeeById,
  getEmployeeByCode,
  testConnection,
  syncDepartmentsMaster,
  syncJobTitlesMaster,
  syncEmploymentTypesMaster,
  syncAllMasterLists,
  upsertMasterEmployee,
  applyEmployeeDeletion,
  syncFullDirectory,
  syncDeltaChanges,
  handleWebhookDelivery,
  cleanupWebhookPiiRetention
};

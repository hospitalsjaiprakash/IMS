const { query } = require('../config/database');

const CACHE_TTL_MS = 30 * 1000; // 30 seconds

let cachedConfig = null;
let cacheExpiresAt = 0;

function clampInt(val, defaultVal, min, max) {
  const parsed = parseInt(val, 10);
  if (Number.isNaN(parsed)) return defaultVal;
  return Math.min(max, Math.max(min, parsed));
}

function parseBool(val, defaultVal = false) {
  if (val === undefined || val === null || val === '') return defaultVal;
  if (typeof val === 'boolean') return val;
  const normalized = String(val).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return defaultVal;
}

function buildParsedConfig(rawMap = {}) {
  return {
    hod_reminder_1_days: clampInt(rawMap.hod_reminder_1_days, 5, 1, 30),
    hod_reminder_2_days: clampInt(rawMap.hod_reminder_2_days, 7, 1, 30),
    hod_escalation_1_days: clampInt(rawMap.hod_escalation_1_days, 14, 1, 60),
    hod_escalation_2_days: clampInt(rawMap.hod_escalation_2_days, 21, 1, 60),
    hod_escalation_3_days: clampInt(rawMap.hod_escalation_3_days, 28, 1, 90),
    imc_feedback_days: clampInt(rawMap.imc_feedback_days, 7, 1, 30),
    mgmt_feedback_days: clampInt(rawMap.mgmt_feedback_days, 7, 1, 30),
    auto_reminder_days: clampInt(rawMap.auto_reminder_days, 2, 1, 14),
    otp_validity_minutes: clampInt(rawMap.otp_validity_minutes, 10, 1, 60),
    email_notifications_enabled: parseBool(rawMap.email_notifications_enabled, true),
    maintenance_mode: parseBool(rawMap.maintenance_mode, false),
    raw: rawMap
  };
}

async function getRuntimeSystemConfig(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedConfig && now < cacheExpiresAt) {
    return cachedConfig;
  }

  try {
    const res = await query('SELECT key, value FROM system_config');
    const rawMap = {};
    for (const row of res.rows) {
      rawMap[row.key] = row.value;
    }
    cachedConfig = buildParsedConfig(rawMap);
    cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    return cachedConfig;
  } catch (err) {
    if (cachedConfig) return cachedConfig;
    return buildParsedConfig({});
  }
}

function invalidateSystemConfigCache() {
  cachedConfig = null;
  cacheExpiresAt = 0;
}

module.exports = {
  getRuntimeSystemConfig,
  invalidateSystemConfigCache,
  CACHE_TTL_MS
};

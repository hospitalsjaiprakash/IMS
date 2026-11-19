/**
 * Secret Encryption at Rest (AES-256-GCM) & Strict OfficePortal URL Allowlisting
 *
 * Format for encrypted values stored in PostgreSQL system_config:
 *   enc:v1:<iv_base64>:<authTag_base64>:<ciphertext_base64>
 *
 * Key source: process.env.CONFIG_ENCRYPTION_KEY (32-byte key as 64-char hex or 44-char base64).
 */

const crypto = require('node:crypto');

const ENC_PREFIX = 'enc:v1:';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

const SECRET_CONFIG_KEYS = new Set([
  'officeportal_client_secret',
  'officeportal_webhook_secret',
  'officeportal_webhook_secret_previous'
]);

const ALLOWED_OFFICEPORTAL_HOSTS = {
  auth: new Set(['accounts.awarious.com']),
  api: new Set(['publicapi.officeportal.io'])
};

const TEST_ONLY_LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

/**
 * Parse and validate the 256-bit encryption key from process.env.CONFIG_ENCRYPTION_KEY
 */
function getEncryptionKeyBuffer() {
  const raw = (process.env.CONFIG_ENCRYPTION_KEY || '').trim();
  if (!raw) {
    const err = new Error('CONFIG_ENCRYPTION_KEY environment variable is required to encrypt or decrypt secrets.');
    err.code = 'CONFIG_ENCRYPTION_KEY_MISSING';
    throw err;
  }

  let keyBuf = null;
  if (/^[0-9a-f]{64}$/i.test(raw)) {
    keyBuf = Buffer.from(raw, 'hex');
  } else {
    const decoded = Buffer.from(raw, 'base64');
    if (decoded.length === 32) {
      keyBuf = decoded;
    }
  }

  if (!keyBuf || keyBuf.length !== 32) {
    const err = new Error('CONFIG_ENCRYPTION_KEY must be a 32-byte key encoded as 64 hex characters or base64.');
    err.code = 'CONFIG_ENCRYPTION_KEY_INVALID';
    throw err;
  }

  return keyBuf;
}

function isEncryptedSecret(value) {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX);
}

/**
 * Encrypt a secret plaintext string using AES-256-GCM.
 * Empty/null values return empty string. Already-encrypted values are returned unchanged.
 */
function encryptSecret(plaintext) {
  if (plaintext === null || plaintext === undefined) return '';
  const str = String(plaintext);
  if (!str) return '';
  if (isEncryptedSecret(str)) {
    // Only skip re-encryption if the value is genuinely valid ciphertext for the current key
    try {
      decryptSecret(str);
      return str;
    } catch (_) {
      // Fall through and encrypt as plaintext so malformed strings never break getConfig()
    }
  }

  const key = getEncryptionKeyBuffer();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const ciphertext = Buffer.concat([cipher.update(str, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${ENC_PREFIX}${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`;
}

/**
 * Decrypt a stored secret value.
 * - Values without the `enc:v1:` prefix are treated as legacy plaintext for zero-downtime migration.
 * - Values with `enc:v1:` MUST authenticate with the GCM tag; any tampering/corruption fails closed.
 */
function decryptSecret(storedValue) {
  if (storedValue === null || storedValue === undefined) return '';
  const str = String(storedValue);
  if (!str) return '';

  // Transparent legacy plaintext compatibility
  if (!isEncryptedSecret(str)) {
    return str;
  }

  const parts = str.split(':');
  if (parts.length !== 5 || parts[0] !== 'enc' || parts[1] !== 'v1') {
    const err = new Error('Encrypted secret format is invalid.');
    err.code = 'SECRET_DECRYPTION_FAILED';
    throw err;
  }

  const [, , ivB64, tagB64, ctB64] = parts;
  let iv;
  let authTag;
  let ciphertext;
  try {
    iv = Buffer.from(ivB64, 'base64');
    authTag = Buffer.from(tagB64, 'base64');
    ciphertext = Buffer.from(ctB64, 'base64');
  } catch (decodeErr) {
    const err = new Error('Encrypted secret payload could not be decoded.');
    err.code = 'SECRET_DECRYPTION_FAILED';
    throw err;
  }

  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
    const err = new Error('Encrypted secret has invalid IV or authentication tag length.');
    err.code = 'SECRET_DECRYPTION_FAILED';
    throw err;
  }

  const key = getEncryptionKeyBuffer();
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (decErr) {
    const err = new Error('Failed to decrypt stored secret (tampered ciphertext or wrong CONFIG_ENCRYPTION_KEY).');
    err.code = 'SECRET_DECRYPTION_FAILED';
    throw err;
  }
}

/**
 * Strict URL allowlist guard preventing SSRF and credential exfiltration via editable HRMS URLs.
 *
 * @param {string} rawUrl - URL to validate
 * @param {'auth'|'api'} kind - Endpoint class ('auth' => accounts.awarious.com, 'api' => publicapi.officeportal.io)
 * @returns {string} Normalized valid URL string
 */
function assertAllowedOfficePortalUrl(rawUrl, kind = 'api') {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) {
    const err = new Error(`OfficePortal ${kind} URL must not be empty.`);
    err.statusCode = 400;
    err.code = 'INVALID_OFFICEPORTAL_URL';
    throw err;
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch (_) {
    const err = new Error(`Invalid OfficePortal ${kind} URL format.`);
    err.statusCode = 400;
    err.code = 'INVALID_OFFICEPORTAL_URL';
    throw err;
  }

  // Reject embedded credentials in URL (e.g. https://user:pass@host)
  if (parsed.username || parsed.password) {
    const err = new Error('OfficePortal URL must not contain embedded credentials.');
    err.statusCode = 400;
    err.code = 'INVALID_OFFICEPORTAL_URL';
    throw err;
  }

  const hostname = parsed.hostname.toLowerCase();
  const isTestEnv = process.env.NODE_ENV === 'test';

  // Local mock server is permitted ONLY during automated test runs
  if (isTestEnv && TEST_ONLY_LOCAL_HOSTS.has(hostname) && (parsed.protocol === 'http:' || parsed.protocol === 'https:')) {
    return trimmed;
  }

  if (parsed.protocol !== 'https:') {
    const err = new Error('OfficePortal URL must use HTTPS.');
    err.statusCode = 400;
    err.code = 'INVALID_OFFICEPORTAL_URL';
    throw err;
  }

  if (parsed.port && parsed.port !== '443') {
    const err = new Error('OfficePortal URL must use the standard HTTPS port (443).');
    err.statusCode = 400;
    err.code = 'INVALID_OFFICEPORTAL_URL';
    throw err;
  }

  const allowedSet = ALLOWED_OFFICEPORTAL_HOSTS[kind] || new Set([
    ...ALLOWED_OFFICEPORTAL_HOSTS.auth,
    ...ALLOWED_OFFICEPORTAL_HOSTS.api
  ]);

  if (!allowedSet.has(hostname)) {
    const allowedList = Array.from(allowedSet).join(', ');
    const err = new Error(`Disallowed OfficePortal ${kind} host "${hostname}". Permitted host(s): ${allowedList}.`);
    err.statusCode = 400;
    err.code = 'INVALID_OFFICEPORTAL_URL';
    throw err;
  }

  return trimmed;
}

module.exports = {
  ENC_PREFIX,
  SECRET_CONFIG_KEYS,
  isEncryptedSecret,
  encryptSecret,
  decryptSecret,
  assertAllowedOfficePortalUrl
};

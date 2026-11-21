/**
 * Prefixes every R2 write key when STORAGE_KEY_PREFIX is configured (e.g. "staging/").
 * Ensures staging uploads and generated letter PDFs never collide with or overwrite
 * production objects in the shared Cloudflare R2 bucket.
 */
const getStoragePrefix = () => (process.env.STORAGE_KEY_PREFIX || '').trim().replace(/^\/+/, '');

function withStoragePrefix(key) {
  if (!key || typeof key !== 'string') return key;
  const prefix = getStoragePrefix();
  if (!prefix) return key;
  const normalizedPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`;
  return key.startsWith(normalizedPrefix) ? key : `${normalizedPrefix}${key}`;
}

module.exports = {
  getStoragePrefix,
  withStoragePrefix,
};

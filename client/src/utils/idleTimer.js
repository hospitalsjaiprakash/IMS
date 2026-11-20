export const IDLE_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes silent inactivity timeout
export const ACTIVITY_STORAGE_KEY = 'ims_last_activity_at';
export const LOGOUT_BROADCAST_KEY = 'ims_logout_at';

/**
 * Parse a stored activity timestamp safely (returns 0 if invalid/missing).
 */
export function parseActivityTimestamp(raw) {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * Resolve the freshest activity timestamp across per-tab sessionStorage and
 * cross-tab localStorage so active work in another tab keeps all tabs alive.
 */
export function resolveLatestActivityTimestamp(sessionRaw, localRaw) {
  const sessionTs = parseActivityTimestamp(sessionRaw);
  const localTs = parseActivityTimestamp(localRaw);
  return Math.max(sessionTs, localTs);
}

/**
 * Return true when wall-clock elapsed inactivity has reached or exceeded timeoutMs.
 */
export function isIdleExpired(lastActivityTs, nowTs, timeoutMs = IDLE_TIMEOUT_MS) {
  if (!Number.isFinite(lastActivityTs) || lastActivityTs <= 0) return false;
  return nowTs - lastActivityTs >= timeoutMs;
}

import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import {
  IDLE_TIMEOUT_MS,
  ACTIVITY_STORAGE_KEY,
  LOGOUT_BROADCAST_KEY,
  resolveLatestActivityTimestamp,
  isIdleExpired,
} from '../utils/idleTimer';

export { IDLE_TIMEOUT_MS };

const THROTTLE_MS = 15 * 1000; // Update activity timestamp at most once per 15s
const CHECK_INTERVAL_MS = 30 * 1000; // Poll wall-clock elapsed time every 30s

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];

const readStoredActivity = () => {
  let sessionRaw = null;
  let localRaw = null;
  try {
    sessionRaw = sessionStorage.getItem(ACTIVITY_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
  try {
    localRaw = localStorage.getItem(ACTIVITY_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
  return resolveLatestActivityTimestamp(sessionRaw, localRaw);
};

const persistActivity = (timestamp) => {
  const val = String(timestamp);
  try {
    sessionStorage.setItem(ACTIVITY_STORAGE_KEY, val);
  } catch {
    // ignore storage errors
  }
  try {
    localStorage.setItem(ACTIVITY_STORAGE_KEY, val);
  } catch {
    // ignore storage errors
  }
};

/**
 * Silent 60-minute inactivity auto-logout hook (no warning modal).
 * Tracks pointer/keyboard/touch/scroll activity across tabs and page reloads,
 * and propagates logout immediately across open tabs.
 */
export function useIdleLogout({ timeoutMs = IDLE_TIMEOUT_MS } = {}) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);
  const clearLocalSession = useAuthStore((s) => s.clearLocalSession);
  const navigate = useNavigate();

  const lastActivityRef = useRef(0);
  const loggingOutRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) {
      loggingOutRef.current = false;
      return undefined;
    }

    const triggerSilentLogout = async () => {
      if (loggingOutRef.current) return;
      loggingOutRef.current = true;
      await logout();
      navigate('/login', { replace: true });
    };

    const triggerCrossTabLogout = () => {
      if (loggingOutRef.current) return;
      loggingOutRef.current = true;
      clearLocalSession({ broadcast: false });
      navigate('/login', { replace: true });
    };

    const now = Date.now();
    const stored = readStoredActivity();
    if (isIdleExpired(stored, now, timeoutMs)) {
      triggerSilentLogout();
      return undefined;
    }

    const initialTs = stored > 0 ? stored : now;
    lastActivityRef.current = initialTs;
    persistActivity(initialTs);

    const recordActivity = () => {
      if (loggingOutRef.current) return;
      const current = Date.now();
      if (current - lastActivityRef.current < THROTTLE_MS) {
        return;
      }
      lastActivityRef.current = current;
      persistActivity(current);
    };

    const checkIdle = () => {
      if (loggingOutRef.current) return;
      const latestStored = readStoredActivity();
      if (latestStored > lastActivityRef.current) {
        lastActivityRef.current = latestStored;
      }
      if (isIdleExpired(lastActivityRef.current, Date.now(), timeoutMs)) {
        triggerSilentLogout();
      }
    };

    const handleStorage = (event) => {
      // Another tab logged out (manually or via idle timeout) — clear this tab immediately
      if (
        event.key === LOGOUT_BROADCAST_KEY ||
        (event.key === ACTIVITY_STORAGE_KEY && event.newValue === null)
      ) {
        triggerCrossTabLogout();
        return;
      }

      if (event.key === ACTIVITY_STORAGE_KEY && event.newValue) {
        const ts = Number(event.newValue);
        if (Number.isFinite(ts) && ts > lastActivityRef.current) {
          lastActivityRef.current = ts;
          try {
            sessionStorage.setItem(ACTIVITY_STORAGE_KEY, String(ts));
          } catch {
            // ignore
          }
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkIdle();
      }
    };

    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, recordActivity, { passive: true });
    }
    window.addEventListener('storage', handleStorage);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const intervalId = window.setInterval(checkIdle, CHECK_INTERVAL_MS);

    return () => {
      for (const evt of ACTIVITY_EVENTS) {
        window.removeEventListener(evt, recordActivity);
      }
      window.removeEventListener('storage', handleStorage);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [isAuthenticated, logout, clearLocalSession, navigate, timeoutMs]);
}

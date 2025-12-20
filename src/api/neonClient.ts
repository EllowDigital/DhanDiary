import { Pool } from '@neondatabase/serverless';
import Constants from 'expo-constants';
import NetInfo from '@react-native-community/netinfo';

// Read NEON_URL from Expo config (app.config.js) -> Constants.expoConfig?.extra
const NEON_URL = (Constants?.expoConfig?.extra as any)?.NEON_URL || process.env.NEON_URL || null;

const pool = NEON_URL ? new Pool({ connectionString: NEON_URL }) : null;

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

const defaultTimeout = 60000; // 60s default timeout per request
const NETINFO_CACHE_MS = 15000;
const CIRCUIT_FUSE_MAX_MS = 15000;

const withTimeout = <T>(p: Promise<T>, ms = defaultTimeout): Promise<T> =>
  Promise.race([
    p,
    new Promise<T>((_r, rej) => setTimeout(() => rej(new Error('Request timed out')), ms)),
  ] as any);

let lastHealthyAt: number | null = null;
let lastLatencyMs: number | null = null;
let lastErrorMessage: string | null = null;
let circuitOpenUntil = 0;
let cachedNetInfoAt = 0;
let cachedIsConnected: boolean | null = null;
let warmPromise: Promise<void> | null = null;

const recordSuccess = (latencyMs: number) => {
  lastHealthyAt = Date.now();
  lastLatencyMs = latencyMs;
  lastErrorMessage = null;
  circuitOpenUntil = 0;
};

const recordFailure = (err: unknown) => {
  const message =
    err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown Neon error';
  lastErrorMessage = message;
};

const ensureRecentNetState = async () => {
  const now = Date.now();
  if (cachedIsConnected !== null && now - cachedNetInfoAt < NETINFO_CACHE_MS) {
    return cachedIsConnected;
  }

  cachedNetInfoAt = now;
  try {
    if (typeof NetInfo?.fetch === 'function') {
      const snapshot = await NetInfo.fetch();
      cachedIsConnected = !!snapshot.isConnected;
    } else {
      cachedIsConnected = true;
    }
  } catch (err) {
    // If NetInfo fails (e.g., during tests), assume online so we can still hit Neon.
    cachedIsConnected = true;
  }
  return cachedIsConnected;
};

const shouldShortCircuit = () => Date.now() < circuitOpenUntil;

const bumpCircuit = (attempt: number) => {
  const backoff = Math.min(2000 * attempt, CIRCUIT_FUSE_MAX_MS);
  circuitOpenUntil = Date.now() + backoff;
};

export type NeonHealthSnapshot = {
  isConfigured: boolean;
  lastHealthyAt: number | null;
  lastLatencyMs: number | null;
  lastErrorMessage: string | null;
  circuitOpenUntil: number | null;
};

export const getNeonHealth = (): NeonHealthSnapshot => ({
  isConfigured: !!pool,
  lastHealthyAt,
  lastLatencyMs,
  lastErrorMessage,
  circuitOpenUntil: circuitOpenUntil > Date.now() ? circuitOpenUntil : null,
});

export const warmNeonConnection = async () => {
  if (!pool) return;
  if (warmPromise) return warmPromise;

  warmPromise = (async () => {
    try {
      const start = Date.now();
      await withTimeout(pool.query('SELECT 1'), 25000);
      recordSuccess(Date.now() - start);
    } catch (err) {
      recordFailure(err);
      bumpCircuit(1);
      throw err;
    } finally {
      warmPromise = null;
    }
  })();

  return warmPromise;
};

/**
 * Robust query wrapper with retries/backoff and timeout.
 * - Retries on transient network errors up to `retries` times.
 * - Applies a per-request timeout.
 */
export const query = async (
  text: string,
  params: any[] = [],
  opts?: { retries?: number; timeoutMs?: number }
) => {
  if (!pool) {
    throw new Error('Neon requires internet + NEON_URL');
  }

  if (shouldShortCircuit()) {
    throw new Error('Neon temporarily unavailable. Retrying shortly.');
  }

  const online = await ensureRecentNetState();
  if (!online) {
    bumpCircuit(1);
    const offlineError = new Error('Offline');
    recordFailure(offlineError);
    throw offlineError;
  }

  // Treat timeouts as transient and increase retries by default to handle brief network hiccups
  const { retries = 3, timeoutMs = defaultTimeout } = opts || {};

  let attempt = 0;
  let lastErr: any = null;
  while (attempt <= retries) {
    try {
      const start = Date.now();
      const result = await withTimeout(pool.query(text, params), timeoutMs);
      recordSuccess(Date.now() - start);
      return result.rows;
    } catch (error) {
      lastErr = error;
      recordFailure(error);
      // Normalize potential Event-like errors (e.g. WebSocket error events from the pool)
      // Some environments surface low-level WS errors as Event objects which are not
      // instanceof Error. Inspect and convert to a readable Error so our transient
      // detection and logging behave predictably.
      let normalizedError: any = error;
      if (error && typeof error === 'object' && !(error instanceof Error)) {
        try {
          const eAny: any = error;
          // If it looks like a WebSocket event, construct a short message
          if (eAny && eAny.type && eAny.target && eAny.target.readyState !== undefined) {
            const ready = eAny.target.readyState;
            const url = eAny.target.url || '<socket>';
            const msg = `WebSocket event type=${String(eAny.type)} readyState=${String(
              ready
            )} url=${String(url)}`;
            // replace lastErr with an Error wrapper for consistent downstream handling
            lastErr = new Error(msg);
            // Use normalizedError for further processing instead of reassigning the catch param
            normalizedError = lastErr;
          } else if (eAny && eAny.message) {
            // Ensure we don't treat a generic object with just message as 'unknown'
            normalizedError = eAny;
          }
        } catch (e) {
          // fallthrough — keep original error
        }
      }
      // Determine if the error looks transient (network / timeout / connection reset)
      const msg = String(
        ((normalizedError as any) && ((normalizedError as any).message || normalizedError)) || ''
      ).toLowerCase();
      const isTransient =
        msg.includes('timeout') ||
        msg.includes('ec timed out') ||
        msg.includes('connection') ||
        msg.includes('network') ||
        msg.includes('offline') ||
        msg.includes('socket') ||
        msg.includes('websocket') ||
        msg.includes('econnreset') ||
        msg.includes('enotfound');

      // Treat our explicit 'Request timed out' as transient too
      if (msg.includes('request timed out')) {
        // mark as transient
      }

      // Avoid noisy logs for unique-constraint collisions (handled by callers)
      try {
        const e: any = normalizedError;
        const code = e && e.code ? String(e.code) : '';
        const msgFull = String(e && e.message ? e.message : '');
        if (
          code === '23505' ||
          msgFull.toLowerCase().includes('duplicate key') ||
          msgFull.includes('idx_cash_entries_client_id')
        ) {
          console.warn('Neon Query duplicate key (suppressed):', msgFull);
          throw error;
        }
      } catch (e) {
        // ignore logging failure
      }

      if (!isTransient) {
        // not transient — log and rethrow immediately
        console.error('Neon Query Error (permanent):', normalizedError);
        throw normalizedError;
      }

      // transient — retry with exponential backoff
      attempt += 1;
      const backoff = Math.min(2000 * attempt, 8000);
      bumpCircuit(attempt);
      console.warn(
        `Neon Query transient error, retrying attempt ${attempt}/${retries} after ${backoff}ms`,
        error
      );
      if (attempt > retries) break;
      await sleep(backoff);
    }
  }

  // all retries exhausted
  console.error('Neon Query failed after retries:', lastErr);
  throw lastErr;
};

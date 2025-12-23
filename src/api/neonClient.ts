import { neon } from '@neondatabase/serverless';
import Constants from 'expo-constants';
import NetInfo from '@react-native-community/netinfo';

// Read NEON_URL from Expo config (app.config.js) -> Constants.expoConfig?.extra
const NEON_URL = (Constants?.expoConfig?.extra as any)?.NEON_URL || process.env.NEON_URL || null;

// Use stateless HTTP client
const sql = NEON_URL ? neon(NEON_URL) : null;

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

const defaultTimeout = 120000; // 120s default timeout per request (mobile networks can be slow)
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

const getHostFromUrl = (u: string | null) => {
  try {
    if (!u) return null;
    // Try to parse as URL; if it contains credentials, mask them
    const parsed = new URL(u);
    return parsed.hostname;
  } catch (e) {
    // fallback: try to strip credentials
    try {
      const noCred = (u || '').split('@').pop();
      return noCred ? noCred.split('/')[0] : null;
    } catch (ee) {
      return null;
    }
  }
};

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
  isConfigured: !!sql,
  lastHealthyAt,
  lastLatencyMs,
  lastErrorMessage,
  circuitOpenUntil: circuitOpenUntil > Date.now() ? circuitOpenUntil : null,
});

export const warmNeonConnection = async () => {
  if (!sql) return;
  if (warmPromise) return warmPromise;

  warmPromise = (async () => {
    try {
      const start = Date.now();
      // Use the HTTP client's query method consistently to avoid SDK surface differences
      const runner = (sql as any).query || (sql as any);
      await withTimeout(runner('SELECT 1', []), 45000);
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

// Additional helper for debugging: attempt a quick health check and return boolean
export const checkNeonConnection = async (timeoutMs = 10000): Promise<boolean> => {
  try {
    await Promise.race([
      warmNeonConnection(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
    ]);
    return true;
  } catch (e) {
    return false;
  }
};

/**
 * Robust query wrapper with retries/backoff and timeout.
 * - Retries on transient network errors up to `retries` times.
 * - Applies a per-request timeout.
 * - Uses HTTP driver (stateless) via `neon` package.
 */
export const query = async (
  text: string,
  params: any[] = [],
  opts?: { retries?: number; timeoutMs?: number }
): Promise<any[]> => {
  if (!sql) {
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

  const { retries = 3, timeoutMs = defaultTimeout } = opts || {};

  let attempt = 0;
  let lastErr: any = null;
  while (attempt <= retries) {
    try {
      const start = Date.now();
      // Execute query via HTTP driver
      // Use .query() for parameterized execution as per latest SDK
      const runner = (sql as any).query || (sql as any);
      const result: any = await withTimeout(runner(text, params), timeoutMs);
      recordSuccess(Date.now() - start);
      // Check if result has .rows (pg-compatible) or is array (neon-native)
      return Array.isArray(result) ? result : result.rows || [];
    } catch (error) {
      lastErr = error;
      recordFailure(error);

      const msg = String(((error as any) && ((error as any).message || error)) || '').toLowerCase();

      const isTransient =
        msg.includes('timeout') ||
        msg.includes('timed out') ||
        msg.includes('connection') ||
        msg.includes('network') ||
        msg.includes('offline') ||
        msg.includes('socket') ||
        msg.includes('websocket') ||
        msg.includes('econnreset') ||
        msg.includes('enotfound') ||
        msg.includes('fetch'); // fetch errors

      // Unique violations are permanent
      if (
        (error as any)?.code === '23505' ||
        msg.includes('duplicate key') ||
        msg.includes('unique constraint')
      ) {
        console.warn('Neon Query duplicate key (suppressed):', msg);
        throw error;
      }

      if (!isTransient) {
        console.error('Neon Query Error (permanent):', error);
        throw error;
      }

      attempt += 1;
      const backoff = Math.min(2000 * attempt, 8000);
      bumpCircuit(attempt);
      const host = getHostFromUrl(NEON_URL as any);
      console.warn(
        `Neon Query transient error (${host || 'host unknown'}), retrying attempt ${attempt}/${retries} after ${backoff}ms`,
        error
      );
      if (attempt > retries) break;
      await sleep(backoff);
    }
  }

  console.error('Neon Query failed after retries:', lastErr);
  throw lastErr;
};

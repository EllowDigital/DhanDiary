import { neon } from '@neondatabase/serverless';
import Constants from 'expo-constants';
import NetInfo from '@react-native-community/netinfo';

// Read NEON_URL from Expo config (app.config.js) -> Constants.expoConfig?.extra
const NEON_URL = (Constants?.expoConfig?.extra as any)?.NEON_URL || process.env.NEON_URL || null;

// neon() returns an http client. Prefer calling `.query(text, params)` on it.
const sql = NEON_URL ? neon(NEON_URL) : null;

// Timeouts / caches
const DEFAULT_TIMEOUT_MS = 45000;
const NETINFO_CACHE_MS = 10000;
const CIRCUIT_FUSE_MAX_MS = 30000;

// State
let lastHealthyAt: number | null = null;
let lastLatencyMs: number | null = null;
let lastErrorMessage: string | null = null;
let circuitOpenUntil = 0;
let cachedNetInfoAt = 0;
let cachedIsConnected: boolean | null = null;
let warmPromise: Promise<void> | null = null;

export type NeonHealthSnapshot = {
  isConfigured: boolean;
  lastHealthyAt: number | null;
  lastLatencyMs: number | null;
  lastErrorMessage: string | null;
  circuitOpenUntil: number | null;
};

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([
    p,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error(`Request timed out after ${ms}ms`)), ms)
    ),
  ] as any);

const getHostFromUrl = (u: string | null) => {
  try {
    if (!u) return 'unknown';
    const parsed = new URL(u);
    return parsed.hostname;
  } catch (e) {
    return 'unknown';
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

const shouldShortCircuit = () => Date.now() < circuitOpenUntil;

const bumpCircuit = (attempt: number) => {
  const backoff = Math.min(2000 * attempt, CIRCUIT_FUSE_MAX_MS);
  circuitOpenUntil = Date.now() + backoff;
};

const ensureRecentNetState = async () => {
  const now = Date.now();
  if (cachedIsConnected !== null && now - cachedNetInfoAt < NETINFO_CACHE_MS) {
    return cachedIsConnected;
  }

  cachedNetInfoAt = now;
  try {
    const snapshot = await NetInfo.fetch();
    cachedIsConnected = !!snapshot.isConnected;
  } catch (err) {
    cachedIsConnected = true;
  }
  return cachedIsConnected;
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
      if (typeof (sql as any).query === 'function') {
        await withTimeout((sql as any).query('SELECT 1', []), 15000);
        recordSuccess(Date.now() - start);
      } else {
        throw new Error('Neon client missing .query() method');
      }
    } catch (err) {
      recordFailure(err);
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn('[Neon] Warm-up failed', err);
      }
    } finally {
      warmPromise = null;
    }
  })();

  return warmPromise;
};

export const checkNeonConnection = async (timeoutMs = 10000): Promise<boolean> => {
  try {
    const p = warmNeonConnection();
    await Promise.race([
      p || Promise.resolve(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
    ]);
    return !!lastHealthyAt && Date.now() - lastHealthyAt < 60000;
  } catch (e) {
    return false;
  }
};

export const query = async <T = any>(
  text: string,
  params: any[] = [],
  opts?: { retries?: number; timeoutMs?: number }
): Promise<T[]> => {
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

  const { retries = 3, timeoutMs = DEFAULT_TIMEOUT_MS } = opts || {};

  let attempt = 0;
  let lastErr: any = null;
  while (attempt <= retries) {
    try {
      const start = Date.now();
      if (typeof (sql as any).query === 'function') {
        const result: any = await withTimeout((sql as any).query(text, params), timeoutMs);
        recordSuccess(Date.now() - start);
        return Array.isArray(result) ? result : result.rows || [];
      } else {
        throw new Error('Incompatible Neon client: expected .query() method');
      }
    } catch (error) {
      lastErr = error;
      recordFailure(error);

      const msg = String(((error as any) && ((error as any).message || error)) || '').toLowerCase();

      const isTransient =
        msg.includes('timeout') ||
        msg.includes('timed out') ||
        msg.includes('connection') ||
        msg.includes('network') ||
        msg.includes('socket') ||
        msg.includes('websocket') ||
        msg.includes('econnreset') ||
        msg.includes('enotfound') ||
        msg.includes('fetch') ||
        msg.includes('502') ||
        msg.includes('503');

      if (
        (error as any)?.code === '23505' ||
        msg.includes('duplicate key') ||
        msg.includes('unique constraint')
      ) {
        console.warn('Neon Query duplicate key (suppressed):', msg);
        throw error;
      }

      if (!isTransient) {
        // Suppress noisy ERROR-level logs for missing remote tables (common in early deploys).
        // The caller (e.g. pullFromNeon) may handle this and set a session guard.
        if (
          msg.includes('relation') &&
          msg.includes('transactions') &&
          msg.includes('does not exist')
        ) {
          if (typeof __DEV__ !== 'undefined' && __DEV__) {
            console.warn('Neon Query permanent error (remote table missing):', msg);
          }
        } else {
          if (typeof __DEV__ !== 'undefined' && __DEV__) {
            console.error('Neon Query Error (permanent):', error);
          } else {
            console.warn('Neon Query encountered an error (suppressed)');
          }
        }
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

  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.error('Neon Query failed after retries:', lastErr);
    throw lastErr;
  } else {
    // Hide implementation details from end-users; rethrow a generic error
    console.warn('Neon Query failed after retries (suppressed)');
    throw new Error('Server temporarily unavailable. Please try again later.');
  }
};

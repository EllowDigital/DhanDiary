import { neon } from '@neondatabase/serverless';
import Constants from 'expo-constants';
import NetInfo from '@react-native-community/netinfo';

// --- Configuration ---

// Read NEON_URL from Expo config (app.config.js) -> Constants.expoConfig?.extra
const NEON_URL = (Constants?.expoConfig?.extra as any)?.NEON_URL || process.env.NEON_URL || null;

// Use stateless HTTP client
// neon() returns a query function: async (sql, params) => result[]
const sql = NEON_URL ? neon(NEON_URL) : null;

// --- Constants ---

const DEFAULT_TIMEOUT_MS = 25000; // 25s timeout (Mobile networks + Cold starts)
const NETINFO_CACHE_MS = 10000; // Cache network status for 10s to reduce bridge traffic
const CIRCUIT_FUSE_MAX_MS = 30000; // Max time to break circuit

// --- State ---

let lastHealthyAt: number | null = null;
let lastLatencyMs: number | null = null;
let lastErrorMessage: string | null = null;
let circuitOpenUntil = 0;
let cachedNetInfoAt = 0;
let cachedIsConnected: boolean | null = null;
let warmPromise: Promise<void> | null = null;

// --- Types ---

export type NeonHealthSnapshot = {
  isConfigured: boolean;
  lastHealthyAt: number | null;
  lastLatencyMs: number | null;
  lastErrorMessage: string | null;
  circuitOpenUntil: number | null;
};

// --- Helpers ---

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([
    p,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error(`Request timed out after ${ms}ms`)), ms)
    ),
  ]);

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
  // Exponential backoff for circuit breaker
  const backoff = Math.min(2000 * Math.pow(1.5, attempt), CIRCUIT_FUSE_MAX_MS);
  circuitOpenUntil = Date.now() + backoff;
};

/**
 * Checks network status with caching to avoid heavy bridge calls on every query.
 */
const ensureRecentNetState = async () => {
  const now = Date.now();
  if (cachedIsConnected !== null && now - cachedNetInfoAt < NETINFO_CACHE_MS) {
    return cachedIsConnected;
  }

  cachedNetInfoAt = now;
  try {
    const snapshot = await NetInfo.fetch();
    cachedIsConnected = !!snapshot.isConnected && !!snapshot.isInternetReachable;
  } catch (err) {
    // If NetInfo fails, assume online to allow retry logic to handle actual failures
    cachedIsConnected = true;
  }
  return cachedIsConnected;
};

// --- Public API ---

export const getNeonHealth = (): NeonHealthSnapshot => ({
  isConfigured: !!sql,
  lastHealthyAt,
  lastLatencyMs,
  lastErrorMessage,
  circuitOpenUntil: circuitOpenUntil > Date.now() ? circuitOpenUntil : null,
});

/**
 * Wakes up the database connection.
 * Useful to call when the app comes to foreground.
 */
export const warmNeonConnection = async () => {
  if (!sql) return;
  if (warmPromise) return warmPromise;

  warmPromise = (async () => {
    try {
      const start = Date.now();
      await withTimeout(sql('SELECT 1'), 15000);
      recordSuccess(Date.now() - start);
    } catch (err) {
      recordFailure(err);
      // Don't throw on warm-up failures, just log
      console.warn('[Neon] Warm-up failed', err);
    } finally {
      warmPromise = null;
    }
  })();

  return warmPromise;
};

export const checkNeonConnection = async (timeoutMs = 10000): Promise<boolean> => {
  try {
    await warmNeonConnection();
    return !!lastHealthyAt && Date.now() - lastHealthyAt < 60000;
  } catch (e) {
    return false;
  }
};

/**
 * Robust query wrapper with retries/backoff, timeouts, and circuit breaking.
 * * @template T The expected row shape (optional)
 */
export const query = async <T = any>(
  text: string,
  params: any[] = [],
  opts?: { retries?: number; timeoutMs?: number }
): Promise<T[]> => {
  if (!sql) {
    throw new Error('Neon DB not configured (missing NEON_URL)');
  }

  if (shouldShortCircuit()) {
    throw new Error('Database temporarily unavailable (Circuit Open)');
  }

  const online = await ensureRecentNetState();
  if (!online) {
    bumpCircuit(1);
    throw new Error('No internet connection');
  }

  const { retries = 3, timeoutMs = DEFAULT_TIMEOUT_MS } = opts || {};
  let attempt = 0;
  let lastErr: any = null;

  while (attempt <= retries) {
    try {
      const start = Date.now();
      // Execute via Neon HTTP driver
      // Note: neon() returns pure array of objects, not { rows: [] } like pg
      const result = await withTimeout(sql(text, params), timeoutMs);

      recordSuccess(Date.now() - start);
      return result as T[];
    } catch (error: any) {
      lastErr = error;
      recordFailure(error);

      const msg = String(error?.message || error).toLowerCase();

      // Check for transient errors suitable for retry
      const isTransient =
        msg.includes('timeout') ||
        msg.includes('network') ||
        msg.includes('fetch') ||
        msg.includes('502') || // Bad Gateway (often transient during scaling)
        msg.includes('503') || // Service Unavailable (cold start)
        msg.includes('connection') ||
        msg.includes('econnreset') ||
        msg.includes('enotfound');

      // Stop immediately on logic errors
      const isPermanent =
        msg.includes('syntax error') ||
        msg.includes('constraint') ||
        msg.includes('relation') ||
        msg.includes('column');

      // Specific check for Unique Constraint violations (common in sync)
      if (error?.code === '23505' || msg.includes('unique constraint')) {
        console.warn('[Neon] Duplicate key error (suppressed retries):', msg);
        throw error;
      }

      if (!isTransient || isPermanent) {
        console.error('[Neon] Permanent query error:', error);
        throw error;
      }

      attempt++;
      if (attempt > retries) break;

      // Calculate backoff
      const backoff = Math.min(1000 * Math.pow(2, attempt), 10000);
      bumpCircuit(attempt);

      const host = getHostFromUrl(NEON_URL);
      console.warn(
        `[Neon] Transient error (${host}), retrying ${attempt}/${retries} in ${backoff}ms`,
        msg
      );

      await sleep(backoff);
    }
  }

  console.error('[Neon] Query failed after max retries:', lastErr);
  throw lastErr;
};

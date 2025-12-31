import { neon, NeonQueryFunction } from '@neondatabase/serverless';
import Constants from 'expo-constants';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

/* -------------------------------------------------------------------------- */
/* Configuration & Constants                                                  */
/* -------------------------------------------------------------------------- */

// 1. Retrieve NEON_URL securely from Expo Config
const NEON_URL = (Constants.expoConfig?.extra?.NEON_URL as string) || process.env.NEON_URL || null;

// 2. Tuning Constants
const DEFAULT_TIMEOUT_MS = 15000; // 15 seconds max per query (mobile networks are slow)
const MAX_RETRIES = 3; // How many times to retry a transient failure
const CIRCUIT_BREAKER_RESET_MS = 30000; // If circuit breaks, wait 30s before trying again
const NET_CACHE_TTL = 5000; // Cache network status for 5s to avoid bridge overhead
const WARMUP_TIMEOUT_MS = 10000; // Shorter timeout for background warm-up

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface CircuitState {
  isOpen: boolean;
  nextRetryAt: number;
  failures: number;
}

export interface HealthCheckResult {
  healthy: boolean;
  latency: number;
  message?: string;
}

/* ------------------ Health Snapshot (for UI hooks) ------------------ */
export type NeonHealthSnapshot = {
  isConfigured: boolean;
  lastHealthyAt: number | null;
  lastLatencyMs: number | null;
  lastErrorMessage: string | null;
  circuitOpenUntil: number | null;
};

let lastHealthyAt: number | null = null;
let lastLatencyMs: number | null = null;
let lastErrorMessage: string | null = null;

/* -------------------------------------------------------------------------- */
/* State Management (Singletons)                                              */
/* -------------------------------------------------------------------------- */

// Circuit Breaker State
const circuit: CircuitState = {
  isOpen: false,
  nextRetryAt: 0,
  failures: 0,
};

// Singleton instance for the Neon client
let sqlInstance: NeonQueryFunction<false, false> | null = null;

// Network Cache State
let lastNetCheck = 0;
let isConnectedCache = true; // Optimistic default to allow attempts

/* -------------------------------------------------------------------------- */
/* Helper Functions                                                           */
/* -------------------------------------------------------------------------- */

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Lazy loads the Neon client.
 * This prevents crashes if the app starts without config, and ensures a singleton.
 */
const getSql = () => {
  if (sqlInstance) return sqlInstance;

  if (!NEON_URL) {
    console.error('[Neon] Critical: NEON_URL is missing in app.config.js or .env');
    return null;
  }

  // Initialize Neon client (HTTP mode)
  try {
    sqlInstance = neon(NEON_URL);
    return sqlInstance;
  } catch (err) {
    console.error('[Neon] Failed to initialize client:', err);
    return null;
  }
};

/**
 * Checks internet connectivity with caching.
 * Prevents excessive calls to the native bridge.
 */
const checkNetwork = async (): Promise<boolean> => {
  const now = Date.now();
  // Return cached value if fresh
  if (now - lastNetCheck < NET_CACHE_TTL) {
    return isConnectedCache;
  }

  try {
    const state: NetInfoState = await NetInfo.fetch();
    // Consider connected if we have an active connection AND internet is reachable
    // Note: isInternetReachable can be null on some platforms initially, so we fallback to isConnected
    const online = !!state.isConnected && (state.isInternetReachable ?? true);

    isConnectedCache = online;
    lastNetCheck = now;
    return online;
  } catch (error) {
    console.warn('[Neon] NetInfo check failed, assuming online:', error);
    return true; // Fail open to allow request attempts
  }
};

/**
 * Wraps a promise with a timeout rejection.
 */
const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Query timed out after ${ms}ms`)), ms)
    ),
  ]);
};

/**
 * Determines if an error is transient (worth retrying) or permanent.
 */
const isRetryableError = (error: any): boolean => {
  if (!error) return false;

  const msg = (error.message || String(error)).toLowerCase();
  const code = error.code ? String(error.code) : '';

  // 1. Permanent Errors (Do NOT Retry)
  if (
    code === '23505' || // Unique violation (duplicate key)
    code === '42P01' || // Undefined table
    code === '42601' || // Syntax error
    msg.includes('duplicate key') ||
    msg.includes('violates unique') ||
    msg.includes('syntax error') ||
    msg.includes('column does not exist') ||
    (msg.includes('relation') && msg.includes('does not exist'))
  ) {
    return false;
  }

  // 2. Transient Errors (DO Retry)
  // 502/503 (Bad Gateway/Service Unavailable) are common during Neon cold starts
  return (
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('connection') ||
    msg.includes('socket') ||
    msg.includes('fetch failed') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('econnreset')
  );
};

/* -------------------------------------------------------------------------- */
/* Core Exports                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Wakes up the Neon compute endpoint without throwing errors.
 * Call this when the app comes to the foreground.
 */
export const warmNeonConnection = async (): Promise<void> => {
  const sql = getSql();
  if (!sql) return;

  // Don't warm up if circuit is open (avoid spamming a down service)
  if (circuit.isOpen && Date.now() < circuit.nextRetryAt) return;

  checkNetwork().then((online) => {
    if (!online) return;

    // Fire and forget - simple lightweight query
    // We use a short timeout because we don't want this to block anything
    withTimeout((sql as any).query('SELECT 1'), WARMUP_TIMEOUT_MS)
      .then(() => {
        // Reset circuit on success
        if (circuit.failures > 0) circuit.failures = 0;
        circuit.isOpen = false;
        lastHealthyAt = Date.now();
        lastLatencyMs = 0;
        lastErrorMessage = null;
        if (__DEV__) console.log('[Neon] Connection warmed up');
      })
      .catch((err) => {
        // Silent fail on warm-up is fine
        lastErrorMessage = err?.message || String(err);
        if (__DEV__) console.log('[Neon] Warm-up skipped/failed:', err.message);
      });
  });
};

/**
 * Execute a SQL query safely with retries, timeout, and circuit breaking.
 * * @param text - The SQL query string
 * @param params - Array of parameters for the query
 * @param options - Optional overrides for retries and timeout
 */
export const query = async <T = any>(
  text: string,
  params: any[] = [],
  options: { retries?: number; timeoutMs?: number } = {}
): Promise<T[]> => {
  const sql = getSql();

  // 0. Configuration Guard
  if (!sql) {
    throw new Error('Neon Database not configured. Check NEON_URL.');
  }

  // 1. Circuit Breaker Guard
  if (circuit.isOpen) {
    if (Date.now() < circuit.nextRetryAt) {
      throw new Error('Service temporarily unavailable (Circuit Open). Please try again later.');
    }
    // Half-open state: Allow one request to pass through to test health
    circuit.isOpen = false;
  }

  // 2. Network Guard
  const isOnline = await checkNetwork();
  if (!isOnline) {
    throw new Error('No internet connection.');
  }

  const retries = options.retries ?? MAX_RETRIES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let attempt = 0;
  let lastError: any;

  // 3. Retry Loop
  while (attempt <= retries) {
    try {
      // Execute Query with Timeout
      const result = await withTimeout(sql(text, params), timeoutMs);

      // Success! Reset circuit stats.
      if (circuit.failures > 0) {
        circuit.failures = 0;
        circuit.isOpen = false;
      }

      return result as T[];
    } catch (error: any) {
      lastError = error;

      // Check if we should stop immediately (Permanent Error)
      if (!isRetryableError(error)) {
        console.error(`[Neon] Permanent Query Error: ${text}`, error);
        throw error;
      }

      attempt++;
      circuit.failures++;

      // If we've exhausted retries, break loop
      if (attempt > retries) break;

      // Calculate Exponential Backoff:
      // Attempt 1: ~1000ms, Attempt 2: ~2000ms, Attempt 3: ~4000ms + Jitter
      const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 10000);

      if (__DEV__) {
        console.warn(
          `[Neon] Transient Error (Attempt ${attempt}/${retries}). Retrying in ${Math.round(delay)}ms...`,
          error.message
        );
      }

      await sleep(delay);
    }
  }

  // 4. Failure Handling
  // If we reach here, we exhausted all retries.
  // If failures are high, trip the circuit breaker to protect the client/server.
  if (circuit.failures >= 3) {
    circuit.isOpen = true;
    circuit.nextRetryAt = Date.now() + CIRCUIT_BREAKER_RESET_MS;
    console.error('[Neon] Circuit Breaker OPENED. Requests paused for 30s.');
  }

  // Throw the last error encountered
  throw lastError;
};

/**
 * Active health check for UI Status Banner.
 * Returns true if DB is reachable and responsive.
 */
export const checkNeonConnection = async (timeoutMs = 5000): Promise<HealthCheckResult> => {
  try {
    const isOnline = await checkNetwork();
    if (!isOnline) {
      return { healthy: false, latency: 0, message: 'Offline' };
    }

    const start = Date.now();
    // Run a lightweight query with 0 retries to get "current" status
    await query('SELECT 1', [], { retries: 0, timeoutMs });

    return {
      healthy: true,
      latency: Date.now() - start,
    };
  } catch (e: any) {
    return {
      healthy: false,
      latency: 0,
      message: e.message || 'Unknown error',
    };
  }
};

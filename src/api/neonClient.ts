import { Pool } from '@neondatabase/serverless';
import Constants from 'expo-constants';
import NetInfo from '@react-native-community/netinfo';

// Read NEON_URL from Expo config (app.config.js) -> Constants.expoConfig?.extra
const NEON_URL = (Constants?.expoConfig?.extra as any)?.NEON_URL || process.env.NEON_URL || null;

const pool = NEON_URL ? new Pool({ connectionString: NEON_URL }) : null;

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

const defaultTimeout = 15000; // 15s default timeout per request

const withTimeout = <T>(p: Promise<T>, ms = defaultTimeout): Promise<T> =>
  Promise.race([
    p,
    new Promise<T>((_r, rej) => setTimeout(() => rej(new Error('Request timed out')), ms)),
  ] as any);

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

  const { retries = 2, timeoutMs = defaultTimeout } = opts || {};

  // short-circuit if offline to avoid waiting on timeouts
  try {
    const net = await NetInfo.fetch();
    if (!net.isConnected) throw new Error('Offline');
  } catch (e) {
    // if NetInfo fails for some reason, continue and let pool.query handle it
  }

  let attempt = 0;
  let lastErr: any = null;
  while (attempt <= retries) {
    try {
      const result = await withTimeout(pool.query(text, params), timeoutMs);
      return result.rows;
    } catch (error) {
      lastErr = error;
      // Determine if the error looks transient (network / timeout / connection reset)
      const msg = String(((error as any) && ((error as any).message || error)) || '').toLowerCase();
      const isTransient =
        msg.includes('timeout') ||
        msg.includes('ec timed out') ||
        msg.includes('connection') ||
        msg.includes('network') ||
        msg.includes('offline') ||
        msg.includes('socket') ||
        msg.includes('econnreset') ||
        msg.includes('enotfound');

      // Avoid noisy logs for unique-constraint collisions (handled by callers)
      try {
        const e: any = error;
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
        console.error('Neon Query Error (permanent):', error);
        throw error;
      }

      // transient — retry with exponential backoff
      attempt += 1;
      const backoff = Math.min(2000 * attempt, 8000);
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

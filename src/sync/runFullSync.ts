import pushToNeon from './pushToNeon';
import pullFromNeon from './pullFromNeon';
import retryWithBackoff from './retry';
import { getSession } from '../db/session';
import { throwIfSyncCancelled } from './syncCancel';

/**
 * Simple lock to prevent overlapping syncs. Exported so callers can query state.
 */
export let isSyncRunning = false;
// NOTE: This exported flag is legacy; robust callers should use the syncManager mutex.
// runFullSync uses this mainly to prevent *reentrant* calls if bypasses happen.

// Throttle foreground syncs to avoid repeated runs when app quickly toggles
let lastSyncAt = 0;
// In production, sync less frequently to reduce Neon compute wakeups.
const MIN_SYNC_INTERVAL_MS = __DEV__ ? 30_000 : 120_000; // dev: 30s, prod: 2m

// Robust check for Jest environment that works in RN and Node
const isJest = typeof process !== 'undefined' && !!process.env?.JEST_WORKER_ID;

/**
 * runFullSync
 * - Push local changes, then pull remote updates.
 * - Errors in push do not abort pull; both are attempted in order.
 * - This function is safe to call manually and from background schedulers.
 */
export type RunFullSyncResult =
  | { status: 'skipped'; reason: 'already_running' | 'throttled' | 'no_session' | 'cancelled' }
  | {
      status: 'ran';
      pushed?: any;
      pulled?: any;
      errors?: { push?: string; pull?: string };
    };

const isUuid = (s: any) =>
  typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);

export async function runFullSync(options?: { force?: boolean }): Promise<RunFullSyncResult> {
  const now = Date.now();
  const force = !!options?.force;

  // Respect cancellation requests (e.g., logout/navigation)
  try {
    throwIfSyncCancelled();
  } catch (e) {
    return { status: 'skipped', reason: 'cancelled' };
  }

  // Guard: don’t hit Neon if there is no valid logged-in session.
  // This avoids noisy warnings while user is on the login screen.
  if (!isJest) {
    try {
      const sess: any = await getSession();
      if (!isUuid(sess?.id)) {
        return { status: 'skipped', reason: 'no_session' };
      }
    } catch (e) {
      return { status: 'skipped', reason: 'no_session' };
    }
  }

  // 1. Concurrency Check
  // Deadlock guard: if the lock has been held for > 45s (e.g. stalled promise), break it.
  if (isSyncRunning) {
    if (now - lastSyncAt > 45000) {
      if (__DEV__) console.warn('[sync] Breaking stale lock (stuck > 45s)');
      isSyncRunning = false;
    } else {
      if (__DEV__) console.log('[sync] runFullSync: already running, skipping');
      return { status: 'skipped', reason: 'already_running' };
    }
  }

  // 2. Throttling Check
  // Skip throttling during Jest tests to keep unit tests deterministic
  if (!force && !isJest && now - lastSyncAt < MIN_SYNC_INTERVAL_MS) {
    if (__DEV__) {
      console.log(
        '[sync] runFullSync: throttled',
        `${Math.round((now - lastSyncAt) / 1000)}s since last sync`
      );
    }
    return { status: 'skipped', reason: 'throttled' };
  }

  // 3. execution
  isSyncRunning = true;
  lastSyncAt = now;
  if (__DEV__) console.log('[sync] runFullSync: started');

  let pushResult: any = null;
  let pullResult: any = null;
  let pushError: unknown = null;
  let pullError: unknown = null;

  try {
    // --- STEP A: PUSH ---
    try {
      throwIfSyncCancelled();
      // Retry transient push failures with exponential backoff
      pushResult = await retryWithBackoff(() => pushToNeon(), {
        maxRetries: 3,
        baseDelayMs: 500,
      });
      if (__DEV__) console.log('[sync] runFullSync: push result', pushResult);
    } catch (pushErr) {
      if ((pushErr as any)?.message === 'sync_cancelled') {
        return { status: 'skipped', reason: 'cancelled' };
      }
      pushError = pushErr;
      // Log warning only if we are not in a test environment (to keep test output clean)
      if (__DEV__ && !isJest) {
        console.warn('[sync] runFullSync: push failed after retries', pushErr);
      }
      // swallow error so we can proceed to pull
    }

    // --- STEP B: PULL ---
    try {
      throwIfSyncCancelled();
      // Retry transient pull failures with exponential backoff
      pullResult = await retryWithBackoff(() => pullFromNeon({ force }), {
        maxRetries: 3,
        baseDelayMs: 500,
      });
      if (__DEV__) console.log('[sync] runFullSync: pull result', pullResult);
    } catch (pullErr) {
      if ((pullErr as any)?.message === 'sync_cancelled') {
        return { status: 'skipped', reason: 'cancelled' };
      }
      pullError = pullErr;
      if (__DEV__ && !isJest) {
        console.warn('[sync] runFullSync: pull failed after retries', pullErr);
      }
    }
  } finally {
    isSyncRunning = false;
    if (__DEV__) console.log('[sync] runFullSync: finished');
  }

  const errors: { push?: string; pull?: string } = {};
  try {
    if (pushError) errors.push = pushError instanceof Error ? pushError.message : String(pushError);
  } catch (e) {}
  try {
    if (pullError) errors.pull = pullError instanceof Error ? pullError.message : String(pullError);
  } catch (e) {}

  return {
    status: 'ran',
    pushed: pushResult,
    pulled: pullResult,
    errors: errors.push || errors.pull ? errors : undefined,
  };
}

export default runFullSync;

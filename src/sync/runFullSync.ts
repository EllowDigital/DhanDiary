import pushToNeon from './pushToNeon';
import pullFromNeon from './pullFromNeon';
import retryWithBackoff from './retry';

/**
 * Simple lock to prevent overlapping syncs. Exported so callers can query state.
 */
export let isSyncRunning = false;

// Throttle foreground syncs to avoid repeated runs when app quickly toggles
let lastSyncAt = 0;
const MIN_SYNC_INTERVAL_MS = 30_000; // 30 seconds

// Robust check for Jest environment that works in RN and Node
const isJest = typeof process !== 'undefined' && !!process.env?.JEST_WORKER_ID;

/**
 * runFullSync
 * - Push local changes, then pull remote updates.
 * - Errors in push do not abort pull; both are attempted in order.
 * - This function is safe to call manually and from background schedulers.
 */
export async function runFullSync(): Promise<{ pushed?: any; pulled?: any } | null> {
  const now = Date.now();

  // 1. Concurrency Check
  if (isSyncRunning) {
    if (__DEV__) console.log('[sync] runFullSync: already running, skipping');
    return null;
  }

  // 2. Throttling Check
  // Skip throttling during Jest tests to keep unit tests deterministic
  if (!isJest && now - lastSyncAt < MIN_SYNC_INTERVAL_MS) {
    if (__DEV__) {
      console.log(
        '[sync] runFullSync: throttled',
        `${Math.round((now - lastSyncAt) / 1000)}s since last sync`
      );
    }
    return null;
  }

  // 3. execution
  isSyncRunning = true;
  lastSyncAt = now;
  if (__DEV__) console.log('[sync] runFullSync: started');

  let pushResult: any = null;
  let pullResult: any = null;

  try {
    // --- STEP A: PUSH ---
    try {
      // Retry transient push failures with exponential backoff
      pushResult = await retryWithBackoff(() => pushToNeon(), {
        maxRetries: 3,
        baseDelayMs: 500,
      });
      if (__DEV__) console.log('[sync] runFullSync: push result', pushResult);
    } catch (pushErr) {
      // Log warning only if we are not in a test environment (to keep test output clean)
      if (__DEV__ && !isJest) {
        console.warn('[sync] runFullSync: push failed after retries', pushErr);
      }
      // swallow error so we can proceed to pull
    }

    // --- STEP B: PULL ---
    try {
      // Retry transient pull failures with exponential backoff
      pullResult = await retryWithBackoff(() => pullFromNeon(), {
        maxRetries: 3,
        baseDelayMs: 500,
      });
      if (__DEV__) console.log('[sync] runFullSync: pull result', pullResult);
    } catch (pullErr) {
      if (__DEV__ && !isJest) {
        console.warn('[sync] runFullSync: pull failed after retries', pullErr);
      }
    }
  } finally {
    isSyncRunning = false;
    if (__DEV__) console.log('[sync] runFullSync: finished');
  }

  return { pushed: pushResult, pulled: pullResult };
}

export default runFullSync;

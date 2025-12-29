import pushToNeon from './pushToNeon';
import pullFromNeon from './pullFromNeon';

/**
 * Simple lock to prevent overlapping syncs. Exported so callers can query state.
 */
export let isSyncRunning = false;
// Throttle foreground syncs to avoid repeated runs when app quickly toggles
let lastSyncAt = 0;
const MIN_SYNC_INTERVAL_MS = 30_000; // 30 seconds
const isJest =
  typeof process !== 'undefined' &&
  (process as any).env &&
  (process as any).env.JEST_WORKER_ID !== undefined;

/**
 * runFullSync
 * - Push local changes, then pull remote updates.
 * - Errors in push do not abort pull; both are attempted in order.
 * - This function is safe to call manually and from background schedulers.
 */
export async function runFullSync(): Promise<{ pushed?: any; pulled?: any } | null> {
  const now = Date.now();

  if (isSyncRunning) {
    if (__DEV__) console.log('[sync] runFullSync: already running, skipping');
    return null;
  }

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

  isSyncRunning = true;
  lastSyncAt = now;
  if (__DEV__) console.log('[sync] runFullSync: started');

  let pushResult: any = null;
  let pullResult: any = null;

  try {
    try {
      pushResult = await pushToNeon();
      if (__DEV__) console.log('[sync] runFullSync: push result', pushResult);
    } catch (pushErr) {
      if (__DEV__ && typeof process !== 'undefined' && process.env.JEST_WORKER_ID === undefined) {
        console.warn('[sync] runFullSync: push failed', pushErr);
      }
      // continue to pull
    }

    try {
      pullResult = await pullFromNeon();
      if (__DEV__) console.log('[sync] runFullSync: pull result', pullResult);
    } catch (pullErr) {
      if (__DEV__ && typeof process !== 'undefined' && process.env.JEST_WORKER_ID === undefined) {
        console.warn('[sync] runFullSync: pull failed', pullErr);
      }
    }
  } finally {
    isSyncRunning = false;
    if (__DEV__) console.log('[sync] runFullSync: finished');
  }

  return { pushed: pushResult, pulled: pullResult };
}

export default runFullSync;

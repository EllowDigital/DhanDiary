import pushToNeon from './pushToNeon';
import pullFromNeon from './pullFromNeon';

/**
 * Simple lock to prevent overlapping syncs. Exported so callers can query state.
 */
export let isSyncRunning = false;

/**
 * runFullSync
 * - Push local changes, then pull remote updates.
 * - Errors in push do not abort pull; both are attempted in order.
 * - This function is safe to call manually and from background schedulers.
 */
export async function runFullSync(): Promise<{ pushed?: any; pulled?: any } | null> {
  if (isSyncRunning) {
    if (__DEV__) console.log('[sync] runFullSync: already running, skipping');
    return null;
  }

  isSyncRunning = true;
  if (__DEV__) console.log('[sync] runFullSync: started');

  let pushResult: any = null;
  let pullResult: any = null;

  try {
    try {
      pushResult = await pushToNeon();
      if (__DEV__) console.log('[sync] runFullSync: push result', pushResult);
    } catch (pushErr) {
      if (__DEV__) console.warn('[sync] runFullSync: push failed', pushErr);
      // continue to pull
    }

    try {
      pullResult = await pullFromNeon();
      if (__DEV__) console.log('[sync] runFullSync: pull result', pullResult);
    } catch (pullErr) {
      if (__DEV__) console.warn('[sync] runFullSync: pull failed', pullErr);
    }
  } finally {
    isSyncRunning = false;
    if (__DEV__) console.log('[sync] runFullSync: finished');
  }

  return { pushed: pushResult, pulled: pullResult };
}

export default runFullSync;

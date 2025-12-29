import { getUnsyncedTransactions } from '../db/transactions';
import { executeSqlAsync } from '../db/sqlite';

/**
 * pushToNeon
 * - Reads local rows with sync_status IN (0,2)
 * - Separates new/updated (0) from deletes (2)
 * - TODO: call Neon API to push changes
 * - On simulated success: mark rows sync_status = 1
 *
 * Notes:
 * - MUST NOT block UI. Call this from a background worker or scheduler.
 * - No Clerk/React imports here.
 */
export async function pushToNeon(): Promise<{ pushed: string[]; deleted: string[] }> {
  if (__DEV__) console.log('[sync] pushToNeon: starting');

  const rows = await getUnsyncedTransactions();
  if (!rows || rows.length === 0) {
    if (__DEV__) console.log('[sync] pushToNeon: no unsynced rows');
    return { pushed: [], deleted: [] };
  }

  const toPush = rows.filter((r) => r.sync_status === 0);
  const toDelete = rows.filter((r) => r.sync_status === 2);

  // TODO: Batch and POST `toPush` to Neon (create/update endpoint)
  // TODO: Batch and POST `toDelete` to Neon (delete endpoint)
  // For now we simulate success and mark local rows as synced.

  const pushedIds: string[] = [];
  const deletedIds: string[] = [];

  try {
    if (toPush.length > 0) {
      // Simulate push success for new/updated rows
      const ids = toPush.map((r) => r.id);
      const placeholders = ids.map(() => '?').join(',');
      const sql = `UPDATE transactions SET sync_status = 1 WHERE id IN (${placeholders});`;
      await executeSqlAsync(sql, ids);
      pushedIds.push(...ids);
      if (__DEV__) console.log('[sync] pushToNeon: marked pushed', ids.length);
    }

    if (toDelete.length > 0) {
      // Simulate delete success: mark deleted rows as synced (1).
      const ids = toDelete.map((r) => r.id);
      const placeholders = ids.map(() => '?').join(',');
      const sql = `UPDATE transactions SET sync_status = 1 WHERE id IN (${placeholders});`;
      await executeSqlAsync(sql, ids);
      deletedIds.push(...ids);
      if (__DEV__) console.log('[sync] pushToNeon: marked deleted synced', ids.length);
    }
  } catch (e) {
    if (__DEV__) console.warn('[sync] pushToNeon error', e);
    // Do not throw — keep failures local and retry later
  }

  if (__DEV__) console.log('[sync] pushToNeon: finished');
  return { pushed: pushedIds, deleted: deletedIds };
}

export default pushToNeon;

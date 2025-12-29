import { getUnsyncedTransactions } from '../db/transactions';
import { executeSqlAsync } from '../db/sqlite';
import { query as neonQuery, getNeonHealth } from '../api/neonClient';

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

  const pushedIds: string[] = [];
  const deletedIds: string[] = [];

  // If Neon isn't configured, bail early (will be retried later).
  try {
    const health = getNeonHealth();
    if (!health.isConfigured) {
      if (__DEV__) console.warn('[sync] pushToNeon: Neon not configured, skipping push');
      return { pushed: [], deleted: [] };
    }
  } catch (e) {
    if (__DEV__) console.warn('[sync] pushToNeon: failed to check neon health', e);
  }

  // Push (upsert) each changed row to Neon using SQL client.
  try {
    for (const row of toPush) {
      try {
        const sql = `INSERT INTO transactions
          (id, user_id, amount, type, category, note, date, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,CASE WHEN $7::bigint IS NULL OR $7::bigint = 0 THEN NULL ELSE to_timestamp($7::bigint / 1000) END,$8::bigint)
          ON CONFLICT (id) DO UPDATE SET
            user_id = EXCLUDED.user_id,
            amount = EXCLUDED.amount,
            type = EXCLUDED.type,
            category = EXCLUDED.category,
            note = EXCLUDED.note,
            date = EXCLUDED.date,
            updated_at = EXCLUDED.updated_at`;

        await neonQuery(sql, [
          row.id,
          row.user_id,
          row.amount,
          row.type,
          row.category ?? null,
          row.note ?? null,
          row.date ?? null,
          row.updated_at ?? null,
        ]);

        // Mark local row as synced
        await executeSqlAsync('UPDATE transactions SET sync_status = 1 WHERE id = ?;', [row.id]);
        pushedIds.push(row.id);
      } catch (err) {
        if (__DEV__) console.warn('[sync] pushToNeon: failed to push row', row.id, err);
        // continue with other rows
      }
    }

    for (const row of toDelete) {
      try {
        await neonQuery('DELETE FROM transactions WHERE id = $1', [row.id]);
        await executeSqlAsync('UPDATE transactions SET sync_status = 1 WHERE id = ?;', [row.id]);
        deletedIds.push(row.id);
      } catch (err) {
        if (__DEV__) console.warn('[sync] pushToNeon: failed to delete row', row.id, err);
      }
    }
  } catch (e) {
    if (__DEV__) console.warn('[sync] pushToNeon error', e);
  }

  if (__DEV__)
    console.log('[sync] pushToNeon: finished', {
      pushed: pushedIds.length,
      deleted: deletedIds.length,
    });
  return { pushed: pushedIds, deleted: deletedIds };
}

export default pushToNeon;

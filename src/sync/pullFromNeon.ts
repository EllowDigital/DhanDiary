import { executeSqlAsync } from '../db/sqlite';
import { upsertTransactionFromRemote } from '../db/transactions';

/**
 * pullFromNeon
 * - Reads `last_sync_timestamp` from `meta` table
 * - TODO: fetch remote rows changed since lastSync from Neon
 * - For each remote row, apply conflict resolution (latest updated_at wins)
 * - Upsert into local SQLite via `upsertTransactionFromRemote`
 * - Update meta.last_sync_timestamp to new value
 *
 * Notes:
 * - No network calls are implemented here (TODO placeholders)
 * - No UI imports or Clerk hooks allowed
 */
export async function pullFromNeon(): Promise<{ pulled: number; lastSync: number | null }> {
  if (__DEV__) console.log('[sync] pullFromNeon: starting');

  const lastSyncRow = await executeSqlAsync('SELECT value FROM meta WHERE key = ? LIMIT 1;', [
    'last_sync_timestamp',
  ]);
  const lastSyncVal = lastSyncRow && lastSyncRow[1] && lastSyncRow[1].rows && lastSyncRow[1].rows.length
    ? lastSyncRow[1].rows.item(0).value
    : null;
  const lastSync = lastSyncVal ? parseInt(lastSyncVal, 10) : 0;

  if (__DEV__) console.log('[sync] pullFromNeon: lastSync', lastSync);

  // TODO: Replace the below simulated fetch with a real Neon API call that
  // requests rows updated since `lastSync`.
  // Example: const remoteRows = await neonApi.fetchTransactionsSince(lastSync);
  const remoteRows: Array<any> = []; // simulated empty response

  let maxRemoteTs = lastSync;
  let pulled = 0;

  for (const remote of remoteRows) {
    try {
      // remote must include: id, user_id, amount, type, category, note, date, updated_at, sync_status
      const remoteUpdatedAt = Number(remote.updated_at || 0);

      // Read local updated_at for conflict resolution
      const localRow = await executeSqlAsync(
        'SELECT updated_at FROM transactions WHERE id = ? LIMIT 1;',
        [remote.id]
      );
      const localUpdatedAt =
        localRow && localRow[1] && localRow[1].rows && localRow[1].rows.length
          ? Number(localRow[1].rows.item(0).updated_at || 0)
          : 0;

      // Conflict rule: only apply remote change if it's newer
      if (remoteUpdatedAt > localUpdatedAt) {
        await upsertTransactionFromRemote({
          id: remote.id,
          user_id: remote.user_id,
          amount: remote.amount,
          type: remote.type,
          category: remote.category ?? null,
          note: remote.note ?? null,
          date: remote.date ?? null,
          updated_at: remoteUpdatedAt,
          sync_status: 1,
        });
        pulled += 1;
      }

      if (remoteUpdatedAt > maxRemoteTs) maxRemoteTs = remoteUpdatedAt;
    } catch (e) {
      if (__DEV__) console.warn('[sync] pullFromNeon: row upsert failed', e, remote && remote.id);
      // continue processing other rows
    }
  }

  // Update last_sync_timestamp if we processed any remote rows
  if (maxRemoteTs && maxRemoteTs > lastSync) {
    try {
      await executeSqlAsync(
        'INSERT OR REPLACE INTO meta(key, value) VALUES(?, ?);',
        ['last_sync_timestamp', String(maxRemoteTs)]
      );
      if (__DEV__) console.log('[sync] pullFromNeon: updated lastSync', maxRemoteTs);
    } catch (e) {
      if (__DEV__) console.warn('[sync] pullFromNeon: failed to update lastSync', e);
    }
  }

  if (__DEV__) console.log('[sync] pullFromNeon: finished, pulled', pulled);
  return { pulled, lastSync: maxRemoteTs || null };
}

export default pullFromNeon;

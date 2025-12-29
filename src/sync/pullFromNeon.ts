import { executeSqlAsync } from '../db/sqlite';
import { upsertTransactionFromRemote } from '../db/transactions';
import { query as neonQuery, getNeonHealth } from '../api/neonClient';

// If the remote Neon DB doesn't have the `transactions` table, avoid
// repeatedly attempting the same query during this app session which
// floods the logs. This is a best-effort session guard only.
let neonMissingTransactionsTable = false;

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
  let lastSyncVal: string | null = null;
  if (lastSyncRow && lastSyncRow[1]) {
    const res = lastSyncRow[1];
    if (res.rows && res.rows.length && res.rows.length > 0) {
      const v = res.rows.item(0);
      lastSyncVal = v ? v.value : null;
    }
  }
  const lastSync = lastSyncVal ? parseInt(lastSyncVal, 10) : 0;

  if (__DEV__) console.log('[sync] pullFromNeon: lastSync', lastSync);

  // If Neon isn't configured, skip pulling for now.
  try {
    const health = getNeonHealth();
    if (!health.isConfigured) {
      if (__DEV__) console.warn('[sync] pullFromNeon: Neon not configured, skipping pull');
      return { pulled: 0, lastSync: lastSync || 0 };
    }
  } catch (e) {
    if (__DEV__) console.warn('[sync] pullFromNeon: failed to get neon health', e);
  }

  // Fetch remote rows updated since lastSync (ascending by updated_at)
  let remoteRows: Array<any> = [];
  if (neonMissingTransactionsTable) {
    if (__DEV__) console.log('[sync] pullFromNeon: skipping pull — remote table missing (cached)');
    return { pulled: 0, lastSync: lastSync || 0 };
  }
  try {
    const sql = `SELECT id, user_id, amount, type, category, note, date, updated_at, sync_status, deleted_at
      FROM transactions
      WHERE updated_at > $1
      ORDER BY updated_at ASC;`;
    // neonQuery returns an array of rows
    // Use $1 parameter for lastSync
    remoteRows = (await neonQuery(sql, [lastSync || 0])) || [];
  } catch (e: any) {
    // If the remote database doesn't have the transactions table, the
    // Neon client will raise an error like: relation "transactions" does not exist
    const msg = (e && (e.message || String(e))).toLowerCase();
    if (msg.includes('relation') && msg.includes('transactions') && msg.includes('does not exist')) {
      neonMissingTransactionsTable = true;
      if (__DEV__) console.warn('[sync] pullFromNeon: remote "transactions" table missing, skipping pulls until restart');
      return { pulled: 0, lastSync: lastSync || 0 };
    }

    if (__DEV__) console.warn('[sync] pullFromNeon: neon query failed', e);
    // Return gracefully — do not throw so runFullSync can continue
    return { pulled: 0, lastSync: lastSync || 0 };
  }

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
      let localUpdatedAt = 0;
      if (localRow && localRow[1]) {
        const r = localRow[1];
        if (r.rows && r.rows.length && r.rows.length > 0) {
          const it = r.rows.item(0);
          localUpdatedAt = it ? Number(it.updated_at || 0) : 0;
        }
      }

      // Conflict rule: handle remote delete first (if present), then normal upsert.
      const remoteDeletedAt = remote.deleted_at ? Number(remote.deleted_at || 0) : 0;

      if (
        remoteDeletedAt &&
        remoteUpdatedAt >= remoteDeletedAt &&
        remoteUpdatedAt > localUpdatedAt
      ) {
        // Remote indicates this row was deleted. Soft-delete locally (sync_status = 2).
        try {
          await executeSqlAsync(
            'UPDATE transactions SET sync_status = 2, updated_at = ? WHERE id = ?;',
            [remoteUpdatedAt, remote.id]
          );
          pulled += 1;
          if (remoteUpdatedAt > maxRemoteTs) maxRemoteTs = remoteUpdatedAt;
        } catch (e) {
          if (__DEV__)
            console.warn('[sync] pullFromNeon: failed to apply remote delete', e, remote.id);
        }
        // continue to next remote row
        continue;
      }

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
        if (remoteUpdatedAt > maxRemoteTs) maxRemoteTs = remoteUpdatedAt;
      }
    } catch (e) {
      if (__DEV__) console.warn('[sync] pullFromNeon: row upsert failed', e, remote && remote.id);
      // continue processing other rows
    }
  }

  // Update last_sync_timestamp if we processed any remote rows
  if (maxRemoteTs && maxRemoteTs > lastSync) {
    try {
      await executeSqlAsync('INSERT OR REPLACE INTO meta(key, value) VALUES(?, ?);', [
        'last_sync_timestamp',
        String(maxRemoteTs),
      ]);
      if (__DEV__) console.log('[sync] pullFromNeon: updated lastSync', maxRemoteTs);
    } catch (e) {
      if (__DEV__) console.warn('[sync] pullFromNeon: failed to update lastSync', e);
    }
  }

  if (__DEV__) console.log('[sync] pullFromNeon: finished, pulled', pulled);
  return { pulled, lastSync: maxRemoteTs || 0 };
}

export default pullFromNeon;

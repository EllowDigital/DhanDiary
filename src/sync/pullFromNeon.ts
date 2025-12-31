import { executeSqlAsync } from '../db/sqlite';
import { upsertTransactionFromRemote } from '../db/transactions';
import { query as neonQuery, getNeonHealth } from '../api/neonClient';
import { getSession, saveSession } from '../db/session';
import { notifySessionChanged } from '../utils/sessionEvents';

// If the remote Neon DB doesn't have the `transactions` table, avoid
// repeatedly attempting the same query during this app session which
// floods the logs. This is a best-effort session guard only.
let neonMissingTransactionsTable = false;

/**
 * pullFromNeon
 * - Reads `last_sync_timestamp` from `meta` table
 * - Fetches remote rows changed since lastSync from Neon
 * - For each remote row, applies conflict resolution (latest updated_at wins)
 * - Upserts into local SQLite via `upsertTransactionFromRemote`
 * - Updates meta.last_sync_timestamp to new value
 */
export async function pullFromNeon(): Promise<{ pulled: number; lastSync: number | null }> {
  if (__DEV__) console.log('[sync] pullFromNeon: starting');

  // 1. Get the last sync timestamp from local SQLite
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

  // 2. Check Neon Health
  try {
    const health = getNeonHealth();
    if (!health.isConfigured) {
      if (__DEV__) console.warn('[sync] pullFromNeon: Neon not configured, skipping pull');
      return { pulled: 0, lastSync: lastSync || 0 };
    }
  } catch (e) {
    if (__DEV__) console.warn('[sync] pullFromNeon: failed to get neon health', e);
  }

  // 3. Fetch remote rows
  let remoteRows: Array<any> = [];

  if (neonMissingTransactionsTable) {
    if (__DEV__) console.log('[sync] pullFromNeon: skipping pull — remote table missing (cached)');
    return { pulled: 0, lastSync: lastSync || 0 };
  }

  try {
    // CORRECT SQL:
    // Uses EXTRACT(EPOCH FROM ...) to get seconds, multiplies by 1000 for ms,
    // and explicitly casts to BIGINT for JavaScript compatibility.
    const sql = `
      SELECT 
        id, 
        user_id, 
        amount, 
        type, 
        category, 
        note, 
        date, 
        currency,
        sync_status,
        (EXTRACT(EPOCH FROM updated_at) * 1000)::bigint as updated_at,
        (EXTRACT(EPOCH FROM created_at) * 1000)::bigint as created_at,
        server_version,
        CASE 
          WHEN deleted_at IS NULL THEN NULL 
          ELSE (EXTRACT(EPOCH FROM deleted_at) * 1000)::bigint 
        END as deleted_at
      FROM transactions
      WHERE updated_at > TO_TIMESTAMP($1 / 1000.0)
      ORDER BY updated_at ASC;
    `;

    // Pass lastSync as is (milliseconds). The SQL handles conversion.
    const params = [lastSync || 0];
    remoteRows = (await neonQuery(sql, params)) || [];
  } catch (e: any) {
    const msg = (e && (e.message || String(e))).toLowerCase();

    // Handle specific case where table doesn't exist yet
    if (
      msg.includes('relation') &&
      msg.includes('transactions') &&
      msg.includes('does not exist')
    ) {
      neonMissingTransactionsTable = true;
      if (__DEV__)
        console.warn(
          '[sync] pullFromNeon: remote "transactions" table missing, skipping pulls until restart'
        );
      return { pulled: 0, lastSync: lastSync || 0 };
    }

    if (__DEV__) console.warn('[sync] pullFromNeon: neon query failed', e);
    // Return gracefully so sync manager can try again later
    return { pulled: 0, lastSync: lastSync || 0 };
  }

  let maxRemoteTs = lastSync;
  let pulled = 0;

  // 4. Process fetched rows
  const processedIds = new Set<string>();
  const seenUserIds = new Set<string>();
  for (const remote of remoteRows) {
    if (!remote || !remote.id) continue;
    if (processedIds.has(remote.id)) {
      if ((globalThis as any).__SYNC_VERBOSE__)
        console.log('[sync] pullFromNeon: skipping duplicate remote row', remote.id);
      continue;
    }
    processedIds.add(remote.id);
    try {
      const remoteUpdatedAt = Number(remote.updated_at || 0);
      if (remote && remote.user_id) seenUserIds.add(String(remote.user_id));

      // Get local version to compare timestamps and sync status
      const localRow = await executeSqlAsync(
        'SELECT updated_at, sync_status FROM transactions WHERE id = ? LIMIT 1;',
        [remote.id]
      );

      let localUpdatedAt = 0;
      let localSyncStatus = null as number | null;
      if (localRow && localRow[1]) {
        const r = localRow[1];
        if (r.rows && r.rows.length && r.rows.length > 0) {
          const it = r.rows.item(0);
          localUpdatedAt = it ? Number(it.updated_at || 0) : 0;
          localSyncStatus = it && typeof it.sync_status === 'number' ? it.sync_status : null;
        }
      }

      const remoteDeletedAt = remote.deleted_at ? Number(remote.deleted_at || 0) : 0;

      // CASE A: Handle Remote Deletion
      // If remote has a deleted_at, and it is newer than our local data
      if (
        remoteDeletedAt &&
        remoteUpdatedAt >= remoteDeletedAt &&
        remoteUpdatedAt > localUpdatedAt
      ) {
        try {
          // Soft-delete locally (sync_status = 2)
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
        continue; // Done with this row
      }

      // CASE B: Handle Remote Update/Insert
      // Respect local pending changes/deletes: local tombstones always win; local pending
      // edits (sync_status = 0) win when newer or equal to remote.
      if (localSyncStatus === 2) {
        // local tombstone present -> skip remote upsert
      } else {
        const localHasPending = localSyncStatus === 0;
        if (localHasPending && localUpdatedAt >= remoteUpdatedAt) {
          // prefer local pending change; skip
        } else if (remoteUpdatedAt > localUpdatedAt) {
          // apply remote row
          await upsertTransactionFromRemote({
            id: remote.id,
            user_id: remote.user_id,
            amount: remote.amount,
            type: remote.type,
            category: remote.category ?? null,
            note: remote.note ?? null,
            date: remote.date ?? null,
            currency: remote.currency ?? 'INR',
            created_at: remote.created_at
              ? new Date(Number(remote.created_at)).toISOString()
              : new Date(remoteUpdatedAt).toISOString(),
            updated_at: remoteUpdatedAt,
            server_version: typeof remote.server_version === 'number' ? remote.server_version : 0,
            sync_status: 1, // 1 = Synced
          });
          pulled += 1;
          if (remoteUpdatedAt > maxRemoteTs) maxRemoteTs = remoteUpdatedAt;
        }
      }
    } catch (e) {
      if (__DEV__) console.warn('[sync] pullFromNeon: row upsert failed', e, remote && remote.id);
      // Continue processing other rows even if one fails
    }
  }

  // 4b. If we pulled rows and there is no meaningful persisted session, persist
  // the remote user_id so subsequent UI queries use the correct user key.
  try {
    if (seenUserIds.size > 0) {
      const sess = await getSession();
      // If there's no session or we previously used a guest id, prefer the remote user id
      const needPersist =
        !sess ||
        String(sess.id).startsWith('guest_') ||
        (sess?.clerk_id && String(sess.clerk_id).startsWith('guest_'));
      if (needPersist) {
        // If multiple user_ids exist, pick the first — apps typically use a single account per install.
        const firstUser = Array.from(seenUserIds.values())[0];
        if (firstUser) {
          try {
            await saveSession(firstUser, '', '');
            // notify subscribers (saveSession calls notifySessionChanged internally, but call again defensively)
            try {
              await notifySessionChanged();
            } catch (e) {}
          } catch (e) {
            if (__DEV__) console.warn('[sync] pullFromNeon: failed to save remote user session', e);
          }
        }
      }
    }
  } catch (e) {
    if (__DEV__) console.warn('[sync] pullFromNeon: session persist check failed', e);
  }

  // 5. Update local checkpoint
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

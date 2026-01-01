import { executeSqlAsync } from '../db/sqlite';
import { upsertTransactionFromRemote } from '../db/transactions';
import { query as neonQuery, getNeonHealth } from '../api/neonClient';
import { validate as uuidValidate } from 'uuid';
import { getSession } from '../db/session';

// If the remote Neon DB doesn't have the `transactions` table, avoid
// repeatedly attempting the same query during this app session which
// floods the logs. This is a best-effort session guard only.
let neonMissingTransactionsTable = false;

/**
 * pullFromNeon
 * - Reads last pulled server_version from `meta` table (scoped per user)
 * - Fetches remote rows with server_version > lastPulledVersion from Neon
 * - For each remote row, applies conflict resolution (latest updated_at wins)
 * - Upserts into local SQLite via `upsertTransactionFromRemote`
 * - Updates meta.last_pull_server_version:<userId> to new value
 */
export async function pullFromNeon(): Promise<{ pulled: number; lastSync: number | null }> {
  if (__DEV__) console.log('[sync] pullFromNeon: starting');

  // 0. Determine the user scope for this pull.
  // Never pull without a known user_id — pulling globally would risk mixing users.
  const sess = await getSession();
  const userId = sess?.id ? String(sess.id) : null;
  const isUserUuid = !!userId && uuidValidate(userId);
  if (!isUserUuid) {
    if (__DEV__)
      console.warn('[sync] pullFromNeon: missing/invalid session user id; skipping pull');
    return { pulled: 0, lastSync: null };
  }

  // 1. Get the last pulled server_version for this user
  const metaKey = `last_pull_server_version:${userId}`;
  const lastRow = await executeSqlAsync('SELECT value FROM meta WHERE key = ? LIMIT 1;', [metaKey]);

  let lastVal: string | null = null;
  if (lastRow && lastRow[1]) {
    const res = lastRow[1];
    if (res.rows && res.rows.length && res.rows.length > 0) {
      const v = res.rows.item(0);
      lastVal = v ? v.value : null;
    }
  }
  const lastPulledServerVersion = lastVal ? parseInt(lastVal, 10) : 0;

  if (__DEV__) console.log('[sync] pullFromNeon: lastPulledServerVersion', lastPulledServerVersion);

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
    // DEV DEBUG: log the cursor param we'll send to Neon
    try {
      if (__DEV__)
        console.log(
          '[sync] pullFromNeon: querying remote with lastPulledServerVersion=',
          lastPulledServerVersion
        );
    } catch (e) {}

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
      WHERE user_id = $1::uuid
        AND server_version > $2::bigint
      ORDER BY server_version ASC
      LIMIT 500;
    `;

    const params = [userId, lastPulledServerVersion || 0];
    remoteRows = (await neonQuery(sql, params)) || [];
    try {
      if (__DEV__)
        console.log(
          '[sync] pullFromNeon: remoteRows.length=',
          (remoteRows && remoteRows.length) || 0
        );
    } catch (e) {}
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

  let maxRemoteTs = 0;
  let maxRemoteServerVersion = lastPulledServerVersion;
  let pulled = 0;

  // 4. Process fetched rows
  const processedIds = new Set<string>();
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
      const remoteServerVersion = Number(remote.server_version || 0);

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
          : new Date(remoteUpdatedAt || Date.now()).toISOString(),
        updated_at: remoteUpdatedAt,
        deleted_at: remote.deleted_at ? new Date(Number(remote.deleted_at)).toISOString() : null,
        server_version: Number.isFinite(remoteServerVersion) ? remoteServerVersion : 0,
        sync_status: 1, // 1 = Synced
      });

      pulled += 1;
      if (remoteUpdatedAt > maxRemoteTs) maxRemoteTs = remoteUpdatedAt;
      if (remoteServerVersion > maxRemoteServerVersion)
        maxRemoteServerVersion = remoteServerVersion;
    } catch (e) {
      if (__DEV__) console.warn('[sync] pullFromNeon: row upsert failed', e, remote && remote.id);
      // Continue processing other rows even if one fails
    }
  }

  // 5. Update local checkpoint
  if (maxRemoteServerVersion > lastPulledServerVersion) {
    try {
      await executeSqlAsync('INSERT OR REPLACE INTO meta(key, value) VALUES(?, ?);', [
        metaKey,
        String(maxRemoteServerVersion),
      ]);
      if (__DEV__)
        console.log('[sync] pullFromNeon: updated lastPulledServerVersion', maxRemoteServerVersion);
    } catch (e) {
      if (__DEV__) console.warn('[sync] pullFromNeon: failed to update lastSync', e);
    }
  }

  if (__DEV__) console.log('[sync] pullFromNeon: finished, pulled', pulled);
  // Keep returning a timestamp-like number for backward compatibility.
  // (Some UI may display this as a "last sync" value.)
  return { pulled, lastSync: maxRemoteTs || 0 };
}

export default pullFromNeon;

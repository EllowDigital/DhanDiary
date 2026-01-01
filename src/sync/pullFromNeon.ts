import { executeSqlAsync } from '../db/sqlite';
import { upsertTransactionFromRemote } from '../db/transactions';
import { query as neonQuery, getNeonHealth } from '../api/neonClient';
import { getSession } from '../db/session';
import { throwIfSyncCancelled } from './syncCancel';

const isUuid = (s: any) =>
  typeof s === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

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
  const isUserUuid = !!userId && isUuid(userId);
  if (!isUserUuid) {
    if (__DEV__)
      console.warn('[sync] pullFromNeon: missing/invalid session user id; skipping pull');
    return { pulled: 0, lastSync: null };
  }

  // 1. Get the last pull cursor for this user.
  // We use a stable cursor based on (updated_at_ms, id) because server_version
  // may be duplicated or non-monotonic depending on server triggers/backfills.
  const cursorKey = `last_pull_cursor_v2:${userId}`;
  const lastRow = await executeSqlAsync('SELECT value FROM meta WHERE key = ? LIMIT 1;', [
    cursorKey,
  ]);

  let cursorUpdatedAtMs = 0;
  let cursorId = '';

  try {
    if (lastRow && lastRow[1]) {
      const res = lastRow[1];
      if (res.rows && res.rows.length && res.rows.length > 0) {
        const v = res.rows.item(0);
        const raw = v ? v.value : null;
        if (raw) {
          const parsed = JSON.parse(String(raw));
          const u = Number(parsed?.updatedAtMs || 0);
          const id = parsed?.id ? String(parsed.id) : '';
          if (Number.isFinite(u) && u >= 0) cursorUpdatedAtMs = u;
          if (id) cursorId = id;
        }
      }
    }
  } catch (e) {
    // ignore malformed cursor
  }

  if (__DEV__)
    console.log('[sync] pullFromNeon: cursor', { cursorUpdatedAtMs, cursorId: cursorId || null });

  // 2. Check Neon Health
  try {
    const health = getNeonHealth();
    if (!health.isConfigured) {
      if (__DEV__) console.warn('[sync] pullFromNeon: Neon not configured, skipping pull');
      return { pulled: 0, lastSync: 0 };
    }
  } catch (e) {
    if (__DEV__) console.warn('[sync] pullFromNeon: failed to get neon health', e);
  }

  // 3. Fetch + apply remote rows (paged)
  if (neonMissingTransactionsTable) {
    if (__DEV__) console.log('[sync] pullFromNeon: skipping pull — remote table missing (cached)');
    return { pulled: 0, lastSync: 0 };
  }

  const PAGE_SIZE = 500;
  const MAX_PAGES = 5;

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
      AND (
        (EXTRACT(EPOCH FROM updated_at) * 1000)::bigint > $2::bigint
        OR (
          (EXTRACT(EPOCH FROM updated_at) * 1000)::bigint = $2::bigint
          AND id::text > $3::text
        )
      )
    ORDER BY updated_at ASC, id ASC
    LIMIT ${PAGE_SIZE};
  `;

  let maxRemoteTs = 0;
  let maxRemoteServerVersion = 0;
  let pulled = 0;

  const processedIds = new Set<string>();
  let pageCursorUpdatedAtMs = cursorUpdatedAtMs;
  let pageCursorId = cursorId;

  const yieldToUi = async () => {
    // Yield to the JS event loop so UI stays responsive during large syncs
    await new Promise((r) => setTimeout(r, 0));
  };

  for (let page = 0; page < MAX_PAGES; page++) {
    throwIfSyncCancelled();
    // DEV DEBUG: log the cursor param we'll send to Neon
    try {
      if (__DEV__)
        console.log('[sync] pullFromNeon: page', page + 1, 'cursor=', {
          updatedAtMs: pageCursorUpdatedAtMs,
          id: pageCursorId || null,
        });
    } catch (e) {}

    let remoteRows: Array<any> = [];
    try {
      const params = [userId, pageCursorUpdatedAtMs || 0, pageCursorId || ''];
      remoteRows = (await neonQuery(sql, params)) || [];
    } catch (e: any) {
      const msg = (e && (e.message || String(e))).toLowerCase();

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
        return { pulled: 0, lastSync: 0 };
      }

      if (__DEV__) console.warn('[sync] pullFromNeon: neon query failed', e);
      // Bubble up so retry/backoff can handle it and sync UI can reflect the failure.
      throw e;
    }

    if (!remoteRows || remoteRows.length === 0) break;

    // Advance the cursor to the last row of this page (stable pagination).
    try {
      const last = remoteRows[remoteRows.length - 1];
      const lu = Number(last?.updated_at || 0);
      const lid = last?.id ? String(last.id) : '';
      if (Number.isFinite(lu) && lu >= 0) pageCursorUpdatedAtMs = lu;
      if (lid) pageCursorId = lid;
    } catch (e) {}

    // Process remote rows in small chunks to avoid blocking the JS thread.
    const UPSERT_CHUNK = 25;
    for (let i = 0; i < remoteRows.length; i += UPSERT_CHUNK) {
      throwIfSyncCancelled();
      const batch = remoteRows.slice(i, i + UPSERT_CHUNK);

      for (const remote of batch) {
        throwIfSyncCancelled();
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
            deleted_at: remote.deleted_at
              ? new Date(Number(remote.deleted_at)).toISOString()
              : null,
            server_version: Number.isFinite(remoteServerVersion) ? remoteServerVersion : 0,
            sync_status: 1, // 1 = Synced
          });

          pulled += 1;
          if (remoteUpdatedAt > maxRemoteTs) maxRemoteTs = remoteUpdatedAt;
          if (remoteServerVersion > maxRemoteServerVersion)
            maxRemoteServerVersion = remoteServerVersion;
        } catch (e) {
          if (__DEV__)
            console.warn('[sync] pullFromNeon: row upsert failed', e, remote && remote.id);
          // Continue processing other rows even if one fails
        }
      }

      // Yield between batches
      await yieldToUi();
    }

    // Decide whether we need another page.
    // We advance cursor based on (updated_at_ms, id). If the page is shorter than PAGE_SIZE
    // we are done.
    if (remoteRows.length < PAGE_SIZE) break;
  }

  // 5. Update local checkpoint (cursor v2)
  try {
    const nextCursor = JSON.stringify({
      updatedAtMs: pageCursorUpdatedAtMs || 0,
      id: pageCursorId || '',
    });
    await executeSqlAsync('INSERT OR REPLACE INTO meta(key, value) VALUES(?, ?);', [
      cursorKey,
      nextCursor,
    ]);
  } catch (e) {
    if (__DEV__) console.warn('[sync] pullFromNeon: failed to update cursor', e);
  }

  // Best-effort: keep writing the legacy server_version key for older diagnostics/tools.
  // Note: server_version may not be suitable as a stable cursor depending on server schema.
  try {
    const metaKeyLegacy = `last_pull_server_version:${userId}`;
    await executeSqlAsync('INSERT OR REPLACE INTO meta(key, value) VALUES(?, ?);', [
      metaKeyLegacy,
      String(maxRemoteServerVersion || 0),
    ]);
  } catch (e) {}

  if (__DEV__) console.log('[sync] pullFromNeon: finished, pulled', pulled);
  // Keep returning a timestamp-like number for backward compatibility.
  // (Some UI may display this as a "last sync" value.)
  return { pulled, lastSync: maxRemoteTs || 0 };
}

export default pullFromNeon;

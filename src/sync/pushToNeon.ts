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

  // DEV DEBUG: report basic diagnostics about unsynced rows
  try {
    if (__DEV__) {
      const userSet = new Set<string>();
      for (const r of rows) if (r && r.user_id) userSet.add(String(r.user_id));
      console.log(
        '[sync] pushToNeon: unsynced rows',
        rows.length,
        'uniqueUsers',
        Array.from(userSet)
      );
    }
  } catch (e) {
    if (__DEV__) console.warn('[sync] pushToNeon: debug log failed', e);
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
          (id, user_id, amount, type, category, note, date)
          VALUES ($1::uuid,$2::uuid,$3::numeric,$4::text,$5::text,$6::text,CASE WHEN $7::bigint IS NULL OR $7::bigint = 0 THEN NULL ELSE to_timestamp($7::bigint / 1000) END)
          ON CONFLICT (id) DO UPDATE SET
            user_id = EXCLUDED.user_id,
            amount = EXCLUDED.amount,
            type = EXCLUDED.type,
            category = EXCLUDED.category,
            note = EXCLUDED.note,
            date = EXCLUDED.date
          RETURNING id, server_version, (EXTRACT(EPOCH FROM updated_at) * 1000)::bigint as updated_at`;

        // Ensure we pass numeric epoch-ms values for date/updated_at so the
        // server-side SQL casting ($7::bigint / $8::bigint) doesn't attempt
        // to cast a timestamp value to bigint (which errors).
        // Do NOT send `updated_at` from client — let Postgres triggers set it.
        // Normalize date to epoch-ms or null (server SQL will convert epoch-ms to timestamptz)
        const normalizeToEpoch = (v: any) => {
          if (v === null || v === undefined) return null;
          if (typeof v === 'number') return v;
          const asNum = Number(v);
          if (!Number.isNaN(asNum)) return asNum;
          const d = new Date(v);
          const t = d.getTime();
          return Number.isNaN(t) ? null : t;
        };

        const dateParam = normalizeToEpoch(row.date ?? null);

        const res = await neonQuery(sql, [
          row.id,
          row.user_id,
          row.amount,
          row.type,
          row.category ?? null,
          row.note ?? null,
          dateParam,
        ]);

        // Neon returns the updated row metadata; update local row to mark synced
        const returned = Array.isArray(res) && res.length ? res[0] : null;
        const serverVer =
          returned && typeof returned.server_version === 'number' ? returned.server_version : null;
        const returnedUpdatedAt =
          returned && returned.updated_at ? Number(returned.updated_at) : null;

        if (returned) {
          // update local row: set sync_status=1 and sync updated_at/server_version
          try {
            await executeSqlAsync(
              'UPDATE transactions SET sync_status = 1, server_version = ?, updated_at = ? WHERE id = ?;',
              [serverVer ?? 0, returnedUpdatedAt ?? Date.now(), row.id]
            );
          } catch (e) {
            // best-effort: if update fails, still mark pushedIds so we don't block
            if (__DEV__)
              console.warn('[sync] pushToNeon: failed to update local metadata', e, row.id);
          }
        } else {
          // No return - fall back to marking synced
          await executeSqlAsync('UPDATE transactions SET sync_status = 1 WHERE id = ?;', [row.id]);
        }
        pushedIds.push(row.id);
      } catch (err) {
        if (__DEV__) console.warn('[sync] pushToNeon: failed to push row', row.id, err);
        // continue with other rows
      }
    }

    for (const row of toDelete) {
      try {
        await neonQuery('DELETE FROM transactions WHERE id = $1', [row.id]);
        // Remove local tombstone after successful remote delete so it does not reappear
        await executeSqlAsync('DELETE FROM transactions WHERE id = ?;', [row.id]);
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

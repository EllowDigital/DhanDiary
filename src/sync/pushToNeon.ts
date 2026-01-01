import { getUnsyncedTransactions } from '../db/transactions';
import { executeSqlAsync } from '../db/sqlite';
import { query as neonQuery, getNeonHealth } from '../api/neonClient';

const CHUNK_SIZE = 50;

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

  // Dirty selection comes from getUnsyncedTransactions().
  // Deletions are identified by tombstones: `sync_status=2` and/or `deleted_at IS NOT NULL`.
  const dirty = rows.filter((r) => !!r);

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

  const normalizeToEpoch = (v: any) => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return v;
    const asNum = Number(v);
    if (!Number.isNaN(asNum)) return asNum;
    const d = new Date(v);
    const t = d.getTime();
    return Number.isNaN(t) ? null : t;
  };

  const buildBatchUpsertSql = (batchSize: number) => {
    // Columns we control from client. Do NOT send updated_at/server_version; server triggers handle them.
    const cols =
      '(id, user_id, client_id, type, amount, category, note, currency, date, created_at, deleted_at)';
    const values: string[] = [];
    let p = 1;
    for (let i = 0; i < batchSize; i++) {
      values.push(
        `($${p++}::uuid,$${p++}::uuid,$${p++}::uuid,$${p++}::text,$${p++}::numeric,$${p++}::text,$${p++}::text,$${p++}::text,` +
          `CASE WHEN $${p}::bigint IS NULL OR $${p}::bigint = 0 THEN NULL ELSE to_timestamp($${p}::bigint / 1000.0) END,` +
          `CASE WHEN $${p + 1}::bigint IS NULL OR $${p + 1}::bigint = 0 THEN NULL ELSE to_timestamp($${p + 1}::bigint / 1000.0) END,` +
          `CASE WHEN $${p + 2}::bigint IS NULL OR $${p + 2}::bigint = 0 THEN NULL ELSE to_timestamp($${p + 2}::bigint / 1000.0) END)`
      );
      p += 3;
    }

    return `
      INSERT INTO transactions ${cols}
      VALUES ${values.join(',\n')}
      ON CONFLICT (id) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        client_id = COALESCE(transactions.client_id, EXCLUDED.client_id),
        amount = EXCLUDED.amount,
        type = EXCLUDED.type,
        category = EXCLUDED.category,
        note = EXCLUDED.note,
        currency = EXCLUDED.currency,
        date = EXCLUDED.date,
        deleted_at = EXCLUDED.deleted_at
      RETURNING id, server_version, (EXTRACT(EPOCH FROM updated_at) * 1000)::bigint as updated_at;
    `;
  };

  const pushBatch = async (batch: any[]) => {
    const sql = buildBatchUpsertSql(batch.length);
    const params: any[] = [];
    for (const row of batch) {
      params.push(
        row.id,
        row.user_id,
        row.client_id ?? null,
        row.type,
        row.amount,
        row.category ?? null,
        row.note ?? null,
        row.currency ?? 'INR',
        normalizeToEpoch(row.date ?? null),
        normalizeToEpoch(row.created_at ?? null),
        normalizeToEpoch(row.deleted_at ?? null)
      );
    }
    return (await neonQuery(sql, params)) || [];
  };

  try {
    // Push changes in chunks to reduce query count (compute wakeups)
    const chunks: any[][] = [];
    for (let i = 0; i < dirty.length; i += CHUNK_SIZE) chunks.push(dirty.slice(i, i + CHUNK_SIZE));

    for (const chunk of chunks) {
      try {
        const returnedRows = await pushBatch(chunk);

        // Mark local as synced using server metadata (best effort)
        const byId = new Map<string, any>();
        for (const r of returnedRows) if (r && r.id) byId.set(String(r.id), r);

        for (const row of chunk) {
          const ret = byId.get(String(row.id)) || null;
          const serverVer = ret && typeof ret.server_version === 'number' ? ret.server_version : 0;
          const returnedUpdatedAt = ret && ret.updated_at ? Number(ret.updated_at) : Date.now();

          try {
            await executeSqlAsync(
              'UPDATE transactions SET sync_status = 1, need_sync = 0, server_version = ?, updated_at = ? WHERE id = ?;',
              [serverVer, returnedUpdatedAt, row.id]
            );
          } catch (e) {
            if (__DEV__)
              console.warn('[sync] pushToNeon: failed to update local metadata', e, row.id);
          }

          if (row.deleted_at || Number((row as any).sync_status) === 2)
            deletedIds.push(String(row.id));
          else pushedIds.push(String(row.id));
        }
      } catch (err) {
        // Fallback: if a chunk fails (e.g., one bad row), try per-row so others still sync.
        if (__DEV__) console.warn('[sync] pushToNeon: batch failed, falling back to per-row', err);
        for (const row of chunk) {
          try {
            const returnedRows = await pushBatch([row]);
            const ret = Array.isArray(returnedRows) && returnedRows.length ? returnedRows[0] : null;
            const serverVer =
              ret && typeof ret.server_version === 'number' ? ret.server_version : 0;
            const returnedUpdatedAt = ret && ret.updated_at ? Number(ret.updated_at) : Date.now();
            await executeSqlAsync(
              'UPDATE transactions SET sync_status = 1, need_sync = 0, server_version = ?, updated_at = ? WHERE id = ?;',
              [serverVer, returnedUpdatedAt, row.id]
            );
            if (row.deleted_at || Number((row as any).sync_status) === 2)
              deletedIds.push(String(row.id));
            else pushedIds.push(String(row.id));
          } catch (rowErr) {
            if (__DEV__) console.warn('[sync] pushToNeon: failed to push row', row.id, rowErr);
          }
        }
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

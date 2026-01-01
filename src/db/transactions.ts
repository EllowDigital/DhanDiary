import { executeSqlAsync } from './sqlite';
import { notifyEntriesChanged } from '../utils/dbEvents';

// Matches 'transactions' table in schema.sql
export type TransactionRow = {
  id: string; // uuid
  user_id: string; // uuid
  client_id?: string | null; // uuid (optional, for tracking device origin)

  // Core Data
  amount: number; // numeric(18,2)
  type: 'income' | 'expense';
  category?: string | null;
  note?: string | null;
  currency: string; // default 'INR'
  date: string; // timestamptz (ISO String)

  // Sync & Versioning
  server_version: number; // bigint default 0
  sync_status: number; // 0=pending, 1=synced (Maps to local logic)
  need_sync?: number; // boolean stored as 0/1 in SQLite

  // Timestamps
  created_at: string | number; // timestamptz (ISO string or epoch ms)
  updated_at: number; // epoch ms
  deleted_at?: string | null; // timestamptz
};

export async function getTransactionById(
  id: string,
  userId: string
): Promise<TransactionRow | null> {
  const sql = `SELECT * FROM transactions WHERE id = ? AND user_id = ? LIMIT 1;`;
  const [, res] = await executeSqlAsync(sql, [id, userId]);
  if (!res || !res.rows || res.rows.length === 0) return null;
  return res.rows.item(0) as TransactionRow;
}

export async function getTransactionByLocalId(id: string): Promise<TransactionRow | null> {
  const sql = `SELECT * FROM transactions WHERE id = ? LIMIT 1;`;
  const [, res] = await executeSqlAsync(sql, [id]);
  if (!res || !res.rows || res.rows.length === 0) return null;
  return res.rows.item(0) as TransactionRow;
}

/** * Insert a new transaction.
 * Matches Postgres defaults: currency='INR', server_version=0
 */
export async function addTransaction(
  txn: Partial<TransactionRow> & { id: string; user_id: string }
) {
  const now = Date.now();

  // Default values based on schema.sql
  const nowIso = new Date().toISOString();
  const nowMs = Date.now();
  const row: TransactionRow = {
    id: txn.id,
    user_id: txn.user_id,
    client_id: txn.client_id ?? null,
    amount: txn.amount ?? 0,
    type: txn.type ?? 'expense',
    category: txn.category ?? null,
    note: txn.note ?? null,
    currency: txn.currency ?? 'INR',
    date: txn.date ?? nowIso, // Schema says NOT NULL
    created_at: nowIso,
    updated_at: nowMs,
    deleted_at: null,
    server_version: 0,
    sync_status: typeof txn.sync_status === 'number' ? txn.sync_status : 0, // Default 0 (pending push)
    need_sync: 1,
  };

  const sql = `
    INSERT OR REPLACE INTO transactions(
      id, user_id, client_id, amount, type, category, note, currency, date, 
      created_at, updated_at, deleted_at, server_version, sync_status, need_sync
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `;

  await executeSqlAsync(sql, [
    row.id,
    row.user_id,
    row.client_id ?? null,
    row.amount,
    row.type,
    row.category,
    row.note,
    row.currency,
    row.date,
    row.created_at,
    row.updated_at,
    row.deleted_at,
    row.server_version,
    row.sync_status,
    row.need_sync ?? 1,
  ]);

  if (__DEV__) console.log('[transactions] add', row.id);
  try {
    notifyEntriesChanged();
  } catch (e) {}

  return row;
}

/**
 * Update existing transaction.
 * Resets sync_status to 0 (pending) and updates updated_at.
 */
export async function updateTransaction(
  txn: Partial<TransactionRow> & { id: string; user_id: string }
) {
  const now = Date.now();

  // Always merge with the current row to avoid accidental data loss from partial updates
  const existing = await getTransactionById(txn.id, txn.user_id);
  const sql = `
    UPDATE transactions 
    SET amount = ?, type = ?, category = ?, note = ?, date = ?, currency = ?,
        updated_at = ?, sync_status = 0, need_sync = 1
    WHERE id = ? AND user_id = ?;
  `;

  if (!existing) {
    // Backward-compatible: try UPDATE first (no-op if missing), then insert fallback.
    const fallbackDate = (txn as any).date ?? new Date().toISOString();
    const fallbackCurrency = (txn as any).currency ?? 'INR';
    const [, res] = await executeSqlAsync(sql, [
      (txn as any).amount ?? 0,
      (txn as any).type ?? 'expense',
      (txn as any).category ?? null,
      (txn as any).note ?? null,
      fallbackDate,
      fallbackCurrency,
      now,
      txn.id,
      txn.user_id,
    ]);

    const affected = Number(res?.rowsAffected || 0);
    if (affected === 0) {
      return await addTransaction({
        ...txn,
        date: fallbackDate,
        currency: fallbackCurrency,
        sync_status: 0,
      } as any);
    }

    try {
      notifyEntriesChanged();
    } catch (e) {}

    // If it unexpectedly updated, return a best-effort shape
    return {
      id: txn.id,
      user_id: txn.user_id,
      amount: (txn as any).amount ?? 0,
      type: ((txn as any).type ?? 'expense') as any,
      category: (txn as any).category ?? null,
      note: (txn as any).note ?? null,
      currency: fallbackCurrency,
      date: fallbackDate,
      created_at: (txn as any).created_at ?? new Date().toISOString(),
      updated_at: now,
      deleted_at: null,
      server_version: (txn as any).server_version ?? 0,
      sync_status: 0,
      need_sync: 1,
    } as TransactionRow;
  }

  const existingDeletedAt = (existing as any).deleted_at ?? null;
  const existingSyncStatus = Number((existing as any).sync_status ?? 0);
  if (existingDeletedAt || existingSyncStatus === 2) {
    throw new Error('Cannot edit a deleted transaction');
  }

  const merged: TransactionRow = {
    ...existing,
    ...txn,
    amount: txn.amount !== undefined ? (txn.amount ?? 0) : (existing.amount ?? 0),
    type: (txn.type !== undefined ? txn.type : existing.type) as any,
    category: txn.category !== undefined ? (txn.category ?? null) : (existing.category ?? null),
    note: txn.note !== undefined ? (txn.note ?? null) : (existing.note ?? null),
    currency: txn.currency !== undefined ? (txn.currency ?? 'INR') : (existing.currency ?? 'INR'),
    date: txn.date !== undefined ? (txn.date as any) : (existing.date as any),
    updated_at: now,
    sync_status: 0,
    need_sync: 1,
  } as TransactionRow;

  const [, res] = await executeSqlAsync(sql, [
    merged.amount,
    merged.type,
    merged.category ?? null,
    merged.note ?? null,
    merged.date ?? new Date().toISOString(),
    merged.currency ?? 'INR',
    now,
    txn.id,
    txn.user_id,
  ]);

  const affected = Number(res?.rowsAffected || 0);
  if (affected === 0) throw new Error('Transaction not found');

  if (__DEV__) console.log('[transactions] update', txn.id);
  try {
    notifyEntriesChanged();
  } catch (e) {}

  return merged;
}

/** * Soft-delete: Set deleted_at timestamp and mark for sync
 * Schema uses 'deleted_at IS NOT NULL' to identify deleted rows.
 */
export async function deleteTransaction(id: string, userId: string) {
  const deletedAtIso = new Date().toISOString();
  const updatedAtMs = Date.now();

  // Idempotent tombstone:
  // - set deleted_at once
  // - mark as tombstoned for sync
  const sql = `
    UPDATE transactions 
    SET deleted_at = COALESCE(deleted_at, ?), updated_at = ?, sync_status = 2, need_sync = 1
    WHERE id = ? AND user_id = ?;
  `;

  await executeSqlAsync(sql, [deletedAtIso, updatedAtMs, id, userId]);

  if (__DEV__) console.log('[transactions] soft delete', id);
  try {
    notifyEntriesChanged();
  } catch (e) {}
  return true;
}

/** * Get active transactions (Not deleted)
 */
export async function getTransactionsByUser(userId: string) {
  // Filter: deleted_at IS NULL
  const sql = `
    SELECT * FROM transactions 
    WHERE user_id = ? 
      AND deleted_at IS NULL 
    ORDER BY date DESC, updated_at DESC;
  `;

  const [, res] = await executeSqlAsync(sql, [userId]);
  const rows: TransactionRow[] = [];
  for (let i = 0; i < res.rows.length; i++) {
    rows.push(res.rows.item(i) as TransactionRow);
  }
  return rows;
}

/**
 * Get pending changes to push to server.
 * Includes creates/updates (sync_status=0) AND deletes (sync_status=0 + deleted_at not null)
 */
export async function getUnsyncedTransactions() {
  // Backwards-compatible selector:
  // - new writes use need_sync=1
  // - older dirty rows may only have sync_status=0
  // - tombstones are sync_status=2
  const sql = `SELECT * FROM transactions WHERE need_sync = 1 OR sync_status IN (0,2);`;
  const [, res] = await executeSqlAsync(sql, []);
  const rows: TransactionRow[] = [];
  for (let i = 0; i < res.rows.length; i++) {
    rows.push(res.rows.item(i) as TransactionRow);
  }
  return rows;
}

/**
 * Return any user_id present in the transactions table. Useful when the app
 * has local data but no persisted session (e.g., app opened offline).
 * Returns first found user_id or null.
 */
export async function getAnyUserWithTransactions(): Promise<string | null> {
  const sql = `SELECT user_id FROM transactions WHERE deleted_at IS NULL LIMIT 1;`;
  const [, res] = await executeSqlAsync(sql, []);
  if (res && res.rows && res.rows.length > 0) {
    const it = res.rows.item(0);
    return it?.user_id || null;
  }
  return null;
}

/**
 * Upsert from Remote (Sync Pull)
 * Aligns with Schema: respects server_version and existing tombstones
 */
export async function upsertTransactionFromRemote(txn: TransactionRow) {
  try {
    // 1. Check if we have a newer local version or a deletion tombstone that hasn't synced yet?
    // Actually, usually "Server Wins" or "Last Write Wins".
    // If local has deleted_at set and sync_status=0, we might want to keep our local delete.

    const checkSql = `SELECT sync_status, deleted_at, server_version, updated_at FROM transactions WHERE id = ? LIMIT 1;`;
    const [, res] = await executeSqlAsync(checkSql, [txn.id]);

    if (res && res.rows && res.rows.length > 0) {
      const existing = res.rows.item(0);

      // If local is pending push (dirty), strictly speaking we have a conflict.
      // Simple strategy: Server Wins (overwrite local), unless you want sophisticated conflict resolution.

      // OPTIONAL: If local has a pending deletion (deleted_at set and sync_status === 0), keep local tombstone.
      // Also treat sync_status === 2 as an explicit local tombstone marker (skip remote upsert).
      const isLocalPendingDelete =
        existing &&
        existing.deleted_at &&
        (Number(existing.need_sync) === 1 || Number(existing.sync_status) === 0);
      const isLocalTombstoneFlag = existing && Number(existing.sync_status) === 2;
      if (isLocalPendingDelete || isLocalTombstoneFlag) {
        if ((globalThis as any).__SYNC_VERBOSE__)
          console.debug(
            '[transactions] skipping remote upsert, local pending delete/tombstone exists',
            txn.id
          );
        return;
      }

      // Also skip if local already has equal-or-newer data by server_version/updated_at.
      if (existing) {
        try {
          const localServerVersion = Number(existing.server_version || 0);
          const localUpdatedAt = Number(existing.updated_at || 0);
          const remoteServerVersion = Number(txn.server_version || 0);
          const remoteUpdatedAt = Number(txn.updated_at || 0);
          if (localServerVersion >= remoteServerVersion && localUpdatedAt >= remoteUpdatedAt) {
            if ((globalThis as any).__SYNC_VERBOSE__)
              console.debug('[transactions] skipping remote upsert, local is up-to-date', txn.id);
            return;
          }
        } catch (e) {
          // ignore parse errors and proceed to upsert
        }
      }
    }

    // Normalize date/created_at/updated_at types for local SQLite storage:
    // - store `date` and `created_at` as ISO strings (timestamptz)
    // - store `updated_at` as epoch milliseconds (number)
    const toIso = (v: any, fallbackMs?: number) => {
      try {
        if (v == null)
          return fallbackMs ? new Date(fallbackMs).toISOString() : new Date().toISOString();
        if (v instanceof Date) return v.toISOString();
        const n = Number(v);
        if (!Number.isNaN(n)) {
          const ms = n < 1e12 ? n * 1000 : n;
          return new Date(ms).toISOString();
        }
        const parsed = Date.parse(String(v));
        if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
        return fallbackMs ? new Date(fallbackMs).toISOString() : new Date().toISOString();
      } catch (e) {
        return fallbackMs ? new Date(fallbackMs).toISOString() : new Date().toISOString();
      }
    };

    const normalizedDate = toIso(txn.date, Number(txn.updated_at) || Date.now());
    const normalizedCreatedAt = toIso(txn.created_at, Number(txn.updated_at) || Date.now());
    const normalizedUpdatedAt = (() => {
      const u = txn.updated_at;
      if (u == null) return Date.now();
      const n = Number(u);
      if (!Number.isNaN(n)) return n < 1e12 ? n * 1000 : n;
      const parsed = Date.parse(String(u));
      return Number.isNaN(parsed) ? Date.now() : parsed;
    })();

    const sql = `
      INSERT OR REPLACE INTO transactions(
        id, user_id, amount, type, category, note, currency, date,
        created_at, updated_at, deleted_at, 
        server_version, sync_status, need_sync
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `;

    const [, writeRes] = await executeSqlAsync(sql, [
      txn.id,
      txn.user_id,
      txn.amount,
      txn.type,
      txn.category ?? null,
      txn.note ?? null,
      txn.currency ?? 'INR',
      normalizedDate,
      normalizedCreatedAt,
      normalizedUpdatedAt,
      txn.deleted_at ?? null,
      txn.server_version ?? 0,
      1, // sync_status = 1 (Synced because it came from server)
      0, // need_sync = 0 because it came from server
    ]);

    if (__DEV__) console.log('[transactions] upsert remote', txn.id);
    try {
      const rowsAffected = Number(writeRes?.rowsAffected || 0);
      if (rowsAffected > 0) notifyEntriesChanged();
    } catch (e) {}
  } catch (e) {
    if (__DEV__) console.warn('[transactions] upsertTransactionFromRemote failed', e, txn.id);
  }
}

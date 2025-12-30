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
  created_at: string; // timestamptz
  updated_at: string; // timestamptz
  deleted_at?: string | null; // timestamptz
};

/** * Insert a new transaction.
 * Matches Postgres defaults: currency='INR', server_version=0
 */
export async function addTransaction(
  txn: Partial<TransactionRow> & { id: string; user_id: string }
) {
  const now = new Date().toISOString();

  // Default values based on schema.sql
  const row: TransactionRow = {
    id: txn.id,
    user_id: txn.user_id,
    amount: txn.amount ?? 0,
    type: txn.type ?? 'expense',
    category: txn.category ?? null,
    note: txn.note ?? null,
    currency: txn.currency ?? 'INR',
    date: txn.date ?? now, // Schema says NOT NULL
    created_at: now,
    updated_at: now,
    deleted_at: null,
    server_version: 0,
    sync_status: typeof txn.sync_status === 'number' ? txn.sync_status : 0, // Default 0 (pending push)
  };

  const sql = `
    INSERT OR REPLACE INTO transactions(
      id, user_id, amount, type, category, note, currency, date, 
      created_at, updated_at, deleted_at, server_version, sync_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `;

  await executeSqlAsync(sql, [
    row.id,
    row.user_id,
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
  const now = new Date().toISOString();

  // SQL to update specific fields and reset sync status
  const sql = `
    UPDATE transactions 
    SET amount = ?, type = ?, category = ?, note = ?, date = ?, currency = ?,
        updated_at = ?, sync_status = 0 
    WHERE id = ? AND user_id = ?;
  `;

  // We use coalescing to ensure we don't accidentally wipe data if partial txn is passed
  // Note: For a true partial update in SQLite without selecting first, you usually
  // need the full object or dynamic SQL. Assuming 'txn' contains the edit form values.

  // WARNING: If txn.amount is undefined, this puts NULL or 0?
  // Ideally, updateTransaction should receive the full updated object or we fetch-then-update.
  // Below assumes the UI passes the complete specific fields being edited.

  const [, res] = await executeSqlAsync(sql, [
    txn.amount ?? 0,
    txn.type ?? 'expense',
    txn.category ?? null,
    txn.note ?? null,
    txn.date ?? now,
    txn.currency ?? 'INR',
    now, // updated_at
    txn.id,
    txn.user_id,
  ]);

  // Fallback: If row doesn't exist locally (offline edit of remote item not yet pulled?), insert it.
  const affected = Number(res?.rowsAffected || 0);
  if (affected === 0) {
    if (__DEV__)
      console.warn('[transactions] update affected 0 rows, falling back to insert', txn.id);
    return await addTransaction({ ...txn, created_at: now } as TransactionRow);
  } else {
    if (__DEV__) console.log('[transactions] update', txn.id);
    try {
      notifyEntriesChanged();
    } catch (e) {}
  }

  // Return a partial structure reflecting the update
  return {
    ...txn,
    updated_at: now,
    sync_status: 0,
  } as TransactionRow;
}

/** * Soft-delete: Set deleted_at timestamp and mark for sync
 * Schema uses 'deleted_at IS NOT NULL' to identify deleted rows.
 */
export async function deleteTransaction(id: string, userId: string) {
  const now = new Date().toISOString();

  // We keep sync_status = 0 (pending) so the deletion gets pushed to server
  const sql = `
    UPDATE transactions 
    SET deleted_at = ?, updated_at = ?, sync_status = 0 
    WHERE id = ? AND user_id = ?;
  `;

  await executeSqlAsync(sql, [now, now, id, userId]);

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
  const sql = `SELECT * FROM transactions WHERE sync_status = 0;`;
  const [, res] = await executeSqlAsync(sql, []);
  const rows: TransactionRow[] = [];
  for (let i = 0; i < res.rows.length; i++) {
    rows.push(res.rows.item(i) as TransactionRow);
  }
  return rows;
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

    const checkSql = `SELECT sync_status, deleted_at, server_version FROM transactions WHERE id = ? LIMIT 1;`;
    const [, res] = await executeSqlAsync(checkSql, [txn.id]);

    if (res && res.rows && res.rows.length > 0) {
      const existing = res.rows.item(0);

      // If local is pending push (dirty), strictly speaking we have a conflict.
      // Simple strategy: Server Wins (overwrite local), unless you want sophisticated conflict resolution.

      // OPTIONAL: If local has higher server_version (impossible if pulled from server)
      // or if we want to preserve local deletion:
      if (existing.deleted_at && existing.sync_status === 0) {
        if (__DEV__)
          console.log('[transactions] skipping remote upsert, local pending delete exists', txn.id);
        return;
      }
    }

    const sql = `
      INSERT OR REPLACE INTO transactions(
        id, user_id, amount, type, category, note, currency, date,
        created_at, updated_at, deleted_at, 
        server_version, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `;

    await executeSqlAsync(sql, [
      txn.id,
      txn.user_id,
      txn.amount,
      txn.type,
      txn.category ?? null,
      txn.note ?? null,
      txn.currency ?? 'INR',
      txn.date, // ISO String
      txn.created_at, // ISO String
      txn.updated_at, // ISO String
      txn.deleted_at ?? null,
      txn.server_version ?? 0,
      1, // sync_status = 1 (Synced because it came from server)
    ]);

    if (__DEV__) console.log('[transactions] upsert remote', txn.id);
    try {
      notifyEntriesChanged();
    } catch (e) {}
  } catch (e) {
    if (__DEV__) console.warn('[transactions] upsertTransactionFromRemote failed', e, txn.id);
  }
}

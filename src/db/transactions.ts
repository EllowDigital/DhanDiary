import { executeSqlAsync } from './sqlite';

export type TransactionRow = {
  id: string;
  user_id: string;
  amount: number;
  type: 'income' | 'expense';
  category?: string | null;
  note?: string | null;
  date?: string | null;
  updated_at: number;
  sync_status: number;
};

/** Insert a new transaction. Ensures updated_at and sync_status are set.
 * Caller must provide `user_id` (Clerk user id).
 */
export async function addTransaction(txn: Partial<TransactionRow> & { id: string }) {
  const now = Date.now();
  const sync_status = typeof txn.sync_status === 'number' ? txn.sync_status : 0;
  const sql = `INSERT OR REPLACE INTO transactions(
    id, user_id, amount, type, category, note, date, updated_at, sync_status
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`;

  await executeSqlAsync(sql, [
    txn.id,
    txn.user_id,
    txn.amount ?? 0,
    txn.type ?? 'expense',
    txn.category ?? null,
    txn.note ?? null,
    txn.date ?? null,
    now,
    sync_status,
  ]);

  if (__DEV__) console.log('[transactions] add', txn.id);
  return {
    ...txn,
    updated_at: now,
    sync_status,
  } as TransactionRow;
}

export async function updateTransaction(txn: Partial<TransactionRow> & { id: string; user_id: string }) {
  const now = Date.now();
  const sql = `UPDATE transactions SET amount = ?, type = ?, category = ?, note = ?, date = ?, updated_at = ?, sync_status = ? WHERE id = ? AND user_id = ?;`;
  // set sync_status to 0 (pending push) on update
  await executeSqlAsync(sql, [
    txn.amount ?? 0,
    txn.type ?? 'expense',
    txn.category ?? null,
    txn.note ?? null,
    txn.date ?? null,
    now,
    0,
    txn.id,
    txn.user_id,
  ]);

  if (__DEV__) console.log('[transactions] update', txn.id);
  return {
    ...txn,
    updated_at: now,
    sync_status: 0,
  } as TransactionRow;
}

/** Soft-delete: mark the row as pending-delete via sync_status = 2 */
export async function deleteTransaction(id: string, userId: string) {
  const now = Date.now();
  const sql = `UPDATE transactions SET sync_status = 2, updated_at = ? WHERE id = ? AND user_id = ?;`;
  await executeSqlAsync(sql, [now, id, userId]);
  if (__DEV__) console.log('[transactions] soft delete', id);
  return true;
}

export async function getTransactionsByUser(userId: string) {
  const sql = `SELECT id, user_id, amount, type, category, note, date, updated_at, sync_status FROM transactions WHERE user_id = ? AND (sync_status IS NULL OR sync_status != 2) ORDER BY date DESC, updated_at DESC;`;
  const [, res] = await executeSqlAsync(sql, [userId]);
  const rows: TransactionRow[] = [];
  for (let i = 0; i < res.rows.length; i++) {
    rows.push(res.rows.item(i));
  }
  return rows;
}

export async function getUnsyncedTransactions() {
  const sql = `SELECT id, user_id, amount, type, category, note, date, updated_at, sync_status FROM transactions WHERE sync_status IN (0,2);`;
  const [, res] = await executeSqlAsync(sql, []);
  const rows: TransactionRow[] = [];
  for (let i = 0; i < res.rows.length; i++) {
    rows.push(res.rows.item(i));
  }
  return rows;
}

// Small helper for tests or debug to upsert from remote source during pull
export async function upsertTransactionFromRemote(txn: TransactionRow) {
  const sql = `INSERT OR REPLACE INTO transactions(id, user_id, amount, type, category, note, date, updated_at, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`;
  await executeSqlAsync(sql, [
    txn.id,
    txn.user_id,
    txn.amount,
    txn.type,
    txn.category ?? null,
    txn.note ?? null,
    txn.date ?? null,
    txn.updated_at ?? Date.now(),
    typeof txn.sync_status === 'number' ? txn.sync_status : 1,
  ]);
  if (__DEV__) console.log('[transactions] upsert remote', txn.id);
}

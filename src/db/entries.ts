import { query } from '../api/neonClient';

export type LocalEntry = any;

const mapRowToLocal = (r: any): LocalEntry => ({
  local_id: String(r.id),
  remote_id: String(r.id),
  user_id: r.user_id,
  type: r.type,
  amount: Number(r.amount),
  category: r.category,
  note: r.note,
  currency: r.currency,
  created_at: r.created_at,
  updated_at: r.updated_at,
  date: r.date,
  need_sync: false,
});

export const getEntries = async (userId: string) => {
  const rows = await query(
    `SELECT id, user_id, type, amount, category, note, currency, created_at, updated_at, date FROM cash_entries WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1000`,
    [userId]
  );
  return (rows || []).map(mapRowToLocal);
};

export const addLocalEntry = async (entry: any) => {
  const res = await query(
    `INSERT INTO cash_entries (user_id, type, amount, category, note, currency, created_at, updated_at, date) VALUES ($1,$2,$3::numeric,$4,$5,$6,$7::timestamptz,$8::timestamptz,$9::timestamptz) RETURNING id, user_id, type, amount, category, note, currency, created_at, updated_at, date`,
    [
      entry.user_id,
      entry.type,
      Number(entry.amount),
      entry.category,
      entry.note || null,
      entry.currency || 'INR',
      entry.created_at,
      entry.updated_at,
      entry.date,
    ]
  );
  const row = res && res[0];
  return row ? mapRowToLocal(row) : null;
};

export const updateLocalEntry = async (localId: string, updates: any) => {
  const fields: string[] = [];
  const params: any[] = [];
  let idx = 1;
  if (updates.type !== undefined) {
    fields.push(`type = $${idx++}`);
    params.push(updates.type);
  }
  if (updates.amount !== undefined) {
    fields.push(`amount = $${idx++}::numeric`);
    params.push(Number(updates.amount));
  }
  if (updates.category !== undefined) {
    fields.push(`category = $${idx++}`);
    params.push(updates.category);
  }
  if (updates.note !== undefined) {
    fields.push(`note = $${idx++}`);
    params.push(updates.note);
  }
  if (updates.date !== undefined) {
    fields.push(`date = $${idx++}::timestamptz`);
    params.push(updates.date);
  }
  if (fields.length === 0) return null;
  params.push(localId);
  const sql = `UPDATE cash_entries SET ${fields.join(',')}, updated_at = NOW() WHERE id = $${idx} RETURNING id, user_id, type, amount, category, note, currency, created_at, updated_at, date`;
  const res = await query(sql, params);
  const row = res && res[0];
  return row ? mapRowToLocal(row) : null;
};

export const markEntryDeleted = async (localId: string) => {
  const res = await query(
    `UPDATE cash_entries SET deleted = true, need_sync = false, updated_at = NOW() WHERE id = $1 RETURNING id, user_id, type, amount, category, note, currency, created_at, updated_at, date`,
    [localId]
  );
  const row = res && res[0];
  return row ? mapRowToLocal(row) : null;
};

export const markEntrySynced = async (
  _localId: string,
  _remoteId?: string,
  _serverVersion?: number,
  _syncedUpdatedAt?: string | null
) => {
  // In online-only mode, entries are directly created on Neon; nothing to mark locally.
  return null;
};

export const deleteLocalEntry = async (localId: string) => {
  // Soft-delete on remote
  return await markEntryDeleted(localId);
};

export const getEntryByLocalId = async (localId: string) => {
  const res = await query(
    `SELECT id, user_id, type, amount, category, note, currency, created_at, updated_at, date FROM cash_entries WHERE id = $1 LIMIT 1`,
    [localId]
  );
  const row = res && res[0];
  return row ? mapRowToLocal(row) : null;
};

export const getLocalByRemoteId = async (remoteId: string) => {
  return await getEntryByLocalId(remoteId);
};

export const upsertLocalFromRemote = async (_remote: any) => {
  // Pull logic handles remote rows; no local DB writes required.
  return null;
};

export const getLocalByClientId = async (_clientId: string) => {
  // Client-side client_id mapping is not used in online-only mode.
  return null;
};

export const getUnsyncedEntries = async () => [];

export async function* fetchEntriesGenerator(userId: string, pageSize: number = 1000) {
  const rows = await query(
    `SELECT id, user_id, type, amount, category, note, currency, created_at, updated_at, date FROM cash_entries WHERE user_id = $1 ORDER BY updated_at DESC`,
    [userId]
  );
  yield (rows || []).map(mapRowToLocal);
}

export const getSummary = async (period: 'daily' | 'monthly', key: string) => {
  // Minimal implementation: return zeroed summary
  return { total: 0 };
};

export const markLocalDeletedByRemoteId = async (remoteId: string) => {
  return await markEntryDeleted(remoteId);
};

export default {
  getEntries,
  addLocalEntry,
  updateLocalEntry,
  markEntryDeleted,
  markEntrySynced,
  getEntryByLocalId,
  getLocalByRemoteId,
  upsertLocalFromRemote,
  markLocalDeletedByRemoteId,
  getLocalByClientId,
  getUnsyncedEntries,
  deleteLocalEntry,
};

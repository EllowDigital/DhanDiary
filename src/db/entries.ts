import { query } from '../api/neonClient';
// lightweight UUID helpers (avoid importing ESM-only 'uuid' in tests)
const uuidValidate = (s: any) =>
  typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);

const uuidv4 = () => {
  // Simple v4 generator (sufficient for client-side IDs)
  const hex = () =>
    Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  return `${hex()}${hex()}-${hex()}-${hex()}-${hex()}-${hex()}${hex()}${hex()}`;
};

// lazy import to avoid circular at runtime; used when mapping clerk id -> neon uuid
const mapClerkToNeon = async (clerkId: string) => {
  try {
    const mod = require('../services/clerkUserSync');
    if (mod && typeof mod.syncClerkUserToNeon === 'function') {
      const res = await mod.syncClerkUserToNeon({ id: clerkId, emailAddresses: [], fullName: '' });
      if (!res) return null;
      // If the bridge returned an offline fallback, treat it as a mapping failure.
      if (res.isOfflineFallback) {
        console.warn('[mapClerkToNeon] bridge returned offline fallback for clerkId', clerkId);
        return null;
      }
      return res.uuid || null;
    }
  } catch (e) {}
  return null;
};

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
  if (!userId || !uuidValidate(userId)) return [];
  const rows = await query(
    `SELECT id, user_id, type, amount, category, note, currency, created_at, updated_at, date FROM cash_entries WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1000`,
    [userId]
  );
  return (rows || []).map(mapRowToLocal);
};

export const addLocalEntry = async (entry: any) => {
  // Ensure we have a valid Neon user id. If caller passed a Clerk id (non-UUID),
  // attempt to map it to a Neon UUID via the bridge. If mapping fails, abort.
  let userId = entry.user_id;
  if (!userId) throw new Error('Missing user_id for entry');
  if (!uuidValidate(userId)) {
    const mapped = await mapClerkToNeon(userId);
    if (mapped) userId = mapped;
    else {
      console.error('[addLocalEntry] user_id is not a valid Neon UUID and mapping failed', userId);
      throw new Error('Invalid user id for remote insert');
    }
  }

  // Ensure client_id exists
  const clientId = entry.client_id && uuidValidate(entry.client_id) ? entry.client_id : uuidv4();

  const res = await query(
    `INSERT INTO cash_entries (user_id, client_id, type, amount, category, note, currency, created_at, updated_at, date) VALUES ($1,$2,$3,$4::numeric,$5,$6,$7,$8::timestamptz,$9::timestamptz,$10::timestamptz) RETURNING id, user_id, type, amount, category, note, currency, created_at, updated_at, date, client_id`,
    [
      userId,
      clientId,
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
  if (!userId || !uuidValidate(userId)) return;
  const rows = await query(
    `SELECT id, user_id, type, amount, category, note, currency, created_at, updated_at, date FROM cash_entries WHERE user_id = $1 ORDER BY updated_at DESC`,
    [userId]
  );
  yield (rows || []).map(mapRowToLocal);
}

export const getSummary = async (period: 'daily' | 'monthly', key: string) => {
  try {
    const rows = await query(
      period === 'daily'
        ? 'SELECT total_in, total_out, count FROM daily_summaries WHERE user_id = $1 AND date = $2 LIMIT 1'
        : 'SELECT total_in, total_out, count FROM monthly_summaries WHERE user_id = $1 AND year = $2 AND month = $3 LIMIT 1',
      period === 'daily' ? [key.split(':')[0], key.split(':')[1]] : [key.split(':')[0], Number(key.split(':')[1]), Number(key.split(':')[2])]
    );
    const r = rows && rows[0];
    if (!r) return null;
    return {
      totalIn: Number(r.total_in || 0),
      totalOut: Number(r.total_out || 0),
      count: Number(r.count || 0),
    };
  } catch (e) {
    console.warn('entries.getSummary failed', e);
    return null;
  }
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

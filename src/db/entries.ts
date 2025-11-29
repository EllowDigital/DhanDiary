import sqlite from './sqlite';
import { notifyEntriesChanged } from '../utils/dbEvents';

export type LocalEntry = {
  local_id: string;
  remote_id?: string | null;
  user_id: string;
  type: 'in' | 'out';
  amount: number;
  category: string;
  note?: string | null;
  currency?: string;
  server_version?: number;
  created_at: string;
  updated_at: string;
  is_synced?: number;
  is_deleted?: number;
  need_sync?: number;
  date?: string | null;
};

const normalizeDate = (v?: any) => {
  if (!v && v !== 0) return null;
  try {
    if (v instanceof Date) return v.toISOString();
    const s = String(v);
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString();
  } catch (e) {}
  return null;
};

export const getEntries = async (userId: string) => {
  const db = await sqlite.open();
  const rows = await db.all<LocalEntry>(
    'SELECT * FROM local_entries WHERE user_id = ? AND is_deleted = 0 ORDER BY date DESC',
    [userId]
  );
  return (rows || []).map(
    (r) =>
      ({
        ...r,
        created_at: normalizeDate(r.created_at) || new Date().toISOString(),
        updated_at:
          normalizeDate(r.updated_at) ||
          (r.created_at ? normalizeDate(r.created_at) : new Date().toISOString()),
        date: normalizeDate((r as any).date) || normalizeDate(r.created_at) || null,
      }) as LocalEntry
  );
};

export const addLocalEntry = async (entry: Omit<LocalEntry, 'is_synced' | 'is_deleted'>) => {
  const db = await sqlite.open();
  const now = new Date().toISOString();
  const created = normalizeDate((entry as any).created_at) || now;
  const updated = normalizeDate((entry as any).updated_at) || created;
  await db.run(
    `INSERT INTO local_entries (local_id, remote_id, user_id, type, amount, category, note, date, currency, server_version, created_at, updated_at, is_synced, need_sync, is_deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, 0)`,
    [
      entry.local_id,
      (entry as any).remote_id || null,
      entry.user_id,
      entry.type,
      entry.amount,
      entry.category,
      entry.note || null,
      normalizeDate((entry as any).date) || created,
      entry.currency || 'INR',
      (entry as any).server_version || 0,
      created,
      updated,
    ]
  );
  try {
    notifyEntriesChanged();
  } catch (e) {}
};

export const updateLocalEntry = async (
  localId: string,
  updates: {
    amount: number;
    category: string;
    note?: string | null;
    type: 'in' | 'out';
    currency?: string;
    date?: string | null;
  }
) => {
  const db = await sqlite.open();
  const now = new Date().toISOString();
  // Fetch original date
  const entry = await db.get<LocalEntry>('SELECT date FROM local_entries WHERE local_id = ?', [
    localId,
  ]);
  const originalDate = entry?.date || null;
  await db.run(
    `UPDATE local_entries SET amount = ?, category = ?, note = ?, type = ?, currency = ?, date = ?, updated_at = ?, need_sync = 1, is_synced = 0 WHERE local_id = ?`,
    [
      updates.amount,
      updates.category,
      updates.note || null,
      updates.type,
      updates.currency || 'INR',
      updates.date !== undefined && updates.date !== null
        ? normalizeDate(updates.date)
        : originalDate,
      now,
      localId,
    ]
  );
  try {
    notifyEntriesChanged();
  } catch (e) {}
};

export const markEntryDeleted = async (localId: string) => {
  const db = await sqlite.open();
  const now = new Date().toISOString();
  await db.run(
    'UPDATE local_entries SET is_deleted = 1, need_sync = 1, is_synced = 0, updated_at = ? WHERE local_id = ?',
    [now, localId]
  );
  try {
    notifyEntriesChanged();
  } catch (e) {}
};

export const markEntrySynced = async (
  localId: string,
  remoteId?: string,
  serverVersion?: number
) => {
  const db = await sqlite.open();
  const now = new Date().toISOString();
  if (remoteId) {
    if (typeof serverVersion === 'number') {
      await db.run(
        'UPDATE local_entries SET is_synced = 1, need_sync = 0, remote_id = ?, server_version = ?, updated_at = ? WHERE local_id = ?',
        [remoteId, serverVersion, now, localId]
      );
    } else {
      await db.run(
        'UPDATE local_entries SET is_synced = 1, need_sync = 0, remote_id = ?, updated_at = ? WHERE local_id = ?',
        [remoteId, now, localId]
      );
    }
  } else {
    await db.run(
      'UPDATE local_entries SET is_synced = 1, need_sync = 0, updated_at = ? WHERE local_id = ?',
      [now, localId]
    );
  }
  try {
    notifyEntriesChanged();
  } catch (e) {}
};

export const getEntryByLocalId = async (localId: string) => {
  const db = await sqlite.open();
  const r = await db.get<LocalEntry>('SELECT * FROM local_entries WHERE local_id = ? LIMIT 1', [
    localId,
  ]);
  if (!r) return null;
  return {
    ...r,
    created_at: normalizeDate(r.created_at) || new Date().toISOString(),
    updated_at: normalizeDate(r.updated_at) || r.created_at,
  } as LocalEntry;
};

export const getLocalByRemoteId = async (remoteId: string) => {
  const db = await sqlite.open();
  return await db.get<LocalEntry>('SELECT * FROM local_entries WHERE remote_id = ? LIMIT 1', [
    remoteId,
  ]);
};

export const getUnsyncedEntries = async () => {
  const db = await sqlite.open();
  return await db.all<LocalEntry>(
    'SELECT * FROM local_entries WHERE need_sync = 1 OR is_deleted = 1 OR (is_synced = 0 AND remote_id IS NULL)'
  );
};

export const upsertLocalFromRemote = async (remote: any) => {
  const db = await sqlite.open();
  const now = new Date().toISOString();
  const existing = await db.get<{ local_id: string; created_at?: string }>(
    'SELECT local_id, created_at FROM local_entries WHERE remote_id = ? LIMIT 1',
    [String(remote.id)]
  );
  if (existing && existing.local_id) {
    const preserved = existing.created_at || remote.created_at || now;
    await db.run(
      `UPDATE local_entries SET user_id = ?, type = ?, amount = ?, category = ?, note = ?, currency = ?, server_version = ?, created_at = ?, updated_at = ?, is_synced = 1, is_deleted = ? WHERE local_id = ?`,
      [
        remote.user_id,
        remote.type,
        remote.amount,
        remote.category || 'General',
        remote.note || null,
        remote.currency || 'INR',
        typeof remote.server_version === 'number' ? remote.server_version : 0,
        preserved,
        remote.updated_at || now,
        remote.deleted ? 1 : 0,
        existing.local_id,
      ]
    );
    try {
      notifyEntriesChanged();
    } catch (e) {}
    return existing.local_id;
  }
  const localId =
    remote.client_id && remote.client_id.length ? String(remote.client_id) : `remote_${remote.id}`;
  await db.run(
    `INSERT OR REPLACE INTO local_entries (local_id, remote_id, user_id, type, amount, category, note, date, currency, server_version, created_at, updated_at, is_synced, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [
      localId,
      String(remote.id),
      remote.user_id,
      remote.type,
      remote.amount,
      remote.category || 'General',
      remote.note || null,
      remote.client_id && remote.client_id.length
        ? remote.created_at || now
        : remote.created_at || now,
      remote.currency || 'INR',
      typeof remote.server_version === 'number' ? remote.server_version : 0,
      remote.created_at || now,
      remote.updated_at || now,
      remote.deleted ? 1 : 0,
    ]
  );
  try {
    notifyEntriesChanged();
  } catch (e) {}
  return localId;
};

export const markLocalDeletedByRemoteId = async (remoteId: string) => {
  const db = await sqlite.open();
  const now = new Date().toISOString();
  await db.run(
    'UPDATE local_entries SET is_deleted = 1, is_synced = 1, updated_at = ? WHERE remote_id = ?',
    [now, String(remoteId)]
  );
  try {
    notifyEntriesChanged();
  } catch (e) {}
};

export const getLocalByClientId = async (clientId: string) => {
  const db = await sqlite.open();
  return await db.get<LocalEntry>(
    'SELECT * FROM local_entries WHERE local_id = ? OR remote_id = ? LIMIT 1',
    [String(clientId), String(clientId)]
  );
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
};

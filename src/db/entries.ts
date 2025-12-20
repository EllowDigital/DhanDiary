import sqlite from './sqlite';
import { notifyEntriesChanged } from '../utils/dbEvents';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { ensureCategory, FALLBACK_CATEGORY } from '../constants/categories';

dayjs.extend(customParseFormat);

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
  if (v === undefined || v === null || v === '') return null;
  try {
    // Date instance
    if (v instanceof Date) return v.toISOString();

    // Numeric values (timestamp in seconds or milliseconds)
    if (typeof v === 'number') {
      const n = v;
      const ms = n < 1e12 ? n * 1000 : n; // treat <1e12 as seconds
      const d = new Date(ms);
      if (!isNaN(d.getTime())) return d.toISOString();
    }

    const s = String(v).trim();

    // Pure numeric string
    if (/^\d+$/.test(s)) {
      const n = Number(s);
      const ms = s.length === 10 ? n * 1000 : n; // 10-digit = seconds
      const d = new Date(ms);
      if (!isNaN(d.getTime())) return d.toISOString();
    }

    // Try native Date parsing first
    const d1 = new Date(s);
    if (!isNaN(d1.getTime())) return d1.toISOString();

    // Fallback: replace hyphens with slashes (some platforms parse better)
    const d2 = new Date(s.replace(/-/g, '/'));
    if (!isNaN(d2.getTime())) return d2.toISOString();

    // Try dayjs with some common formats (DD-MM-YYYY, DD/MM/YYYY etc.)
    const formats = [
      'DD-MM-YYYY',
      'D-M-YYYY',
      'DD/MM/YYYY',
      'D/M/YYYY',
      'MMM D YYYY',
      'MMMM D YYYY',
      'YYYY-MM-DD',
      'YYYY/MM/DD',
      'YYYY-MM-DDTHH:mm:ssZ',
    ];
    const dj = dayjs(s, formats, true);
    if (dj.isValid()) return dj.toISOString();
  } catch (e) { }
  return null;
};

export const getEntries = async (userId: string) => {
  const db = await sqlite.open();
  const rows = await db.all<LocalEntry>(
    'SELECT * FROM local_entries WHERE user_id = ? AND is_deleted = 0 ORDER BY date DESC',
    [userId]
  );
  const mapped = (rows || []).map((r) => ({
    ...r,
    category: ensureCategory(r.category || FALLBACK_CATEGORY),
    // Do NOT silently fall back to `now` here — prefer null so the UI can show a clear
    // 'unknown' date rather than incorrectly showing today's date when parsing fails.
    created_at: normalizeDate(r.created_at) || null,
    updated_at: normalizeDate(r.updated_at) || normalizeDate(r.created_at) || null,
    date: normalizeDate((r as any).date) || normalizeDate(r.created_at) || null,
  })) as LocalEntry[];

  // De-duplicate entries by remote_id when possible (keep the most recent by updated_at),
  // this helps avoid showing duplicates created during earlier sync conflict resolutions.
  const byRemote: Record<string, LocalEntry> = {};
  const uniques: LocalEntry[] = [];
  for (const e of mapped) {
    if (e.remote_id) {
      const key = String(e.remote_id);
      const existing = byRemote[key];
      if (!existing) {
        byRemote[key] = e;
      } else {
        const existingTime = new Date(existing.updated_at || 0).getTime();
        const thisTime = new Date(e.updated_at || 0).getTime();
        if (thisTime > existingTime) byRemote[key] = e;
      }
    } else {
      uniques.push(e);
    }
  }

  // Combine deduped remote-backed entries and local-only entries
  const result = uniques.concat(Object.values(byRemote));

  // Ensure deterministic ordering by date (desc)
  result.sort((a, b) => {
    const ta = a.date ? new Date(a.date).getTime() : 0;
    const tb = b.date ? new Date(b.date).getTime() : 0;
    return tb - ta;
  });

  return result;
};

export const addLocalEntry = async (entry: Omit<LocalEntry, 'is_synced' | 'is_deleted'>) => {
  const db = await sqlite.open();
  const now = new Date().toISOString();
  const created =
    normalizeDate((entry as any).date) || normalizeDate((entry as any).created_at) || now;
  const updated = normalizeDate((entry as any).updated_at) || created;
  const category = ensureCategory(entry.category);
  await db.run(
    `INSERT INTO local_entries (local_id, remote_id, user_id, type, amount, category, note, date, currency, server_version, created_at, updated_at, is_synced, need_sync, is_deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, 0)`,
    [
      entry.local_id,
      (entry as any).remote_id || null,
      entry.user_id,
      entry.type,
      entry.amount,
      category,
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
  } catch (e) { }
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
      ensureCategory(updates.category),
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
  } catch (e) { }
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
  } catch (e) { }
};

export const markEntrySynced = async (
  localId: string,
  remoteId?: string,
  serverVersion?: number,
  syncedUpdatedAt?: string | null
) => {
  const db = await sqlite.open();
  const normalized = syncedUpdatedAt ? normalizeDate(syncedUpdatedAt) : null;
  const setClauses: string[] = ['is_synced = 1', 'need_sync = 0'];
  const params: any[] = [];

  if (remoteId) {
    setClauses.push('remote_id = ?');
    params.push(remoteId);
  }

  if (typeof serverVersion === 'number' && !Number.isNaN(serverVersion)) {
    setClauses.push('server_version = ?');
    params.push(serverVersion);
  }

  if (normalized) {
    setClauses.push('updated_at = ?');
    params.push(normalized);
  }

  // If no explicit timestamp provided, preserve existing updated_at to avoid
  // falsely treating the row as newer during conflict resolution.
  await db.run(`UPDATE local_entries SET ${setClauses.join(', ')} WHERE local_id = ?`, [
    ...params,
    localId,
  ]);
  try {
    notifyEntriesChanged();
  } catch (e) { }
};

export const deleteLocalEntry = async (localId: string) => {
  const db = await sqlite.open();
  await db.run('DELETE FROM local_entries WHERE local_id = ?', [localId]);
  try {
    notifyEntriesChanged();
  } catch (e) { }
};

export const getEntryByLocalId = async (localId: string) => {
  const db = await sqlite.open();
  const r = await db.get<LocalEntry>('SELECT * FROM local_entries WHERE local_id = ? LIMIT 1', [
    localId,
  ]);
  if (!r) return null;
  return {
    ...r,
    created_at: normalizeDate(r.created_at) || null,
    updated_at: normalizeDate(r.updated_at) || normalizeDate(r.created_at) || null,
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
    'SELECT * FROM local_entries WHERE need_sync = 1 OR (is_deleted = 1 AND is_synced = 0) OR (is_synced = 0 AND remote_id IS NULL)'
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
    // Preserve existing created_at if present (normalize it), otherwise normalize remote.created_at
    const preserved = normalizeDate(existing.created_at) || normalizeDate(remote.created_at) || now;
    const updatedAt = normalizeDate(remote.updated_at) || normalizeDate(remote.created_at) || now;
    // Warn when remote timestamps couldn't be normalized so we can detect format issues
    if (!normalizeDate(remote.created_at)) {
      try {
        console.warn(
          'upsertLocalFromRemote: remote.created_at not normalized',
          remote.id,
          remote.created_at
        );
      } catch (e) { }
    }
    await db.run(
      `UPDATE local_entries SET user_id = ?, type = ?, amount = ?, category = ?, note = ?, currency = ?, server_version = ?, created_at = ?, updated_at = ?, is_synced = 1, is_deleted = ? WHERE local_id = ?`,
      [
        remote.user_id,
        remote.type,
        remote.amount,
        ensureCategory(remote.category || FALLBACK_CATEGORY),
        remote.note || null,
        remote.currency || 'INR',
        typeof remote.server_version === 'number' ? remote.server_version : 0,
        preserved,
        updatedAt,
        remote.deleted ? 1 : 0,
        existing.local_id,
      ]
    );
    try {
      notifyEntriesChanged();
    } catch (e) { }
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
      ensureCategory(remote.category || FALLBACK_CATEGORY),
      remote.note || null,
      // Normalize date/created/updated timestamps from remote before storing.
      remote.client_id && remote.client_id.length
        ? normalizeDate(remote.created_at) || remote.created_at || now
        : normalizeDate(remote.created_at) || remote.created_at || now,
      remote.currency || 'INR',
      typeof remote.server_version === 'number' ? remote.server_version : 0,
      normalizeDate(remote.created_at) || remote.created_at || now,
      normalizeDate(remote.updated_at) ||
      normalizeDate(remote.created_at) ||
      remote.updated_at ||
      now,
      remote.deleted ? 1 : 0,
    ]
  );
  try {
    notifyEntriesChanged();
  } catch (e) { }
  return localId;
};

export const markLocalDeletedByRemoteId = async (remoteId: string) => {
  const db = await sqlite.open();
  const now = new Date().toISOString();
  await db.run(
    'UPDATE local_entries SET is_deleted = 1, is_synced = 1, need_sync = 0, updated_at = ? WHERE remote_id = ?',
    [now, String(remoteId)]
  );
  try {
    notifyEntriesChanged();
  } catch (e) { }
};

export const getLocalByClientId = async (clientId: string) => {
  const db = await sqlite.open();
  return await db.get<LocalEntry>(
    'SELECT * FROM local_entries WHERE local_id = ? OR remote_id = ? LIMIT 1',
    [String(clientId), String(clientId)]
  );
};

export async function* fetchEntriesGenerator(userId: string, pageSize: number = 1000) {
  const db = await sqlite.open();
  let offset = 0;
  while (true) {
    const rows = await db.all<LocalEntry>(
      'SELECT * FROM local_entries WHERE user_id = ? AND is_deleted = 0 ORDER BY date DESC LIMIT ? OFFSET ?',
      [userId, pageSize, offset]
    );
    if (!rows || rows.length === 0) break;

    const mapped = rows.map((r) => ({
      ...r,
      category: ensureCategory(r.category || FALLBACK_CATEGORY),
      created_at: normalizeDate(r.created_at) || null,
      updated_at: normalizeDate(r.updated_at) || normalizeDate(r.created_at) || null,
      date: normalizeDate((r as any).date) || normalizeDate(r.created_at) || null,
    })) as LocalEntry[];

    yield mapped;
    offset += pageSize;
  }
}

// ...existing code...
export const getSummary = async (period: 'daily' | 'monthly', key: string) => {
  // This is a placeholder as the original function was referenced but not defined in localDb.
  // In a real app, this would query a summaries table.
  // For now, we return null to mimic no cached summary, forcing aggregation.
  return null;
};

export default {
  // ...existing code...
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

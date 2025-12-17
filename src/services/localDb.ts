import * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { EntryInput, EntryUpdate, LocalEntry, mapToLocalEntry } from '../types/entries';
import getDeviceId from './deviceId';
import { ensureCategory, DEFAULT_CATEGORY } from '../constants/categories';

let db: any = null;
let useNativeSqlite = false;
try {
  if (SQLite && typeof (SQLite as any).openDatabase === 'function') {
    db = (SQLite as any).openDatabase('dhandiary.db');
    useNativeSqlite = true;
  }
} catch (e) {
  useNativeSqlite = false;
}

// Fallback: AsyncStorage-backed simple adapter when native sqlite not available.
const ENTRIES_KEY = 'localdb:entries';
const SUMMARIES_KEY = 'localdb:summaries';

const asyncStorageAdapter = {
  async readEntries(): Promise<Record<string, any[]>> {
    try {
      const v = await AsyncStorage.getItem(ENTRIES_KEY);
      return v ? JSON.parse(v) : {};
    } catch (_) {
      return {};
    }
  },
  async writeEntries(obj: Record<string, any[]>) {
    await AsyncStorage.setItem(ENTRIES_KEY, JSON.stringify(obj));
  },
  async readSummaries(): Promise<Record<string, any>> {
    try {
      const v = await AsyncStorage.getItem(SUMMARIES_KEY);
      return v ? JSON.parse(v) : {};
    } catch (_) {
      return {};
    }
  },
  async writeSummaries(obj: Record<string, any>) {
    await AsyncStorage.setItem(SUMMARIES_KEY, JSON.stringify(obj));
  },
  // Minimal transaction/executeSql emulation for the queries used in this file
  transaction(cb: (tx: any) => void) {
    const tx = {
      executeSql: async (
        sql: string,
        params: any[] = [],
        success?: (t: any, res: any) => void,
        _err?: any
      ) => {
        // Handle SELECT entries
        const selectEntries =
          /SELECT \* FROM entries WHERE user_id = \? AND is_deleted = 0 ORDER BY date DESC, created_at DESC LIMIT (\d+)/i.exec(
            sql
          );
        if (selectEntries) {
          const userId = params[0];
          const lim = Number(params[1] || selectEntries[1]) || 1000;
          const all = await asyncStorageAdapter.readEntries();
          const arr = (all[userId] || [])
            .filter((r) => !r.is_deleted)
            .sort((a, b) => {
              if (a.date === b.date) return (b.created_at || 0) - (a.created_at || 0);
              return String(b.date).localeCompare(String(a.date));
            })
            .slice(0, lim);
          const rows = { length: arr.length, item: (i: number) => arr[i] };
          success && success(tx, { rows });
          return;
        }

        // SELECT with LIMIT OFFSET (generator)
        const selectPage =
          /SELECT \* FROM entries WHERE user_id = \? AND is_deleted = 0 ORDER BY date DESC, created_at DESC LIMIT \? OFFSET \?/i.exec(
            sql
          );
        if (selectPage) {
          const userId = params[0];
          const limit = Number(params[1] || 500);
          const offset = Number(params[2] || 0);
          const all = await asyncStorageAdapter.readEntries();
          const arr = (all[userId] || [])
            .filter((r) => !r.is_deleted)
            .sort((a, b) => {
              if (a.date === b.date) return (b.created_at || 0) - (a.created_at || 0);
              return String(b.date).localeCompare(String(a.date));
            })
            .slice(offset, offset + limit);
          const rows = { length: arr.length, item: (i: number) => arr[i] };
          success && success(tx, { rows });
          return;
        }

        // INSERT OR REPLACE INTO entries
        if (/INSERT OR REPLACE INTO entries/i.test(sql)) {
          const [
            id,
            user_id,
            amount,
            category,
            note,
            type,
            currency,
            date,
            created_at,
            updated_at,
            device_id,
            sync_status,
          ] = params;
          const all = await asyncStorageAdapter.readEntries();
          if (!all[user_id]) all[user_id] = [];
          const idx = all[user_id].findIndex((r) => r.id === id);
          const row = {
            id,
            user_id,
            amount,
            category,
            note,
            type,
            currency,
            date,
            created_at,
            updated_at,
            device_id,
            is_deleted: 0,
            sync_status: sync_status || 'SYNCED',
          };
          if (idx >= 0) all[user_id][idx] = row;
          else all[user_id].unshift(row);
          await asyncStorageAdapter.writeEntries(all);
          success && success(tx, { rows: { length: 1, item: (i: number) => row } });
          return;
        }

        // UPDATE entries SET ... WHERE id = ?
        if (/UPDATE entries SET/i.test(sql) && /WHERE id = \?/i.test(sql)) {
          const updated_at = params[6];
          const id = params[params.length - 1];
          const sync_status = params.length >= 9 ? params[7] : undefined;
          const all = await asyncStorageAdapter.readEntries();
          for (const k of Object.keys(all)) {
            const idx = all[k].findIndex((r) => r.id === id);
            if (idx >= 0) {
              const row = all[k][idx];
              row.amount = params[0];
              row.category = params[1];
              row.note = params[2];
              row.type = params[3];
              row.currency = params[4];
              row.date = params[5];
              row.updated_at = updated_at;
              if (sync_status !== undefined) row.sync_status = sync_status;
              all[k][idx] = row;
              await asyncStorageAdapter.writeEntries(all);
              success && success(tx, { rows: { length: 1, item: (i: number) => row } });
              return;
            }
          }
          success && success(tx, { rows: { length: 0 } });
          return;
        }

        // UPDATE entries SET is_deleted = 1 WHERE id = ?  (or with updated_at/sync_status)
        if (sql.toLowerCase().includes('is_deleted = 1')) {
          const id = params[params.length - 1];
          const all = await asyncStorageAdapter.readEntries();
          for (const k of Object.keys(all)) {
            const idx = all[k].findIndex((r) => r.id === id);
            if (idx >= 0) {
              all[k][idx].is_deleted = 1;
              if (params.length >= 2) {
                const updatedAt = params[params.length - 2];
                all[k][idx].updated_at = updatedAt;
              }
              // optional sync_status param may be present
              if (params.length >= 3) {
                const maybeSync = params[params.length - 2];
                if (typeof maybeSync === 'string') all[k][idx].sync_status = maybeSync;
              }
              await asyncStorageAdapter.writeEntries(all);
              success && success(tx, { rows: { length: 1, item: (i: number) => all[k][idx] } });
              return;
            }
          }
          success && success(tx, { rows: { length: 0 } });
          return;
        }

        // INSERT INTO summaries ... ON CONFLICT => emulate upsert accumulation
        if (/INSERT INTO summaries/i.test(sql)) {
          const [period, key, inC, outC, cnt, updated_at] = params;
          const summaries = await asyncStorageAdapter.readSummaries();
          const k = `${period}:${key}`;
          if (!summaries[k])
            summaries[k] = {
              period,
              key,
              totalInCents: 0,
              totalOutCents: 0,
              count: 0,
              updated_at: 0,
            };
          summaries[k].totalInCents = (summaries[k].totalInCents || 0) + (inC || 0);
          summaries[k].totalOutCents = (summaries[k].totalOutCents || 0) + (outC || 0);
          summaries[k].count = (summaries[k].count || 0) + (cnt || 0);
          summaries[k].updated_at = updated_at || Date.now();
          await asyncStorageAdapter.writeSummaries(summaries);
          success && success(tx, { rows: { length: 1, item: (i: number) => summaries[k] } });
          return;
        }

        // SELECT FROM summaries WHERE period = ? AND key = ? LIMIT 1
        if (/SELECT \* FROM summaries WHERE period = \? AND key = \? LIMIT 1/i.test(sql)) {
          const [period, key] = params;
          const summaries = await asyncStorageAdapter.readSummaries();
          const k = `${period}:${key}`;
          const row = summaries[k] || null;
          const rows = row ? { length: 1, item: (i: number) => row } : { length: 0 };
          success && success(tx, { rows });
          return;
        }

        // Default: no-op
        success && success(tx, { rows: { length: 0 } });
      },
    };
    // call cb asynchronously to mirror sqlite behaviour
    setTimeout(() => cb(tx), 0);
  },
};

if (!useNativeSqlite) {
  db = asyncStorageAdapter as any;
}

type Subscriber = (entries: LocalEntry[]) => void;
const subscribers = new Map<string, Set<Subscriber>>();

function notify(userId: string) {
  const subs = subscribers.get(userId);
  if (!subs || subs.size === 0) return;
  getEntries(userId).then((rows) => {
    for (const s of subs) s(rows);
  });
}

export function initDB() {
  db.transaction((tx: any) => {
    tx.executeSql(
      `CREATE TABLE IF NOT EXISTS entries (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        amount REAL,
        category TEXT,
        note TEXT,
        type TEXT,
        currency TEXT,
        date TEXT,
        created_at INTEGER,
          updated_at INTEGER,
          device_id TEXT,
          is_deleted INTEGER DEFAULT 0,
          sync_status TEXT DEFAULT 'SYNCED'
      );`
    );

    tx.executeSql(
      `CREATE TABLE IF NOT EXISTS summaries (
        period TEXT,
        key TEXT,
        totalInCents INTEGER,
        totalOutCents INTEGER,
        count INTEGER,
        updated_at INTEGER,
        PRIMARY KEY (period, key)
      );`
    );

    tx.executeSql(
      `CREATE TABLE IF NOT EXISTS outbox (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        op TEXT,
        payload TEXT,
        created_at INTEGER,
        processed INTEGER DEFAULT 0
      );`
    );
    // Ensure column exists on older DBs - ignore failure if already present
    try {
      tx.executeSql("ALTER TABLE entries ADD COLUMN sync_status TEXT DEFAULT 'SYNCED'");
    } catch (e) {
      // ignore
    }
  });
}

const nowMs = () => Date.now();

function rowToLocalEntry(row: any, userId: string): LocalEntry {
  const created = new Date(row.created_at || nowMs()).toISOString();
  const updated = new Date(row.updated_at || row.created_at || nowMs()).toISOString();
  return {
    local_id: row.id,
    user_id: userId,
    type: (row.type as any) || 'out',
    amount: Number(row.amount) || 0,
    category: ensureCategory(row.category || DEFAULT_CATEGORY),
    note: row.note ?? null,
    currency: row.currency || 'INR',
    date: row.date || created,
    created_at: created,
    updated_at: updated,
    device_id: row.device_id || null,
    is_deleted: row.is_deleted || 0,
    syncStatus: row.sync_status || 'SYNCED',
    version: row.version || 1,
  };
}

export function getEntries(userId: string): Promise<LocalEntry[]> {
  return new Promise((resolve) => {
    db.transaction((tx: any) => {
      tx.executeSql(
        'SELECT * FROM entries WHERE user_id = ? AND is_deleted = 0 ORDER BY date DESC, created_at DESC LIMIT 1000',
        [userId],
        (_t: any, result: any) => {
          const rows: LocalEntry[] = [];
          for (let i = 0; i < result.rows.length; i++) {
            rows.push(rowToLocalEntry(result.rows.item(i), userId));
          }
          resolve(rows);
        },
        () => {
          resolve([]);
          return false;
        }
      );
    });
  });
}

export function subscribeEntries(
  userId: string,
  cb: Subscriber,
  onError?: (err: any) => void
): () => void {
  if (!subscribers.has(userId)) subscribers.set(userId, new Set());
  subscribers.get(userId)!.add(cb);
  // emit initial
  getEntries(userId)
    .then((rows) => cb(rows))
    .catch(onError);
  return () => {
    subscribers.get(userId)!.delete(cb);
  };
}

function toIso(v?: string | Date | null) {
  if (!v) return new Date().toISOString();
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function generateId() {
  // RFC4122-like simple UUID v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function applySummaryIncrements(
  userId: string,
  dateIso: string,
  type: 'in' | 'out',
  amount: number,
  deltaCount: number
) {
  const d = new Date(dateIso);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const dayKey = `${year}-${month}-${day}`;
  const monthKey = `${year}-${month}`;
  const yearKey = String(year);

  const inCents = type === 'in' ? Math.round(amount * 100) : 0;
  const outCents = type === 'out' ? Math.round(amount * 100) : 0;

  const upsert = (period: string, key: string, inC: number, outC: number, cnt: number) =>
    new Promise<void>((resolve) => {
      db.transaction((tx: any) => {
        tx.executeSql(
          'INSERT INTO summaries (period, key, totalInCents, totalOutCents, count, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(period, key) DO UPDATE SET totalInCents = totalInCents + excluded.totalInCents, totalOutCents = totalOutCents + excluded.totalOutCents, count = count + excluded.count, updated_at = excluded.updated_at',
          [period, key, inC, outC, cnt, nowMs()],
          () => resolve(),
          () => resolve()
        );
      });
    });

  await upsert('daily', dayKey, inCents, outCents, deltaCount);
  await upsert('monthly', monthKey, inCents, outCents, deltaCount);
  await upsert('yearly', yearKey, inCents, outCents, deltaCount);
}

export async function createEntry(userId: string, input: EntryInput): Promise<LocalEntry> {
  const id = input.local_id || generateId();
  const payload = {
    id,
    user_id: userId,
    amount: Number(input.amount) || 0,
    category: input.category || DEFAULT_CATEGORY,
    note: input.note ?? null,
    type: input.type === 'in' ? 'in' : 'out',
    currency: input.currency || 'INR',
    date: toIso(input.date),
    created_at: nowMs(),
    updated_at: nowMs(),
  };

  const deviceId = await getDeviceId();
  await new Promise<void>((resolve) => {
    db.transaction((tx: any) => {
      tx.executeSql(
        'INSERT OR REPLACE INTO entries (id, user_id, amount, category, note, type, currency, date, created_at, updated_at, device_id, is_deleted, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
        [
          payload.id,
          payload.user_id,
          payload.amount,
          payload.category,
          payload.note,
          payload.type,
          payload.currency,
          payload.date,
          payload.created_at,
          payload.updated_at,
          deviceId,
          'PENDING',
        ],
        () => resolve(),
        () => resolve()
      );
    });
  });

  // update summaries
  await applySummaryIncrements(
    userId,
    payload.date,
    payload.type as 'in' | 'out',
    payload.amount,
    1
  );

  notify(userId);
  return rowToLocalEntry(payload as any, userId);
}

export async function patchEntry(
  userId: string,
  localId: string,
  updates: EntryUpdate
): Promise<void> {
  // Read current
  const existing = await getEntries(userId).then((rows) =>
    rows.find((r) => r.local_id === localId)
  );
  if (!existing) throw new Error('entry not found');

  const next = { ...existing } as any;
  if (updates.amount !== undefined) next.amount = Number(updates.amount) || 0;
  if (updates.category !== undefined) next.category = updates.category;
  if (updates.note !== undefined) next.note = updates.note ?? null;
  if (updates.type !== undefined) next.type = updates.type === 'in' ? 'in' : 'out';
  if (updates.currency !== undefined) next.currency = updates.currency || next.currency;
  if (updates.date !== undefined) next.date = toIso(updates.date as any);
  next.updated_at = nowMs();

  await new Promise<void>((resolve) => {
    db.transaction((tx: any) => {
      tx.executeSql(
        'UPDATE entries SET amount = ?, category = ?, note = ?, type = ?, currency = ?, date = ?, updated_at = ?, sync_status = ? WHERE id = ?',
        [
          next.amount,
          next.category,
          next.note,
          next.type,
          next.currency,
          next.date,
          next.updated_at,
          'PENDING',
          localId,
        ],
        () => resolve(),
        () => resolve()
      );
    });
  });

  // Re-aggregate: decrement previous, increment new
  const prevDate = existing.date || existing.created_at;
  const prevType = existing.type;
  const prevAmount = existing.amount;
  await applySummaryIncrements(userId, prevDate, prevType as 'in' | 'out', -prevAmount, -1);
  await applySummaryIncrements(userId, next.date, next.type as 'in' | 'out', next.amount, 1);

  notify(userId);
}

export async function removeEntry(userId: string, localId: string): Promise<void> {
  const existing = await getEntries(userId).then((rows) =>
    rows.find((r) => r.local_id === localId)
  );
  if (!existing) return;

  await new Promise<void>((resolve) => {
    db.transaction((tx: any) => {
      const now = nowMs();
      tx.executeSql(
        'UPDATE entries SET is_deleted = 1, updated_at = ?, sync_status = ? WHERE id = ?',
        [now, 'PENDING', localId],
        () => resolve(),
        () => resolve()
      );
    });
  });

  const exDate = existing.date || existing.created_at;
  await applySummaryIncrements(userId, exDate, existing.type as 'in' | 'out', -existing.amount, -1);
  notify(userId);
}

export async function getSummary(period: 'daily' | 'monthly' | 'yearly', key: string) {
  return new Promise<any>((resolve) => {
    db.transaction((tx: any) => {
      tx.executeSql(
        'SELECT * FROM summaries WHERE period = ? AND key = ? LIMIT 1',
        [period, key],
        (_t: any, result: any) => {
          if (result.rows.length === 0) return resolve(null);
          resolve(result.rows.item(0));
        },
        () => resolve(null)
      );
    });
  });
}

// Wipe all local data for a given user (Option A - recommended)
export async function wipeUserData(userId: string): Promise<void> {
  // If using native sqlite, execute deletes; otherwise clear AsyncStorage entries for the user
  if (useNativeSqlite) {
    await new Promise<void>((resolve) => {
      db.transaction((tx: any) => {
        tx.executeSql(
          'DELETE FROM entries WHERE user_id = ?',
          [userId],
          () => {},
          () => {}
        );
        tx.executeSql(
          'DELETE FROM outbox WHERE user_id = ?',
          [userId],
          () => {},
          () => {}
        );
        // summaries are global in this schema; clear them to avoid cross-user leakage
        tx.executeSql(
          'DELETE FROM summaries',
          [],
          () => {},
          () => {}
        );
        resolve();
      });
    });
  } else {
    const all = await asyncStorageAdapter.readEntries();
    delete all[userId];
    await asyncStorageAdapter.writeEntries(all);
    await asyncStorageAdapter.writeSummaries({});
  }
  // notify subscribers
  notify(userId);
}

const LOCK_KEY = (userId: string) => `localdb:locked:${userId}`;

export async function lockUser(userId: string) {
  try {
    await AsyncStorage.setItem(LOCK_KEY(userId), '1');
  } catch {}
}

export async function unlockUser(userId: string) {
  try {
    await AsyncStorage.removeItem(LOCK_KEY(userId));
  } catch {}
}

export async function isUserLocked(userId: string): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(LOCK_KEY(userId));
    return !!v;
  } catch {
    return false;
  }
}

export default {
  initDB,
  getEntries,
  subscribeEntries,
  createEntry,
  patchEntry,
  removeEntry,
  getSummary,
};

// Async generator to page through entries without loading all into memory.
export async function* fetchEntriesGenerator(userId: string, pageSize = 500) {
  if (!userId) return;
  let offset = 0;
  while (true) {
    const rows: LocalEntry[] = await new Promise((resolve) => {
      db.transaction((tx: any) => {
        tx.executeSql(
          'SELECT * FROM entries WHERE user_id = ? AND is_deleted = 0 ORDER BY date DESC, created_at DESC LIMIT ? OFFSET ?',
          [userId, pageSize, offset],
          (_t: any, result: any) => {
            const out: LocalEntry[] = [];
            for (let i = 0; i < result.rows.length; i++)
              out.push(rowToLocalEntry(result.rows.item(i), userId));
            resolve(out);
          },
          () => resolve([])
        );
      });
    });
    if (!rows || rows.length === 0) break;
    yield rows;
    if (rows.length < pageSize) break;
    offset += rows.length;
  }
}

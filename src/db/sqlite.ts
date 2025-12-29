import sqliteClient, { runAsync, getAllAsync } from './sqliteClient';

/**
 * Ensure the required tables exist. This function is async-safe and idempotent.
 * It should be called once on app startup before any DB reads/writes.
 */
export async function initDB(): Promise<void> {
  try {
    await executeSqlAsync(`CREATE TABLE IF NOT EXISTS transactions(
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      amount REAL NOT NULL,
      type TEXT CHECK(type IN ('income','expense')),
      category TEXT,
      note TEXT,
      date TEXT,
      updated_at INTEGER,
      sync_status INTEGER DEFAULT 0
    );`);

    await executeSqlAsync(`CREATE TABLE IF NOT EXISTS categories(
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT,
      type TEXT,
      updated_at INTEGER,
      sync_status INTEGER DEFAULT 0
    );`);

    await executeSqlAsync(`CREATE TABLE IF NOT EXISTS meta(
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT
    );`);

    if (__DEV__) console.log('[sqlite] initialized');
  } catch (e) {
    if (__DEV__) console.warn('[sqlite] init error', e);
    throw e;
  }
}

/**
 * Compatibility wrapper: emulate the old `executeSqlAsync` return shape
 * used across the codebase: Promise<[tx, result]> where `result.rows`
 * provides `length` and `item(i)` access. Prefer `runAsync`/`getAllAsync`
 * under the hood for modern drivers.
 */
export async function executeSqlAsync(sql: string, params: any[] = []) {
  const sqlTrim = sql.trim().toUpperCase();
  // Heuristic: use SELECT detection for queries returning rows
  const isSelect = sqlTrim.startsWith('SELECT');

  if (isSelect) {
    let rows = await getAllAsync(sql, params);
    if (!rows) {
      if (typeof __DEV__ !== 'undefined' && __DEV__)
        console.warn('[sqlite] executeSqlAsync: getAllAsync returned null for', sql);
      rows = [];
    }
    const result = {
      rows: {
        length: rows.length,
        item: (i: number) => rows[i],
        _array: rows,
      },
      rowsAffected: 0,
      insertId: null,
    };
    return [null, result] as const;
  }

  // Non-select — use runAsync and map to legacy result shape
  const runRes = await runAsync(sql, params);
  const result = {
    rows: {
      length: 0,
      item: (_: number) => null,
      _array: [],
    },
    rowsAffected: runRes.changes ?? 0,
    insertId: runRes.lastInsertRowId ?? null,
  };
  return [null, result] as const;
}

export default sqliteClient;

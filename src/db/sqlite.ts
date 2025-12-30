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
    // Ensure optional local schema upgrades run immediately after init
    try {
      await ensureLocalSchemaUpgrades();
    } catch (e) {
      if (__DEV__) console.warn('[sqlite] ensureLocalSchemaUpgrades error during init', e);
    }
  } catch (e) {
    if (__DEV__) console.warn('[sqlite] init error', e);
    throw e;
  }
}

// Ensure optional migration columns exist (idempotent)
export async function ensureLocalSchemaUpgrades(): Promise<void> {
  try {
    // Check for server_version column using PRAGMA table_info
    // Use the lower-level `getAllAsync` to ensure PRAGMA returns rows
    // (PRAGMA is not a SELECT and would be treated as non-select otherwise).
    const cols = (await getAllAsync("PRAGMA table_info('transactions');")) || [];
    const names = cols.map((c: any) => c.name);
    if (!names.includes('server_version')) {
      try {
        await executeSqlAsync(
          'ALTER TABLE transactions ADD COLUMN server_version INTEGER DEFAULT 0;'
        );
        if (__DEV__) console.log('[sqlite] added server_version column');
      } catch (e) {
        if (__DEV__) console.warn('[sqlite] failed to add server_version column', e);
      }
    }
    // Add missing columns introduced in later schema versions
    if (!names.includes('currency')) {
      try {
        await executeSqlAsync("ALTER TABLE transactions ADD COLUMN currency TEXT DEFAULT 'INR';");
        if (__DEV__) console.log('[sqlite] added currency column');
      } catch (e) {
        if (__DEV__) console.warn('[sqlite] failed to add currency column', e);
      }
    }

    if (!names.includes('created_at')) {
      try {
        await executeSqlAsync('ALTER TABLE transactions ADD COLUMN created_at TEXT DEFAULT NULL;');
        if (__DEV__) console.log('[sqlite] added created_at column');
      } catch (e) {
        if (__DEV__) console.warn('[sqlite] failed to add created_at column', e);
      }
    }

    if (!names.includes('deleted_at')) {
      try {
        await executeSqlAsync('ALTER TABLE transactions ADD COLUMN deleted_at TEXT DEFAULT NULL;');
        if (__DEV__) console.log('[sqlite] added deleted_at column');
      } catch (e) {
        if (__DEV__) console.warn('[sqlite] failed to add deleted_at column', e);
      }
    }
  } catch (e) {
    if (__DEV__) console.warn('[sqlite] ensureLocalSchemaUpgrades error', e);
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

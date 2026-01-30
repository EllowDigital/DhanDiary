import sqliteClient, { runAsync, getAllAsync } from './sqliteClient';

let initPromise: Promise<void> | null = null;

/**
 * Ensure the required tables exist. This function is async-safe and idempotent.
 * It should be called once on app startup before any DB reads/writes.
 */
export async function initDB(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      await executeSqlAsync(`CREATE TABLE IF NOT EXISTS transactions(
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        client_id TEXT,
        amount REAL NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('income','expense')),
        category TEXT,
        note TEXT,
        currency TEXT NOT NULL DEFAULT 'INR',
        date TEXT NOT NULL,
        server_version INTEGER NOT NULL DEFAULT 0,
        sync_status INTEGER NOT NULL DEFAULT 0,
        need_sync INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT NULL,
        updated_at INTEGER,
        deleted_at TEXT DEFAULT NULL
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
  })().finally(() => {
    initPromise = null;
  });

  return initPromise;
}

// Ensure optional migration columns exist (idempotent)
export async function ensureLocalSchemaUpgrades(): Promise<void> {
  // Serialize upgrades so concurrent callers (startup + delete-account re-init)
  // do not race and attempt ALTER TABLE twice (causing duplicate-column errors).
  if (schemaUpgradePromise) return schemaUpgradePromise;

  schemaUpgradePromise = (async () => {
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
          const msg = String((e as any)?.message || e);
          if (!msg.toLowerCase().includes('duplicate column')) {
            if (__DEV__) console.warn('[sqlite] failed to add server_version column', e);
          }
        }
      }
      // Add missing columns introduced in later schema versions
      if (!names.includes('currency')) {
        try {
          await executeSqlAsync("ALTER TABLE transactions ADD COLUMN currency TEXT DEFAULT 'INR';");
          if (__DEV__) console.log('[sqlite] added currency column');
        } catch (e) {
          const msg = String((e as any)?.message || e);
          if (!msg.toLowerCase().includes('duplicate column')) {
            if (__DEV__) console.warn('[sqlite] failed to add currency column', e);
          }
        }
      }

      if (!names.includes('created_at')) {
        try {
          await executeSqlAsync(
            'ALTER TABLE transactions ADD COLUMN created_at TEXT DEFAULT NULL;'
          );
          if (__DEV__) console.log('[sqlite] added created_at column');
        } catch (e) {
          const msg = String((e as any)?.message || e);
          if (!msg.toLowerCase().includes('duplicate column')) {
            if (__DEV__) console.warn('[sqlite] failed to add created_at column', e);
          }
        }
      }

      if (!names.includes('deleted_at')) {
        try {
          await executeSqlAsync(
            'ALTER TABLE transactions ADD COLUMN deleted_at TEXT DEFAULT NULL;'
          );
          if (__DEV__) console.log('[sqlite] added deleted_at column');
        } catch (e) {
          const msg = String((e as any)?.message || e);
          if (!msg.toLowerCase().includes('duplicate column')) {
            if (__DEV__) console.warn('[sqlite] failed to add deleted_at column', e);
          }
        }
      }

      // Normalize existing date/created_at/updated_at formats for consistency.
      // This will convert mixed numeric/string dates into ISO strings (for date/created_at)
      // and epoch ms for updated_at. This preserves the original moment while making
      // client-side grouping and sorting reliable across devices.

      // Optimization: Run this ONLY once. We use a meta flag to track it.
      try {
        const metaRows =
          (await getAllAsync("SELECT value FROM meta WHERE key = 'normalized_dates_v2'")) || [];
        const alreadyDone = metaRows.length > 0;

        if (!alreadyDone) {
          if (__DEV__) console.log('[sqlite] running one-time date normalization...');
          const rows =
            (await getAllAsync('SELECT id, date, created_at, updated_at FROM transactions;')) || [];

          let batchCount = 0;

          await executeSqlAsync('BEGIN TRANSACTION;');
          try {
            for (const r of rows) {
              const toIso = (v: any, fallbackMs?: number) => {
                if (v == null) return fallbackMs ? new Date(fallbackMs).toISOString() : null;
                if (v instanceof Date) return v.toISOString();
                const n = Number(v);
                if (!Number.isNaN(n)) {
                  const ms = n < 1e12 ? n * 1000 : n;
                  return new Date(ms).toISOString();
                }
                const parsed = Date.parse(String(v));
                if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
                return fallbackMs ? new Date(fallbackMs).toISOString() : null;
              };

              const normUpdated = (() => {
                const u = r.updated_at;
                if (u == null) return null;
                const n = Number(u);
                if (!Number.isNaN(n)) return n < 1e12 ? n * 1000 : n;
                const parsed = Date.parse(String(u));
                return Number.isNaN(parsed) ? null : parsed;
              })();

              const newDate = toIso(r.date, normUpdated ?? Date.now());
              const newCreated = toIso(r.created_at, normUpdated ?? Date.now());
              const newUpdated = normUpdated ?? null;

              const needUpdate =
                (newDate && String(newDate) !== String(r.date)) ||
                (newCreated && String(newCreated) !== String(r.created_at)) ||
                (newUpdated && Number(newUpdated) !== Number(r.updated_at));

              if (needUpdate) {
                await executeSqlAsync(
                  'UPDATE transactions SET date = ?, created_at = ?, updated_at = ? WHERE id = ?; ',
                  [newDate ?? r.date, newCreated ?? r.created_at, newUpdated ?? r.updated_at, r.id]
                );
                batchCount++;
              }
            }
            await executeSqlAsync(
              "INSERT OR REPLACE INTO meta (key, value) VALUES ('normalized_dates_v2', '1');"
            );
            await executeSqlAsync('COMMIT;');
            if (__DEV__)
              console.log(`[sqlite] normalization complete. Updated ${batchCount} rows.`);
          } catch (err) {
            await executeSqlAsync('ROLLBACK;');
            throw err;
          }
        }
      } catch (e) {
        if (__DEV__) console.warn('[sqlite] failed to run date normalization', e);
      }
    } catch (e) {
      if (__DEV__) console.warn('[sqlite] ensureLocalSchemaUpgrades error', e);
    }
  })().finally(() => {
    schemaUpgradePromise = null;
  });

  return schemaUpgradePromise;
}

let schemaUpgradePromise: Promise<void> | null = null;

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

/**
 * Hard-wipe local SQLite content (per-user isolation).
 * Keeps tables intact to avoid "no such table" races during navigation.
 */
export async function wipeLocalData(): Promise<void> {
  // Ensure tables exist first.
  try {
    await initDB();
  } catch (e) {
    // If init fails, still attempt deletes best-effort.
  }

  // Delete rows (fast) rather than dropping tables (can be slow and racy).
  // Wrap in a transaction to avoid partial wipes across tables.
  try {
    await runAsync('BEGIN TRANSACTION;');
    await runAsync('DELETE FROM transactions;');
    await runAsync('DELETE FROM categories;');
    await runAsync('DELETE FROM meta;');
    await runAsync('COMMIT;');
  } catch (e) {
    try {
      await runAsync('ROLLBACK;');
    } catch (rollbackError) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn('[sqlite] wipeLocalData rollback failed', rollbackError);
      }
    }
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[sqlite] wipeLocalData failed', e);
    }
    throw e;
  }
}

export default sqliteClient;

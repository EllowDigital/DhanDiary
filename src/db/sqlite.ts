import sqliteClient, { execAsync as executeSqlAsync } from './sqliteClient';

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

export { executeSqlAsync };

export default sqliteClient;

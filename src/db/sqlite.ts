import * as SQLite from 'expo-sqlite';

const DB_NAME = 'dhandiary.db';

// `expo-sqlite` typings vary across versions; use any to avoid strict type mismatch.
export const db: any = (SQLite as any).openDatabase
  ? (SQLite as any).openDatabase(DB_NAME)
  : (SQLite as any).openDatabaseSync
  ? (SQLite as any).openDatabaseSync(DB_NAME)
  : (SQLite as any).openDatabase(DB_NAME);

function toPromise<T>(fn: (resolve: (v: T) => void, reject: (e: any) => void) => void) {
  return new Promise<T>(fn);
}

export function executeSqlAsync(sql: string, params: any[] = []): Promise<any[]> {
  return toPromise<any[]>((resolve, reject) => {
    try {
      db.transaction((tx: any) => {
        tx.executeSql(
          sql,
          params,
          (_t: any, result: any) => resolve([_t, result]),
          (_t: any, err: any) => {
            reject(err);
            return false;
          }
        );
      });
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Ensure the required tables exist. This function is async-safe and idempotent.
 * It should be called once on app startup before any DB reads/writes.
 */
export async function initDB(): Promise<void> {
  // Wrap in a transaction to reduce partial setup states
  await toPromise<void>((resolve, reject) => {
    try {
      db.transaction(
        (tx: any) => {
          // transactions table
          tx.executeSql(
            `CREATE TABLE IF NOT EXISTS transactions(
              id TEXT PRIMARY KEY NOT NULL,
              user_id TEXT NOT NULL,
              amount REAL NOT NULL,
              type TEXT CHECK(type IN ('income','expense')),
              category TEXT,
              note TEXT,
              date TEXT,
              updated_at INTEGER,
              sync_status INTEGER DEFAULT 0
            );`
          );

          // categories table
          tx.executeSql(
            `CREATE TABLE IF NOT EXISTS categories(
              id TEXT PRIMARY KEY NOT NULL,
              user_id TEXT NOT NULL,
              name TEXT,
              type TEXT,
              updated_at INTEGER,
              sync_status INTEGER DEFAULT 0
            );`
          );

          // meta table for storing small key/value pairs such as last_sync_timestamp
          tx.executeSql(
            `CREATE TABLE IF NOT EXISTS meta(
              key TEXT PRIMARY KEY NOT NULL,
              value TEXT
            );`
          );
        },
        (tErr: any) => {
          if (__DEV__) console.warn('[sqlite] init transaction error', tErr);
          reject(tErr);
          return false;
        },
        () => resolve()
      );
    } catch (e) {
      reject(e);
    }
  });

  if (__DEV__) console.log('[sqlite] initialized', DB_NAME);
}

export default db;

import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';

type DB = {
  name: string;
  raw: any;
  run: (sql: string, params?: any[]) => Promise<void>;
  all: <T = any>(sql: string, params?: any[]) => Promise<T[]>;
  get: <T = any>(sql: string, params?: any[]) => Promise<T | null>;
  exec: (sql: string) => Promise<void>;
};

const DB_NAME = 'dhandiary.db';
let DB_INSTANCE: Promise<DB> | null = null;
let LAST_DB: DB | null = null;

const open = async (): Promise<DB> => {
  if (DB_INSTANCE) return DB_INSTANCE;

  DB_INSTANCE = (async () => {
    let raw: any;
    // Different expo-sqlite versions expose openDatabase or openDatabaseSync/openDatabaseAsync.
    if ((SQLite as any).openDatabaseAsync) {
      raw = await (SQLite as any).openDatabaseAsync(DB_NAME);
    } else if ((SQLite as any).openDatabaseSync) {
      raw = (SQLite as any).openDatabaseSync(DB_NAME);
    } else if ((SQLite as any).openDatabase) {
      raw = (SQLite as any).openDatabase(DB_NAME);
    } else {
      // fallback: try calling as any
      raw = (SQLite as any).openDatabaseSync ? (SQLite as any).openDatabaseSync(DB_NAME) : null;
    }

    const run = (sql: string, params: any[] = []) =>
      new Promise<void>(async (resolve, reject) => {
        try {
          if (raw.runAsync) {
            try {
              // Some expo-sqlite implementations accept (sql, params)
              // while others expect a prepared statement object. Try the simple call
              // first and fall back to a classic transaction if it fails.
              await raw.runAsync(sql, params);
              resolve();
              return;
            } catch (e) {
              // fall through to transaction fallback
            }
          }

          raw.transaction((tx: any) => {
            tx.executeSql(
              sql,
              params,
              () => resolve(),
              (_: any, err: any) => reject(err)
            );
          }, reject);
        } catch (e) {
          reject(e);
        }
      });

    const all = <T = any>(sql: string, params: any[] = []) =>
      new Promise<T[]>(async (resolve, reject) => {
        try {
          if (raw.getAllAsync) {
            try {
              const res = await raw.getAllAsync(sql, params);
              resolve(res as T[]);
              return;
            } catch (e) {
              // fall through to transaction fallback
            }
          }

          raw.transaction((tx: any) => {
            tx.executeSql(
              sql,
              params,
              (_tx: any, res: any) => {
                const out: any[] = [];
                for (let i = 0; i < res.rows.length; i++) out.push(res.rows.item(i));
                resolve(out as T[]);
              },
              (_: any, err: any) => reject(err)
            );
          }, reject);
        } catch (e) {
          reject(e);
        }
      });

    const get = async <T = any>(sql: string, params: any[] = []) => {
      const rows = await all<T>(sql, params);
      return rows && rows.length ? rows[0] : null;
    };

    const exec = async (sql: string) => {
      // execute single statement
      return run(sql, []);
    };

    const db: DB = { name: DB_NAME, raw, run, all, get, exec };

    // enable WAL for better concurrency; best-effort
    try {
      await db.exec('PRAGMA journal_mode = WAL');
    } catch (e) {
      /* ignore */
    }

    LAST_DB = db;
    return db;
  })();

  return DB_INSTANCE;
};

const close = async () => {
  try {
    const db = LAST_DB || (DB_INSTANCE ? await DB_INSTANCE : null);
    if (!db || !db.raw) return;
    const raw = db.raw;
    if (typeof raw.closeAsync === 'function') {
      await raw.closeAsync();
    } else if (typeof raw.close === 'function') {
      raw.close();
    } else if (raw._db && typeof raw._db.close === 'function') {
      raw._db.close();
    }
  } catch (e) {
    // ignore close failures
  } finally {
    LAST_DB = null;
    DB_INSTANCE = null;
  }
};

const resolveSqliteDir = () => {
  const fsAny = FileSystem as any;
  const documentDir = typeof fsAny.documentDirectory === 'string' ? fsAny.documentDirectory : null;
  const cacheDir = typeof fsAny.cacheDirectory === 'string' ? fsAny.cacheDirectory : null;
  if (documentDir) return `${documentDir}SQLite`;
  if (cacheDir) return `${cacheDir}SQLite`;
  return null;
};

const deleteDbFile = async () => {
  await close();
  const baseDir = resolveSqliteDir();
  if (!baseDir) return;

  const suffixes = ['', '-wal', '-shm'];
  for (const suffix of suffixes) {
    const path = `${baseDir}/${DB_NAME}${suffix}`;
    try {
      const info = await FileSystem.getInfoAsync(path);
      if (info.exists) {
        await FileSystem.deleteAsync(path, { idempotent: true });
      }
    } catch (e) {
      // ignore individual delete failures
    }
  }
};

export default { open, close, deleteDbFile };

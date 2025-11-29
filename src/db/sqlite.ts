import * as SQLite from 'expo-sqlite';

type DB = {
  name: string;
  raw: any;
  run: (sql: string, params?: any[]) => Promise<void>;
  all: <T = any>(sql: string, params?: any[]) => Promise<T[]>;
  get: <T = any>(sql: string, params?: any[]) => Promise<T | null>;
  exec: (sql: string) => Promise<void>;
};

let DB_INSTANCE: Promise<DB> | null = null;

const open = async (): Promise<DB> => {
  if (DB_INSTANCE) return DB_INSTANCE;

  DB_INSTANCE = (async () => {
    let raw: any;
    // Different expo-sqlite versions expose openDatabase or openDatabaseSync/openDatabaseAsync.
    if ((SQLite as any).openDatabaseAsync) {
      raw = await (SQLite as any).openDatabaseAsync('dhandiary.db');
    } else if ((SQLite as any).openDatabaseSync) {
      raw = (SQLite as any).openDatabaseSync('dhandiary.db');
    } else if ((SQLite as any).openDatabase) {
      raw = (SQLite as any).openDatabase('dhandiary.db');
    } else {
      // fallback: try calling as any
      raw = (SQLite as any).openDatabaseSync
        ? (SQLite as any).openDatabaseSync('dhandiary.db')
        : null;
    }

    const run = (sql: string, params: any[] = []) =>
      new Promise<void>((resolve, reject) => {
        try {
          if (raw.runAsync) {
            raw
              .runAsync(sql, params)
              .then(() => resolve())
              .catch(reject);
            return;
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
      new Promise<T[]>((resolve, reject) => {
        try {
          if (raw.getAllAsync) {
            raw.getAllAsync(sql, params).then(resolve).catch(reject);
            return;
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

    const db: DB = { name: 'dhandiary.db', raw, run, all, get, exec };

    // enable WAL for better concurrency; best-effort
    try {
      await db.exec('PRAGMA journal_mode = WAL');
    } catch (e) {
      /* ignore */
    }

    return db;
  })();

  return DB_INSTANCE;
};

export default { open };

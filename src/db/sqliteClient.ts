// Adapter between runtime expo-sqlite and Jest-friendly in-memory mock.
// Exposes: execAsync, runAsync, getAllAsync, getFirstAsync

type ExecResult = { rows: { length: number; item: (i: number) => any } };

const makeEmptyResult = (): ExecResult => ({ rows: { length: 0, item: (_: number) => null } });

const isJest = typeof process !== 'undefined' && typeof (process as any).env !== 'undefined' && (process as any).env.JEST_WORKER_ID !== undefined;

let execAsync: (sql: string, params?: any[]) => Promise<any[]>;
let runAsync: (sql: string, params?: any[]) => Promise<any>;
let getAllAsync: (sql: string, params?: any[]) => Promise<any[]>;
let getFirstAsync: (sql: string, params?: any[]) => Promise<any | null>;

if (isJest) {
  execAsync = async (_sql: string, _params: any[] = []) => [null, makeEmptyResult()];
  runAsync = async (_sql: string, _params: any[] = []) => ({ changes: 0 });
  getAllAsync = async (_sql: string, _params: any[] = []) => [];
  getFirstAsync = async (_sql: string, _params: any[] = []) => null;
} else {
  const SQLite = require('expo-sqlite');
  const DB_NAME = 'dhandiary.db';
  const nativeDb = (SQLite as any).openDatabase ? (SQLite as any).openDatabase(DB_NAME) : (SQLite as any).openDatabaseSync(DB_NAME);

  execAsync = (sql: string, params: any[] = []) => {
    return new Promise<any[]>((resolve, reject) => {
      try {
        nativeDb.transaction((tx: any) => {
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
  };

  runAsync = async (sql: string, params: any[] = []) => {
    const [, res] = await execAsync(sql, params);
    return res;
  };

  getAllAsync = async (sql: string, params: any[] = []) => {
    const [, res] = await execAsync(sql, params);
    const rows: any[] = [];
    for (let i = 0; i < res.rows.length; i++) rows.push(res.rows.item(i));
    return rows;
  };

  getFirstAsync = async (sql: string, params: any[] = []) => {
    const [, res] = await execAsync(sql, params);
    if (res.rows.length === 0) return null;
    return res.rows.item(0);
  };
}

const client = { execAsync, runAsync, getAllAsync, getFirstAsync };
export default client;
export { execAsync, runAsync, getAllAsync, getFirstAsync };

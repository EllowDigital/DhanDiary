import * as SQLite from 'expo-sqlite';

// --- Types ---

// The shape of the result for write operations (INSERT, UPDATE, DELETE)
export interface RunResult {
  lastInsertRowId: number;
  changes: number;
}

// Generic interface for database rows
export type Row = Record<string, any>;

// Interface defining our unified client API
export interface DatabaseClient {
  // execAsync keeps backward-compatible tuple: [tx, result]
  execAsync: (sql: string, params?: any[]) => Promise<[any, any]>;
  runAsync: (sql: string, params?: any[]) => Promise<RunResult>;
  getAllAsync: <T = Row>(sql: string, params?: any[]) => Promise<T[]>;
  getFirstAsync: <T = Row>(sql: string, params?: any[]) => Promise<T | null>;
}

const DB_NAME = 'dhandiary.db';

// Check if we are running in a Jest test environment
const isJest =
  typeof process !== 'undefined' &&
  process.env.JEST_WORKER_ID !== undefined;

// --- Implementations ---

/**
 * 1. JEST / MOCK IMPLEMENTATION
 * Returns empty structures or null to prevent tests from crashing.
 */
const mockClient: DatabaseClient = {
  execAsync: async (_sql: string, _params: any[] = []) => {
    const emptyResult = {
      rows: { length: 0, item: (_: number) => null },
      rowsAffected: 0,
      insertId: null,
    };
    return [null, emptyResult];
  },
  runAsync: async () => ({ lastInsertRowId: 0, changes: 0 }),
  getAllAsync: async () => [],
  getFirstAsync: async () => null,
};

/**
 * 2. REAL DATABASE IMPLEMENTATION
 * Factory function to create the correct client based on available Expo methods.
 */
const createDbClient = (): DatabaseClient => {
  if (isJest) return mockClient;

  // Initialize DB. Try modern synchronous open, fall back to legacy.
  let db: any;
  try {
    // @ts-ignore: Check for modern openDatabaseSync (SDK 50+)
    if (typeof (SQLite as any).openDatabaseSync === 'function') {
      // @ts-ignore
      db = (SQLite as any).openDatabaseSync(DB_NAME);
    } else if (typeof (SQLite as any).openDatabase === 'function') {
      // Legacy (SDK 49-)
      db = (SQLite as any).openDatabase(DB_NAME);
    } else {
      throw new Error('No compatible openDatabase found on expo-sqlite');
    }
  } catch (e) {
    console.warn('Error opening DB, falling back to mock:', e);
    return mockClient;
  }

  // --- A: Modern API (SDK 50+) ---
  // If the database object has the new methods natively, pass them through.
  if (db && typeof db.getAllAsync === 'function') {
    return {
      execAsync: (sql: string, params: any[] = []) => {
        return (db.execAsync(sql, params) as Promise<any>).then((res: any) => [null, res]);
      },
      runAsync: (sql: string, params: any[] = []) => db.runAsync(sql, params),
      getAllAsync: (sql: string, params: any[] = []) => db.getAllAsync(sql, params),
      getFirstAsync: (sql: string, params: any[] = []) => db.getFirstAsync(sql, params),
    };
  }

  // --- B: Legacy Adapter (SDK 49 & below) ---
  // Polyfills the new Async API using the old transaction API.
  console.log('Using Legacy SQLite Adapter');

  const executeSql = (sql: string, params: any[] = []): Promise<any> => {
    return new Promise((resolve, reject) => {
      db.transaction((tx: any) => {
        tx.executeSql(
          sql,
          params,
          (_: any, result: any) => resolve(result),
          (_: any, error: any) => {
            reject(error);
            return false; // Stop transaction
          }
        );
      });
    });
  };

  return {
    // execAsync is for batch execution strings in modern API
    execAsync: async (sql: string, params: any[] = []) => {
      // In legacy, run and return tuple similar to modern API
      const res = await executeSql(sql, params);
      return [null, res];
    },

    runAsync: async (sql: string, params: any[] = []) => {
      const res = await executeSql(sql, params);
      // Map legacy 'rowsAffected' -> modern 'changes'
      return {
        lastInsertRowId: res.insertId || 0,
        changes: res.rowsAffected || 0,
      };
    },

    getAllAsync: async <T = Row>(sql: string, params: any[] = []) => {
      const res = await executeSql(sql, params);
      // In legacy, rows is an array-like object with an 'item' function
      const items: T[] = [];
      for (let i = 0; i < res.rows.length; i++) {
        items.push(res.rows.item(i));
      }
      return items;
    },

    getFirstAsync: async <T = Row>(sql: string, params: any[] = []) => {
      const res = await executeSql(sql, params);
      if (res.rows.length > 0) {
        return res.rows.item(0) as T;
      }
      return null;
    },
  };
};

// Initialize the client singleton
const client = createDbClient();

// Export the singleton as default and named methods
export default client;
export const { execAsync, runAsync, getAllAsync, getFirstAsync } = client;
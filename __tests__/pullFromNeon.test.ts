jest.mock('../src/api/neonClient', () => {
  return {
    __esModule: true,
    query: jest.fn(),
    getNeonHealth: jest.fn(() => ({ isConfigured: true })),
  };
});

jest.mock('../src/db/sqlite', () => ({ executeSqlAsync: jest.fn() }));
jest.mock('../src/db/transactions', () => ({ upsertTransactionFromRemote: jest.fn() }));
jest.mock('../src/db/session', () => ({ getSession: jest.fn() }));

const neonClient = require('../src/api/neonClient');
const sqlite = require('../src/db/sqlite');
const txns = require('../src/db/transactions');
const session = require('../src/db/session');

const { default: pullFromNeon } = require('../src/sync/pullFromNeon');

describe('pullFromNeon', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    // Ensure neon health is enabled for tests
    neonClient.getNeonHealth.mockReturnValue({ isConfigured: true });
    session.getSession.mockResolvedValue({
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Test',
      email: 'test@example.com',
    });
  });

  test('pulls by server_version cursor and updates meta cursor', async () => {
    const userId = '11111111-1111-1111-1111-111111111111';
    const metaKey = `last_pull_server_version:${userId}`;

    // Simulate meta last_pull_server_version = 5
    sqlite.executeSqlAsync.mockImplementation(async (sql: string, params?: any[]) => {
      if (sql.includes('FROM meta')) {
        // Ensure we're reading the expected key
        if (Array.isArray(params) && params[0] === metaKey) {
          return [null, { rows: { length: 1, item: () => ({ value: '5' }) } }];
        }
        return [null, { rows: { length: 0, item: () => null } }];
      }
      // meta upsert
      return [null, { rows: { length: 0, item: () => null } }];
    });

    // remote rows: one new row with server_version 6
    neonClient.query.mockResolvedValueOnce([
      {
        id: 'r1',
        user_id: userId,
        amount: 10,
        type: 'income',
        category: null,
        note: null,
        date: null,
        updated_at: 200,
        created_at: 150,
        server_version: 6,
        sync_status: 1,
      },
    ]);

    const res = await pullFromNeon();

    expect(txns.upsertTransactionFromRemote).toHaveBeenCalledTimes(1);
    expect(sqlite.executeSqlAsync).toHaveBeenCalledWith(
      'INSERT OR REPLACE INTO meta(key, value) VALUES(?, ?);',
      [metaKey, '6']
    );
    expect(res.pulled).toBe(1);
    expect(res.lastSync).toBe(200);
  });

  test('returns 0 when no remote rows', async () => {
    sqlite.executeSqlAsync.mockImplementation(async (sql: string, params?: any[]) => {
      if (sql.includes('FROM meta')) {
        return [null, { rows: { length: 0, item: () => null } }];
      }
      return [null, { rows: { length: 0, item: () => null } }];
    });

    neonClient.query.mockResolvedValueOnce([]);

    const res = await pullFromNeon();

    expect(txns.upsertTransactionFromRemote).not.toHaveBeenCalled();
    expect(res.pulled).toBe(0);
    expect(res.lastSync).toBe(0);
  });

  test('passes remote delete through upsert and advances cursor', async () => {
    const userId = '11111111-1111-1111-1111-111111111111';
    const metaKey = `last_pull_server_version:${userId}`;

    // meta last_pull_server_version = 50
    sqlite.executeSqlAsync.mockImplementation(async (sql: string, params?: any[]) => {
      if (sql.includes('FROM meta')) {
        if (Array.isArray(params) && params[0] === metaKey) {
          return [null, { rows: { length: 1, item: () => ({ value: '50' }) } }];
        }
        return [null, { rows: { length: 0, item: () => null } }];
      }
      // catch update calls
      return [null, { rows: { length: 0, item: () => null } }];
    });

    neonClient.query.mockResolvedValueOnce([
      {
        id: 'r3',
        user_id: userId,
        amount: 0,
        type: 'expense',
        category: null,
        note: null,
        date: null,
        updated_at: 200,
        deleted_at: 200,
        created_at: 100,
        server_version: 51,
        sync_status: 1,
      },
    ]);

    const res = await pullFromNeon();

    expect(txns.upsertTransactionFromRemote).toHaveBeenCalledTimes(1);
    expect(sqlite.executeSqlAsync).toHaveBeenCalledWith(
      'INSERT OR REPLACE INTO meta(key, value) VALUES(?, ?);',
      [metaKey, '51']
    );
    expect(res.pulled).toBe(1);
    expect(res.lastSync).toBe(200);
  });
});

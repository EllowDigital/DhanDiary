jest.mock('../src/api/neonClient', () => {
  return { __esModule: true, query: jest.fn(), getNeonHealth: jest.fn(() => ({ isConfigured: true })) };
});

jest.mock('../src/db/sqlite', () => ({ executeSqlAsync: jest.fn() }));
jest.mock('../src/db/transactions', () => ({ upsertTransactionFromRemote: jest.fn() }));

const neonClient = require('../src/api/neonClient');
const sqlite = require('../src/db/sqlite');
const txns = require('../src/db/transactions');

const { default: pullFromNeon } = require('../src/sync/pullFromNeon');

describe('pullFromNeon', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    // Ensure neon health is enabled for tests
    neonClient.getNeonHealth.mockReturnValue({ isConfigured: true });
  });

  test('newer remote overwrites local and lastSync updates', async () => {
    // Simulate meta last_sync_timestamp = 100
    sqlite.executeSqlAsync.mockImplementation(async (sql: string, params?: any[]) => {
      if (sql.includes('FROM meta')) {
        return [null, { rows: { length: 1, item: () => ({ value: '100' }) } }];
      }
      // local lookup for updated_at: return no local row
      if (sql.includes('FROM transactions WHERE id = ?')) {
        return [null, { rows: { length: 0, item: () => null } }];
      }
      // meta upsert
      return [null, { rows: { length: 0, item: () => null } }];
    });

    // remote rows: one new row with updated_at 200
    neonClient.query.mockResolvedValueOnce([
      {
        id: 'r1',
        user_id: 'u1',
        amount: 10,
        type: 'income',
        category: null,
        note: null,
        date: null,
        updated_at: 200,
        sync_status: 1,
      },
    ]);

    const res = await pullFromNeon();

    expect(txns.upsertTransactionFromRemote).toHaveBeenCalledTimes(1);
    expect(sqlite.executeSqlAsync).toHaveBeenCalledWith(
      'INSERT OR REPLACE INTO meta(key, value) VALUES(?, ?);',
      ['last_sync_timestamp', '200']
    );
    expect(res.pulled).toBe(1);
    expect(res.lastSync).toBe(200);
  });

  test('older remote does not overwrite local', async () => {
    // meta last_sync = 0
    sqlite.executeSqlAsync.mockImplementation(async (sql: string, params?: any[]) => {
      if (sql.includes('FROM meta')) {
        return [null, { rows: { length: 0, item: () => null } }];
      }
      // local lookup: local updated_at = 500
      if (sql.includes('FROM transactions WHERE id = ?')) {
        return [null, { rows: { length: 1, item: () => ({ updated_at: 500 }) } }];
      }
      return [null, { rows: { length: 0, item: () => null } }];
    });

    neonClient.query.mockResolvedValueOnce([
      {
        id: 'r2',
        user_id: 'u1',
        amount: 5,
        type: 'expense',
        category: null,
        note: null,
        date: null,
        updated_at: 100,
        sync_status: 1,
      },
    ]);

    const res = await pullFromNeon();

    expect(txns.upsertTransactionFromRemote).not.toHaveBeenCalled();
    expect(res.pulled).toBe(0);
    expect(res.lastSync).toBe(0);
  });
});

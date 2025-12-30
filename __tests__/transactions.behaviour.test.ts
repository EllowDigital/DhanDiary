jest.mock('../src/db/sqlite', () => ({ executeSqlAsync: jest.fn() }));
jest.mock('../src/utils/dbEvents', () => ({ notifyEntriesChanged: jest.fn() }));

const sqlite = require('../src/db/sqlite');
const events = require('../src/utils/dbEvents');

describe('transactions DB behavior', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('upsertTransactionFromRemote skips when local tombstone exists', async () => {
    // Re-require after resetting modules
    const { upsertTransactionFromRemote } = require('../src/db/transactions');

    // First call (checkSql) should return a row with sync_status = 2
    sqlite.executeSqlAsync.mockImplementationOnce(async (sql: any, params: any) => {
      if (sql.includes('SELECT sync_status')) {
        return [null, { rows: { length: 1, item: () => ({ sync_status: 2 }) } }];
      }
      return [null, { rows: { length: 0, item: () => null } }];
    });

    const txn = { id: 't1', user_id: 'u1', amount: 10, type: 'expense' };
    await upsertTransactionFromRemote(txn);

    // After detecting tombstone, the function should return early and not attempt insert
    expect(sqlite.executeSqlAsync).toHaveBeenCalledTimes(1);
    expect(events.notifyEntriesChanged).not.toHaveBeenCalled();
  });

  test('updateTransaction writes provided date and notifies subscribers', async () => {
    const { updateTransaction } = require('../src/db/transactions');

    // Mock update result to indicate 1 row affected
    sqlite.executeSqlAsync.mockImplementation(async (sql: any, params: any) => {
      // For the UPDATE call return a result with rowsAffected = 1 in second element
      if (sql.trim().toUpperCase().startsWith('UPDATE TRANSACTIONS')) {
        return [null, { rowsAffected: 1 }];
      }
      return [null, { rows: { length: 0, item: () => null } }];
    });

    const dateIso = '2025-11-01T12:00:00.000Z';
    await updateTransaction({ id: 't2', user_id: 'u1', date: dateIso, amount: 50, type: 'income' });

    // The update SQL should have been called at least once
    expect(sqlite.executeSqlAsync).toHaveBeenCalled();

    // Find the UPDATE call and assert date param used
    const calls = sqlite.executeSqlAsync.mock.calls;
    const updateCall = calls.find(
      (c: any) => typeof c[0] === 'string' && c[0].includes('UPDATE transactions')
    );
    expect(updateCall).toBeDefined();
    const params = updateCall[1];
    // params order: amount, type, category, note, date, updated_at, sync_status, id, user_id
    expect(params[4]).toBe(dateIso);

    // notifyEntriesChanged should have been called after successful update
    expect(events.notifyEntriesChanged).toHaveBeenCalled();
  });
});

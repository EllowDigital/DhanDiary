/**
 * Integration-style safety test:
 * Delete (tombstone) -> push clears need_sync -> pull must not resurrect.
 */

jest.mock('../src/api/neonClient', () => {
  return {
    __esModule: true,
    query: jest.fn(),
    getNeonHealth: jest.fn(() => ({ isConfigured: true })),
  };
});

// We want real transactions logic, but with a controlled in-memory executeSqlAsync.
jest.mock('../src/db/sqlite', () => ({ executeSqlAsync: jest.fn() }));

// Push reads unsynced rows; we’ll provide them directly.
jest.mock('../src/db/transactions', () => {
  const actual = jest.requireActual('../src/db/transactions');
  return {
    __esModule: true,
    ...actual,
    getUnsyncedTransactions: jest.fn(),
  };
});

const neonClient = require('../src/api/neonClient');
const sqlite = require('../src/db/sqlite');
const txns = require('../src/db/transactions');

const { pushToNeon } = require('../src/sync/pushToNeon');

type Row = {
  id: string;
  user_id: string;
  deleted_at: string | null;
  sync_status: number;
  need_sync: number;
  server_version: number;
  updated_at: number;
};

const makeRows = (items: any[]) => ({
  rows: {
    length: items.length,
    item: (i: number) => items[i],
  },
});

describe('tombstone delete->push->pull never resurrects', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    neonClient.getNeonHealth.mockReturnValue({ isConfigured: true });
  });

  test('keeps local tombstone even if remote row is not deleted', async () => {
    const userId = '11111111-1111-1111-1111-111111111111';
    const txnId = '22222222-2222-2222-2222-222222222222';

    const row: Row = {
      id: txnId,
      user_id: userId,
      deleted_at: null,
      sync_status: 1,
      need_sync: 0,
      server_version: 10,
      updated_at: 1000,
    };

    // Minimal in-memory SQL handler for the queries used by:
    // - deleteTransaction
    // - pushToNeon local metadata update
    // - upsertTransactionFromRemote conflict checks
    // - (potential) INSERT OR REPLACE (should NOT happen in this test)
    sqlite.executeSqlAsync.mockImplementation(async (sql: string, params: any[] = []) => {
      const normalizedSql = sql.replace(/\s+/g, ' ').trim();

      // deleteTransaction (with user)
      if (
        normalizedSql.startsWith('UPDATE transactions SET deleted_at = COALESCE(deleted_at, ?)')
      ) {
        const [deletedAtIso, updatedAtMs, id, u] = params;
        if (id === row.id && u === row.user_id) {
          row.deleted_at = row.deleted_at ?? deletedAtIso;
          row.updated_at = Number(updatedAtMs);
          row.sync_status = 2;
          row.need_sync = 1;
          return [null, { rowsAffected: 1, ...makeRows([]) }];
        }
        return [null, { rowsAffected: 0, ...makeRows([]) }];
      }

      // deleteTransaction fallback (id-only)
      if (
        normalizedSql.startsWith('UPDATE transactions SET deleted_at = COALESCE(deleted_at, ?)') &&
        normalizedSql.includes('WHERE id = ?;')
      ) {
        const [deletedAtIso, updatedAtMs, id] = params;
        if (id === row.id) {
          row.deleted_at = row.deleted_at ?? deletedAtIso;
          row.updated_at = Number(updatedAtMs);
          row.sync_status = 2;
          row.need_sync = 1;
          return [null, { rowsAffected: 1, ...makeRows([]) }];
        }
        return [null, { rowsAffected: 0, ...makeRows([]) }];
      }

      // pushToNeon local update
      if (
        normalizedSql.startsWith(
          'UPDATE transactions SET sync_status = ?, need_sync = 0, server_version = ?, updated_at = ? WHERE id = ?;'
        )
      ) {
        const [syncStatus, serverVersion, updatedAtMs, id] = params;
        if (id === row.id) {
          row.sync_status = Number(syncStatus);
          row.need_sync = 0;
          row.server_version = Number(serverVersion);
          row.updated_at = Number(updatedAtMs);
          return [null, { rowsAffected: 1, ...makeRows([]) }];
        }
        return [null, { rowsAffected: 0, ...makeRows([]) }];
      }

      // upsertTransactionFromRemote conflict check
      if (
        normalizedSql.startsWith(
          'SELECT sync_status, need_sync, deleted_at, server_version, updated_at FROM transactions WHERE id = ? LIMIT 1;'
        )
      ) {
        const [id] = params;
        if (id === row.id) {
          return [null, makeRows([{ ...row }])];
        }
        return [null, makeRows([])];
      }

      // upsertTransactionFromRemote write
      if (normalizedSql.startsWith('INSERT OR REPLACE INTO transactions(')) {
        // If this runs, that would mean we resurrected or overwrote.
        // Apply anyway so the test can catch it via expectations.
        return [null, { rowsAffected: 1, ...makeRows([]) }];
      }

      return [null, { rowsAffected: 0, ...makeRows([]) }];
    });

    // Step 1: delete -> tombstone
    await txns.deleteTransaction(txnId, userId);
    expect(row.sync_status).toBe(2);
    expect(row.need_sync).toBe(1);
    expect(row.deleted_at).toBeTruthy();

    // Step 2: push -> clears need_sync but keeps sync_status=2
    txns.getUnsyncedTransactions.mockResolvedValueOnce([
      {
        id: row.id,
        user_id: row.user_id,
        deleted_at: row.deleted_at,
        sync_status: row.sync_status,
        need_sync: row.need_sync,
        client_id: null,
        type: 'expense',
        amount: 0,
        category: null,
        note: null,
        currency: 'INR',
        date: new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
    ]);

    neonClient.query.mockResolvedValueOnce([
      {
        id: txnId,
        server_version: 11,
        updated_at: 2000,
      },
    ]);

    const pushRes = await pushToNeon();
    expect(pushRes.deleted).toContain(txnId);
    expect(row.need_sync).toBe(0);
    expect(row.sync_status).toBe(2);

    // Step 3: pull -> remote row is not deleted; must NOT resurrect
    const before = { ...row };

    await txns.upsertTransactionFromRemote({
      id: txnId,
      user_id: userId,
      amount: 999,
      type: 'expense',
      category: null,
      note: null,
      currency: 'INR',
      date: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: 3000,
      deleted_at: null,
      server_version: 12,
      sync_status: 1,
      need_sync: 0,
    });

    // Still tombstoned, no resurrection.
    expect(row.deleted_at).toBe(before.deleted_at);
    expect(row.sync_status).toBe(2);
    expect(row.need_sync).toBe(0);

    // Ensure we didn't write an INSERT OR REPLACE as part of resurrection.
    const calls: string[] = sqlite.executeSqlAsync.mock.calls.map((c: any[]) => String(c[0]));
    const wroteRemoteUpsert = calls.some((s) => s.includes('INSERT OR REPLACE INTO transactions('));
    expect(wroteRemoteUpsert).toBe(false);
  });
});

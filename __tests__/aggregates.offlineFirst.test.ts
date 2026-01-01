import dayjs from 'dayjs';

// IMPORTANT: mock dependencies BEFORE importing the module under test.
const mockCheckNeonConnection = jest.fn(async () => true);
const mockGetNeonHealth = jest.fn(() => ({
  isConfigured: true,
  circuitOpenUntil: 0,
  lastErrorMessage: null,
}));

jest.mock('../src/api/neonClient', () => ({
  checkNeonConnection: (...args: any[]) => (mockCheckNeonConnection as any)(...args),
  getNeonHealth: (...args: any[]) => (mockGetNeonHealth as any)(...args),
}));

type SqlRows = { length: number; item: (i: number) => any };
const makeRows = (items: any[]): SqlRows => ({
  length: items.length,
  item: (i: number) => items[i],
});

const mockExecuteSqlAsync = jest.fn(async (sql: string) => {
  // totals query
  if (
    sql.includes('AS total_in') &&
    sql.includes('AS total_out') &&
    sql.includes('FROM transactions')
  ) {
    return [
      null,
      { rows: makeRows([{ total_in: 100, total_out: 150, max_in: 80, max_out: 60, cnt: 3 }]) },
    ];
  }

  // daily trend query
  if (
    sql.includes('AS total_out') &&
    sql.includes('GROUP BY') &&
    sql.includes("strftime('%Y-%m-%d")
  ) {
    return [
      null,
      {
        rows: makeRows([
          { d: '2026-01-01', total_out: 50 },
          { d: '2026-01-02', total_out: 100 },
        ]),
      },
    ];
  }

  // category query
  if (sql.includes('COALESCE(category') && sql.includes('LIMIT 8')) {
    return [
      null,
      {
        rows: makeRows([
          { category: 'Food', value: 120, cnt: 2 },
          { category: 'Travel', value: 30, cnt: 1 },
        ]),
      },
    ];
  }

  // max income/expense query in fallback extras
  if (sql.includes('AS max_in') && sql.includes('AS max_out') && sql.includes('MAX(')) {
    return [null, { rows: makeRows([{ max_in: 80, max_out: 60 }]) }];
  }

  return [null, { rows: makeRows([]) }];
});

jest.mock('../src/db/sqlite', () => ({
  executeSqlAsync: (...args: any[]) => (mockExecuteSqlAsync as any)(...args),
}));

describe('aggregateWithPreferSummary offline-first', () => {
  beforeEach(() => {
    mockCheckNeonConnection.mockClear();
    mockExecuteSqlAsync.mockClear();
  });

  test('does not probe Neon when allowRemote=false and computes correct savingsRate', async () => {
    // Use require() to keep Jest compatible without experimental VM modules
    const { aggregateWithPreferSummary } = require('../src/services/aggregates');

    const res = await aggregateWithPreferSummary(
      '11111111-1111-1111-1111-111111111111',
      dayjs('2026-01-01'),
      dayjs('2026-01-02'),
      { allowRemote: false }
    );

    expect(mockCheckNeonConnection).not.toHaveBeenCalled();
    expect(res.totalIn).toBe(100);
    expect(res.totalOut).toBe(150);
    expect(res.net).toBe(-50);
    // savings rate should be negative when spending exceeds income
    expect(Math.round((res as any).savingsRate)).toBe(-50);
    expect(Array.isArray(res.dailyTrend)).toBe(true);
    expect(Array.isArray(res.pieData)).toBe(true);
  });
});

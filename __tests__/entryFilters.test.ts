import { buildEntryDisplay, summarizeEntries } from '../src/utils/entryFilters';
import { LocalEntry } from '../src/db/entries';
import { DEFAULT_CATEGORY } from '../src/constants/categories';

const makeEntry = (overrides: Partial<LocalEntry> & { local_id: string }): LocalEntry => ({
  local_id: overrides.local_id,
  user_id: overrides.user_id || 'user-1',
  type: overrides.type || 'out',
  amount: overrides.amount ?? 0,
  category: overrides.category || DEFAULT_CATEGORY,
  note: overrides.note ?? null,
  currency: overrides.currency || 'INR',
  remote_id: overrides.remote_id ?? null,
  server_version: overrides.server_version,
  created_at: overrides.created_at || '2025-01-01T00:00:00.000Z',
  updated_at: overrides.updated_at || overrides.created_at || '2025-01-01T00:00:00.000Z',
  is_synced: overrides.is_synced,
  is_deleted: overrides.is_deleted,
  need_sync: overrides.need_sync,
  date: overrides.date ?? overrides.created_at ?? '2025-01-01T00:00:00.000Z',
});

const NOW = new Date('2025-01-31T00:00:00.000Z').getTime();

const entries: LocalEntry[] = [
  makeEntry({
    local_id: 'out_recent',
    type: 'out',
    amount: 1200,
    category: 'Bills',
    date: '2025-01-29T00:00:00.000Z',
  }),
  makeEntry({
    local_id: 'out_missing_date',
    type: 'out',
    amount: 600,
    category: 'Bills',
    date: null,
    created_at: '2025-01-28T00:00:00.000Z',
  }),
  makeEntry({
    local_id: 'out_old',
    type: 'out',
    amount: 800,
    category: 'Transport',
    date: '2024-12-20T00:00:00.000Z',
  }),
  makeEntry({
    local_id: 'in_high',
    type: 'in',
    amount: 5000,
    category: 'SALARY',
    date: '2025-01-10T00:00:00.000Z',
  }),
  makeEntry({
    local_id: 'in_low',
    type: 'in',
    amount: 200,
    category: 'Shopping',
    date: null,
    created_at: '2025-01-05T00:00:00.000Z',
  }),
];

describe('entryFilters utilities', () => {
  it('filters by timeframe with timestamp fallbacks', () => {
    const { filteredEntries } = buildEntryDisplay(
      entries,
      { type: 'out', timeframe: '7d', sortMode: 'recent' },
      NOW
    );

    const ids = filteredEntries.map((entry) => entry.local_id);
    expect(ids).toEqual(['out_recent', 'out_missing_date']);
  });

  it('sorts income entries by amount', () => {
    const { sortedEntries } = buildEntryDisplay(
      entries,
      { type: 'in', timeframe: 'all', sortMode: 'amount' },
      NOW
    );

    expect(sortedEntries.map((entry) => entry.local_id)).toEqual(['in_high', 'in_low']);
  });

  it('summarizes filtered entries consistently', () => {
    const { filteredEntries } = buildEntryDisplay(
      entries,
      { type: 'out', timeframe: '7d', sortMode: 'recent' },
      NOW
    );
    const summary = summarizeEntries(filteredEntries);

    expect(summary.count).toBe(2);
    expect(summary.total).toBe(1800);
    expect(summary.avg).toBe(900);
    expect(summary.topCategory).toBe('Bills');
    expect(summary.lastTimestamp).toBe(new Date('2025-01-29T00:00:00.000Z').getTime());
  });
});

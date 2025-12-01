import { LocalEntry } from '../db/entries';

export type EntryTimeframe = 'all' | '7d' | '30d';
export type EntrySortMode = 'recent' | 'amount';

const TIMEFRAME_TO_DAYS: Record<Exclude<EntryTimeframe, 'all'>, number> = {
  '7d': 7,
  '30d': 30,
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const getTimestamp = (value?: string | null) => {
  if (!value) return NaN;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : NaN;
};

export const entryTimestamp = (entry: LocalEntry): number => {
  const ts = getTimestamp(entry.date) ?? NaN;
  if (Number.isFinite(ts)) return ts;
  const createdTs = getTimestamp(entry.created_at) ?? NaN;
  if (Number.isFinite(createdTs)) return createdTs;
  const updatedTs = getTimestamp(entry.updated_at) ?? NaN;
  if (Number.isFinite(updatedTs)) return updatedTs;
  return 0;
};

export const selectEntriesByType = (
  entries: LocalEntry[] | undefined,
  type: 'in' | 'out'
): LocalEntry[] => {
  if (!entries?.length) return [];
  return entries.filter((entry) => entry.type === type);
};

export const applyTimeframeFilter = (
  entries: LocalEntry[],
  timeframe: EntryTimeframe,
  now: number = Date.now()
): LocalEntry[] => {
  if (timeframe === 'all' || !entries.length) return entries;
  const days = TIMEFRAME_TO_DAYS[timeframe];
  const cutoff = now - days * DAY_IN_MS;
  return entries.filter((entry) => entryTimestamp(entry) >= cutoff);
};

export const sortEntriesByMode = (entries: LocalEntry[], sortMode: EntrySortMode): LocalEntry[] => {
  if (!entries.length) return entries;
  const list = [...entries];
  if (sortMode === 'amount') {
    return list.sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0));
  }
  return list.sort((a, b) => entryTimestamp(b) - entryTimestamp(a));
};

export type EntrySummary = {
  total: number;
  avg: number;
  count: number;
  topCategory: string;
  lastTimestamp: number;
};

export const summarizeEntries = (entries: LocalEntry[]): EntrySummary => {
  if (!entries.length) {
    return {
      total: 0,
      avg: 0,
      count: 0,
      topCategory: 'General',
      lastTimestamp: 0,
    };
  }

  let total = 0;
  let lastTimestamp = 0;
  const categoryTotals: Record<string, number> = {};

  entries.forEach((entry) => {
    const amount = Number(entry.amount) || 0;
    total += amount;
    const ts = entryTimestamp(entry);
    if (ts > lastTimestamp) lastTimestamp = ts;
    const category = entry.category || 'General';
    categoryTotals[category] = (categoryTotals[category] || 0) + amount;
  });

  const topCategory =
    Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0]?.[0] || 'General';
  const count = entries.length;

  return {
    total,
    avg: count ? total / count : 0,
    count,
    topCategory,
    lastTimestamp,
  };
};

export const buildEntryDisplay = (
  entries: LocalEntry[] | undefined,
  opts: { type: 'in' | 'out'; timeframe: EntryTimeframe; sortMode: EntrySortMode },
  now: number = Date.now()
) => {
  const typedEntries = selectEntriesByType(entries, opts.type);
  const filteredEntries = applyTimeframeFilter(typedEntries, opts.timeframe, now);
  const sortedEntries = sortEntriesByMode(filteredEntries, opts.sortMode);
  return {
    typedEntries,
    filteredEntries,
    sortedEntries,
  };
};

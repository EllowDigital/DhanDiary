import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';

dayjs.extend(isSameOrBefore);
import { getSummary } from '../db/localDb';
import asyncAggregator from '../utils/asyncAggregator';
// Use the online entries generator which reads directly from Neon
import { fetchEntriesGenerator } from '../db/entries';
import { StatResult } from '../utils/asyncAggregator';

/**
 * Aggregates service
 * - Prefer precomputed summaries stored under `users/{uid}/summaries/{period}`
 * - If summaries not available for range, fallback to streaming aggregation
 * - This file intentionally keeps logic lightweight so it can be replaced
 *   with a native-worker bridging implementation later.
 */

export const readPrecomputedDaily = async (
  userId: string,
  start: dayjs.Dayjs,
  end: dayjs.Dayjs
) => {
  if (!userId) return null;
  try {
    // Read summaries from local DB for each day in range (inclusive)
    const results: any[] = [];
    let cur = start.startOf('day');
    const last = end.startOf('day');
    while (cur.isSameOrBefore(last)) {
      const key = cur.format('YYYY-MM-DD');
      const s: any = await getSummary('daily', key);
      if (s) {
        results.push({
          id: key,
          date: key,
          in: (s.totalInCents || 0) / 100,
          out: (s.totalOutCents || 0) / 100,
          count: s.count || 0,
        });
      }
      cur = cur.add(1, 'day');
    }
    if (results.length === 0) return null;
    return results;
  } catch (err) {
    console.warn('Failed to read precomputed daily summaries', err);
    return null;
  }
};

export const aggregateWithPreferSummary = async (
  userId: string | undefined,
  start: dayjs.Dayjs,
  end: dayjs.Dayjs,
  opts?: { signal?: AbortSignal }
): Promise<StatResult> => {
  // Try precomputed daily first
  if (userId) {
    const pre = await readPrecomputedDaily(userId, start, end);
    if (pre && pre.length > 0) {
      // Convert precomputed to StatResult-like minimal shape
      // Note: this is a best-effort mapping; full fidelity requires server-side schema.
      const totalOut = pre.reduce((s: number, p: any) => s + (Number(p.out || 0) || 0), 0);
      const totalIn = pre.reduce((s: number, p: any) => s + (Number(p.in || 0) || 0), 0);
      const pie: { name: string; value: number; count: number }[] = [];
      const dailyTrend: { label: string; value: number; date: string }[] = pre
        .slice()
        .sort((a: any, b: any) => (a.date > b.date ? 1 : -1))
        .map((p: any) => ({
          label: dayjs(p.date).format('DD MMM'),
          value: Number(p.out || 0),
          date: String(p.date),
        }));

      return {
        totalIn,
        totalOut,
        net: totalIn - totalOut,
        count: 0,
        skipped: 0,
        mean: 0,
        median: 0,
        stddev: 0,
        maxIncome: 0,
        maxExpense: 0,
        currency: 'INR',
        detectedCurrencies: [],
        dailyTrend,
        pieData: pie,
      } as StatResult;
    }
  }

  // Fallback: stream pages from Firestore and aggregate in JS (non-blocking)
  const pages = userId ? fetchEntriesGenerator(userId, 500) : undefined;
  if (pages && opts?.signal) {
    return asyncAggregator.aggregateFromPages(pages, start, end, { signal: opts.signal });
  }
  if (pages) {
    return asyncAggregator.aggregateFromPages(pages, start, end);
  }

  // If no userId, just return empty aggregator
  return {
    totalIn: 0,
    totalOut: 0,
    net: 0,
    count: 0,
    skipped: 0,
    mean: 0,
    median: 0,
    stddev: 0,
    maxIncome: 0,
    maxExpense: 0,
    currency: 'INR',
    detectedCurrencies: [],
    dailyTrend: [],
    pieData: [],
  } as StatResult;
};

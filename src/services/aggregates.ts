import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';

dayjs.extend(isSameOrBefore);
import { getSummaries } from '../db/localDb';
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
    // Fetch daily summaries in a single range query to avoid N round-trips
    const srows: any = await getSummaries(
      'daily',
      start.format('YYYY-MM-DD'),
      end.format('YYYY-MM-DD')
    );

    // Normalize returned rows into a map for quick lookup
    const summaryMap = new Map<string, any>();
    (srows || []).forEach((r: any) => {
      const d = dayjs(r.date).format('YYYY-MM-DD');
      summaryMap.set(d, {
        date: d,
        total_in: Number(r.total_in || r.totalIn || 0),
        total_out: Number(r.total_out || r.totalOut || 0),
        count: Number(r.count || 0),
      });
    });

    // Determine full date range and detect any missing days
    const days: string[] = [];
    let cur = start.startOf('day');
    const last = end.startOf('day');
    while (cur.isSameOrBefore(last)) {
      days.push(cur.format('YYYY-MM-DD'));
      cur = cur.add(1, 'day');
    }

    const missing = days.filter((d) => !summaryMap.has(d));

    // If there are missing days, query cash_entries only for those dates and merge
    let filledMap = new Map(summaryMap);
    if (missing.length > 0) {
      try {
        const { query } = require('../api/neonClient');
        // Parameterize date array to avoid many queries. Use Postgres date[] parameter.
        const rows = await query(
          `SELECT date::date AS date, COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0) AS total_in, COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS total_out, COUNT(*)::int AS count
           FROM transactions
           WHERE user_id = $1 AND date::date = ANY($2::date[]) AND deleted_at IS NULL
           GROUP BY date::date`,
          [userId, missing]
        );
        (rows || []).forEach((r: any) => {
          const d = dayjs(r.date).format('YYYY-MM-DD');
          filledMap.set(d, {
            date: d,
            total_in: Number(r.total_in || 0),
            total_out: Number(r.total_out || 0),
            count: Number(r.count || 0),
          });
        });
      } catch (e) {
        console.warn('Failed to backfill missing daily summaries from entries', e);
      }
    }

    // Build ordered results for the UI
    const results = days
      .map((d) => {
        const r = filledMap.get(d);
        return r
          ? {
              id: d,
              date: d,
              in: Number(r.total_in || 0),
              out: Number(r.total_out || 0),
              count: Number(r.count || 0),
            }
          : null;
      })
      .filter(Boolean);

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
      // Build daily trend (expenses) and category distribution by querying Neon once
      const dailyTrend: { label: string; value: number; date: string }[] = pre
        .slice()
        .sort((a: any, b: any) => (a.date > b.date ? 1 : -1))
        .map((p: any) => ({
          label: dayjs(p.date).format('DD MMM'),
          value: Number(p.out || 0),
          date: String(p.date),
        }));
      // Attempt to fetch top categories (expenses) and extrema for the same range so UI can show Distribution/Top Expenses and metrics
      let pie: { name: string; value: number; count: number }[] = [];
      let maxIncome = 0;
      let maxExpense = 0;
      let avgPerDay = 0;
      let savingsRate = 0;
      try {
        const { query } = require('../api/neonClient');
        const catRows = await query(
          `SELECT COALESCE(category,'Uncategorized') AS category, COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS value, COUNT(*)::int AS cnt
           FROM transactions
           WHERE user_id = $1 AND date::date >= $2::date AND date::date <= $3::date AND deleted_at IS NULL
           GROUP BY COALESCE(category,'Uncategorized') ORDER BY value DESC LIMIT 8`,
          [userId, start.format('YYYY-MM-DD'), end.format('YYYY-MM-DD')]
        );
        pie = (catRows || []).map((r: any) => ({
          name: r.category,
          value: Number(r.value || 0),
          count: Number(r.cnt || 0),
        }));

        // Compute maxima and averages
        try {
          const maxInRows = await query(
            `SELECT COALESCE(MAX(amount),0) AS max_in FROM transactions WHERE user_id = $1 AND type = 'income' AND date::date >= $2::date AND date::date <= $3::date AND deleted_at IS NULL`,
            [userId, start.format('YYYY-MM-DD'), end.format('YYYY-MM-DD')]
          );
          maxIncome = Number((maxInRows && maxInRows[0] && maxInRows[0].max_in) || 0);
        } catch (e) {
          maxIncome = 0;
        }

        try {
          const maxOutRows = await query(
            `SELECT COALESCE(MAX(amount),0) AS max_out FROM transactions WHERE user_id = $1 AND type = 'expense' AND date::date >= $2::date AND date::date <= $3::date AND deleted_at IS NULL`,
            [userId, start.format('YYYY-MM-DD'), end.format('YYYY-MM-DD')]
          );
          maxExpense = Number((maxOutRows && maxOutRows[0] && maxOutRows[0].max_out) || 0);
        } catch (e) {
          maxExpense = 0;
        }

        try {
          const days = Math.max(1, end.diff(start, 'day') + 1);
          avgPerDay = days > 0 ? Number(totalOut) / days : 0;
          savingsRate =
            Number(totalIn) > 0
              ? ((Number(totalIn) - Number(totalOut)) / Number(totalIn)) * 100
              : 0;
        } catch (e) {
          avgPerDay = 0;
          savingsRate = 0;
        }
      } catch (e) {
        // If category aggregation fails, fall back to empty pieData (UI shows empty state)
        console.warn('Failed to fetch category distribution for summaries', e);
        pie = [];
      }

      return {
        totalIn,
        totalOut,
        net: totalIn - totalOut,
        count: pre.reduce((s: number, p: any) => s + (Number(p.count || 0) || 0), 0),
        skipped: 0,
        mean: 0,
        median: 0,
        stddev: 0,
        maxIncome,
        maxExpense,
        currency: 'INR',
        detectedCurrencies: [],
        dailyTrend,
        pieData: pie,
        avgPerDay,
        savingsRate: Math.max(0, savingsRate),
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

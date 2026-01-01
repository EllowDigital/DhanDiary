import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import { getSummaries } from '../db/localDb';
import asyncAggregator, { StatResult } from '../utils/asyncAggregator';
import { fetchEntriesGenerator } from '../db/entries';
import { getNeonHealth, checkNeonConnection } from '../api/neonClient'; // Consolidated import
import { executeSqlAsync } from '../db/sqlite';

dayjs.extend(isSameOrBefore);

// Simple in-memory cache
type CacheEntry = { ts: number; value: StatResult };
const AGG_CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30 * 1000; // 30s Cache

const cacheKey = (
  userId: string,
  start: dayjs.Dayjs,
  end: dayjs.Dayjs,
  cacheBuster?: string | number
) =>
  `${userId}:${start.startOf('day').valueOf()}:${end.startOf('day').valueOf()}:$${
    cacheBuster ?? ''
  }`;

/**
 * ------------------------------------------------------------------
 * 1. LOCAL SQLITE AGGREGATION (Offline / Fallback)
 * ------------------------------------------------------------------
 */
const aggregateLocally = async (userId: string, start: dayjs.Dayjs, end: dayjs.Dayjs) => {
  const startIso = start.startOf('day').toISOString();
  const endIso = end.endOf('day').toISOString();

  // A. Totals & Extremes
  const totalSql = `
    SELECT
      COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0) AS total_in,
      COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS total_out,
      COALESCE(MAX(CASE WHEN type='income' THEN amount END),0) AS max_in,
      COALESCE(MAX(CASE WHEN type='expense' THEN amount END),0) AS max_out,
      COUNT(*) AS cnt
    FROM transactions
    WHERE user_id = ? AND date >= ? AND date <= ? AND deleted_at IS NULL;
  `;

  const [, totalRes] = await executeSqlAsync(totalSql, [userId, startIso, endIso]);
  const totalRow = totalRes.rows.length ? totalRes.rows.item(0) : null;

  const totalIn = Number(totalRow?.total_in || 0);
  const totalOut = Number(totalRow?.total_out || 0);
  const maxIncome = Number(totalRow?.max_in || 0);
  const maxExpense = Number(totalRow?.max_out || 0);
  const count = Number(totalRow?.cnt || 0);

  // B. Daily Trend (Expenses)
  const dailySql = `
    SELECT date(date) as d, COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS total_out
    FROM transactions
    WHERE user_id = ? AND date >= ? AND date <= ? AND deleted_at IS NULL
    GROUP BY date(date)
    ORDER BY date(date);
  `;
  const [, dailyRes] = await executeSqlAsync(dailySql, [userId, startIso, endIso]);
  const dailyMap = new Map<string, number>();
  for (let i = 0; i < dailyRes.rows.length; i++) {
    const r: any = dailyRes.rows.item(i) || {};
    dailyMap.set(String(r.d || ''), Number(r.total_out || 0));
  }

  // Fill Date Gaps
  const days: string[] = [];
  let cur = start.startOf('day');
  const last = end.startOf('day');
  while (cur.isSameOrBefore(last)) {
    days.push(cur.format('YYYY-MM-DD'));
    cur = cur.add(1, 'day');
  }

  const dailyTrend = days.map((d) => ({
    label: dayjs(d).format('DD MMM'),
    value: dailyMap.get(d) || 0,
    date: d,
  }));

  // C. Category Distribution
  const catSql = `
    SELECT 
      COALESCE(category,'Uncategorized') AS category, 
      COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS value, 
      COUNT(*) AS cnt
    FROM transactions
    WHERE user_id = ? AND date >= ? AND date <= ? AND deleted_at IS NULL
    GROUP BY COALESCE(category,'Uncategorized')
    ORDER BY value DESC
    LIMIT 8;
  `;
  const [, catRes] = await executeSqlAsync(catSql, [userId, startIso, endIso]);
  const pie = [] as { name: string; value: number; count: number }[];
  for (let i = 0; i < catRes.rows.length; i++) {
    const r: any = catRes.rows.item(i) || {};
    pie.push({
      name: r.category || 'Uncategorized',
      value: Number(r.value || 0),
      count: Number(r.cnt || 0),
    });
  }

  const daysCount = Math.max(1, days.length);
  const avgPerDay = daysCount > 0 ? Number(totalOut) / daysCount : 0;
  const savingsRate = totalIn > 0 ? ((totalIn - totalOut) / totalIn) * 100 : 0;

  return {
    totalIn,
    totalOut,
    net: totalIn - totalOut,
    count,
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
};

/**
 * ------------------------------------------------------------------
 * 2. PRECOMPUTED SUMMARIES READER
 * ------------------------------------------------------------------
 */
export const readPrecomputedDaily = async (
  userId: string,
  start: dayjs.Dayjs,
  end: dayjs.Dayjs
) => {
  if (!userId) return null;
  try {
    const srows: any = await getSummaries(
      'daily',
      start.format('YYYY-MM-DD'),
      end.format('YYYY-MM-DD')
    );

    const summaryMap = new Map<string, any>();
    (srows || []).forEach((r: any) => {
      const d = dayjs(r.date).format('YYYY-MM-DD');
      // Handle potential casing diffs (DB is snake_case)
      summaryMap.set(d, {
        date: d,
        total_in: Number(r.total_in ?? r.totalIn ?? 0),
        total_out: Number(r.total_out ?? r.totalOut ?? 0),
        count: Number(r.count ?? 0),
      });
    });

    const days: string[] = [];
    let cur = start.startOf('day');
    const last = end.startOf('day');
    while (cur.isSameOrBefore(last)) {
      days.push(cur.format('YYYY-MM-DD'));
      cur = cur.add(1, 'day');
    }

    const missing = days.filter((d) => !summaryMap.has(d));
    let filledMap = new Map(summaryMap);

    // Backfill missing days from Remote DB if needed
    if (missing.length > 0) {
      try {
        const reachable = await checkNeonConnection(1000);
        if (reachable) {
          const { query } = require('../api/neonClient');
          const rows = await query(
            `SELECT date::date AS date, 
                    COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0) AS total_in, 
                    COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS total_out, 
                    COUNT(*)::int AS count
             FROM transactions
             WHERE user_id = $1 AND date::date >= $2::date AND date::date <= $3::date AND deleted_at IS NULL
             GROUP BY date::date`,
            [userId, start.format('YYYY-MM-DD'), end.format('YYYY-MM-DD')]
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
        }
      } catch (e) {
        console.warn('Failed to backfill missing daily summaries from entries', e);
      }
    }

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

/**
 * ------------------------------------------------------------------
 * 3. MAIN AGGREGATOR
 * ------------------------------------------------------------------
 */
export const aggregateWithPreferSummary = async (
  userId: string | undefined,
  start: dayjs.Dayjs,
  end: dayjs.Dayjs,
  opts?: { signal?: AbortSignal; cacheBuster?: string | number }
): Promise<StatResult> => {
  if (!userId) {
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
  }

  // 1. Check Cache
  const key = cacheKey(userId, start, end, opts?.cacheBuster);
  const cached = AGG_CACHE.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.value;

  // 2. Try Precomputed Summaries (Daily)
  const pre = await readPrecomputedDaily(userId, start, end);
  if (pre && pre.length > 0) {
    const totalOut = pre.reduce((s: number, p: any) => s + (Number(p.out || 0) || 0), 0);
    const totalIn = pre.reduce((s: number, p: any) => s + (Number(p.in || 0) || 0), 0);

    const dailyTrend = pre
      .slice()
      .sort((a: any, b: any) => (a.date > b.date ? 1 : -1))
      .map((p: any) => ({
        label: dayjs(p.date).format('DD MMM'),
        value: Number(p.out || 0),
        date: String(p.date),
      }));

    // 3. Fetch "Extras" (Categories & Max/Min)
    // summaries don't have these, so we need a separate query
    let pie: { name: string; value: number; count: number }[] = [];
    let maxIncome = 0;
    let maxExpense = 0;

    let neonReachable = false;
    try {
      neonReachable = await checkNeonConnection(1500);
    } catch (e) {}

    if (neonReachable) {
      // REMOTE QUERY
      try {
        const { query } = require('../api/neonClient');
        const [catRows, statsRows] = await Promise.all([
          query(
            `SELECT COALESCE(category,'Uncategorized') AS category, 
                    COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS value, 
                    COUNT(*)::int AS cnt
             FROM transactions
             WHERE user_id = $1 AND date::date >= $2::date AND date::date <= $3::date AND deleted_at IS NULL
             GROUP BY COALESCE(category,'Uncategorized') ORDER BY value DESC LIMIT 8`,
            [userId, start.format('YYYY-MM-DD'), end.format('YYYY-MM-DD')]
          ),
          query(
            `SELECT COALESCE(MAX(CASE WHEN type='income' THEN amount END),0) AS max_in, 
                    COALESCE(MAX(CASE WHEN type='expense' THEN amount END),0) AS max_out
             FROM transactions
             WHERE user_id = $1 AND date::date >= $2::date AND date::date <= $3::date AND deleted_at IS NULL`,
            [userId, start.format('YYYY-MM-DD'), end.format('YYYY-MM-DD')]
          ),
        ]);

        pie = (catRows || []).map((r: any) => ({
          name: r.category,
          value: Number(r.value || 0),
          count: Number(r.cnt || 0),
        }));
        maxIncome = Number(statsRows?.[0]?.max_in || 0);
        maxExpense = Number(statsRows?.[0]?.max_out || 0);
      } catch (e) {
        console.warn('Remote details fetch failed, falling back to local', e);
        // Force fallback logic below to run if this part failed
        neonReachable = false;
      }
    }

    if (!neonReachable) {
      // LOCAL FALLBACK for Extras
      try {
        const startIso = start.startOf('day').toISOString();
        const endIso = end.endOf('day').toISOString();

        const catSql = `
          SELECT COALESCE(category,'Uncategorized') AS category, 
                 COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS value, 
                 COUNT(*) AS cnt
          FROM transactions
          WHERE user_id = ? AND date >= ? AND date <= ? AND deleted_at IS NULL
          GROUP BY COALESCE(category,'Uncategorized') ORDER BY value DESC LIMIT 8;`;
        const [, catLocal] = await executeSqlAsync(catSql, [userId, startIso, endIso]);

        pie = [];
        for (let i = 0; i < catLocal.rows.length; i++) {
          const r: any = catLocal.rows.item(i) || {};
          pie.push({
            name: r.category || 'Uncategorized',
            value: Number(r.value || 0),
            count: Number(r.cnt || 0),
          });
        }

        const statsSql = `
          SELECT COALESCE(MAX(CASE WHEN type='income' THEN amount END),0) AS max_in,
                 COALESCE(MAX(CASE WHEN type='expense' THEN amount END),0) AS max_out
          FROM transactions
          WHERE user_id = ? AND date >= ? AND date <= ? AND deleted_at IS NULL;`;
        const [, statsLocal] = await executeSqlAsync(statsSql, [userId, startIso, endIso]);
        const srow = statsLocal.rows.length ? statsLocal.rows.item(0) : null;
        maxIncome = Number(srow?.max_in || 0);
        maxExpense = Number(srow?.max_out || 0);
      } catch (e) {
        console.warn('Local category/stats fallback failed', e);
      }
    }

    // Derived Stats
    const daysCount = Math.max(1, end.diff(start, 'day') + 1);
    const avgPerDay = daysCount > 0 ? Number(totalOut) / daysCount : 0;
    const savingsRate = totalIn > 0 ? ((totalIn - totalOut) / totalIn) * 100 : 0;

    const result = {
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

    AGG_CACHE.set(key, { ts: Date.now(), value: result });
    return result;
  }

  // 4. Fallback: Full Aggregation
  try {
    const health = getNeonHealth();
    // If not configured, immediately use local
    if (!health.isConfigured) {
      return await aggregateLocally(userId, start, end);
    }
    // If configured but unreachable, use local
    const reachable = await checkNeonConnection(2000);
    if (!reachable) {
      return await aggregateLocally(userId, start, end);
    }
  } catch (e) {
    return await aggregateLocally(userId, start, end);
  }

  // If we reach here, Neon is reachable but we don't have precomputed summaries.
  // Use streaming generator for potentially large datasets.
  const pages = fetchEntriesGenerator(userId, 500);
  if (pages) {
    if (opts?.signal) {
      return asyncAggregator.aggregateFromPages(pages, start, end, { signal: opts.signal });
    }
    return asyncAggregator.aggregateFromPages(pages, start, end);
  }

  // Final fallback
  return await aggregateLocally(userId, start, end);
};

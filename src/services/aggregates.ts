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

// Cache Neon reachability briefly to avoid repeated network checks when
// users quickly switch filters on the Analytics screen.
let NEON_REACHABLE_CACHE: { ts: number; ok: boolean } | null = null;
const NEON_REACHABLE_CACHE_MS = 5000;

const getNeonReachableCached = async (timeoutMs: number) => {
  const now = Date.now();
  if (NEON_REACHABLE_CACHE && now - NEON_REACHABLE_CACHE.ts < NEON_REACHABLE_CACHE_MS) {
    return NEON_REACHABLE_CACHE.ok;
  }
  let ok = false;
  try {
    ok = await checkNeonConnection(timeoutMs);
  } catch (e) {
    ok = false;
  }
  NEON_REACHABLE_CACHE = { ts: now, ok };
  return ok;
};

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
  const totalDays = Math.abs(end.diff(start, 'day'));
  const bucketFmt = totalDays > 1095 ? '%Y' : totalDays > 60 ? '%Y-%m' : '%Y-%m-%d';
  const bucketUnit: 'year' | 'month' | 'day' =
    totalDays > 1095 ? 'year' : totalDays > 60 ? 'month' : 'day';

  // IMPORTANT:
  // We group and filter by the user's *local day* so Analytics matches what the
  // user sees on screen (not UTC day boundaries).
  const startKey = start.startOf('day').format('YYYY-MM-DD');
  const endKey = end.endOf('day').format('YYYY-MM-DD');

  const localDayExpr = "strftime('%Y-%m-%d', COALESCE(date, created_at), 'localtime')";

  // A. Totals & Extremes
  const totalSql = `
    SELECT
      COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0) AS total_in,
      COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS total_out,
      COALESCE(MAX(CASE WHEN type='income' THEN amount END),0) AS max_in,
      COALESCE(MAX(CASE WHEN type='expense' THEN amount END),0) AS max_out,
      COUNT(*) AS cnt
    FROM transactions
    WHERE user_id = ?
      AND deleted_at IS NULL
      AND ${localDayExpr} >= ?
      AND ${localDayExpr} <= ?;
  `;

  const [, totalRes] = await executeSqlAsync(totalSql, [userId, startKey, endKey]);
  const totalRow = totalRes.rows.length ? totalRes.rows.item(0) : null;

  const totalIn = Number(totalRow?.total_in || 0);
  const totalOut = Number(totalRow?.total_out || 0);
  const maxIncome = Number(totalRow?.max_in || 0);
  const maxExpense = Number(totalRow?.max_out || 0);
  const count = Number(totalRow?.cnt || 0);

  // B. Trend (Adaptive Bucketing)
  const bucketExpr = `strftime('${bucketFmt}', COALESCE(date, created_at), 'localtime')`;
  const trendSql = `
    SELECT ${bucketExpr} as b,
           COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS total_out
    FROM transactions
    WHERE user_id = ?
      AND deleted_at IS NULL
      AND ${localDayExpr} >= ?
      AND ${localDayExpr} <= ?
    GROUP BY ${bucketExpr}
    ORDER BY ${bucketExpr};
  `;
  const [, trendRes] = await executeSqlAsync(trendSql, [userId, startKey, endKey]);
  const trendMap = new Map<string, number>();
  for (let i = 0; i < trendRes.rows.length; i++) {
    const r: any = trendRes.rows.item(i) || {};
    trendMap.set(String(r.b || ''), Number(r.total_out || 0));
  }

  // Fill gaps at the chosen bucket granularity
  const buckets: string[] = [];
  let cur = start.startOf(bucketUnit);
  const last = end.startOf(bucketUnit);
  while (cur.isSameOrBefore(last)) {
    if (bucketUnit === 'year') buckets.push(cur.format('YYYY'));
    else if (bucketUnit === 'month') buckets.push(cur.format('YYYY-MM'));
    else buckets.push(cur.format('YYYY-MM-DD'));
    cur = cur.add(1, bucketUnit);
  }

  const dailyTrend = buckets.map((b) => ({
    label:
      bucketUnit === 'year'
        ? dayjs(b).format('YYYY')
        : bucketUnit === 'month'
          ? dayjs(`${b}-01`).format('MMM YY')
          : dayjs(b).format('DD MMM'),
    value: trendMap.get(b) || 0,
    date: b,
  }));

  // C. Category Distribution
  const catSql = `
    SELECT 
      COALESCE(category,'Uncategorized') AS category, 
      COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS value, 
      COUNT(*) AS cnt
    FROM transactions
    WHERE user_id = ?
      AND deleted_at IS NULL
      AND ${localDayExpr} >= ?
      AND ${localDayExpr} <= ?
    GROUP BY COALESCE(category,'Uncategorized')
    ORDER BY value DESC
    LIMIT 8;
  `;
  const [, catRes] = await executeSqlAsync(catSql, [userId, startKey, endKey]);
  const pie = [] as { name: string; value: number; count: number }[];
  for (let i = 0; i < catRes.rows.length; i++) {
    const r: any = catRes.rows.item(i) || {};
    pie.push({
      name: r.category || 'Uncategorized',
      value: Number(r.value || 0),
      count: Number(r.cnt || 0),
    });
  }

  const daysCount = Math.max(1, end.diff(start, 'day') + 1);
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
    savingsRate,
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
  end: dayjs.Dayjs,
  opts?: { allowRemote?: boolean }
) => {
  if (!userId) return null;

  // Offline-first: do not attempt any remote summary reads unless explicitly allowed.
  if (opts && opts.allowRemote === false) return null;

  // If Neon isn't configured or is likely unreachable, avoid remote calls entirely.
  try {
    const health = getNeonHealth();
    if (!health?.isConfigured) return null;
    // If the circuit is open, avoid even a probe.
    if (health?.circuitOpenUntil && health.circuitOpenUntil > Date.now()) return null;
    const reachable = await getNeonReachableCached(800);
    if (!reachable) return null;
  } catch (e) {
    return null;
  }

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
        const reachable = await getNeonReachableCached(1000);
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
  opts?: { signal?: AbortSignal; cacheBuster?: string | number; allowRemote?: boolean }
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

  const allowRemote = opts?.allowRemote !== false;

  // 2. Try Precomputed Summaries (Daily)
  const pre = await readPrecomputedDaily(userId, start, end, { allowRemote });
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
    if (allowRemote) {
      try {
        neonReachable = await getNeonReachableCached(1500);
      } catch (e) {}
    }

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
        const startKey = start.startOf('day').format('YYYY-MM-DD');
        const endKey = end.endOf('day').format('YYYY-MM-DD');
        const localDayExpr = "strftime('%Y-%m-%d', COALESCE(date, created_at), 'localtime')";

        const catSql = `
          SELECT COALESCE(category,'Uncategorized') AS category, 
                 COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS value, 
                 COUNT(*) AS cnt
          FROM transactions
          WHERE user_id = ?
            AND deleted_at IS NULL
            AND ${localDayExpr} >= ?
            AND ${localDayExpr} <= ?
          GROUP BY COALESCE(category,'Uncategorized') ORDER BY value DESC LIMIT 8;`;
        const [, catLocal] = await executeSqlAsync(catSql, [userId, startKey, endKey]);

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
          WHERE user_id = ?
            AND deleted_at IS NULL
            AND ${localDayExpr} >= ?
            AND ${localDayExpr} <= ?;`;
        const [, statsLocal] = await executeSqlAsync(statsSql, [userId, startKey, endKey]);
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
      savingsRate,
    } as StatResult;

    AGG_CACHE.set(key, { ts: Date.now(), value: result });
    return result;
  }

  // 4. Fallback: Full Aggregation
  try {
    const health = getNeonHealth();

    // Offline-first: if remote isn't allowed (or we're offline), skip all Neon probing.
    if (!allowRemote) {
      return await aggregateLocally(userId, start, end);
    }

    // If not configured, immediately use local
    if (!health.isConfigured) {
      return await aggregateLocally(userId, start, end);
    }
    // If configured but unreachable, use local
    const reachable = await getNeonReachableCached(2000);
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

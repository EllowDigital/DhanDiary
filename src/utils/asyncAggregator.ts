import dayjs from 'dayjs';
import { LocalEntry } from '../types/entries';

// --- CONFIGURATION ---
const BATCH_SIZE = 4000; // Increased batch size for modern phones
const STAT_SAMPLES = 10000;
const NUM_REGEX = /[^0-9.-]/g;

// --- TYPES ---
export interface AggregationOptions {
  signal?: AbortSignal;
  currency?: string;
  includeErrors?: boolean;
}

export interface StatResult {
  totalIn: number;
  totalOut: number;
  net: number;
  count: number;
  skipped: number;
  mean: number;
  median: number;
  stddev: number;
  maxIncome: number;
  maxExpense: number;
  currency: string;
  detectedCurrencies: string[];
  dailyTrend: { label: string; value: number; date: string }[];
  pieData: { name: string; value: number; count: number }[];
  errors?: string[];
}

// --- UTILS ---
const yieldToUI = () =>
  new Promise<void>((resolve) => {
    // Avoid referencing `setImmediate` as a bare identifier to satisfy ESLint `no-undef`.
    const g: any = typeof globalThis !== 'undefined' ? globalThis : {};
    if (g && typeof g.setImmediate === 'function') return g.setImmediate(resolve);
    if (typeof MessageChannel !== 'undefined') {
      const mc = new MessageChannel();
      mc.port1.onmessage = () => resolve();
      mc.port2.postMessage(0);
      return;
    }
    setTimeout(resolve, 0);
  });

/**
 * High-performance parser that avoids DayJS overhead in hot loops
 */
const fastUnix = (dateInput: string | number | Date | any): number | null => {
  if (!dateInput) return null;
  if (typeof dateInput === 'number') return dateInput; // Already timestamp
  if (dateInput instanceof Date) return dateInput.getTime() / 1000;

  // Try native date parse (much faster than dayjs)
  const native = Date.parse(dateInput);
  if (!isNaN(native)) return native / 1000;

  // Fallback to dayjs for complex strings
  const d = dayjs(dateInput);
  return d.isValid() ? d.unix() : null;
};

// --- CORE ENGINE ---
class AnalyticsCore {
  // Financials (stored as BigInt cents to prevent floating point errors)
  private totalIn = 0n;
  private totalOut = 0n;
  private maxIn = 0n;
  private maxOut = 0n;

  // Stats
  private count = 0;
  private skipped = 0;
  private mean = 0;
  private m2 = 0; // For Welford's Variance
  private seen = 0;
  private samples = new Float64Array(STAT_SAMPLES);

  // Aggregators
  private categoryMap = new Map<string, { val: bigint; count: number }>();
  private bucketMap = new Map<string, bigint>();
  private detectedCurrencies = new Set<string>();
  private errors: string[] = [];

  // Config
  private startUnix: number;
  private endUnix: number;
  private bucketFormat: string;
  private startDate: dayjs.Dayjs;
  private endDate: dayjs.Dayjs;
  private targetCurrency: string;

  constructor(rangeStart: dayjs.Dayjs, rangeEnd: dayjs.Dayjs, targetCurrency = 'INR') {
    this.startDate = rangeStart;
    this.endDate = rangeEnd;
    this.startUnix = rangeStart.unix();
    this.endUnix = rangeEnd.unix();
    this.targetCurrency = targetCurrency;

    const totalDays = Math.abs(rangeEnd.diff(rangeStart, 'day'));

    // Adaptive Bucketing
    if (totalDays > 1095)
      this.bucketFormat = 'YYYY'; // > 3 Years
    else if (totalDays > 60)
      this.bucketFormat = 'YYYY-MM'; // > 2 Months
    else this.bucketFormat = 'YYYY-MM-DD'; // Default
  }

  process(e: LocalEntry) {
    try {
      // 1. Validate Time
      const unix = fastUnix(e.date || e.created_at);
      if (!unix || unix < this.startUnix || unix > this.endUnix) return;

      // 2. Validate Amount
      let rawVal = typeof e.amount === 'number' ? e.amount : 0;
      if (typeof e.amount === 'string') {
        const cleaned = parseFloat((e.amount as string).replace(NUM_REGEX, ''));
        if (!isNaN(cleaned)) rawVal = cleaned;
      }

      // Skip zero-value transactions if they aren't relevant (optional)
      // if (rawVal === 0) return;

      const cents = BigInt(Math.round(Math.abs(rawVal) * 100));

      // 3. Currency Check
      if (e.currency) {
        this.detectedCurrencies.add(e.currency);
        // Note: Real FX conversion would happen here.
        // For now, we assume 1:1 if currency matches or if it's the first one found.
        if (this.detectedCurrencies.size === 1) this.targetCurrency = e.currency;
      }

      this.count++;

      // 4. Statistics (Reservoir Sampling)
      this.seen++;
      if (this.seen <= STAT_SAMPLES) {
        this.samples[this.seen - 1] = rawVal;
      } else {
        const idx = Math.floor(Math.random() * this.seen);
        if (idx < STAT_SAMPLES) this.samples[idx] = rawVal;
      }

      // 5. Standard Deviation (Welford's Algorithm)
      const delta = rawVal - this.mean;
      this.mean += delta / this.count;
      this.m2 += delta * (rawVal - this.mean);

      // 6. Categorization
      const cat = e.category || 'Uncategorized';
      const catData = this.categoryMap.get(cat) || { val: 0n, count: 0 };
      catData.val += cents;
      catData.count += 1;
      this.categoryMap.set(cat, catData);

      // 7. Bucketing (Optimized Date Formatting)
      // We only convert back to DayJS object here, as it's needed for the format string.
      // Optimization: You could use native Intl.DateTimeFormat here for more speed,
      // but keeping dayjs for consistency with 'YYYY-MM' logic.
      const bucketKey = dayjs.unix(unix).format(this.bucketFormat);

      if (e.type === 'in') {
        this.totalIn += cents;
        if (cents > this.maxIn) this.maxIn = cents;
      } else {
        // We only chart expenses usually
        this.totalOut += cents;
        if (cents > this.maxOut) this.maxOut = cents;
        this.bucketMap.set(bucketKey, (this.bucketMap.get(bucketKey) || 0n) + cents);
      }
    } catch (err: any) {
      this.skipped++;
      if (this.errors.length < 20) this.errors.push(`ID ${e.id}: ${err.message}`);
    }
  }

  finalize(): StatResult {
    // 1. Median Calculation
    const validSamples = this.samples.subarray(0, Math.min(this.seen, STAT_SAMPLES)).sort();
    const mid = Math.floor(validSamples.length / 2);
    const median = validSamples.length
      ? validSamples.length % 2 !== 0
        ? validSamples[mid]
        : (validSamples[mid - 1] + validSamples[mid]) / 2
      : 0;

    // 2. Pie Data Sort
    const pieData = Array.from(this.categoryMap.entries())
      .map(([name, data]) => ({
        name,
        value: Number(data.val) / 100,
        count: data.count,
      }))
      .sort((a, b) => b.value - a.value);

    // 3. Gap Filling (Robust Trend)
    // We iterate from Start to End and ensure every bucket exists.
    const trend = [];
    let current = this.startDate;
    const unit =
      this.bucketFormat === 'YYYY' ? 'year' : this.bucketFormat === 'YYYY-MM' ? 'month' : 'day';

    // Safety: prevent infinite loop if dates are messed up
    let safetyCounter = 0;
    while (
      (current.isBefore(this.endDate) || current.isSame(this.endDate, unit)) &&
      safetyCounter < 1000
    ) {
      const key = current.format(this.bucketFormat);
      const val = this.bucketMap.get(key) || 0n;

      trend.push({
        label: this.formatLabel(current),
        date: key, // Keep ISO-like key for sorting if needed later
        value: Number(val) / 100,
      });

      current = current.add(1, unit);
      safetyCounter++;
    }

    // 4. Cleanup to help GC
    this.categoryMap.clear();
    this.bucketMap.clear();

    return {
      totalIn: Number(this.totalIn) / 100,
      totalOut: Number(this.totalOut) / 100,
      net: Number(this.totalIn - this.totalOut) / 100,
      count: this.count,
      skipped: this.skipped,
      mean: this.mean,
      median,
      stddev: Math.sqrt(this.count > 1 ? this.m2 / (this.count - 1) : 0),
      maxIncome: Number(this.maxIn) / 100,
      maxExpense: Number(this.maxOut) / 100,
      currency: this.targetCurrency,
      detectedCurrencies: Array.from(this.detectedCurrencies),
      dailyTrend: trend,
      pieData: pieData,
      errors: this.errors.length > 0 ? this.errors : undefined,
    };
  }

  private formatLabel(date: dayjs.Dayjs): string {
    if (this.bucketFormat === 'YYYY') return date.format('YYYY');
    if (this.bucketFormat === 'YYYY-MM') return date.format('MMM YY');
    return date.format('DD MMM');
  }
}

// --- PUBLIC API ---

export const aggregateForRange = async (
  entries: LocalEntry[],
  start: dayjs.Dayjs,
  end: dayjs.Dayjs,
  opts?: AggregationOptions
): Promise<StatResult> => {
  const engine = new AnalyticsCore(start, end, opts?.currency);

  if (!entries || entries.length === 0) return engine.finalize();

  // Process in chunks to prevent JS thread blocking
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    if (opts?.signal?.aborted) throw new Error('Aborted');

    // Process chunk synchronously for speed
    const endIdx = Math.min(i + BATCH_SIZE, entries.length);
    for (let j = i; j < endIdx; j++) {
      engine.process(entries[j]);
    }

    // Yield to UI thread every batch
    await yieldToUI();
  }

  return engine.finalize();
};

export const aggregateFromPages = async (
  pages: AsyncIterable<LocalEntry[]>,
  start: dayjs.Dayjs,
  end: dayjs.Dayjs,
  opts?: AggregationOptions
): Promise<StatResult> => {
  const engine = new AnalyticsCore(start, end, opts?.currency);

  for await (const page of pages) {
    if (opts?.signal?.aborted) throw new Error('Aborted');

    // Process entire page
    for (const item of page) {
      engine.process(item);
    }

    // Yield after every page fetch
    await yieldToUI();
  }

  return engine.finalize();
};

export default { aggregateForRange, aggregateFromPages };

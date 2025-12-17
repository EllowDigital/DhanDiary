import dayjs from 'dayjs';
import { LocalEntry } from '../types/entries';

const BATCH_SIZE = 3000;
const STAT_SAMPLES = 15000;
const NUM_REGEX = /[^0-9.-]/g;

// Safe non-blocking yield
const yieldToUI = () =>
  new Promise<void>((resolve) => {
    if (typeof setImmediate === 'function') setImmediate(resolve);
    else setTimeout(resolve, 0);
  });

class AnalyticsCore {
  totalIn = 0n;
  totalOut = 0n;
  count = 0;
  mean = 0;
  m2 = 0;
  maxIn = 0n;
  maxOut = 0n;
  categoryMap = new Map<string, bigint>();
  dayMap = new Map<string, bigint>();
  samples = new Float64Array(STAT_SAMPLES);
  seen = 0;
  currency = 'INR';

  // New: Track which bucket format we are using
  bucketFormat: string;

  constructor(rangeStart: dayjs.Dayjs, totalDays: number) {
    // CRASH FIX: Aggressive Bucketing
    // If > 3 years (1095 days), group by YEAR (e.g., "2023", "2024")
    // If > 3 months (90 days), group by MONTH (e.g., "Jan 2024")
    // Else, group by DAY (e.g., "01 Jan")
    if (totalDays > 1095) {
      this.bucketFormat = 'YYYY';
    } else if (totalDays > 90) {
      this.bucketFormat = 'YYYY-MM';
    } else {
      this.bucketFormat = 'YYYY-MM-DD';
    }

    // Pre-fill buckets to ensure chart continuity (no gaps)
    let current = rangeStart;
    const unit =
      this.bucketFormat === 'YYYY' ? 'year' : this.bucketFormat === 'YYYY-MM' ? 'month' : 'day';

    // Safety cap: Don't pre-fill more than 50 buckets to save memory
    // The chart will just show gaps if they exist, which is safer than OOM
    for (let i = 0; i < 50; i++) {
      const key = current.format(this.bucketFormat);
      this.dayMap.set(key, 0n);
      current = current.add(1, unit);
      if (current.isAfter(dayjs())) break; // Don't project into future
    }
  }

  process(e: LocalEntry, sU: number, eU: number) {
    if (!e) return;
    const d = dayjs(e.date || e.created_at);
    const dU = d.unix();
    if (!d.isValid() || dU < sU || dU > eU) return;

    if (e.currency && this.count === 0) this.currency = e.currency;

    let rawVal =
      typeof e.amount === 'number'
        ? e.amount
        : parseFloat(String(e.amount).replace(NUM_REGEX, '')) || 0;
    const cents = BigInt(Math.round(rawVal * 100));
    this.count++;

    // Statistics
    this.seen++;
    if (this.seen <= STAT_SAMPLES) this.samples[this.seen - 1] = rawVal;
    else {
      const idx = Math.floor(Math.random() * this.seen);
      if (idx < STAT_SAMPLES) this.samples[idx] = rawVal;
    }

    const delta = rawVal - this.mean;
    this.mean += delta / this.count;
    this.m2 += delta * (rawVal - this.mean);

    // Maps
    const cat = e.category || 'General';
    this.categoryMap.set(cat, (this.categoryMap.get(cat) || 0n) + cents);

    if (e.type === 'in') {
      this.totalIn += cents;
      if (cents > this.maxIn) this.maxIn = cents;
    } else {
      this.totalOut += cents;
      if (cents > this.maxOut) this.maxOut = cents;

      // Dynamic Bucket Key
      const key = d.format(this.bucketFormat);
      // We set directly; pre-filling handled most keys, this catches outliers
      this.dayMap.set(key, (this.dayMap.get(key) || 0n) + cents);
    }
  }

  finalize() {
    const validSamples = this.samples.subarray(0, Math.min(this.seen, STAT_SAMPLES)).sort();
    const mid = Math.floor(validSamples.length / 2);
    const median = validSamples.length
      ? validSamples.length % 2 !== 0
        ? validSamples[mid]
        : (validSamples[mid - 1] + validSamples[mid]) / 2
      : 0;

    const sortedCategories = Array.from(this.categoryMap.entries())
      .map(([name, v]) => ({ name, value: Number(v) / 100 }))
      .sort((a, b) => b.value - a.value);

    // Sort Trend Chronologically
    const sortedTrend = Array.from(this.dayMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, v]) => ({ label, value: Number(v) / 100 }));

    return {
      totalIn: this.totalIn,
      totalOut: this.totalOut,
      net: this.totalIn - this.totalOut,
      count: this.count,
      mean: this.mean,
      median,
      stddev: Math.sqrt(this.count > 1 ? this.m2 / (this.count - 1) : 0),
      maxIncome: Number(this.maxIn) / 100,
      maxExpense: Number(this.maxOut) / 100,
      currency: this.currency,
      dailyTrend: sortedTrend,
      pieData: sortedCategories,
    };
  }
}

export const aggregateForRange = async (
  entries: LocalEntry[],
  start: dayjs.Dayjs,
  end: dayjs.Dayjs,
  opts?: any
) => {
  const engine = new AnalyticsCore(start, Math.max(1, end.diff(start, 'day') + 1));
  if (!entries?.length) return engine.finalize();
  const sU = start.unix();
  const eU = end.unix();

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    if (opts?.signal?.aborted) throw new Error('Aborted');
    for (let j = i; j < Math.min(i + BATCH_SIZE, entries.length); j++)
      engine.process(entries[j], sU, eU);
    await yieldToUI();
  }
  return engine.finalize();
};

export const aggregateFromPages = async (
  pages: AsyncIterable<LocalEntry[]>,
  start: dayjs.Dayjs,
  end: dayjs.Dayjs,
  opts?: any
) => {
  const engine = new AnalyticsCore(start, Math.max(1, end.diff(start, 'day') + 1));
  const sU = start.unix();
  const eU = end.unix();
  for await (const page of pages) {
    if (opts?.signal?.aborted) break;
    for (const item of page) engine.process(item, sU, eU);
    await yieldToUI();
  }
  return engine.finalize();
};

export default { aggregateForRange, aggregateFromPages };

import dayjs from 'dayjs';
import { LocalEntry } from '../types/entries';

const BATCH_SIZE = 3000;
const STAT_SAMPLES = 20000;
const NUM_REGEX = /[^0-9.-]/g;

// Optimized thread yielding
const yieldToUI = () => new Promise<void>((resolve) => {
  if (typeof setImmediate === 'function') setImmediate(resolve);
  else setTimeout(resolve, 0);
});

class AnalyticsCore {
  totalIn = 0n; totalOut = 0n; count = 0;
  maxIn = 0n; maxOut = 0n;
  
  // Track actual data range found
  minUnix = Infinity;
  maxUnix = -Infinity;

  categoryMap = new Map<string, bigint>();
  dayMap = new Map<string, bigint>();
  samples = new Float64Array(STAT_SAMPLES);
  seen = 0; currency = 'INR';

  constructor(rangeStart: dayjs.Dayjs, totalDays: number) {
    const isArchiveScale = totalDays > 366;
    for (let i = 0; i < totalDays; i++) {
      const d = rangeStart.add(i, 'day');
      const key = isArchiveScale ? d.format('YYYY-MM') : d.format('YYYY-MM-DD');
      if (!this.dayMap.has(key)) this.dayMap.set(key, 0n);
    }
  }

  process(e: LocalEntry, sU: number, eU: number) {
    if (!e) return;
    const entryDate = e.date || e.created_at;
    const d = dayjs(entryDate);
    const dU = d.unix();

    if (!d.isValid() || dU < sU || dU > eU) return;

    // Track actual range
    if (dU < this.minUnix) this.minUnix = dU;
    if (dU > this.maxUnix) this.maxUnix = dU;

    if (e.currency && this.count === 0) this.currency = e.currency;

    let rawVal = 0;
    try {
      if (typeof e.amount === 'number') rawVal = e.amount;
      else rawVal = parseFloat(String(e.amount).replace(NUM_REGEX, '')) || 0;
    } catch { rawVal = 0; }

    const cents = BigInt(Math.round(rawVal * 100));
    this.count++;

    // Reservoir Sampling
    this.seen++;
    if (this.seen <= STAT_SAMPLES) this.samples[this.seen - 1] = rawVal;
    else {
      const idx = Math.floor(Math.random() * this.seen);
      if (idx < STAT_SAMPLES) this.samples[idx] = rawVal;
    }

    // Categorization
    const cat = e.category || 'General';
    this.categoryMap.set(cat, (this.categoryMap.get(cat) || 0n) + cents);

    // Totals
    if (e.type === 'in') {
      this.totalIn += cents;
      if (cents > this.maxIn) this.maxIn = cents;
    } else {
      this.totalOut += cents;
      if (cents > this.maxOut) this.maxOut = cents;
      const key = this.dayMap.size > 366 ? d.format('YYYY-MM') : d.format('YYYY-MM-DD');
      if (this.dayMap.has(key)) this.dayMap.set(key, (this.dayMap.get(key) || 0n) + cents);
    }
  }

  finalize() {
    // Sort Samples
    const validSamples = this.samples.subarray(0, Math.min(this.seen, STAT_SAMPLES)).sort();
    
    // Sort Categories
    const sortedCategories = Array.from(this.categoryMap.entries())
      .map(([name, v]) => ({ name, value: Number(v) / 100 }))
      .sort((a, b) => b.value - a.value);

    // Sort Trend
    const sortedTrend = Array.from(this.dayMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, v]) => ({ label, value: Number(v) / 100 }));

    return {
      totalIn: this.totalIn,
      totalOut: this.totalOut,
      net: this.totalIn - this.totalOut,
      count: this.count,
      maxIncome: Number(this.maxIn) / 100,
      maxExpense: Number(this.maxOut) / 100,
      currency: this.currency,
      dailyTrend: sortedTrend,
      pieData: sortedCategories,
      // Return the actual date range found in the data
      dateRange: {
        start: this.minUnix !== Infinity ? this.minUnix : null,
        end: this.maxUnix !== -Infinity ? this.maxUnix : null
      }
    };
  }
}

// ... (aggregateForRange and aggregateFromPages remain similar, just using the new class) ...

export const aggregateForRange = async (entries: LocalEntry[], start: dayjs.Dayjs, end: dayjs.Dayjs, opts?: any) => {
  const engine = new AnalyticsCore(start, Math.max(1, end.diff(start, 'day') + 1));
  if (!entries?.length) return engine.finalize();
  const sU = start.unix(); const eU = end.unix();

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    if (opts?.signal?.aborted) throw new Error('Aborted');
    const chunkEnd = Math.min(i + BATCH_SIZE, entries.length);
    for (let j = i; j < chunkEnd; j++) engine.process(entries[j], sU, eU);
    await yieldToUI();
  }
  return engine.finalize();
};

export const aggregateFromPages = async (pages: AsyncIterable<LocalEntry[]>, start: dayjs.Dayjs, end: dayjs.Dayjs, opts?: any) => {
  const engine = new AnalyticsCore(start, Math.max(1, end.diff(start, 'day') + 1));
  const sU = start.unix(); const eU = end.unix();
  for await (const page of pages) {
    if (opts?.signal?.aborted) break;
    for (const item of page) engine.process(item, sU, eU);
    await yieldToUI();
  }
  return engine.finalize();
};

export default { aggregateForRange, aggregateFromPages };
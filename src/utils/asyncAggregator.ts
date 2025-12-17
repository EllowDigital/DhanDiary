import dayjs from 'dayjs';

type LocalEntry = {
  amount?: number | string;
  date?: string;
  created_at?: string;
  type?: 'in' | 'out';
  category?: string | null;
  currency?: string;
};

export type TrendPoint = { label: string; value: number };

const CHUNK_SIZE = 2000;

function toCents(amount: number | string | undefined): bigint {
  const n = Number(amount) || 0;
  // Round to 2 decimals then convert to cents
  return BigInt(Math.round(n * 100));
}

function formatCents(bn: bigint): string {
  const negative = bn < 0n;
  const abs = negative ? -bn : bn;
  const units = abs / 100n;
  const cents = abs % 100n;
  // thousands separator for units
  const unitsStr = units.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const centsStr = cents.toString().padStart(2, '0');
  return `${negative ? '-' : ''}${unitsStr}.${centsStr}`;
}

export async function aggregateForRange(
  entries: LocalEntry[],
  rangeStart: dayjs.Dayjs,
  rangeEnd: dayjs.Dayjs
) {
  // chunked processing to avoid blocking the JS thread for long
  let totalIn = 0n;
  let totalOut = 0n;
  let count = 0;

  // For Welford's algorithm (mean & variance)
  let mean = 0;
  let m2 = 0;

  const categoryMap: Record<string, bigint> = {};
  const dayMap = new Map<string, bigint>();
  let maxIn = 0n;
  let maxOut = 0n;

  const rangeDays = rangeEnd.diff(rangeStart, 'day');
  const totalDays = Math.max(1, rangeDays + 1);
  for (let i = 0; i < totalDays; i++) {
    dayMap.set(rangeStart.add(i, 'day').format('YYYY-MM-DD'), 0n);
  }

  // Prepare for median sampling (reservoir sampling) during the same chunked pass
  // Helpers
  const parseNumber = (v: number | string | undefined) => {
    if (v === undefined || v === null) return 0;
    if (typeof v === 'number') return Number(v) || 0;
    try {
      // remove currency symbols, commas, spaces
      const cleaned = String(v).replace(/[^0-9.-]/g, '');
      const n = parseFloat(cleaned);
      return Number.isFinite(n) ? n : 0;
    } catch (err) {
      return 0;
    }
  };

  // If dataset is extremely large, sample a subset to process (avoid OOM / long CPU)
  const LARGE_THRESHOLD = 500000; // entries
  const SAMPLE_PROCESS_LIMIT = 200000; // process at most these many entries when huge
  let entriesToProcess: LocalEntry[] = entries;
  if (entries.length > LARGE_THRESHOLD) {
    // reservoir sample entries that fall within date range
    const sampled: LocalEntry[] = [];
    let seenForSample = 0;
    for (const e of entries) {
      try {
        const d = dayjs(e.date || e.created_at);
        if (!d.isValid()) continue;
        if (d.isBefore(rangeStart) || d.isAfter(rangeEnd)) continue;
        seenForSample++;
        if (sampled.length < SAMPLE_PROCESS_LIMIT) sampled.push(e);
        else {
          const idx = Math.floor(Math.random() * seenForSample);
          if (idx < SAMPLE_PROCESS_LIMIT) sampled[idx] = e;
        }
      } catch (err) {
        // ignore malformed entries
      }
    }
    entriesToProcess = sampled;
  }

  // Prepare for median sampling (reservoir sampling) during the same chunked pass
  const sampleLimit = 100000;
  const samples: number[] = [];
  let seen = 0;

  // adapt chunk size for very large processed set
  const effectiveChunk = entriesToProcess.length > 200000 ? Math.max(500, Math.floor(CHUNK_SIZE / 4)) : CHUNK_SIZE;
  for (let i = 0; i < entriesToProcess.length; i += effectiveChunk) {
    const chunk = entriesToProcess.slice(i, i + effectiveChunk);
    for (const e of chunk) {
      try {
        const d = dayjs(e.date || e.created_at);
        if (!d.isValid()) continue;
        if (d.isBefore(rangeStart) || d.isAfter(rangeEnd)) continue;

        const parsed = parseNumber(e.amount);
        const cents = BigInt(Math.round(parsed * 100));
        count++;

        // Collect samples for median using reservoir sampling during the same pass
        // This avoids a second full scan of entries which can block the JS thread.
        seen++;
        const valForSample = parsed;
        if (samples.length < sampleLimit) {
          samples.push(valForSample);
        } else {
          const idx = Math.floor(Math.random() * seen);
          if (idx < sampleLimit) samples[idx] = valForSample;
        }

        // Welford update using Number for mean/stddev (values are in main currency units)
        const x = Number(cents) / 100; // convert back to units
        const delta = x - mean;
        mean += delta / count;
        m2 += delta * (x - mean);

        if (e.type === 'in') {
          totalIn += cents;
          if (cents > maxIn) maxIn = cents;
        } else {
          totalOut += cents;
          if (cents > maxOut) maxOut = cents;
          // daily map
          const key = d.format('YYYY-MM-DD');
          if (dayMap.has(key)) dayMap.set(key, dayMap.get(key)! + cents);
        }

        const cat = e.category || 'General';
        categoryMap[cat] = (categoryMap[cat] || 0n) + cents;
      } catch (err) {
        // ignore malformed entries and continue processing other entries
        continue;
      }
    }
    // yield to event loop
    await new Promise((r) => setTimeout(r, 0));
  }
  const variance = count > 1 ? m2 / (count - 1) : 0;
  const stddev = Math.sqrt(variance);

  // median: samples were collected during the main loop (reservoir sampling)
  // If dataset was small and we didn't collect any (edge-case), ensure samples array exists
  // `samples` and `seen` are declared below before the loop.
  samples.sort((a, b) => a - b);
  const median = samples.length
    ? samples.length % 2 === 1
      ? samples[(samples.length - 1) / 2]
      : (samples[samples.length / 2 - 1] + samples[samples.length / 2]) / 2
    : 0;

  // dailyTrend convert to numbers
  const labels: string[] = [];
  const values: number[] = [];
  let counter = 0;
  dayMap.forEach((val, key) => {
    labels.push(key);
    values.push(Number(val) / 100);
    counter++;
  });

  // pie data
  const pie = Object.entries(categoryMap)
    .map(([name, v]) => ({ name, value: v }))
    .sort((a, b) => (a.value > b.value ? -1 : 1))
    .map((p) => ({ name: p.name, value: Number(p.value) / 100 }));

  return {
    totalIn,
    totalOut,
    net: totalIn - totalOut,
    count,
    mean,
    median,
    stddev,
    dailyTrend: labels.map((label, i) => ({ label, value: values[i] })),
    pieData: pie,
    topCategories: pie.slice(0, 10),
    maxIncome: Number(maxIn) / 100,
    maxExpense: Number(maxOut) / 100,
    formatCents,
    // currency detection: first entry within range
    currency: (() => {
      for (const e of entries) {
        const d = dayjs(e.date || e.created_at);
        if (!d.isValid()) continue;
        if (d.isBefore(rangeStart) || d.isAfter(rangeEnd)) continue;
        if (e.currency) return e.currency;
      }
      return 'INR';
    })(),
  };
}

export default { aggregateForRange };

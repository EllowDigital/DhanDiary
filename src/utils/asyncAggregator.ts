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

  for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
    const chunk = entries.slice(i, i + CHUNK_SIZE);
    for (const e of chunk) {
      const d = dayjs(e.date || e.created_at);
      if (!d.isValid()) continue;
      if (d.isBefore(rangeStart) || d.isAfter(rangeEnd)) continue;

      const cents = toCents(e.amount);
      count++;

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
    }
    // yield to event loop
    await new Promise((r) => setTimeout(r, 0));
  }

  const variance = count > 1 ? m2 / (count - 1) : 0;
  const stddev = Math.sqrt(variance);

  // median: for large datasets we approximate by sampling up to 100k items
  const sampleLimit = 100000;
  const samples: number[] = [];
  if (entries.length <= sampleLimit) {
    for (const e of entries) {
      const d = dayjs(e.date || e.created_at);
      if (!d.isValid()) continue;
      if (d.isBefore(rangeStart) || d.isAfter(rangeEnd)) continue;
      samples.push(Number(e.amount) || 0);
    }
  } else {
    // reservoir sampling
    let seen = 0;
    for (const e of entries) {
      const d = dayjs(e.date || e.created_at);
      if (!d.isValid()) continue;
      if (d.isBefore(rangeStart) || d.isAfter(rangeEnd)) continue;
      const val = Number(e.amount) || 0;
      seen++;
      if (samples.length < sampleLimit) samples.push(val);
      else {
        const idx = Math.floor(Math.random() * seen);
        if (idx < sampleLimit) samples[idx] = val;
      }
    }
  }
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

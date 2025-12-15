import dayjs from 'dayjs';

type Entry = any;

function escapeCsvCell(value: unknown) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function buildCSV(entries: Entry[], fields: string[]) {
  const out: string[] = [];
  out.push(fields.map(h => escapeCsvCell(h)).join(','));
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const row = fields.map(f => escapeCsvCell(e[f] ?? '')).join(',');
    out.push(row);
  }
  return out.join('\n');
}

export function buildJSON(entries: Entry[], pretty = false) {
  return pretty ? JSON.stringify(entries, null, 2) : JSON.stringify(entries);
}

function summarize(entries: Entry[]) {
  let totalIn = 0;
  let totalOut = 0;
  for (const e of entries) {
    const amt = Number(e.amount) || 0;
    if (e.type === 'in') totalIn += amt;
    else totalOut += amt;
  }
  const count = entries.length;
  const net = totalIn - totalOut;
  const avg = count ? (totalIn + totalOut) / count : 0;
  return { totalIn, totalOut, net, count, avg };
}

function smallStyles() {
  return `
    body{font-family: -apple-system, Roboto, 'Helvetica Neue', Arial; color:#111827;}
    .wrap{max-width:960px;margin:24px auto;padding:20px;background:#fff;border-radius:10px;box-shadow:0 8px 28px rgba(15,23,42,0.06);} 
    header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
    h1{font-size:22px;margin:0;color:#0f172a}
    .meta{color:#6b7280;font-size:12px}
    .summary-cards{display:flex;gap:12px;margin-top:12px}
    .card{flex:1;padding:12px;border-radius:8px;background:#f8fafc}
    .card .label{font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em}
    .card .value{font-size:16px;font-weight:800;margin-top:6px}
    table{width:100%;border-collapse:collapse;margin-top:16px}
    thead th{padding:10px 8px;border-bottom:2px solid #e6eef8;text-align:left;font-size:12px;color:#475569}
    tbody td{padding:10px 8px;border-bottom:1px solid #f3f6fa;font-size:13px;color:#0f172a}
    tr:nth-child(even){background:#fbfcfe}
    td.note{max-width:360px;white-space:pre-wrap;word-break:break-word;color:#374151}
    td.amount{font-weight:700}
    .generated{font-size:11px;color:#94a3b8}
  `;
}

function escapeHtml(input: string) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCurrency(amount: number, currency?: string) {
  const sym = currency === 'INR' || !currency ? '₹' : currency + ' ';
  try {
    return sym + Intl.NumberFormat('en-IN').format(Number(amount) || 0);
  } catch (e) {
    return sym + (Number(amount) || 0).toFixed(2);
  }
}

export async function buildPdfFile(entries: Entry[], options: { title?: string; aiLayout?: boolean } = {}) {
  const title = options.title || 'Export';
  const sum = summarize(entries);
  // Choose layout based on aiLayout flag (local heuristics)
  const condensed = options.aiLayout && entries.length > 100;

  // Only include the approved columns for user-facing PDF exports
  const headerHtml = `<header><h1>${title}</h1><div class="meta">${sum.count} items · ${sum.totalIn.toFixed(2)} in · ${sum.totalOut.toFixed(2)} out</div></header>`;

  const generatedAt = dayjs().format('DD MMM YYYY, HH:mm');

  const tableHead = `<thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Note</th><th style="text-align:right">Amount</th></tr></thead>`;
  const tableRows = entries
    .map((e) => {
      const date = e.date ? escapeHtml(dayjs(e.date).format('DD MMM YYYY')) : '';
      const typeLabel = e.type === 'in' ? 'Income' : 'Expense';
      const category = escapeHtml(String(e.category || 'General'));
      const note = e.note ? escapeHtml(String(e.note)) : '—';
      const currency = e.currency || 'INR';
      const amount = Number(e.amount) || 0;
      const amountStr = formatCurrency(amount, currency);
      return `<tr><td>${date}</td><td>${typeLabel}</td><td>${category}</td><td class="note">${note}</td><td class="amount" style="text-align:right">${amountStr}</td></tr>`;
    })
    .join('');

  const html = `
  <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>${smallStyles()}</style>
    </head>
    <body>
      <div class="wrap">
        ${headerHtml}
        <div class="generated">Generated: ${generatedAt}</div>
        <div class="summary-cards">
          <div class="card"><div class="label">Income</div><div class="value">${formatCurrency(sum.totalIn)}</div></div>
          <div class="card"><div class="label">Expense</div><div class="value">${formatCurrency(sum.totalOut)}</div></div>
          <div class="card"><div class="label">Net</div><div class="value">${formatCurrency(sum.net)}</div></div>
        </div>
        <table>
          ${tableHead}
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>
    </body>
  </html>`;

  // Lazy-import native modules to avoid adding them to the startup bundle
  const Print = await import('expo-print');
  const FileSystem = await import('expo-file-system/legacy');
  const { uri } = await (Print as any).printToFileAsync({ html });
  const dest = (FileSystem as any).cacheDirectory + `${title.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.pdf`;
  await (FileSystem as any).copyAsync({ from: uri, to: dest });
  return dest;
}

export async function exportToFile(format: 'csv' | 'json' | 'pdf', entries: Entry[], opts: { fields?: string[]; pretty?: boolean; title?: string; aiLayout?: boolean } = {}) {
  if (!entries) throw new Error('No entries provided');
  if (format === 'csv') {
    const fields = opts.fields ?? Object.keys(entries[0] || {});
    const csv = buildCSV(entries, fields);
    const FS = await import('expo-file-system/legacy');
    const path = (FS as any).cacheDirectory + `${(opts.title || 'export').replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.csv`;
    await (FS as any).writeAsStringAsync(path, csv, { encoding: (FS as any).EncodingType.UTF8 });
    return path;
  }
  if (format === 'json') {
    const json = buildJSON(entries, !!opts.pretty);
    const FS = await import('expo-file-system/legacy');
    const path = (FS as any).cacheDirectory + `${(opts.title || 'export').replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.json`;
    await (FS as any).writeAsStringAsync(path, json, { encoding: (FS as any).EncodingType.UTF8 });
    return path;
  }
  if (format === 'pdf') {
    return buildPdfFile(entries, { title: opts.title, aiLayout: !!opts.aiLayout });
  }
  throw new Error('Unsupported format');
}

// Stream-export entries directly from Firestore using paginated reads to avoid OOM.
export async function exportFromUser(
  userId: string,
  format: 'csv' | 'json' | 'pdf',
  opts: { fields?: string[]; pretty?: boolean; title?: string; aiLayout?: boolean } = {},
  pageSize = 500
) {
  if (!userId) throw new Error('userId required for export');

  const { fetchEntriesGenerator } = await import('../services/firestoreEntries');
  const gen = fetchEntriesGenerator(userId, pageSize);

  const FS = await import('expo-file-system/legacy');
  const enc = (FS as any).EncodingType?.UTF8;
  const baseName = (opts.title || 'export').replace(/[^a-z0-9]/gi, '_');

  if (format === 'csv') {
    const path = (FS as any).cacheDirectory + `${baseName}_${Date.now()}.csv`;
    // iterate pages
    let first = true;
    for await (const page of gen) {
      if (!page || page.length === 0) continue;
      const fields = opts.fields ?? Object.keys(page[0] || {});
      const csv = buildCSV(page, fields);
      if (first) {
        await (FS as any).writeAsStringAsync(path, csv, { encoding: enc });
        first = false;
      } else {
        // drop header line and append only rows
        const withoutHeader = csv.split('\n').slice(1).join('\n');
        await (FS as any).writeAsStringAsync(path, '\n' + withoutHeader, { encoding: enc, append: true });
      }
    }
    return path;
  }

  if (format === 'json') {
    const path = (FS as any).cacheDirectory + `${baseName}_${Date.now()}.json`;
    let firstItem = true;
    await (FS as any).writeAsStringAsync(path, '[', { encoding: enc });
    for await (const page of gen) {
      if (!page || page.length === 0) continue;
      for (const item of page) {
        const text = JSON.stringify(item);
        if (firstItem) {
          await (FS as any).writeAsStringAsync(path, text, { encoding: enc, append: true });
          firstItem = false;
        } else {
          await (FS as any).writeAsStringAsync(path, ',' + text, { encoding: enc, append: true });
        }
      }
    }
    await (FS as any).writeAsStringAsync(path, ']', { encoding: enc, append: true });
    return path;
  }

  if (format === 'pdf') {
    // PDF generation requires the full dataset in memory to build a single document.
    // Collect pages up to a reasonable cap to avoid unbounded memory growth.
    const MAX_ENTRIES = 5000;
    const coll: Entry[] = [];
    for await (const page of gen) {
      if (!page || page.length === 0) continue;
      coll.push(...page);
      if (coll.length > MAX_ENTRIES) {
        throw new Error('Too many entries for PDF export; try CSV/JSON or narrow the date range');
      }
    }
    return buildPdfFile(coll, { title: opts.title, aiLayout: !!opts.aiLayout });
  }

  throw new Error('Unsupported format');
}

export async function shareFile(path: string) {
  const Sharing = await import('expo-sharing');
  if (!(await (Sharing as any).isAvailableAsync())) throw new Error('Sharing not available');
  return (Sharing as any).shareAsync(path);
}


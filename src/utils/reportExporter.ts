import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import * as XLSXBase from 'xlsx';
import { formatDate } from './date';
import { isIncome } from './transactionType';

// Prefer a style-capable SheetJS build when available.
// If not installed, we fall back to the existing `xlsx` dependency.
const XLSX: any = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('xlsx-js-style');
  } catch (e) {
    return XLSXBase as any;
  }
})();

// --- Types ---
type Format = 'pdf' | 'excel' | 'json' | 'csv';

export interface ExportOptions {
  title: string;
  periodLabel: string;
  groupBy?: 'none' | 'category';
}

interface TransactionItem {
  date: string | Date;
  type: string;
  category: string;
  amount: number;
  currency?: string;
  note?: string;
  created_at?: string;
  [key: string]: any;
}

// --- Main Export Function ---
export const exportToFile = async (
  format: Format,
  data: TransactionItem[],
  options: ExportOptions
): Promise<string | null> => {
  try {
    switch (format) {
      case 'pdf':
        return await generatePdf(data, options);
      case 'excel':
        return await generateExcel(data, options);
      case 'csv':
        return await generateCsv(data, options);
      case 'json':
        return await generateJson(data, options);
      default:
        return null;
    }
  } catch (error) {
    console.error('Export failed:', error);
    throw error;
  }
};

export const shareFile = async (filePath: string) => {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device');
  }
  await Sharing.shareAsync(filePath, {
    mimeType: filePath.endsWith('.xlsx')
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : undefined,
    UTI: filePath.endsWith('.xlsx') ? 'com.microsoft.excel.xlsx' : undefined,
  });
};

// --- HELPERS ---

// Robust write helper that handles legacy/new API and path discovery
async function writeFile(filename: string, contents: string, options: any = {}) {
  // 1. Path Discovery: Find a guaranteed writable path
  const path = await getWritablePath(filename);

  // 2. Try Legacy API (safest for older Expo SDKs)
  try {
    const FSlegacy = require('expo-file-system/legacy');
    if (FSlegacy && typeof FSlegacy.writeAsStringAsync === 'function') {
      await FSlegacy.writeAsStringAsync(path, contents, options);
      return path;
    }
  } catch (e) {
    // ignore
  }

  // 3. Try Standard API
  try {
    if (typeof (FileSystem as any).writeAsStringAsync === 'function') {
      await (FileSystem as any).writeAsStringAsync(path, contents, options);
      return path;
    }
  } catch (e) {
    // ignore
  }

  // 4. Try New File API (Standard Web/Node style)
  try {
    // FIX: Use globalThis to avoid ESLint 'global is not defined' error
    const FileCtor = (FileSystem as any).File || globalThis.File;
    if (typeof FileCtor === 'function') {
      const f = new FileCtor(path);
      if (typeof f.write === 'function') await f.write(contents);
      else if (typeof f.writeAsync === 'function') await f.writeAsync(contents);
      else if (typeof f.text === 'function') await f.write(contents);
      return path;
    }
  } catch (e) {
    // ignore
  }

  throw new Error('No available write API found on this device.');
}

const getWritablePath = async (filename: string): Promise<string> => {
  const fs = FileSystem as any;
  if (fs.cacheDirectory) return `${fs.cacheDirectory}${filename}`;
  if (fs.documentDirectory) return `${fs.documentDirectory}${filename}`;

  // Fallback: Use Expo Print to "discover" a valid cache path
  try {
    const { uri } = await Print.printToFileAsync({ html: '<p>temp</p>' });
    const dir = uri.substring(0, uri.lastIndexOf('/') + 1);
    return `${dir}${filename}`;
  } catch (e) {
    throw new Error('Could not determine a writable directory path.');
  }
};

const moneyFormatterCache = new Map<string, Intl.NumberFormat>();
const getMoneyFormatter = (currency: string) => {
  const key = `en-IN|${currency}|0`;
  const existing = moneyFormatterCache.get(key);
  if (existing) return existing;
  const created = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  });
  moneyFormatterCache.set(key, created);
  return created;
};

const formatMoney = (amount: number, currency = 'INR') => {
  try {
    return getMoneyFormatter(currency).format(amount);
  } catch {
    // Fallback: Intl can throw for unknown currency codes.
    return String(amount);
  }
};

const escapeHtml = (value: any) => {
  const s = value === null || value === undefined ? '' : String(value);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const safeDateYMD = (input: any): string => {
  if (!input) return '';
  if (input instanceof Date && Number.isFinite(input.getTime())) {
    const y = input.getFullYear();
    const m = String(input.getMonth() + 1).padStart(2, '0');
    const d = String(input.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof input === 'string') {
    // Fast-path common ISO-like dates
    if (input.length >= 10 && /\d{4}-\d{2}-\d{2}/.test(input.slice(0, 10)))
      return input.slice(0, 10);
    const dt = new Date(input);
    if (Number.isFinite(dt.getTime())) return safeDateYMD(dt);
    return input;
  }
  if (typeof input === 'number') {
    const ms = input > 32503680000 ? input : input * 1000;
    const dt = new Date(ms);
    if (Number.isFinite(dt.getTime())) return safeDateYMD(dt);
  }
  try {
    return formatDate(input, 'YYYY-MM-DD');
  } catch {
    return '';
  }
};

const safeDateTimeLocal = (input: any): string => {
  if (!input) return '';
  if (typeof input === 'string') {
    // Fast-path ISO-like timestamps: 2026-01-01T13:45:00Z
    if (input.length >= 16 && /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(input.slice(0, 16))) {
      return input.slice(0, 16).replace('T', ' ');
    }
  }
  const dt =
    input instanceof Date
      ? input
      : new Date(typeof input === 'number' ? (input > 32503680000 ? input : input * 1000) : input);
  if (!Number.isFinite(dt.getTime())) return '';
  const ymd = safeDateYMD(dt);
  const hh = String(dt.getHours()).padStart(2, '0');
  const mm = String(dt.getMinutes()).padStart(2, '0');
  return `${ymd} ${hh}:${mm}`;
};

const getCreatedAtText = (item: any): string => {
  const raw =
    item?.created_at ??
    item?.createdAt ??
    item?.created_at_ms ??
    item?.created_at_unix ??
    item?.created ??
    item?.updated_at ??
    item?.updatedAt ??
    null;
  if (!raw) return '';
  return safeDateTimeLocal(raw);
};

const sanitizeFilename = (name: string) => name.replace(/[^a-z0-9]/gi, '_').toLowerCase();

// --- GENERATORS ---

// 1. PDF GENERATOR
const generatePdf = async (data: TransactionItem[], options: ExportOptions): Promise<string> => {
  const { title, periodLabel, groupBy } = options;
  let totalIncome = 0;
  let totalExpense = 0;
  let contentHtml = '';

  const grouped: Record<string, { in: number; out: number }> | null =
    groupBy === 'category' ? {} : null;

  // Build transaction rows + totals in one pass (faster + fewer allocations)
  const transactionRowParts: string[] = new Array(data.length);
  for (let idx = 0; idx < data.length; idx++) {
    const item = data[idx];
    const income = isIncome(item.type);
    const amt = Number(item.amount || 0);
    if (income) totalIncome += amt;
    else totalExpense += amt;

    if (grouped) {
      const cat = item.category || 'Uncategorized';
      if (!grouped[cat]) grouped[cat] = { in: 0, out: 0 };
      if (income) grouped[cat].in += amt;
      else grouped[cat].out += amt;
    }

    transactionRowParts[idx] = `
    <tr style="border-bottom: 1px solid #e2e8f0; background-color: ${idx % 2 === 0 ? '#fff' : '#f8fafc'};">
      <td style="padding: 6px;">${escapeHtml(formatDate(item.date, 'DD MMM YYYY'))}</td>
      <td style="padding: 6px;">${escapeHtml(item.category || '')}</td>
      <td style="padding: 6px; color: #64748b;">${escapeHtml(item.note || '')}</td>
      <td style="padding: 6px; text-align: right; color: ${income ? '#166534' : '#991B1B'}; font-weight: 600;">
        ${income ? '+' : '-'} ${escapeHtml(formatMoney(amt, item.currency))}
      </td>
    </tr>
  `;
  }

  // Generate Grouped or Linear Content
  if (grouped) {
    const keys = Object.keys(grouped);
    const rowParts: string[] = new Array(keys.length);
    for (let i = 0; i < keys.length; i++) {
      const cat = keys[i];
      const g = grouped[cat];
      rowParts[i] = `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px; font-weight: 600;">${escapeHtml(cat)}</td>
        <td style="padding: 8px; text-align: right; color: #166534;">${g.in > 0 ? escapeHtml(formatMoney(g.in)) : '-'}</td>
        <td style="padding: 8px; text-align: right; color: #991B1B;">${g.out > 0 ? escapeHtml(formatMoney(g.out)) : '-'}</td>
        <td style="padding: 8px; text-align: right; font-weight: bold;">${escapeHtml(formatMoney(g.in - g.out))}</td>
      </tr>
    `;
    }
    const rows = rowParts.join('');

    contentHtml += `
      <div style="margin-bottom: 20px;">
        <h3>Summary by Category</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <tr style="background-color: #f1f5f9; text-align: left;">
            <th style="padding: 8px;">Category</th>
            <th style="padding: 8px; text-align: right; color: #166534;">Income</th>
            <th style="padding: 8px; text-align: right; color: #991B1B;">Expense</th>
            <th style="padding: 8px; text-align: right;">Net</th>
          </tr>
          ${rows}
        </table>
      </div>`;
  }

  // Transaction List
  const transactionRows = transactionRowParts.join('');

  const html = `
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
           body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 20px; color: #1e293b; }
           h1 { margin: 0 0 5px 0; font-size: 24px; color: #0f172a; }
           p.subtitle { margin: 0 0 20px 0; color: #64748b; font-size: 14px; }
           .summary-card { padding: 15px; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 20px; display: flex; justify-content: space-between; }
           .stat { flex: 1; text-align: center; }
           .stat-label { font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: bold; }
           .stat-val { font-size: 18px; font-weight: bold; margin-top: 5px; }
           .net { color: ${totalIncome - totalExpense >= 0 ? '#166534' : '#991B1B'}; }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        <p class="subtitle">${periodLabel} | Generated by DhanDiary</p>
        <div class="summary-card">
           <div class="stat"><div class="stat-label">Total Income</div><div class="stat-val" style="color: #166534;">${formatMoney(totalIncome)}</div></div>
           <div class="stat"><div class="stat-label">Total Expenses</div><div class="stat-val" style="color: #991B1B;">${formatMoney(totalExpense)}</div></div>
           <div class="stat"><div class="stat-label">Net Balance</div><div class="stat-val net">${formatMoney(totalIncome - totalExpense)}</div></div>
        </div>
        ${contentHtml}
        <h3>Transactions</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
           <tr style="background-color: #f1f5f9; text-align: left;">
             <th style="padding: 6px;">Date</th><th style="padding: 6px;">Category</th><th style="padding: 6px;">Note</th><th style="padding: 6px; text-align: right;">Amount</th>
           </tr>
           ${transactionRows}
        </table>
      </body>
    </html>
  `;

  const { uri } = await Print.printToFileAsync({ html, base64: false });
  return uri;
};

// 2. CSV GENERATOR
const generateCsv = async (data: TransactionItem[], options: ExportOptions): Promise<string> => {
  let totalIncome = 0;
  let totalExpense = 0;

  // Use array join for speed
  const csvRows: string[] = [];

  // Headers
  csvRows.push(['Date', 'Type', 'Category', 'Amount', 'Currency', 'Note', 'CreatedAt'].join(','));

  // Data Loop
  for (const item of data) {
    const amt = Number(item.amount || 0);
    if (isIncome(item.type)) totalIncome += amt;
    else totalExpense += amt;

    const safeNote = String(item.note || '')
      .replace(/\r?\n/g, ' ')
      .replace(/"/g, '""');

    const row = [
      safeDateYMD(item.date),
      item.type,
      item.category || '',
      amt,
      item.currency || 'INR',
      `"${safeNote}"`, // escape quotes
      getCreatedAtText(item as any),
    ];
    csvRows.push(row.join(','));
  }

  // Summary Footer
  csvRows.push(''); // blank line
  csvRows.push(',,FINANCIAL SUMMARY,,,,');
  csvRows.push(`,,Total Income,${totalIncome},,,`);
  csvRows.push(`,,Total Expenses,${totalExpense},,,`);
  csvRows.push(`,,Net Balance,${totalIncome - totalExpense},,,`);

  const fileName = `${sanitizeFilename(options.title)}.csv`;
  // CSV is always simple text, use utf8
  return await writeFile(fileName, csvRows.join('\n'), { encoding: 'utf8' });
};

// 3. EXCEL GENERATOR (Binary SheetJS Method - Prevents Corruption)
const generateExcel = async (data: TransactionItem[], options: ExportOptions): Promise<string> => {
  const currency = (data[0]?.currency || 'INR') as string;
  const now = new Date();

  let totalIncome = 0;
  let totalExpense = 0;
  const categoryAgg: Record<string, { in: number; out: number }> = {};

  // Build table rows in one pass (faster on large exports)
  const tableRows: any[][] = new Array(data.length);
  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    const amt = Number(item.amount || 0);
    const income = isIncome(item.type);
    if (income) totalIncome += amt;
    else totalExpense += amt;

    if (options.groupBy === 'category') {
      const cat = item.category || 'Uncategorized';
      if (!categoryAgg[cat]) categoryAgg[cat] = { in: 0, out: 0 };
      if (income) categoryAgg[cat].in += amt;
      else categoryAgg[cat].out += amt;
    }

    // Statement-like: signed amount (income positive, expense negative)
    const signed = income ? amt : -amt;

    tableRows[i] = [
      safeDateYMD(item.date),
      item.category || '',
      item.note || '',
      income ? 'Credit' : 'Debit',
      signed,
      item.currency || currency || 'INR',
      getCreatedAtText(item as any),
    ];
  }

  const net = totalIncome - totalExpense;

  // Sheet 1: Statement
  const statementAoa: any[][] = [];
  const cols = ['Date', 'Category', 'Note', 'Statement Type', 'Amount', 'Currency', 'Created At'];
  const lastCol = cols.length - 1;

  statementAoa.push(['DhanDiary']);
  statementAoa.push(['Statement']);
  statementAoa.push([`Period: ${options.periodLabel || 'All Time'}`]);
  statementAoa.push([
    `Generated: ${safeDateYMD(now)} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
  ]);
  statementAoa.push(['']);

  statementAoa.push(['Summary']);
  statementAoa.push(['Total Income', totalIncome, '', '', '', currency]);
  statementAoa.push(['Total Expenses', totalExpense, '', '', '', currency]);
  statementAoa.push(['Net Balance', net, '', '', '', currency]);
  statementAoa.push(['']);

  const headerRowIndex1Based = statementAoa.length + 1;
  statementAoa.push(cols);
  for (let i = 0; i < tableRows.length; i++) statementAoa.push(tableRows[i]);

  const wsStatement = XLSX.utils.aoa_to_sheet(statementAoa);

  // Light styling (avoid per-row styles for performance)
  try {
    const titleStyle = {
      font: { bold: true, sz: 20, color: { rgb: '0F172A' } },
      alignment: { horizontal: 'center', vertical: 'center' },
    };
    const subTitleStyle = {
      font: { bold: true, sz: 16, color: { rgb: '1E293B' } },
      alignment: { horizontal: 'center', vertical: 'center' },
    };
    const metaStyle = {
      font: { bold: false, sz: 11, color: { rgb: '475569' } },
      alignment: { horizontal: 'center', vertical: 'center' },
    };
    const headerStyle = {
      font: { bold: true, sz: 12, color: { rgb: 'FFFFFF' } },
      fill: { patternType: 'solid', fgColor: { rgb: '2563EB' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    };
    const summaryTitleStyle = {
      font: { bold: true, sz: 12, color: { rgb: '0F172A' } },
      fill: { patternType: 'solid', fgColor: { rgb: 'F1F5F9' } },
    };

    const setStyle = (addr: string, s: any) => {
      const cell = wsStatement[addr];
      if (cell) cell.s = s;
    };

    setStyle('A1', titleStyle);
    setStyle('A2', subTitleStyle);
    setStyle('A3', metaStyle);
    setStyle('A4', metaStyle);
    setStyle('A6', summaryTitleStyle);

    // Header row styles
    const headerRow0 = headerRowIndex1Based - 1;
    for (let c = 0; c <= lastCol; c++) {
      const addr = XLSX.utils.encode_cell({ r: headerRow0, c });
      setStyle(addr, headerStyle);
    }
  } catch (e) {
    // If the installed SheetJS build doesn't support styles, silently ignore.
  }

  // Merge title rows across all columns for a cleaner, professional look
  wsStatement['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: lastCol } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: lastCol } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: lastCol } },
  ];

  wsStatement['!cols'] = [
    { wch: 12 },
    { wch: 18 },
    { wch: 32 },
    { wch: 18 },
    { wch: 14 },
    { wch: 10 },
    { wch: 20 },
  ];

  // Autofilter on the table header row
  try {
    const endColLetter = XLSX.utils.encode_col(lastCol);
    wsStatement['!autofilter'] = {
      ref: `A${headerRowIndex1Based}:${endColLetter}${headerRowIndex1Based}`,
    };
  } catch (e) {}

  // Freeze panes below the header row
  try {
    wsStatement['!freeze'] = {
      xSplit: 0,
      ySplit: headerRowIndex1Based,
      topLeftCell: `A${headerRowIndex1Based + 1}`,
      activePane: 'bottomLeft',
      state: 'frozen',
    };
  } catch (e) {}

  // Apply numeric format to Amount column for table rows
  try {
    const amountColIdx = 4;
    const startRow0 = headerRowIndex1Based; // 1-based header; data starts next
    const dataStart0 = startRow0 + 1;
    const dataEnd0 = dataStart0 + tableRows.length - 1;
    for (let r = dataStart0; r <= dataEnd0; r++) {
      const addr = XLSX.utils.encode_cell({ r: r - 1, c: amountColIdx });
      const cell = wsStatement[addr];
      if (cell && cell.t === 'n') cell.z = '#,##0.00';
    }
  } catch (e) {}

  // Sheet 2: Category Summary (optional)
  let wsSummary: any | null = null;
  if (options.groupBy === 'category') {
    const summaryAoa: any[][] = [];
    summaryAoa.push(['DhanDiary']);
    summaryAoa.push(['Category Summary']);
    summaryAoa.push([`Period: ${options.periodLabel || 'All Time'}`]);
    summaryAoa.push(['']);
    summaryAoa.push(['Category', 'Income', 'Expense', 'Net', 'Currency']);

    const cats = Object.keys(categoryAgg).sort((a, b) => a.localeCompare(b));
    for (const cat of cats) {
      const entry = categoryAgg[cat];
      summaryAoa.push([cat, entry.in, entry.out, entry.in - entry.out, currency]);
    }

    const ws = XLSX.utils.aoa_to_sheet(summaryAoa);
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 4 } },
    ];
    ws['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 }];
    wsSummary = ws;
  }

  const wb = XLSX.utils.book_new();
  (wb as any).Props = {
    Title: 'DhanDiary Statement',
    Subject: options.periodLabel || 'Statement',
    Author: 'DhanDiary',
    CreatedDate: now,
  };

  XLSX.utils.book_append_sheet(wb, wsStatement, 'Statement');
  if (wsSummary) XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  // Generate Binary Output (Base64)
  const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  const fileName = `${sanitizeFilename(options.title || 'dhandiary_statement')}.xlsx`;
  return await writeFile(fileName, wbout, { encoding: 'base64' });
};

// 4. JSON GENERATOR
const generateJson = async (data: TransactionItem[], options: ExportOptions): Promise<string> => {
  const jsonContent = JSON.stringify(
    {
      meta: {
        title: options.title,
        period: options.periodLabel,
        generated: new Date().toISOString(),
      },
      data,
    },
    null,
    2
  );

  const fileName = `${sanitizeFilename(options.title)}.json`;
  return await writeFile(fileName, jsonContent, { encoding: 'utf8' });
};

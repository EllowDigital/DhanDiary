import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import XLSX from 'xlsx'; // Ensure this is installed: npm install xlsx
import { formatDate } from './date';
import { isIncome } from './transactionType';

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

const formatMoney = (amount: number, currency = 'INR') => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(amount);
};

const sanitizeFilename = (name: string) => name.replace(/[^a-z0-9]/gi, '_').toLowerCase();

// --- GENERATORS ---

// 1. PDF GENERATOR
const generatePdf = async (data: TransactionItem[], options: ExportOptions): Promise<string> => {
  const { title, periodLabel, groupBy } = options;
  let totalIncome = 0;
  let totalExpense = 0;
  let contentHtml = '';

  // Calculate totals
  data.forEach((item) => {
    if (isIncome(item.type)) totalIncome += Number(item.amount);
    else totalExpense += Number(item.amount);
  });

  // Generate Grouped or Linear Content
  if (groupBy === 'category') {
    const grouped: Record<string, { in: number; out: number }> = {};
    data.forEach((item) => {
      const cat = item.category || 'Uncategorized';
      if (!grouped[cat]) grouped[cat] = { in: 0, out: 0 };
      if (isIncome(item.type)) grouped[cat].in += Number(item.amount);
      else grouped[cat].out += Number(item.amount);
    });

    const rows = Object.keys(grouped)
      .map(
        (cat) => `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px; font-weight: 600;">${cat}</td>
        <td style="padding: 8px; text-align: right; color: #166534;">${grouped[cat].in > 0 ? formatMoney(grouped[cat].in) : '-'}</td>
        <td style="padding: 8px; text-align: right; color: #991B1B;">${grouped[cat].out > 0 ? formatMoney(grouped[cat].out) : '-'}</td>
        <td style="padding: 8px; text-align: right; font-weight: bold;">${formatMoney(grouped[cat].in - grouped[cat].out)}</td>
      </tr>
    `
      )
      .join('');

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
  const transactionRows = data
    .map(
      (item, idx) => `
    <tr style="border-bottom: 1px solid #e2e8f0; background-color: ${idx % 2 === 0 ? '#fff' : '#f8fafc'};">
      <td style="padding: 6px;">${formatDate(item.date, 'DD MMM YYYY')}</td>
      <td style="padding: 6px;">${item.category}</td>
      <td style="padding: 6px; color: #64748b;">${item.note || ''}</td>
      <td style="padding: 6px; text-align: right; color: ${isIncome(item.type) ? '#166534' : '#991B1B'}; font-weight: 600;">
        ${isIncome(item.type) ? '+' : '-'} ${formatMoney(item.amount, item.currency)}
      </td>
    </tr>
  `
    )
    .join('');

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

    const row = [
      formatDate(item.date, 'YYYY-MM-DD'),
      item.type,
      item.category || '',
      amt,
      item.currency || 'INR',
      `"${(item.note || '').replace(/"/g, '""')}"`, // escape quotes
      item.created_at || '',
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
  let totalIncome = 0;
  let totalExpense = 0;

  // 1. Calculate Totals first
  data.forEach((item) => {
    const amt = Number(item.amount || 0);
    if (isIncome(item.type)) totalIncome += amt;
    else totalExpense += amt;
  });

  // 2. Build Data Array (Array of Arrays for SheetJS)
  const aoaData: any[][] = [];

  // -- Report Header --
  aoaData.push([options.title]);
  aoaData.push([options.periodLabel]);
  aoaData.push(['Generated by DhanDiary']);
  aoaData.push(['']); // Empty row

  // -- Financial Summary --
  aoaData.push(['FINANCIAL SUMMARY']);
  aoaData.push(['Total Income', totalIncome]);
  aoaData.push(['Total Expenses', totalExpense]);
  aoaData.push(['Net Balance', totalIncome - totalExpense]);
  aoaData.push(['']); // Empty row

  // -- Transactions Header --
  aoaData.push(['Date', 'Type', 'Category', 'Amount', 'Currency', 'Note', 'CreatedAt']);

  // -- Transactions Rows --
  data.forEach((item) => {
    aoaData.push([
      formatDate(item.date, 'YYYY-MM-DD'),
      item.type,
      item.category || '',
      Number(item.amount || 0),
      item.currency || 'INR',
      item.note || '',
      item.created_at || '',
    ]);
  });

  // 3. Create Workbook & Sheet
  const ws = XLSX.utils.aoa_to_sheet(aoaData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');

  // 4. Generate Binary Output (Base64)
  // 'base64' type creates a true binary Excel file, preventing corruption errors
  const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

  const fileName = `${sanitizeFilename(options.title)}.xlsx`;
  
  // Important: Pass 'base64' encoding to write function
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
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import XLSX from 'xlsx';
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
  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('Sharing is not available on this device');
  }
  await Sharing.shareAsync(filePath, {
    mimeType: filePath.endsWith('.xlsx')
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : undefined,
    UTI: filePath.endsWith('.xlsx') ? 'com.microsoft.excel.xlsx' : undefined,
  });
};

// --- Helpers ---

/**
 * Standard robust file writer using Expo FileSystem.
 * FIX: Replaced EncodingType Enum with string literals 'utf8' | 'base64' to prevent runtime crashes.
 */
const writeFile = async (
  fileName: string,
  contents: string,
  encoding: 'utf8' | 'base64' = 'utf8'
): Promise<string> => {
  // Ensure we have a valid directory path
  const dir = FileSystem.documentDirectory;
  if (!dir) {
    throw new Error('FileSystem.documentDirectory is not available');
  }

  const fileUri = `${dir}${fileName}`;
  await FileSystem.writeAsStringAsync(fileUri, contents, { encoding });
  return fileUri;
};

const formatMoney = (amount: number, currency = 'INR') => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(amount);
};

const sanitizeFilename = (name: string) => name.replace(/[^a-z0-9]/gi, '_').toLowerCase();

// --- Generators ---

// 1. PDF GENERATOR
const generatePdf = async (data: TransactionItem[], options: ExportOptions): Promise<string> => {
  const { title, periodLabel, groupBy } = options;
  let contentHtml = '';
  let totalIncome = 0;
  let totalExpense = 0;

  // Calculate totals and grouping
  if (groupBy === 'category') {
    const grouped: Record<string, { in: number; out: number; items: TransactionItem[] }> = {};

    data.forEach((item) => {
      const cat = item.category || 'Uncategorized';
      if (!grouped[cat]) grouped[cat] = { in: 0, out: 0, items: [] };
      grouped[cat].items.push(item);

      const amt = Number(item.amount);
      if (isIncome(item.type)) {
        grouped[cat].in += amt;
        totalIncome += amt;
      } else {
        grouped[cat].out += amt;
        totalExpense += amt;
      }
    });

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
          ${Object.keys(grouped)
            .map(
              (cat) => `
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 8px; font-weight: 600;">${cat}</td>
              <td style="padding: 8px; text-align: right; color: #166534;">${grouped[cat].in > 0 ? formatMoney(grouped[cat].in) : '-'}</td>
              <td style="padding: 8px; text-align: right; color: #991B1B;">${grouped[cat].out > 0 ? formatMoney(grouped[cat].out) : '-'}</td>
              <td style="padding: 8px; text-align: right; font-weight: bold;">${formatMoney(grouped[cat].in - grouped[cat].out)}</td>
            </tr>`
            )
            .join('')}
        </table>
      </div>
    `;
  } else {
    data.forEach((item) => {
      if (isIncome(item.type)) totalIncome += Number(item.amount);
      else totalExpense += Number(item.amount);
    });
  }

  // Transaction Table
  contentHtml += `
    <h3>Transactions</h3>
    <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
      <tr style="background-color: #f1f5f9; text-align: left;">
        <th style="padding: 6px;">Date</th>
        <th style="padding: 6px;">Category</th>
        <th style="padding: 6px;">Note</th>
        <th style="padding: 6px; text-align: right;">Amount</th>
      </tr>
      ${data
        .map(
          (item, idx) => `
        <tr style="border-bottom: 1px solid #e2e8f0; background-color: ${idx % 2 === 0 ? '#fff' : '#f8fafc'};">
          <td style="padding: 6px;">${formatDate(item.date, 'DD MMM YYYY')}</td>
          <td style="padding: 6px;">${item.category}</td>
          <td style="padding: 6px; color: #64748b;">${item.note || ''}</td>
          <td style="padding: 6px; text-align: right; color: ${isIncome(item.type) ? '#166534' : '#991B1B'}; font-weight: 600;">
            ${isIncome(item.type) ? '+' : '-'} ${formatMoney(item.amount, item.currency)}
          </td>
        </tr>`
        )
        .join('')}
    </table>
  `;

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
          <div class="stat">
            <div class="stat-label">Total Income</div>
            <div class="stat-val" style="color: #166534;">${formatMoney(totalIncome)}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Total Expenses</div>
            <div class="stat-val" style="color: #991B1B;">${formatMoney(totalExpense)}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Net Balance</div>
            <div class="stat-val net">${formatMoney(totalIncome - totalExpense)}</div>
          </div>
        </div>
        ${contentHtml}
      </body>
    </html>
  `;

  const { uri } = await Print.printToFileAsync({ html, base64: false });
  return uri;
};

// 2. CSV GENERATOR
const generateCsv = async (data: TransactionItem[], options: ExportOptions): Promise<string> => {
  const headers = ['Date', 'Type', 'Category', 'Amount', 'Currency', 'Note', 'CreatedAt'];

  // Use map for faster array processing
  const rows = data.map((item) => {
    const date = formatDate(item.date, 'YYYY-MM-DD');
    const type = item.type || '';
    const category = item.category || '';
    const amount = item.amount ?? 0;
    const currency = item.currency || 'INR';
    const note = (item.note || '').replace(/"/g, '""'); // Escape double quotes
    const created = item.created_at || '';

    return [date, type, category, amount, currency, `"${note}"`, created].join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\n');
  const fileName = `${sanitizeFilename(options.title)}.csv`;

  // FIX: Explicitly pass 'utf8' string to avoid undefined Enum error
  return await writeFile(fileName, csvContent, 'utf8');
};

// 3. EXCEL GENERATOR (Using XLSX Library)
const generateExcel = async (data: TransactionItem[], options: ExportOptions): Promise<string> => {
  // 1. Prepare Data for Sheet
  const sheetData = data.map((item) => ({
    Date: formatDate(item.date, 'YYYY-MM-DD'),
    Type: item.type,
    Category: item.category,
    Amount: item.amount,
    Currency: item.currency || 'INR',
    Note: item.note || '',
    CreatedAt: item.created_at || '',
  }));

  // 2. Create Workbook and Worksheet
  const ws = XLSX.utils.json_to_sheet(sheetData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Transactions');

  // 3. Generate Base64 output
  const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

  // 4. Write to file
  const fileName = `${sanitizeFilename(options.title)}.xlsx`;

  // FIX: Explicitly pass 'base64' string to avoid undefined Enum error
  return await writeFile(fileName, wbout, 'base64');
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
  // FIX: Explicitly pass 'utf8' string
  return await writeFile(fileName, jsonContent, 'utf8');
};

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
const { documentDirectory } = FileSystem as any;
// Some SDK versions may not expose EncodingType; fallback to 'utf8' string if missing
const UTF8_ENCODING = (FileSystem as any)?.EncodingType?.UTF8 || 'utf8';

// Robust write helper: prefer the legacy API when available (expo-file-system/legacy),
// then fall back to the installed FileSystem implementation. This avoids runtime
// errors on newer Expo SDKs where the old helpers are removed.
async function writeFile(path: string, contents: string, options?: any) {
  // Prefer the legacy API via synchronous require so Metro includes it in the bundle
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const FSlegacy = require('expo-file-system/legacy');
    if (FSlegacy && typeof FSlegacy.writeAsStringAsync === 'function') {
      await FSlegacy.writeAsStringAsync(path, contents, options);
      return;
    }
  } catch (e) {
    // If require fails, continue to other fallbacks
  }

  // Try the older style API on the primary package (may exist on older SDKs)
  try {
    if (typeof (FileSystem as any).writeAsStringAsync === 'function') {
      await (FileSystem as any).writeAsStringAsync(path, contents, options);
      return;
    }
  } catch (e) {
    // ignore and proceed to new API attempt
  }

  // Try the new File API: create a File instance and write text
  try {
    const FileCtor = (FileSystem as any).File || (global as any).File;
    if (typeof FileCtor === 'function') {
      const f = new FileCtor(path);
      // Try common method names used across runtimes
      if (typeof f.write === 'function') {
        // Some implementations accept either a string or an object
        // Try simple string write first
        await f.write(contents);
        return;
      }
      if (typeof f.writeAsync === 'function') {
        await f.writeAsync(contents);
        return;
      }
      if (typeof f.text === 'function') {
        // fallback: try writing via text() setter if available (rare)
        await f.write(contents);
        return;
      }
    }
  } catch (e) {
    // ignore
  }

  throw new Error(
    'No available write API: upgrade `expo-file-system` or install `expo-file-system/legacy`.'
  );
}
import { formatDate } from './date';
import { isIncome } from './transactionType';

// Types
type Format = 'pdf' | 'excel' | 'json' | 'csv';
interface ExportOptions {
  title: string;
  periodLabel: string;
  groupBy?: 'none' | 'category';
}

export const exportToFile = async (
  format: Format,
  data: any[],
  options: ExportOptions
): Promise<string | null> => {
  if (format === 'pdf') {
    return await generatePdf(data, options);
  }
  if (format === 'excel') {
    return await generateExcel(data, options);
  }
  if (format === 'csv') {
    return await generateCsv(data, options);
  }
  if (format === 'json') {
    return await generateJson(data, options);
  }
  return null;
};

export const shareFile = async (filePath: string) => {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device');
  }
  await Sharing.shareAsync(filePath);
};

// --- PDF GENERATOR ---
const generatePdf = async (data: any[], options: ExportOptions): Promise<string> => {
  const { title, periodLabel, groupBy } = options;

  let contentHtml = '';
  let totalIncome = 0;
  let totalExpense = 0;

  if (groupBy === 'category') {
    const grouped: Record<string, { in: number; out: number; items: any[] }> = {};

    data.forEach((item) => {
      const cat = item.category || 'Uncategorized';
      if (!grouped[cat]) grouped[cat] = { in: 0, out: 0, items: [] };
      grouped[cat].items.push(item);
      if (isIncome(item.type)) {
        grouped[cat].in += Number(item.amount);
        totalIncome += Number(item.amount);
      } else {
        grouped[cat].out += Number(item.amount);
        totalExpense += Number(item.amount);
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
                    </tr>
                `
                  )
                  .join('')}
             </table>
        </div>
      `;
  } else {
    // Linear list calculation
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
            </tr>
        `
          )
          .join('')}
     </table>
  `;

  const html = `
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
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

// --- CSV GENERATOR ---
const generateCsv = async (data: any[], options: ExportOptions): Promise<string> => {
  // Build CSV header
  const headers = ['Date', 'Type', 'Category', 'Amount', 'Currency', 'Note', 'CreatedAt'];
  let csv = headers.join(',') + '\n';

  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    const date = formatDate(item.date, 'YYYY-MM-DD');
    const type = (item.type || '').toString();
    const category = (item.category || '').toString();
    const amount = item.amount != null ? item.amount : '';
    const currency = item.currency || '';
    const note = (item.note || '').toString().replace(/"/g, '""');
    const created = item.created_at || '';
    // Wrap fields that may contain commas or quotes in double-quotes
    const row = [date, type, category, amount, currency, `"${note}"`, created];
    csv += row.join(',') + '\n';
  }

  const fileName = `${options.title.replace(/\s/g, '_')}.csv`;
  const path = `${documentDirectory}${fileName}`;
  try {
    await writeFile(path, csv, { encoding: UTF8_ENCODING as any });
    return path;
  } catch (e) {
    throw new Error(`Failed to write CSV file: ${e instanceof Error ? e.message : String(e)}`);
  }
};

// --- CSV GENERATOR ---
// --- EXCEL GENERATOR (HTML table saved with .xls extension)
const generateExcel = async (data: any[], options: ExportOptions): Promise<string> => {
  // Build rows with a fast loop to avoid creating large intermediate arrays
  let rowsHtml = '';
  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    const note = (item.note || '').toString().replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const date = formatDate(item.date, 'YYYY-MM-DD');
    const amount = item.amount;
    const currency = item.currency || 'INR';
    rowsHtml += `<tr><td>${date}</td><td>${item.type}</td><td>${item.category}</td><td style="text-align: right">${amount}</td><td>${currency}</td><td>${note}</td><td>${item.created_at || ''}</td></tr>`;
  }

  const html = `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          table { border-collapse: collapse; }
          td, th { border: 1px solid #ddd; padding: 6px; }
          th { background: #f1f5f9; }
        </style>
      </head>
      <body>
        <h3>${options.title}</h3>
        <p>${options.periodLabel}</p>
        <table>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Category</th>
            <th>Amount</th>
            <th>Currency</th>
            <th>Note</th>
            <th>CreatedAt</th>
          </tr>
          ${rowsHtml}
        </table>
      </body>
    </html>
  `;

  try {
    const fileName = `${options.title.replace(/\s/g, '_')}.xls`;
    const path = `${documentDirectory}${fileName}`;
    await writeFile(path, html, { encoding: UTF8_ENCODING as any });
    return path;
  } catch (e) {
    // Re-throw with clearer message
    throw new Error(`Failed to write Excel file: ${e instanceof Error ? e.message : String(e)}`);
  }
};

// --- JSON GENERATOR ---
const generateJson = async (data: any[], options: ExportOptions): Promise<string> => {
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
  const fileName = `${options.title.replace(/\s/g, '_')}.json`;
  const path = `${documentDirectory}${fileName}`;
  try {
    await writeFile(path, jsonContent, { encoding: UTF8_ENCODING as any });
    return path;
  } catch (e) {
    throw new Error(`Failed to write JSON file: ${e instanceof Error ? e.message : String(e)}`);
  }
};

const formatMoney = (amount: number, currency = 'INR') => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(amount);
};

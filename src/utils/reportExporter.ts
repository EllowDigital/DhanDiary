import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
const { documentDirectory, writeAsStringAsync, EncodingType } = FileSystem as any;
import dayjs from 'dayjs';
import { isIncome } from './transactionType';

// Types
type Format = 'pdf' | 'csv' | 'json';
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
                <td style="padding: 6px;">${dayjs(item.date).format('DD MMM YYYY')}</td>
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
  const header = 'Date,Type,Category,Amount,Currency,Note,CreatedAt\n';
  const rows = data
    .map((i) => {
      const cleanNote = (i.note || '').replace(/,/g, ' '); // remove commas to prevent csv break
      return `${dayjs(i.date).format('YYYY-MM-DD')},${i.type},${i.category},${i.amount},${i.currency || 'INR'},${cleanNote},${i.created_at}`;
    })
    .join('\n');

  const csvContent = header + rows;
  const fileName = `${options.title.replace(/\s/g, '_')}.csv`;
  const path = `${documentDirectory}${fileName}`;
  await writeAsStringAsync(path, csvContent, { encoding: EncodingType.UTF8 });
  return path;
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
  await writeAsStringAsync(path, jsonContent, { encoding: EncodingType.UTF8 });
  return path;
};

const formatMoney = (amount: number, currency = 'INR') => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(amount);
};

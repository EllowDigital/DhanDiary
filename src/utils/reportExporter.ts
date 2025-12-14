import dayjs from 'dayjs';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { LocalEntry } from '../types/entries';

export type ReportSummary = {
  totalIn: number;
  totalOut: number;
  net: number;
  currencySymbol?: string;
  filterLabel?: string;
};

export type ReportMetadata = {
  title?: string;
  rangeLabel?: string;
  generatedAt?: string;
};

const formatCurrency = (value: number, currencySymbol: string) => {
  const amount = Number.isFinite(value) ? value : 0;
  return `${currencySymbol}${amount.toLocaleString()}`;
};

const escapeHtml = (input: string) =>
  input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const csvEscape = (value: string) => {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

const ensureSharingAvailable = async () => {
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('Sharing is not available on this device.');
  }
};

const buildHtml = (entries: LocalEntry[], summary: ReportSummary, metadata?: ReportMetadata) => {
  const currency = summary.currencySymbol || '₹';
  const title = metadata?.title || 'DhanDiary Financial Report';
  const rangeLabel = metadata?.rangeLabel || 'All activity';
  const generatedAt = metadata?.generatedAt || dayjs().format('DD MMM YYYY, HH:mm');
  const sortedEntries = [...entries].sort((a, b) => {
    const left = dayjs(a.date || a.created_at).valueOf();
    const right = dayjs(b.date || b.created_at).valueOf();
    return right - left;
  });

  const rows = sortedEntries
    .map((entry) => {
      const date = dayjs(entry.date || entry.created_at).format('DD MMM YYYY');
      const amount = formatCurrency(Number(entry.amount) || 0, currency);
      const category = escapeHtml(entry.category || 'General');
      const note = entry.note ? escapeHtml(entry.note) : '—';
      const typeLabel = entry.type === 'in' ? 'Income' : 'Expense';
      return `<tr>
        <td>${date}</td>
        <td>${typeLabel}</td>
        <td>${category}</td>
        <td>${note}</td>
        <td class="amount ${entry.type}">${amount}</td>
      </tr>`;
    })
    .join('');

  const emptyState =
    rows ||
    '<tr><td colspan="5" style="text-align:center;padding:24px;color:#6b7280;">No entries available for this period.</td></tr>';

  return `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 24px; color: #111827; }
        h1 { margin-bottom: 0; font-size: 24px; }
        .muted { color: #6b7280; margin-top: 4px; }
        .summary { display: flex; flex-wrap: wrap; gap: 16px; margin: 24px 0; }
        .summary-card { flex: 1; min-width: 160px; border-radius: 12px; padding: 16px; background: #f3f4f6; }
        .summary-label { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #6b7280; }
        .summary-value { font-size: 20px; font-weight: 700; margin-top: 4px; }
        table { width: 100%; border-collapse: collapse; }
        th { text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; padding: 8px 4px; border-bottom: 1px solid #e5e7eb; }
        td { padding: 12px 4px; border-bottom: 1px solid #f3f4f6; font-size: 13px; }
        .amount { text-align: right; font-weight: 600; }
        .amount.expense { color: #b91c1c; }
        .amount.income { color: #15803d; }
      </style>
    </head>
    <body>
      <h1>${escapeHtml(title)}</h1>
      <p class="muted">${escapeHtml(rangeLabel)} · Generated ${escapeHtml(generatedAt)}</p>
      <div class="summary">
        <div class="summary-card">
          <div class="summary-label">Income</div>
          <div class="summary-value">${formatCurrency(summary.totalIn, currency)}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Expense</div>
          <div class="summary-value">${formatCurrency(summary.totalOut, currency)}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Net</div>
          <div class="summary-value">${formatCurrency(summary.net, currency)}</div>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Category</th>
            <th>Note</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          ${emptyState}
        </tbody>
      </table>
    </body>
  </html>`;
};

const buildCsv = (entries: LocalEntry[], metadata?: ReportMetadata) => {
  const title = metadata?.title || 'DhanDiary Financial Report';
  const rangeLabel = metadata?.rangeLabel || 'All activity';
  const generatedAt = metadata?.generatedAt || dayjs().format('DD MMM YYYY, HH:mm');
  const header = ['Date', 'Type', 'Category', 'Note', 'Amount'];
  const rows = entries
    .map((entry) => {
      const date = dayjs(entry.date || entry.created_at).format('YYYY-MM-DD');
      const type = entry.type === 'in' ? 'Income' : 'Expense';
      const category = entry.category || 'General';
      const note = entry.note || '';
      const amount = String(Number(entry.amount) || 0);
      return [date, type, category, note, amount].map((v) => csvEscape(v)).join(',');
    })
    .join('\n');
  const summaryBlock = `"Report Title","${title}"\n"Range","${rangeLabel}"\n"Generated","${generatedAt}"\n\n`;
  return `${summaryBlock}${header.join(',')}\n${rows}`;
};

export const exportEntriesAsPdf = async (
  entries: LocalEntry[],
  summary: ReportSummary,
  metadata?: ReportMetadata
) => {
  await ensureSharingAvailable();
  const html = buildHtml(entries, summary, metadata);
  const file = await Print.printToFileAsync({
    html,
  });
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/pdf',
    dialogTitle: 'Share PDF Report',
    UTI: 'com.adobe.pdf',
  });
};

export const exportEntriesAsCsv = async (entries: LocalEntry[], metadata?: ReportMetadata) => {
  await ensureSharingAvailable();
  const csv = buildCsv(entries, metadata);
  const fileName = `dhandiary_report_${dayjs().format('YYYYMMDD_HHmmss')}.csv`;
  const fileUri = `${FileSystem.cacheDirectory || ''}${fileName}`;
  await FileSystem.writeAsStringAsync(fileUri, csv, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  await Sharing.shareAsync(fileUri, {
    mimeType: 'text/csv',
    dialogTitle: 'Share Excel Report',
    UTI: 'public.comma-separated-values-text',
  });
};

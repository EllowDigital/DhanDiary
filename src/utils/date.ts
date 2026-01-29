import dayjs from 'dayjs';

/**
 * Parse various date inputs robustly into a Date instance.
 * - numbers < 1e12 are treated as seconds and multiplied by 1000
 * - strings that are numeric are treated similarly
 * - falls back to `new Date()` when parsing fails
 */
export function parseToDate(value: unknown): Date {
  try {
    if (value == null) return new Date();
    if (value instanceof Date) return value;
    const n = Number(value as any);
    if (!Number.isNaN(n) && typeof value !== 'object') {
      const ms = n < 1e12 ? n * 1000 : n;
      return new Date(ms);
    }
    const parsed = Date.parse(String(value));
    if (!Number.isNaN(parsed)) return new Date(parsed);
    return new Date();
  } catch (e) {
    return new Date();
  }
}

export function dayjsFrom(value: unknown) {
  return dayjs(parseToDate(value));
}

export function formatDate(value: unknown, fmt = 'MMM D, h:mm A') {
  try {
    return dayjsFrom(value).format(fmt);
  } catch (e) {
    return 'Invalid Date';
  }
}

export default { parseToDate, dayjsFrom, formatDate };

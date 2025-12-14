import { ensureCategory, DEFAULT_CATEGORY } from '../constants/categories';

export type EntryType = 'in' | 'out';

export type LocalEntry = {
  local_id: string;
  user_id: string;
  type: EntryType;
  amount: number;
  category: string;
  note?: string | null;
  currency?: string;
  date?: string | null;
  created_at: string;
  updated_at: string;
};

export type EntryInput = {
  local_id?: string;
  amount: number;
  category: string;
  note?: string | null;
  type: EntryType;
  currency?: string;
  date?: string | Date | null;
};

export type EntryUpdate = {
  amount?: number;
  category?: string;
  note?: string | null;
  type?: EntryType;
  currency?: string;
  date?: string | Date | null;
};

const toIsoString = (date: Date | null) => {
  if (!date) return null;
  const time = date.getTime();
  if (Number.isNaN(time)) return null;
  return new Date(time).toISOString();
};

// Helper to normalize arbitrary date inputs into ISO strings.
export const normalizeDate = (value?: string | Date | number | null) => {
  if (value === undefined || value === null || value === '') return null;
  try {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object' && value !== null && 'toDate' in (value as any)) {
      const converted = (value as any).toDate?.();
      const iso = toIsoString(converted instanceof Date ? converted : null);
      if (iso) return iso;
    }
    if (typeof value === 'number') {
      const ms = value < 1e12 ? value * 1000 : value;
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
    const s = String(value).trim();
    if (/^\d+$/.test(s)) {
      const n = Number(s);
      const ms = s.length === 10 ? n * 1000 : n;
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
    const direct = new Date(s);
    if (!Number.isNaN(direct.getTime())) return direct.toISOString();
    const fallback = new Date(s.replace(/-/g, '/'));
    if (!Number.isNaN(fallback.getTime())) return fallback.toISOString();
  } catch (e) {
    // ignore
  }
  return null;
};

export const mapToLocalEntry = (
  docId: string,
  userId: string,
  data: Record<string, any>
): LocalEntry => {
  const now = new Date().toISOString();
  const normalizedDate = normalizeDate(data.date) || now;
  return {
    local_id: docId,
    user_id: userId,
    type: (data.type as EntryType) || 'out',
    amount: Number(data.amount) || 0,
    category: ensureCategory(data.category || DEFAULT_CATEGORY),
    note: data.note ?? null,
    currency: data.currency || 'INR',
    date: normalizedDate,
    created_at: normalizeDate(data.createdAt) || normalizedDate,
    updated_at: normalizeDate(data.updatedAt) || normalizedDate,
  };
};

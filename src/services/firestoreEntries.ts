import {
  EntryInput,
  EntryUpdate,
  LocalEntry,
  mapToLocalEntry,
  normalizeDate,
} from '../types/entries';
import { ensureCategory, DEFAULT_CATEGORY } from '../constants/categories';
import {
  getEntries as localGetEntries,
  subscribeEntries as localSubscribeEntries,
  createEntry as localCreateEntry,
  patchEntry as localPatchEntry,
  removeEntry as localRemoveEntry,
  fetchEntriesGenerator as localFetchEntriesGenerator,
} from './localDb';

export const fetchEntries = async (userId: string): Promise<LocalEntry[]> => {
  if (!userId) return [];
  return await localGetEntries(userId);
};

export const subscribeEntries = (
  userId: string,
  onChange: (entries: LocalEntry[]) => void,
  onError?: (error: any) => void
) => {
  if (!userId) return () => undefined;
  return localSubscribeEntries(userId, onChange, onError);
};

const sanitizeInput = (input: EntryInput) => {
  const now = new Date().toISOString();
  const date = normalizeDate(input.date) || now;
  return {
    amount: Number(input.amount) || 0,
    category: ensureCategory(input.category || DEFAULT_CATEGORY),
    note: input.note ?? null,
    type: input.type === 'in' ? 'in' : 'out',
    currency: input.currency || 'INR',
    date,
    createdAt: now,
    updatedAt: now,
  };
};

// Client-side helpers for Spark-only incremental summaries
const toCents = (v: any) => Math.round((Number(v) || 0) * 100);
const ymd = (iso: string | undefined | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return {
    day: `${year}-${month}-${day}`,
    month: `${year}-${month}`,
    year: String(year),
  };
};

async function applyIncrementsClient(
  tx: any,
  docRef: any,
  increments: { inCents?: number; outCents?: number; count?: number }
) {
  const snap = await tx.get(docRef);
  const now = serverTimestamp();
  if (!snap.exists()) {
    const base: any = {
      totalInCents: 0,
      totalOutCents: 0,
      count: 0,
      updatedAt: now,
    };
    if (increments.inCents) base.totalInCents = increments.inCents;
    if (increments.outCents) base.totalOutCents = increments.outCents;
    if (increments.count) base.count = increments.count;
    tx.set(docRef, base, { merge: true });
    return;
  }

  const updates: any = { updatedAt: now };
  if (increments.inCents) updates.totalInCents = increment(increments.inCents);
  if (increments.outCents) updates.totalOutCents = increment(increments.outCents);
  if (increments.count) updates.count = increment(increments.count);
  tx.update(docRef, updates);
}

export const createEntry = async (userId: string, input: EntryInput): Promise<LocalEntry> => {
  if (!userId) throw new Error('userId is required to create an entry');
  return await localCreateEntry(userId, input as any);
};

export const patchEntry = async (
  userId: string,
  localId: string,
  updates: EntryUpdate
): Promise<void> => {
  if (!userId) throw new Error('userId is required to update an entry');
  if (!localId) throw new Error('localId is required to update an entry');
  return await localPatchEntry(userId, localId, updates as any);
};

export const removeEntry = async (userId: string, localId: string): Promise<void> => {
  if (!userId) throw new Error('userId is required to delete an entry');
  if (!localId) throw new Error('localId is required to delete an entry');
  return await localRemoveEntry(userId, localId);
};

// Async generator to page through entries without loading all into memory.
export async function* fetchEntriesGenerator(userId: string, pageSize = 500) {
  if (!userId) return;
  for await (const page of localFetchEntriesGenerator(userId, pageSize)) {
    yield page;
  }
}

import {
  FirestoreError,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  startAfter,
  query,
  serverTimestamp,
  updateDoc,
  runTransaction,
  writeBatch,
  increment,
} from 'firebase/firestore';
import { getFirestoreDb } from '../firebase';
import {
  EntryInput,
  EntryUpdate,
  LocalEntry,
  mapToLocalEntry,
  normalizeDate,
} from '../types/entries';
import { ensureCategory, DEFAULT_CATEGORY } from '../constants/categories';

const buildCollectionRef = (userId: string) => {
  const db = getFirestoreDb();
  return collection(db, 'users', userId, 'cash_entries');
};

export const fetchEntries = async (userId: string): Promise<LocalEntry[]> => {
  if (!userId) return [];
  const colRef = buildCollectionRef(userId);
  const q = query(colRef, orderBy('date', 'desc'), orderBy('createdAt', 'desc'), limit(500));
  const snap = await getDocs(q);
  return snap.docs.map((docSnap) => mapToLocalEntry(docSnap.id, userId, docSnap.data()));
};

export const subscribeEntries = (
  userId: string,
  onChange: (entries: LocalEntry[]) => void,
  onError?: (error: FirestoreError) => void
) => {
  if (!userId) return () => undefined;
  const colRef = buildCollectionRef(userId);
  const q = query(colRef, orderBy('date', 'desc'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const entries = snapshot.docs.map((docSnap) =>
        mapToLocalEntry(docSnap.id, userId, docSnap.data())
      );
      onChange(entries);
    },
    (error) => {
      console.warn('Entries listener error', error);
      onError?.(error);
    }
  );
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
  const colRef = buildCollectionRef(userId);
  const payload = sanitizeInput(input);

  const newDocRef = doc(colRef);
  await runTransaction(getFirestoreDb(), async (tx) => {
    tx.set(newDocRef, {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const when = ymd(payload.date);
    if (!when) return;
    const inC = payload.type === 'in' ? toCents(payload.amount) : 0;
    const outC = payload.type === 'out' ? toCents(payload.amount) : 0;

    const dailyRef = doc(getFirestoreDb(), 'users', userId, 'summaries', 'daily', 'items', when.day);
    const monthlyRef = doc(getFirestoreDb(), 'users', userId, 'summaries', 'monthly', 'items', when.month);
    const yearlyRef = doc(getFirestoreDb(), 'users', userId, 'summaries', 'yearly', 'items', when.year);

    await applyIncrementsClient(tx, dailyRef, { inCents: inC, outCents: outC, count: 1 });
    await applyIncrementsClient(tx, monthlyRef, { inCents: inC, outCents: outC, count: 1 });
    await applyIncrementsClient(tx, yearlyRef, { inCents: inC, outCents: outC, count: 1 });
  });

  return mapToLocalEntry(newDocRef.id, userId, payload);
};

export const patchEntry = async (
  userId: string,
  localId: string,
  updates: EntryUpdate
): Promise<void> => {
  if (!userId) throw new Error('userId is required to update an entry');
  if (!localId) throw new Error('localId is required to update an entry');
  const docRef = doc(getFirestoreDb(), 'users', userId, 'cash_entries', localId);

  await runTransaction(getFirestoreDb(), async (tx) => {
    const snap = await tx.get(docRef);
    if (!snap.exists()) throw new Error('entry not found');
    const before = snap.data() as any;

    const next: Record<string, any> = { updatedAt: serverTimestamp() };
    if (updates.amount !== undefined) next.amount = Number(updates.amount) || 0;
    if (updates.category !== undefined) next.category = ensureCategory(updates.category);
    if (updates.note !== undefined) next.note = updates.note ?? null;
    if (updates.type !== undefined) next.type = updates.type === 'in' ? 'in' : 'out';
    if (updates.currency !== undefined && updates.currency) next.currency = updates.currency;
    if (updates.date !== undefined) next.date = normalizeDate(updates.date);

    const after = { ...before, ...next };

    const beforeWhen = ymd(before.date || before.createdAt);
    const afterWhen = ymd(after.date || before.createdAt);

    const beforeIn = before.type === 'in' ? toCents(before.amount) : 0;
    const beforeOut = before.type === 'out' ? toCents(before.amount) : 0;
    const afterIn = after.type === 'in' ? toCents(after.amount) : 0;
    const afterOut = after.type === 'out' ? toCents(after.amount) : 0;

    tx.update(docRef, next);

    if (beforeWhen && afterWhen && beforeWhen.day === afterWhen.day) {
      const inDelta = afterIn - beforeIn;
      const outDelta = afterOut - beforeOut;
      if (inDelta !== 0 || outDelta !== 0) {
        const dailyRef = doc(getFirestoreDb(), 'users', userId, 'summaries', 'daily', 'items', afterWhen.day);
        const monthlyRef = doc(getFirestoreDb(), 'users', userId, 'summaries', 'monthly', 'items', afterWhen.month);
        const yearlyRef = doc(getFirestoreDb(), 'users', userId, 'summaries', 'yearly', 'items', afterWhen.year);
        await applyIncrementsClient(tx, dailyRef, { inCents: inDelta, outCents: outDelta, count: 0 });
        await applyIncrementsClient(tx, monthlyRef, { inCents: inDelta, outCents: outDelta, count: 0 });
        await applyIncrementsClient(tx, yearlyRef, { inCents: inDelta, outCents: outDelta, count: 0 });
      }
    } else {
      if (beforeWhen) {
        const dref = doc(getFirestoreDb(), 'users', userId, 'summaries', 'daily', 'items', beforeWhen.day);
        const mref = doc(getFirestoreDb(), 'users', userId, 'summaries', 'monthly', 'items', beforeWhen.month);
        const yref = doc(getFirestoreDb(), 'users', userId, 'summaries', 'yearly', 'items', beforeWhen.year);
        await applyIncrementsClient(tx, dref, { inCents: -beforeIn, outCents: -beforeOut, count: -1 });
        await applyIncrementsClient(tx, mref, { inCents: -beforeIn, outCents: -beforeOut, count: -1 });
        await applyIncrementsClient(tx, yref, { inCents: -beforeIn, outCents: -beforeOut, count: -1 });
      }
      if (afterWhen) {
        const dref = doc(getFirestoreDb(), 'users', userId, 'summaries', 'daily', 'items', afterWhen.day);
        const mref = doc(getFirestoreDb(), 'users', userId, 'summaries', 'monthly', 'items', afterWhen.month);
        const yref = doc(getFirestoreDb(), 'users', userId, 'summaries', 'yearly', 'items', afterWhen.year);
        await applyIncrementsClient(tx, dref, { inCents: afterIn, outCents: afterOut, count: 1 });
        await applyIncrementsClient(tx, mref, { inCents: afterIn, outCents: afterOut, count: 1 });
        await applyIncrementsClient(tx, yref, { inCents: afterIn, outCents: afterOut, count: 1 });
      }
    }
  });
};

export const removeEntry = async (userId: string, localId: string): Promise<void> => {
  if (!userId) throw new Error('userId is required to delete an entry');
  if (!localId) throw new Error('localId is required to delete an entry');
  const docRef = doc(getFirestoreDb(), 'users', userId, 'cash_entries', localId);

  await runTransaction(getFirestoreDb(), async (tx) => {
    const snap = await tx.get(docRef);
    if (!snap.exists()) return;
    const before = snap.data() as any;
    const when = ymd(before.date || before.createdAt);
    const inC = before.type === 'in' ? toCents(before.amount) : 0;
    const outC = before.type === 'out' ? toCents(before.amount) : 0;

    tx.delete(docRef);
    if (!when) return;
    const dref = doc(getFirestoreDb(), 'users', userId, 'summaries', 'daily', 'items', when.day);
    const mref = doc(getFirestoreDb(), 'users', userId, 'summaries', 'monthly', 'items', when.month);
    const yref = doc(getFirestoreDb(), 'users', userId, 'summaries', 'yearly', 'items', when.year);
    await applyIncrementsClient(tx, dref, { inCents: -inC, outCents: -outC, count: -1 });
    await applyIncrementsClient(tx, mref, { inCents: -inC, outCents: -outC, count: -1 });
    await applyIncrementsClient(tx, yref, { inCents: -inC, outCents: -outC, count: -1 });
  });
};

// Async generator to page through entries without loading all into memory.
export async function* fetchEntriesGenerator(userId: string, pageSize = 500) {
  if (!userId) return;
  const colRef = buildCollectionRef(userId);
  let lastDoc: any = undefined;
  while (true) {
    const q = lastDoc
      ? query(
          colRef,
          orderBy('date', 'desc'),
          orderBy('createdAt', 'desc'),
          startAfter(lastDoc),
          limit(pageSize)
        )
      : query(colRef, orderBy('date', 'desc'), orderBy('createdAt', 'desc'), limit(pageSize));
    const snap = await getDocs(q);
    if (!snap || !snap.docs || snap.docs.length === 0) break;
    const page = snap.docs.map((docSnap) => mapToLocalEntry(docSnap.id, userId, docSnap.data()));
    yield page;
    if (snap.docs.length < pageSize) break;
    lastDoc = snap.docs[snap.docs.length - 1];
  }
}

import {
  FirestoreError,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  startAfter,
  query,
  serverTimestamp,
  updateDoc,
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

export const createEntry = async (userId: string, input: EntryInput): Promise<LocalEntry> => {
  if (!userId) throw new Error('userId is required to create an entry');
  const colRef = buildCollectionRef(userId);
  const payload = sanitizeInput(input);
  const docRef = await addDoc(colRef, {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return mapToLocalEntry(docRef.id, userId, payload);
};

export const patchEntry = async (
  userId: string,
  localId: string,
  updates: EntryUpdate
): Promise<void> => {
  if (!userId) throw new Error('userId is required to update an entry');
  if (!localId) throw new Error('localId is required to update an entry');
  const docRef = doc(getFirestoreDb(), 'users', userId, 'cash_entries', localId);
  const next: Record<string, any> = { updatedAt: serverTimestamp() };

  if (updates.amount !== undefined) next.amount = Number(updates.amount) || 0;
  if (updates.category !== undefined) next.category = ensureCategory(updates.category);
  if (updates.note !== undefined) next.note = updates.note ?? null;
  if (updates.type !== undefined) next.type = updates.type === 'in' ? 'in' : 'out';
  if (updates.currency !== undefined && updates.currency) next.currency = updates.currency;
  if (updates.date !== undefined) next.date = normalizeDate(updates.date);

  await updateDoc(docRef, next);
};

export const removeEntry = async (userId: string, localId: string): Promise<void> => {
  if (!userId) throw new Error('userId is required to delete an entry');
  if (!localId) throw new Error('localId is required to delete an entry');
  const docRef = doc(getFirestoreDb(), 'users', userId, 'cash_entries', localId);
  await deleteDoc(docRef);
};

// Async generator to page through entries without loading all into memory.
export async function* fetchEntriesGenerator(userId: string, pageSize = 500) {
  if (!userId) return;
  const colRef = buildCollectionRef(userId);
  let lastDoc: any = undefined;
  while (true) {
    const q = lastDoc
      ? query(colRef, orderBy('date', 'desc'), orderBy('createdAt', 'desc'), startAfter(lastDoc), limit(pageSize))
      : query(colRef, orderBy('date', 'desc'), orderBy('createdAt', 'desc'), limit(pageSize));
    const snap = await getDocs(q);
    if (!snap || !snap.docs || snap.docs.length === 0) break;
    const page = snap.docs.map((docSnap) => mapToLocalEntry(docSnap.id, userId, docSnap.data()));
    yield page;
    if (snap.docs.length < pageSize) break;
    lastDoc = snap.docs[snap.docs.length - 1];
  }
}

// localDb.ts
// ------------------------------------------------------------
// Firestore-backed entries store (Expo-safe, Spark-plan friendly)
// ------------------------------------------------------------

import getDeviceId from './deviceId';

/* ------------------------------------------------------------------ */
/* Types */
/* ------------------------------------------------------------------ */

export type EntryInput = any;
export type EntryUpdate = any;
export type LocalEntry = any;

/* ------------------------------------------------------------------ */
/* Dynamic Firebase access (NO static imports) */
/* ------------------------------------------------------------------ */

const tryGetFirestore = () => {
  try {
    return require('@react-native-firebase/firestore');
  } catch {
    return null;
  }
};

const tryGetAuth = () => {
  try {
    return require('@react-native-firebase/auth');
  } catch {
    return null;
  }
};

/* ------------------------------------------------------------------ */
/* Helpers */
/* ------------------------------------------------------------------ */

function toIso(v?: string | Date | null) {
  if (!v) return new Date().toISOString();
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function mapDocToEntry(doc: any, userId: string): LocalEntry | null {
  try {
    const data = typeof doc.data === 'function' ? doc.data() : doc;
    if (!data) return null;

    return {
      local_id: doc.id,
      user_id: userId,
      amount: Number(data.amount) || 0,
      category: data.category || null,
      note: data.note ?? null,
      type: data.type === 'in' ? 'in' : 'out',
      currency: data.currency || 'INR',
      date: data.date || data.created_at,
      created_at: data.created_at,
      updated_at: data.updated_at || data.created_at,
      device_id: data.device_id || null,
      is_deleted: !!data.is_deleted,
      syncStatus: data.sync_status || 'SYNCED',
    };
  } catch (e) {
    console.error('mapDocToEntry failed', e);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Auth propagation guard */
/* ------------------------------------------------------------------ */

async function ensureAuthReady(userId: string, timeoutMs = 6000) {
  const authMod = tryGetAuth();
  if (!authMod) return true;

  const auth = authMod.default ? authMod.default() : authMod();
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const current = auth.currentUser;
    if (current && current.uid === userId) {
      try {
        if (typeof current.getIdToken === 'function') {
          await current.getIdToken(true);
        }
      } catch {}
      return true;
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Firestore collection helper */
/* ------------------------------------------------------------------ */

function entriesCollection(userId: string) {
  const fsMod = tryGetFirestore();
  if (!fsMod) throw new Error('Firestore not available');

  const firestore = fsMod.default ? fsMod.default() : fsMod();
  return firestore.collection('users').doc(userId).collection('entries');
}

/* ------------------------------------------------------------------ */
/* Public API */
/* ------------------------------------------------------------------ */

export async function initDB() {
  // no-op (Firestore-backed)
}

/* ------------------------ READ ------------------------ */

export async function getEntries(userId: string): Promise<LocalEntry[]> {
  await ensureAuthReady(userId);

  try {
    const col = entriesCollection(userId);
    const snap = await col.where('is_deleted', '==', false).limit(1000).get();

    const rows = snap.docs
      .map((d: any) => mapDocToEntry(d, userId))
      .filter(Boolean as any);

    rows.sort((a: any, b: any) => {
      const ta = new Date(a.date || a.created_at).getTime();
      const tb = new Date(b.date || b.created_at).getTime();
      return tb - ta;
    });

    return rows;
  } catch (e) {
    console.error('getEntries failed', e);
    return [];
  }
}

/* --------------------- REALTIME ---------------------- */

type Subscriber = (rows: LocalEntry[]) => void;
const listeners = new Map<string, () => void>();

export function subscribeEntries(userId: string, cb: Subscriber) {
  let cancelled = false;

  (async () => {
    const ok = await ensureAuthReady(userId);
    if (!ok || cancelled) return;

    try {
      const col = entriesCollection(userId);
      const ref = col.where('is_deleted', '==', false).limit(500);

      const unsubscribe = ref.onSnapshot(
        (snap: any) => {
          const rows = snap.docs
            .map((d: any) => mapDocToEntry(d, userId))
            .filter(Boolean as any)
            .sort((a: any, b: any) => {
              const ta = new Date(a.date || a.created_at).getTime();
              const tb = new Date(b.date || b.created_at).getTime();
              return tb - ta;
            });
          cb(rows);
        },
        (err: any) => console.error('subscribeEntries error', err)
      );

      listeners.set(userId, unsubscribe);
    } catch (e) {
      console.error('subscribeEntries setup failed', e);
    }
  })();

  return () => {
    cancelled = true;
    const unsub = listeners.get(userId);
    if (unsub) unsub();
    listeners.delete(userId);
  };
}

/* ---------------------- WRITE ------------------------ */

export async function createEntry(userId: string, entry: EntryInput) {
  await ensureAuthReady(userId);

  const id = entry?.local_id || generateId();
  const now = new Date().toISOString();

  const payload = {
    local_id: id,
    user_id: userId,
    amount: Number(entry.amount) || 0,
    category: entry.category || null,
    note: entry.note ?? null,
    type: entry.type === 'in' ? 'in' : 'out',
    currency: entry.currency || 'INR',
    date: entry.date ? toIso(entry.date) : now,
    created_at: now,
    updated_at: now,
    device_id: getDeviceId(),
    is_deleted: false,
    sync_status: 'SYNCED',
  };

  const col = entriesCollection(userId);
  await col.doc(id).set(payload, { merge: true });

  const doc = await col.doc(id).get();
  return mapDocToEntry(doc, userId);
}

export async function patchEntry(
  userId: string,
  localId: string,
  updates: EntryUpdate
) {
  const col = entriesCollection(userId);
  const payload: any = { updated_at: new Date().toISOString() };

  if (updates.amount !== undefined) payload.amount = Number(updates.amount) || 0;
  if (updates.category !== undefined) payload.category = updates.category;
  if (updates.note !== undefined) payload.note = updates.note ?? null;
  if (updates.type !== undefined) payload.type = updates.type === 'in' ? 'in' : 'out';
  if (updates.currency !== undefined) payload.currency = updates.currency;
  if (updates.date !== undefined) payload.date = toIso(updates.date);

  await col.doc(localId).set(payload, { merge: true });
}

export async function removeEntry(userId: string, localId: string) {
  const col = entriesCollection(userId);
  await col.doc(localId).set(
    {
      is_deleted: true,
      updated_at: new Date().toISOString(),
    },
    { merge: true }
  );
}

/* ---------------------- ADMIN ------------------------ */

export async function wipeUserData(userId: string) {
  const col = entriesCollection(userId);
  const snap = await col.get();

  const fsMod = tryGetFirestore();
  if (!fsMod) return;

  const firestore = fsMod.default ? fsMod.default() : fsMod();
  let batch = firestore.batch();
  let count = 0;

  for (const d of snap.docs) {
    batch.delete(d.ref);
    count++;
    if (count >= 500) {
      await batch.commit();
      batch = firestore.batch();
      count = 0;
    }
  }
  if (count > 0) await batch.commit();
}

/* ------------------------------------------------------------------ */
/* Default export */
/* ------------------------------------------------------------------ */

export default {
  initDB,
  getEntries,
  subscribeEntries,
  createEntry,
  patchEntry,
  removeEntry,
  wipeUserData,
};

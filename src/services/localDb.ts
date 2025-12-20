import getDeviceId from './deviceId';

type EntryInput = any;
type EntryUpdate = any;
type LocalEntry = any;

const tryGetFirestore = () => {
  try {
    return require('@react-native-firebase/firestore');
  } catch (e) {
    return null;
  }
};

const tryGetAuth = () => {
  try {
    return require('@react-native-firebase/auth');
  } catch (e) {
    return null;
  }
};

function toIso(v?: string | Date | null) {
  if (!v) return new Date().toISOString();
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function mapDocToEntry(doc: any, userId: string) {
  const data = doc.data();
  return {
    local_id: doc.id,
    user_id: userId,
    amount: Number(data.amount) || 0,
    category: data.category || null,
    note: data.note ?? null,
    type: data.type || 'out',
    currency: data.currency || 'INR',
    date: data.date || data.created_at || new Date().toISOString(),
    created_at: data.created_at || new Date().toISOString(),
    updated_at: data.updated_at || data.created_at || new Date().toISOString(),
    device_id: data.device_id || null,
    is_deleted: data.is_deleted ? 1 : 0,
    syncStatus: data.sync_status || 'SYNCED',
  } as LocalEntry;
}

export async function initDB() {
  // no-op for Firestore-backed store
  return;
}

function entriesCollection(userId: string) {
  const fs = tryGetFirestore();
  if (!fs) throw new Error('Firestore not available');
  const firestore = fs.default ? fs.default() : fs();
  // Ensure auth state is available and token propagated before performing
  // Firestore operations. Rules require request.auth.uid == uid, so if the
  // client hasn't yet attached an ID token the operation will be rejected.
  try {
    const authMod = tryGetAuth();
    if (authMod) {
      const authInstance = authMod.default ? authMod.default() : authMod();
      const waitForAuth = async (timeoutMs = 6000) => {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
          const current = authInstance.currentUser;
          if (current && current.uid === userId) return current;
          // small delay
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => setTimeout(r, 200));
        }
        return authInstance.currentUser;
      };
      const current = authInstance.currentUser && authInstance.currentUser.uid === userId ? authInstance.currentUser : await waitForAuth();
      if (!current || current.uid !== userId) {
        const err: any = new Error('localDb:unauthenticated');
        err.code = 'localdb/unauthenticated';
        err.message = 'No authenticated Firebase user matching uid; aborting Firestore access';
        throw err;
      }
      try {
        if (typeof current.getIdToken === 'function') {
          // Force refresh token to ensure Firestore sees authenticated requests
          await current.getIdToken(true).catch(() => {});
        }
      } catch (e) {
        // ignore token refresh errors; we'll likely surface a permission error later
      }
    }
  } catch (e) {
    // If auth checks fail, let Firestore operation attempt and surface the proper error
    // but log for diagnostics.
    console.debug('entriesCollection: auth propagation check failed', e?.message || e);
  }

  return firestore.collection('users').doc(userId).collection('entries');
}

export async function getEntries(userId: string): Promise<LocalEntry[]> {
  try {
    const col = entriesCollection(userId);
    const snap = await col.where('is_deleted', '==', false).orderBy('date', 'desc').limit(1000).get();
    return snap.docs.map((d: any) => mapDocToEntry(d, userId));
  } catch (e) {
    // If the read failed, try a paged generator fallback which can succeed
    // in some environments or provide more useful logs for large datasets.
    try {
      const out: LocalEntry[] = [];
      for await (const page of fetchEntriesGenerator(userId, 500)) {
        out.push(...page);
        if (out.length >= 1000) break;
      }
      return out;
    } catch (gerr) {
      console.error('localDb.getEntries: failed to fetch entries', e?.message || e, gerr?.message || gerr);
      return [];
    }
  }
}

type Subscriber = (entries: LocalEntry[]) => void;
const listeners = new Map<string, { ref: any; unsubscribe: any }>();

export function subscribeEntries(userId: string, cb: Subscriber) {
  try {
    const col = entriesCollection(userId);
    // Smaller realtime window for performance
    const ref = col.where('is_deleted', '==', false).orderBy('date', 'desc').limit(500);
    const unsub = ref.onSnapshot(
      (snap: any) => {
        try {
          const rows = snap.docs.map((d: any) => mapDocToEntry(d, userId));
          cb(rows);
        } catch (e) {
          console.error('subscribeEntries: callback error', e?.message || e);
        }
      },
      (err: any) => {
        console.error('subscribeEntries: onSnapshot error', err?.message || err);
        // Do not throw — caller's listener should decide how to recover.
      }
    );
    listeners.set(userId, { ref, unsubscribe: unsub });
  } catch (e: any) {
    console.error('subscribeEntries: failed to initialize listener', e?.message || e);
    // Return a no-op unsubscribe so callers can call it safely
    return () => {};
  }
  // return unsubscribe
  return () => {
    try {
      const l = listeners.get(userId);
      if (l && typeof l.unsubscribe === 'function') l.unsubscribe();
    } catch (e) {}
    listeners.delete(userId);
  };
}

export async function createEntry(userId: string, input: EntryInput): Promise<LocalEntry> {
  const id = input.local_id || generateId();
  const deviceId = await getDeviceId();
  const now = new Date().toISOString();
  const payload = {
    amount: Number(input.amount) || 0,
    category: input.category || null,
    note: input.note ?? null,
    type: input.type === 'in' ? 'in' : 'out',
    currency: input.currency || 'INR',
    date: toIso(input.date),
    created_at: now,
    updated_at: now,
    device_id: deviceId,
    is_deleted: false,
    sync_status: 'SYNCED',
  };
  const col = entriesCollection(userId);
  // Retry a couple times for transient network / quota issues
  const maxAttempts = 3;
  let attempt = 0;
  while (attempt < maxAttempts) {
    try {
      attempt++;
      await col.doc(id).set(payload, { merge: true });
      const doc = await col.doc(id).get();
      return mapDocToEntry(doc, userId);
    } catch (e: any) {
      console.error('localDb.createEntry: write attempt failed', { attempt, userId, err: e?.message || e });
      // If non-transient error (permission etc) abort early
      const msg = String(e?.message || e || 'unknown');
      if (msg.includes('permission') || msg.includes('PERMISSION_DENIED') || msg.includes('missing or insufficient permissions')) {
        const out: any = new Error('Failed to save entry due to Firestore permissions. ' + msg);
        out.original = e;
        throw out;
      }
      // small backoff
      await new Promise((res) => setTimeout(res, 200 * attempt));
    }
  }
  const out: any = new Error('Failed to save entry after multiple attempts. Check network and Firestore rules.');
  throw out;
}

export async function patchEntry(userId: string, localId: string, updates: EntryUpdate) {
  const col = entriesCollection(userId);
  const now = new Date().toISOString();
  const payload: any = { updated_at: now, sync_status: 'SYNCED' };
  if (updates.amount !== undefined) payload.amount = Number(updates.amount) || 0;
  if (updates.category !== undefined) payload.category = updates.category;
  if (updates.note !== undefined) payload.note = updates.note ?? null;
  if (updates.type !== undefined) payload.type = updates.type === 'in' ? 'in' : 'out';
  if (updates.currency !== undefined) payload.currency = updates.currency;
  if (updates.date !== undefined) payload.date = toIso(updates.date as any);
  await col.doc(localId).set(payload, { merge: true });
}

export async function removeEntry(userId: string, localId: string) {
  const col = entriesCollection(userId);
  const now = new Date().toISOString();
  await col.doc(localId).set({ is_deleted: true, updated_at: now, sync_status: 'SYNCED' }, { merge: true });
}

export async function getSummary(period: 'daily' | 'monthly' | 'yearly', key: string) {
  // Simple implementation: query entries in the period and aggregate
  // key formats expected: daily 'YYYY-MM-DD', monthly 'YYYY-MM', yearly 'YYYY'
  // We'll compute range start/end
  const parts = key.split('-');
  let start: Date, end: Date;
  if (period === 'daily') {
    start = new Date(key + 'T00:00:00Z');
    end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
  } else if (period === 'monthly') {
    const [y, m] = parts;
    start = new Date(`${y}-${m}-01T00:00:00Z`);
    end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
  } else {
    start = new Date(`${key}-01-01T00:00:00Z`);
    end = new Date(start);
    end.setUTCFullYear(end.getUTCFullYear() + 1);
  }
  // This function needs a user context; return null to signal not available here.
  return null;
}

export async function wipeUserData(userId: string) {
  const col = entriesCollection(userId);
  const snap = await col.get();
  const batchSize = 500;
  const fs = tryGetFirestore();
  const firestore = fs.default ? fs.default() : fs();
  let batch = firestore.batch();
  let counter = 0;
  for (const doc of snap.docs) {
    batch.delete(doc.ref);
    counter++;
    if (counter >= batchSize) {
      await batch.commit();
      batch = firestore.batch();
      counter = 0;
    }
  }
  if (counter > 0) await batch.commit();
}

// Minimal lock API kept for compatibility. These are no-ops for Firestore-backed store.
export async function isUserLocked(_userId: string) {
  return false;
}

export async function lockUser(_userId: string) {
  return;
}

export async function unlockUser(_userId: string) {
  return;
}

export default {
  initDB,
  getEntries,
  subscribeEntries,
  createEntry,
  patchEntry,
  removeEntry,
  getSummary,
  wipeUserData,
};

// Generator for pagination
export async function* fetchEntriesGenerator(userId: string, pageSize = 500) {
  const col = entriesCollection(userId);
  let last: any = null;
  while (true) {
    let q = col.where('is_deleted', '==', false).orderBy('date', 'desc').limit(pageSize);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (!snap || snap.docs.length === 0) break;
    yield snap.docs.map((d: any) => mapDocToEntry(d, userId));
    last = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < pageSize) break;
  }
}


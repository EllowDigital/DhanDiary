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

    } catch (e) {
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
      const current = authInstance.currentUser;
      // If current user not available or doesn't match requested uid, abort synchronously.
      if (!current || current.uid !== userId) {
        const err: any = new Error('localDb:unauthenticated');
        err.code = 'localdb/unauthenticated';
        err.message = 'No authenticated Firebase user matching uid; aborting Firestore access';
        throw err;
      }
      // Trigger a non-blocking token refresh so Firestore requests have a better
      // chance of being authenticated. Do not await here to keep this function sync.
      try {
        if (typeof current.getIdToken === 'function') {
          current.getIdToken(true).catch(() => {});
        }
      } catch (e) {
        // ignore
      }
    }
  } catch (e) {
    console.debug('entriesCollection: auth propagation check failed', e?.message || e);
  }

  return firestore.collection('users').doc(userId).collection('entries');
}

async function ensureAuthReady(userId: string, timeoutMs = 6000) {
  try {
    const authMod = tryGetAuth();
    if (!authMod) return true;
    const authInstance = authMod.default ? authMod.default() : authMod();
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const current = authInstance.currentUser;
      if (current && current.uid === userId) {
        try {
          if (typeof current.getIdToken === 'function') await current.getIdToken(true);
        } catch (e) {
          // ignore token refresh errors
        }
        return true;
      }
      // best-effort refresh on provided user object
      try {
        if (authInstance && authInstance.currentUser && typeof authInstance.currentUser.getIdToken === 'function') {
          authInstance.currentUser.getIdToken(true).catch(() => {});
        }
      } catch (e) {}
          console.error('subscribeEntries: background listener creation failed', e?.message || e);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 250));
    }
    return false;
  } catch (e) {
    return false;
  }
}

export async function getEntries(userId: string): Promise<LocalEntry[]> {
  try {
    await ensureAuthReady(userId);
    const col = entriesCollection(userId);
    // Avoid composite-index requirement by filtering server-side and
    // performing ordering client-side. For typical user datasets this
    // is acceptable; it prevents the app crashing when a composite
    // index is missing (Spark plan) and keeps security rules intact.
    const snap = await col.where('is_deleted', '==', false).limit(1000).get();
    const rows = snap.docs.map((d: any) => mapDocToEntry(d, userId));
    rows.sort((a: any, b: any) => {
      const ta = new Date(a.date || a.created_at).getTime() || 0;
      const tb = new Date(b.date || b.created_at).getTime() || 0;
      return tb - ta;
    });
    return rows;
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
    // Avoid ordering on server (composite index). We'll sort client-side
    // after receiving the snapshot so missing composite indexes don't
    // break listeners.
    const ref = col.where('is_deleted', '==', false).limit(500);
    const unsub = ref.onSnapshot(
      (snap: any) => {
        try {
          const rows = snap.docs.map((d: any) => mapDocToEntry(d, userId));
          rows.sort((a: any, b: any) => {
            const ta = new Date(a.date || a.created_at).getTime() || 0;
            const tb = new Date(b.date || b.created_at).getTime() || 0;
            return tb - ta;
          });
          cb(rows);
        } catch (e) {
          console.error('subscribeEntries: callback error', e?.message || e);
        }
      },
      (err: any) => {
        // Fast-path: try to create listener immediately
        const col = entriesCollection(userId);
        const ref = col.where('is_deleted', '==', false).limit(500);
        const unsub = ref.onSnapshot(
          (snap: any) => {
            try {
              const rows = snap.docs.map((d: any) => mapDocToEntry(d, userId));
              rows.sort((a: any, b: any) => {
                const ta = new Date(a.date || a.created_at).getTime() || 0;
                const tb = new Date(b.date || b.created_at).getTime() || 0;
                return tb - ta;
              });
              cb(rows);
            } catch (e) {
              console.error('subscribeEntries: callback error', e?.message || e);
            }
          },
          (err: any) => {
            console.error('subscribeEntries: onSnapshot error', err?.message || err);
          }
        );
        listeners.set(userId, { ref, unsubscribe: unsub });
        return () => {
          try {
            const l = listeners.get(userId);
            if (l && typeof l.unsubscribe === 'function') l.unsubscribe();
          } catch (e) {}
          listeners.delete(userId);
        };
      } catch (e) {
        // If immediate listener creation failed (likely unauthenticated), schedule
        // a background attempt to wait for auth and then create the listener.
        console.debug('subscribeEntries: initial listener failed, scheduling retry', e?.message || e);
        let cancelled = false;
        (async () => {
          const ok = await ensureAuthReady(userId);
          if (cancelled) return;
          if (!ok) {
            console.error('subscribeEntries: auth not ready; listener not created');
            return;
          }
          try {
            const col = entriesCollection(userId);
            const ref = col.where('is_deleted', '==', false).limit(500);
            const unsub = ref.onSnapshot(
              (snap: any) => {
                try {
                  const rows = snap.docs.map((d: any) => mapDocToEntry(d, userId));
                  rows.sort((a: any, b: any) => {
                    const ta = new Date(a.date || a.created_at).getTime() || 0;
                    const tb = new Date(b.date || b.created_at).getTime() || 0;
                    return tb - ta;
                  });
                  cb(rows);
                } catch (e) {
                  console.error('subscribeEntries: callback error', e?.message || e);
                }
              },
              (err: any) => console.error('subscribeEntries: onSnapshot error', err?.message || err)
            );
            listeners.set(userId, { ref, unsubscribe: unsub });
          } catch (e2) {
            console.error('subscribeEntries: background listener creation failed', e2?.message || e2);
          }
        })();
        // Return unsubscribe that cancels scheduled attempt and cleans up any listener created
        return () => {
          cancelled = true;
          try {
            const l = listeners.get(userId);
            if (l && typeof l.unsubscribe === 'function') l.unsubscribe();
          } catch (e) {}
          listeners.delete(userId);
        };
      }
    created_at: now,
    updated_at: now,
    device_id: deviceId,
    is_deleted: false,
    sync_status: 'SYNCED',
  };
  // Ensure auth state and token are propagated before attempting writes
  await ensureAuthReady(userId);
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
        // Attempt to refresh token and wait once before giving up
        try {
          await ensureAuthReady(userId, 3000);
        } catch (ie) {}
        // If this was the last attempt, fail with descriptive error
        if (attempt >= maxAttempts) {
          const out: any = new Error('Failed to save entry due to Firestore permissions. ' + msg);
          out.original = e;
          throw out;
        }
        // small backoff then retry
        await new Promise((res) => setTimeout(res, 300 * attempt));
        continue;
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
  // Avoid server-side ordering to prevent composite-index requirements.
  // We'll fetch matching docs and yield them in client-sorted pages.
  const snap = await col.where('is_deleted', '==', false).get();
  if (!snap || snap.docs.length === 0) return;
  const all = snap.docs.map((d: any) => mapDocToEntry(d, userId));
  all.sort((a: any, b: any) => {
    const ta = new Date(a.date || a.created_at).getTime() || 0;
    const tb = new Date(b.date || b.created_at).getTime() || 0;
    return tb - ta;
  });
  for (let i = 0; i < all.length; i += pageSize) {
    yield all.slice(i, i + pageSize);
  }
}


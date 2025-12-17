import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestoreDb } from '../firebase';
import {
  collection,
  doc,
  setDoc,
  writeBatch,
  query,
  where,
  orderBy,
  startAfter,
  limit,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import {
  getEntries,
  createEntry as localCreateEntry,
  patchEntry as localPatchEntry,
  removeEntry as localRemoveEntry,
} from './localDb';
import { wipeUserData, isUserLocked, lockUser, unlockUser } from './localDb';

const LAST_PULLED_KEY = (userId: string) => `localdb:lastPulledAt:${userId}`;
const LAST_PUSHED_KEY = (userId: string) => `localdb:lastPushedAt:${userId}`;
const BACKOFF_KEY = (userId: string) => `localdb:syncBackoff:${userId}`;

const DEFAULT_BATCH = 100;

// Compression mapping (client->cloud short keys)
const compress = (row: any) => ({
  i: row.local_id,
  a: Math.round((Number(row.amount) || 0) * 100), // cents as integer
  c: row.category,
  n: row.note ?? null,
  t: row.type,
  cu: row.currency || 'INR',
  d: row.date || row.created_at,
  u: typeof row.updated_at === 'number' ? row.updated_at : toMs((row as any).updated_at),
  di: (row as any).device_id || null,
  del: (row as any).is_deleted ? true : false,
  v: (row as any).version || 1,
});

const decompress = (remote: any) => ({
  local_id: remote.i || remote.id,
  amount: remote.a !== undefined ? (Number(remote.a) || 0) / 100 : Number(remote.amount) || 0,
  category: remote.c || remote.category,
  note: remote.n ?? remote.note ?? null,
  type: remote.t || remote.type,
  currency: remote.cu || remote.currency || 'INR',
  date: remote.d || remote.date,
  updatedAt: remote.u || remote.updatedAt || remote.updated_at,
  deviceId: remote.di || remote.deviceId || null,
  isDeleted: remote.del || remote.isDeleted || false,
  version: remote.v || remote.version || 1,
});

function toMs(v: any): number {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (v instanceof Timestamp) return v.toMillis();
  const n = Number(v);
  if (!Number.isNaN(n)) return n;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

async function getLastPulledAt(userId: string): Promise<number> {
  try {
    const v = await AsyncStorage.getItem(LAST_PULLED_KEY(userId));
    return v ? Number(v) || 0 : 0;
  } catch {
    return 0;
  }
}

async function setLastPulledAt(userId: string, ms: number) {
  try {
    await AsyncStorage.setItem(LAST_PULLED_KEY(userId), String(ms));
  } catch {}
}

async function getLastPushedAt(userId: string): Promise<number> {
  try {
    const v = await AsyncStorage.getItem(LAST_PUSHED_KEY(userId));
    return v ? Number(v) || 0 : 0;
  } catch {
    return 0;
  }
}

async function setLastPushedAt(userId: string, ms: number) {
  try {
    await AsyncStorage.setItem(LAST_PUSHED_KEY(userId), String(ms));
  } catch {}
}

async function getBackoff(userId: string) {
  try {
    const v = await AsyncStorage.getItem(BACKOFF_KEY(userId));
    return v ? JSON.parse(v) : { retries: 0, nextAt: 0 };
  } catch {
    return { retries: 0, nextAt: 0 };
  }
}

async function setBackoff(userId: string, state: any) {
  try {
    await AsyncStorage.setItem(BACKOFF_KEY(userId), JSON.stringify(state));
  } catch {}
}

export async function pushLocalChanges(userId: string, batchSize = DEFAULT_BATCH) {
  if (!userId) return;
  try {
    const now = Date.now();
    const back = await getBackoff(userId);
    if (back.nextAt && back.nextAt > Date.now()) {
      console.info('[sync] backing off until', new Date(back.nextAt).toISOString());
      return;
    }

    const local = await getEntries(userId);
    const lastPushed = await getLastPushedAt(userId);
    // Priority: deletes first, then updates (updated_at > lastPushed), then creates
    const deletes = local.filter((r: any) => r.is_deleted && r.syncStatus !== 'SYNCED');
    const updates = local.filter(
      (r: any) => !r.is_deleted && r.syncStatus === 'PENDING' && toMs(r.updated_at) > lastPushed
    );
    const creates = local.filter(
      (r: any) =>
        !r.is_deleted &&
        (r.syncStatus === 'PENDING' || !r.syncStatus) &&
        toMs(r.updated_at) <= lastPushed
    );
    const pending = [...deletes, ...updates, ...creates];
    if (!pending || pending.length === 0) return;

    const db = getFirestoreDb();
    // chunk and push
    for (let i = 0; i < pending.length; i += batchSize) {
      const chunk = pending.slice(i, i + batchSize);
      const batch = writeBatch(db);
      for (const row of chunk) {
        const docRef = doc(collection(db, 'users', userId, 'cash_entries'), row.local_id);
        const payload = compress(row);
        batch.set(docRef, payload, { merge: true });
      }
      try {
        await batch.commit();
        // on success reset backoff
        await setBackoff(userId, { retries: 0, nextAt: 0 });
        // update last pushed
        await setLastPushedAt(userId, now);
        // mark local rows as SYNCED by setting sync_status via localPatchEntry
        for (const row of chunk) {
          try {
            await localPatchEntry(userId, row.local_id, {} as any).catch(() => {});
          } catch {}
        }
      } catch (err) {
        console.warn('[sync] push chunk failed', err);
        // backoff
        const retries = (back.retries || 0) + 1;
        const delay = Math.min(60 * 60 * 1000, Math.pow(2, retries) * 1000); // exponential up to 1h
        const nextAt = Date.now() + delay;
        await setBackoff(userId, { retries, nextAt });
        return;
      }
    }
  } catch (e) {
    console.warn('[sync] pushLocalChanges failed', e);
  }
}

export async function pullRemoteChanges(
  userId: string,
  pageSize = DEFAULT_BATCH,
  opts?: { recentDays?: number; includeHistory?: boolean }
) {
  if (!userId) return;
  try {
    const db = getFirestoreDb();
    let lastPulled = await getLastPulledAt(userId);
    let lastSeen = lastPulled;

    const recentDays = opts?.recentDays ?? 90;
    const recentWindowMs = recentDays * 24 * 60 * 60 * 1000;
    const windowStart = Date.now() - recentWindowMs;

    const col = collection(db, 'users', userId, 'cash_entries');
    // Determine lower bound: either lastPulled or windowStart (for lazy historical sync)
    const lowerBound = opts?.includeHistory
      ? lastPulled || 0
      : Math.max(lastPulled || 0, windowStart);

    // Prefer compressed field 'u' (updated) if present on documents; fallback to 'updatedAt'
    let q: any;
    let fieldUsed = 'updatedAt';
    const tryField = async (field: string) => {
      try {
        if (lowerBound)
          return query(col, orderBy(field), where(field, '>', lowerBound), limit(pageSize));
        return query(col, orderBy(field), limit(pageSize));
      } catch (e) {
        return null;
      }
    };

    const qU = await tryField('u');
    if (qU) {
      q = qU;
      fieldUsed = 'u';
    } else {
      const qA = await tryField('updatedAt');
      if (qA) {
        q = qA;
        fieldUsed = 'updatedAt';
      } else {
        q = query(col, limit(pageSize));
        fieldUsed = 'updatedAt';
      }
    }

    while (true) {
      const snap = await getDocs(q);
      if (!snap || !snap.docs || snap.docs.length === 0) break;
      for (const ds of snap.docs) {
        const remoteRaw = ds.data() as any;
        // accept both compressed and full forms
        const remote = decompress(remoteRaw);
        const rid = ds.id;
        const remoteUpdated = toMs(remote.updatedAt || remote.u || 0);
        lastSeen = Math.max(lastSeen, remoteUpdated);

        const localRows = await getEntries(userId);
        const local = localRows.find((r) => r.local_id === rid) as any | undefined;

        if (!local && !remote.isDeleted) {
          await localCreateEntry(userId, {
            local_id: rid,
            amount: remote.amount || 0,
            category: remote.category || 'uncategorized',
            note: remote.note ?? null,
            type: remote.type === 'in' ? 'in' : 'out',
            currency: remote.currency || 'INR',
            date: remote.date || new Date(remoteUpdated).toISOString(),
          });
        } else if (local && remote.isDeleted) {
          await localRemoveEntry(userId, rid);
        } else if (local && !remote.isDeleted) {
          const localUpdated = toMs(
            local.updated_at || local.updatedAt || local.updatedAtMillis || 0
          );
          if (localUpdated === remoteUpdated) {
            const localDevice = (local as any).device_id || null;
            const remoteDevice = remote.deviceId || null;
            if (remoteDevice && localDevice && remoteDevice !== localDevice) {
              if (String(remoteDevice) < String(localDevice)) {
                await applyRemoteToLocal(userId, rid, remote);
              }
            }
          } else if (remoteUpdated > localUpdated) {
            await applyRemoteToLocal(userId, rid, remote);
          } else {
            // local newer -> keep local
          }
        }
      }

      if (snap.docs.length < pageSize) break;
      const lastDoc = snap.docs[snap.docs.length - 1];
      q = query(col, orderBy(fieldUsed), startAfter(lastDoc), limit(pageSize));
    }

    await setLastPulledAt(userId, lastSeen || Date.now());
  } catch (e) {
    console.warn('[sync] pullRemoteChanges failed', e);
  }
}

// Active auto-sync intervals per user
const activeSyncs: Record<string, { timer?: any; intervalMs: number }> = {};

export async function bootstrapFromRemoteOnFirstLogin(userId: string) {
  if (!userId) return;
  // If local DB already has entries for this user, do not overwrite
  const local = await getEntries(userId);
  if (local && local.length > 0) {
    // already initialized
    return;
  }

  // Ensure we lock the user while bootstrapping to avoid concurrent syncs
  await lockUser(userId);
  try {
    // Full pull (includeHistory) from remote - get everything
    await pullRemoteChanges(userId, DEFAULT_BATCH, { includeHistory: true });
    // set last pushed to now to avoid immediate re-pushing local empty set
    await setLastPushedAt(userId, Date.now());
  } finally {
    await unlockUser(userId);
  }
}

export function startAutoSync(userId: string, intervalMs = 30_000) {
  if (!userId) return;
  if (activeSyncs[userId] && activeSyncs[userId].timer) return;
  activeSyncs[userId] = { intervalMs };
  const timer = setInterval(async () => {
    try {
      const locked = await isUserLocked(userId);
      if (locked) return;
      await pushLocalChanges(userId);
      await pullRemoteChanges(userId);
    } catch (e) {
      console.warn('[sync] autoSync error', e);
    }
  }, intervalMs);
  activeSyncs[userId].timer = timer;
}

export function stopAutoSync(userId: string) {
  const s = activeSyncs[userId];
  if (s && s.timer) {
    clearInterval(s.timer);
    delete activeSyncs[userId];
  }
}

export async function stopSyncForUser(userId: string) {
  stopAutoSync(userId);
  await lockUser(userId);
}

export async function wipeLocalForUser(userId: string) {
  // stop sync, lock, wipe
  stopAutoSync(userId);
  await lockUser(userId);
  try {
    await wipeUserData(userId);
  } finally {
    await unlockUser(userId);
  }
}

async function applyRemoteToLocal(userId: string, id: string, remote: any) {
  try {
    const rows = await getEntries(userId);
    const local = rows.find((r) => r.local_id === id) as any | undefined;
    if (!local) {
      await localCreateEntry(userId, {
        local_id: id,
        amount: remote.amount || 0,
        category: remote.category || 'uncategorized',
        note: remote.note ?? null,
        type: remote.type === 'in' ? 'in' : 'out',
        currency: remote.currency || 'INR',
        date: remote.date || new Date(toMs(remote.updatedAt)).toISOString(),
      });
      return;
    }

    await localPatchEntry(userId, id, {
      amount: remote.amount || 0,
      category: remote.category || local.category,
      note: remote.note ?? local.note,
      type: remote.type === 'in' ? 'in' : 'out',
      currency: remote.currency || local.currency,
      date: remote.date || local.date,
    } as any);
  } catch (e) {
    console.warn('[sync] applyRemoteToLocal failed for', id, e);
  }
}

export async function runSyncOnce(userId: string) {
  if (!userId) return;
  if (await isUserLocked(userId)) {
    console.info('[sync] user locked, skipping runSyncOnce for', userId);
    return;
  }
  console.info('[sync] runSyncOnce start for', userId);
  try {
    await pushLocalChanges(userId);
    await pullRemoteChanges(userId);
    console.info('[sync] runSyncOnce complete for', userId);
  } catch (e) {
    console.warn('[sync] runSyncOnce error', e);
  }
}

export default {
  runSyncOnce,
  pushLocalChanges,
  pullRemoteChanges,
  bootstrapFromRemoteOnFirstLogin,
  startAutoSync,
  stopAutoSync,
  stopSyncForUser,
  wipeLocalForUser,
};

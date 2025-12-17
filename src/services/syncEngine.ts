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

const LAST_PULLED_KEY = (userId: string) => `localdb:lastPulledAt:${userId}`;

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

export async function pushLocalChanges(userId: string, batchSize = 200) {
  if (!userId) return;
  try {
    const local = await getEntries(userId);
    const pending = local.filter((r: any) => (r as any).syncStatus === 'PENDING' || !(r as any).syncStatus);
    if (!pending || pending.length === 0) return;

    const db = getFirestoreDb();
    for (let i = 0; i < pending.length; i += batchSize) {
      const chunk = pending.slice(i, i + batchSize);
      const batch = writeBatch(db);
      for (const row of chunk) {
        const docRef = doc(collection(db, 'users', userId, 'cash_entries'), row.local_id);
        const payload = {
          id: row.local_id,
          amount: row.amount,
          category: row.category,
          note: row.note ?? null,
          type: row.type,
          currency: row.currency || 'INR',
          date: row.date || row.created_at,
          updatedAt: typeof row.updated_at === 'number' ? row.updated_at : toMs((row as any).updated_at),
          deviceId: (row as any).device_id || null,
          isDeleted: (row as any).is_deleted ? true : false,
          version: (row as any).version || 1,
        };
        batch.set(docRef, payload, { merge: true });
      }
      await batch.commit();
      for (const row of chunk) {
        try {
          await localPatchEntry(userId, row.local_id, {} as any).catch(() => {});
        } catch {}
      }
    }
  } catch (e) {
    console.warn('[sync] pushLocalChanges failed', e);
  }
}

export async function pullRemoteChanges(userId: string, pageSize = 500) {
  if (!userId) return;
  try {
    const db = getFirestoreDb();
    let lastPulled = await getLastPulledAt(userId);
    let lastSeen = lastPulled;

    const col = collection(db, 'users', userId, 'cash_entries');
    let q = query(col, orderBy('updatedAt'), limit(pageSize));
    if (lastPulled) q = query(col, orderBy('updatedAt'), where('updatedAt', '>', lastPulled), limit(pageSize));

    while (true) {
      const snap = await getDocs(q);
      if (!snap || !snap.docs || snap.docs.length === 0) break;
      for (const ds of snap.docs) {
        const remote = ds.data() as any;
        const rid = ds.id;
        const remoteUpdated = toMs(remote.updatedAt || remote.updatedAtMillis || remote.updated_at || 0);
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
          const localUpdated = toMs(local.updated_at || local.updatedAt || local.updatedAtMillis || 0);
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
      q = query(col, orderBy('updatedAt'), startAfter(lastDoc), limit(pageSize));
    }

    await setLastPulledAt(userId, lastSeen || Date.now());
  } catch (e) {
    console.warn('[sync] pullRemoteChanges failed', e);
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
};

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getEntries,
  createEntry as localCreateEntry,
  patchEntry as localPatchEntry,
  removeEntry as localRemoveEntry,
  wipeUserData,
  isUserLocked,
  lockUser,
  unlockUser,
} from './localDb';

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
  // No-op in local-only mode. All changes are saved locally immediately.
  return;
}

export async function pullRemoteChanges(
  userId: string,
  pageSize = DEFAULT_BATCH,
  opts?: { recentDays?: number; includeHistory?: boolean }
) {
  // No-op in local-only mode.
  return;
}

// Active auto-sync intervals per user
const activeSyncs: Record<string, { timer?: any; intervalMs: number }> = {};

export async function bootstrapFromRemoteOnFirstLogin(userId: string) {
  // No-op in local-only mode. Local DB is authoritative.
  return;
}

export function startAutoSync(userId: string, intervalMs = 30_000) {
  // No-op for local-only mode
  return;
}

export function stopAutoSync(userId: string) {
  // No-op for local-only mode
}

export async function stopSyncForUser(userId: string) {
  // No-op for local-only mode
}

export async function wipeLocalForUser(userId: string) {
  // Use local wipe implementation
  await wipeUserData(userId);
}

async function applyRemoteToLocal(userId: string, id: string, remote: any) {
  // Not used in local-only mode
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

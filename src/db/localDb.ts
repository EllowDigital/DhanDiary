// Simplified localDb shim using AsyncStorage for lightweight storage.
import AsyncStorage from '../utils/AsyncStorageWrapper';
import { notifyEntriesChanged } from '../utils/dbEvents';
import { clearOfflineDbOwner } from './offlineOwner';

const KEY_ENTRIES = 'local_entries_v1';
const KEY_QUEUED_REMOTE = 'queued_remote_rows_v1';
const KEY_QUEUED_MAP = 'queued_local_remote_map_v1';
const KEY_SESSION = 'session';

export const init = async (): Promise<void> => {
  // No-op; AsyncStorage needs no initialization
  return;
};

export const isDbOperational = async () => {
  return false;
};

export const getDb = async () => {
  return null;
};

const readEntries = async (): Promise<any[]> => {
  const raw = await AsyncStorage.getItem(KEY_ENTRIES);
  return raw ? JSON.parse(raw) : [];
};

const writeEntries = async (arr: any[]) => {
  await AsyncStorage.setItem(KEY_ENTRIES, JSON.stringify(arr));
};

export const addLocalEntry = async (entry: any) => {
  const arr = await readEntries();
  arr.push({ ...entry, is_synced: 0, need_sync: 1, is_deleted: 0 });
  await writeEntries(arr);
  try {
    notifyEntriesChanged();
  } catch (e) {}
};

export const getEntries = async (userId?: string) => {
  const arr = await readEntries();
  if (!userId) return arr;
  return arr.filter((e) => e.user_id === userId && !e.is_deleted);
};

export const updateLocalEntry = async (localId: string, updates: any) => {
  const arr = await readEntries();
  const idx = arr.findIndex((x) => x.local_id === localId);
  if (idx >= 0) {
    arr[idx] = { ...arr[idx], ...updates, need_sync: 1, is_synced: 0, updated_at: new Date().toISOString() };
    await writeEntries(arr);
    try { notifyEntriesChanged(); } catch (e) {}
  }
};

export const markEntryDeleted = async (localId: string) => {
  const arr = await readEntries();
  const idx = arr.findIndex((x) => x.local_id === localId);
  if (idx >= 0) {
    arr[idx].is_deleted = 1;
    arr[idx].need_sync = 1;
    arr[idx].is_synced = 0;
    arr[idx].updated_at = new Date().toISOString();
    await writeEntries(arr);
    try { notifyEntriesChanged(); } catch (e) {}
  }
};

export const markEntrySynced = async (localId: string, remoteId?: string, serverVersion?: number, syncedUpdatedAt?: string | null) => {
  const arr = await readEntries();
  const idx = arr.findIndex((x) => x.local_id === localId);
  if (idx >= 0) {
    arr[idx].is_synced = 1;
    arr[idx].need_sync = 0;
    if (remoteId) arr[idx].remote_id = remoteId;
    if (typeof serverVersion === 'number') arr[idx].server_version = serverVersion;
    if (syncedUpdatedAt) arr[idx].updated_at = syncedUpdatedAt;
    await writeEntries(arr);
    try { notifyEntriesChanged(); } catch (e) {}
  }
};

export const deleteLocalEntry = async (localId: string) => {
  let arr = await readEntries();
  arr = arr.filter((x) => x.local_id !== localId);
  await writeEntries(arr);
  try { notifyEntriesChanged(); } catch (e) {}
};

export const getEntryByLocalId = async (localId: string) => {
  const arr = await readEntries();
  return arr.find((x) => x.local_id === localId) || null;
};

export const getLocalByRemoteId = async (remoteId: string) => {
  const arr = await readEntries();
  return arr.find((x) => String(x.remote_id) === String(remoteId)) || null;
};

export const getLocalByClientId = async (clientId: string) => {
  const arr = await readEntries();
  return arr.find((x) => x.local_id === clientId || String(x.remote_id) === String(clientId)) || null;
};

export const getUnsyncedEntries = async () => {
  const arr = await readEntries();
  return arr.filter((x) => x.need_sync === 1 || (x.is_deleted === 1 && x.is_synced === 0) || (x.is_synced === 0 && !x.remote_id));
};

export const upsertLocalFromRemote = async (remote: any) => {
  const arr = await readEntries();
  const existing = arr.find((x) => String(x.remote_id) === String(remote.id));
  const now = new Date().toISOString();
  if (existing) {
    existing.user_id = remote.user_id;
    existing.type = remote.type;
    existing.amount = remote.amount;
    existing.category = remote.category;
    existing.note = remote.note || null;
    existing.currency = remote.currency || 'INR';
    existing.server_version = typeof remote.server_version === 'number' ? remote.server_version : 0;
    existing.created_at = existing.created_at || now;
    existing.updated_at = remote.updated_at || now;
    existing.is_synced = 1;
    existing.is_deleted = remote.deleted ? 1 : 0;
    await writeEntries(arr);
    try { notifyEntriesChanged(); } catch (e) {}
    return existing.local_id;
  }
  const localId = remote.client_id && remote.client_id.length ? String(remote.client_id) : `remote_${remote.id}`;
  arr.push({
    local_id: localId,
    remote_id: String(remote.id),
    user_id: remote.user_id,
    type: remote.type,
    amount: remote.amount,
    category: remote.category,
    note: remote.note || null,
    date: remote.date || null,
    currency: remote.currency || 'INR',
    server_version: typeof remote.server_version === 'number' ? remote.server_version : 0,
    created_at: remote.created_at || now,
    updated_at: remote.updated_at || now,
    is_synced: 1,
    is_deleted: remote.deleted ? 1 : 0,
  });
  await writeEntries(arr);
  try { notifyEntriesChanged(); } catch (e) {}
  return localId;
};

export async function* fetchEntriesGenerator(userId: string, pageSize: number = 1000) {
  const arr = await readEntries();
  const filtered = arr.filter((x) => x.user_id === userId && !x.is_deleted);
  for (let i = 0; i < filtered.length; i += pageSize) {
    yield filtered.slice(i, i + pageSize);
  }
}

export const getSummary = async (period: 'daily' | 'monthly', key: string) => {
  return null;
};

export const addPendingProfileUpdate = async () => { throw new Error('addPendingProfileUpdate: not implemented when SQLite disabled'); };
export const getPendingProfileUpdates = async () => [];
export const markPendingProfileProcessed = async () => { throw new Error('markPendingProfileProcessed: not implemented when SQLite disabled'); };

// Queues implemented with AsyncStorage
const readQueued = async (key: string) => {
  const raw = await AsyncStorage.getItem(key);
  return raw ? JSON.parse(raw) : [];
};

const writeQueued = async (key: string, arr: any[]) => {
  await AsyncStorage.setItem(key, JSON.stringify(arr));
};

export const queueRemoteRow = async (remote: any) => {
  const arr = await readQueued(KEY_QUEUED_REMOTE);
  arr.push({ id: Date.now() + Math.random(), payload: JSON.stringify(remote), queued_at: new Date().toISOString(), attempts: 0 });
  await writeQueued(KEY_QUEUED_REMOTE, arr);
};

export const getQueuedRemoteRows = async () => {
  return await readQueued(KEY_QUEUED_REMOTE);
};

export const removeQueuedRemoteRow = async (id: number) => {
  let arr = await readQueued(KEY_QUEUED_REMOTE);
  arr = arr.filter((x: any) => x.id !== id);
  await writeQueued(KEY_QUEUED_REMOTE, arr);
};

export const queueLocalRemoteMapping = async (localId: string, remoteId: string) => {
  const arr = await readQueued(KEY_QUEUED_MAP);
  arr.push({ id: Date.now() + Math.random(), local_id: localId, remote_id: remoteId, queued_at: new Date().toISOString(), attempts: 0 });
  await writeQueued(KEY_QUEUED_MAP, arr);
};

export const getQueuedLocalRemoteMappings = async () => {
  return await readQueued(KEY_QUEUED_MAP);
};

export const removeQueuedLocalRemoteMapping = async (id: number) => {
  let arr = await readQueued(KEY_QUEUED_MAP);
  arr = arr.filter((x: any) => x.id !== id);
  await writeQueued(KEY_QUEUED_MAP, arr);
};

export const flushQueuedRemoteRows = async () => {
  await writeQueued(KEY_QUEUED_REMOTE, []);
  return { processed: 0 };
};

export const flushQueuedLocalRemoteMappings = async () => {
  await writeQueued(KEY_QUEUED_MAP, []);
  return { processed: 0 };
};

export const flushFallbackLocalEntries = async () => ({ processed: 0 });

export const clearAllData = async (opts?: { includeSession?: boolean }) => {
  if (opts?.includeSession !== false) {
    await AsyncStorage.removeItem(KEY_SESSION);
  }
  await AsyncStorage.removeItem(KEY_ENTRIES);
  await AsyncStorage.removeItem(KEY_QUEUED_REMOTE);
  await AsyncStorage.removeItem(KEY_QUEUED_MAP);
};

export const wipeLocalDatabase = async () => {
  await clearAllData({ includeSession: true });
  try { await clearOfflineDbOwner(); } catch (e) {}
};

export default {
  init,
  getDb,
  // Entries
  addLocalEntry,
  getEntries,
  updateLocalEntry,
  markEntryDeleted,
  markEntrySynced,
  getEntryByLocalId,
  getLocalByRemoteId,
  upsertLocalFromRemote,
  getUnsyncedEntries,
  // Session
  getSession: async () => {
    const s = await AsyncStorage.getItem(KEY_SESSION);
    return s ? JSON.parse(s) : null;
  },
  saveSession: async (session: any) => {
    return AsyncStorage.setItem(KEY_SESSION, JSON.stringify(session));
  },
  clearSession: async () => {
    return AsyncStorage.removeItem(KEY_SESSION);
  },
  // Queues
  queueRemoteRow,
  flushQueuedRemoteRows,
  queueLocalRemoteMapping,
  flushQueuedLocalRemoteMappings,
  flushFallbackLocalEntries,
  // Maintenance
  wipeLocalDatabase,
  isDbOperational,
};

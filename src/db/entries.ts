import * as localDb from './localDb';

export type LocalEntry = any;

export const getEntries = async (userId: string) => {
  return localDb.getEntries(userId);
};

export const addLocalEntry = async (entry: any) => {
  return localDb.addLocalEntry(entry);
};

export const updateLocalEntry = async (localId: string, updates: any) => {
  return localDb.updateLocalEntry(localId, updates);
};

export const markEntryDeleted = async (localId: string) => {
  return localDb.markEntryDeleted(localId);
};

export const markEntrySynced = async (localId: string, remoteId?: string, serverVersion?: number, syncedUpdatedAt?: string | null) => {
  return localDb.markEntrySynced(localId, remoteId, serverVersion, syncedUpdatedAt);
};

export const deleteLocalEntry = async (localId: string) => {
  return localDb.deleteLocalEntry(localId);
};

export const getEntryByLocalId = async (localId: string) => {
  return localDb.getEntryByLocalId(localId);
};

export const getLocalByRemoteId = async (remoteId: string) => {
  return localDb.getLocalByRemoteId(remoteId);
};

export const upsertLocalFromRemote = async (remote: any) => {
  return localDb.upsertLocalFromRemote(remote);
};

export const getLocalByClientId = async (clientId: string) => {
  return localDb.getLocalByClientId(clientId);
};

export const getUnsyncedEntries = async () => {
  return localDb.getUnsyncedEntries();
};

export async function* fetchEntriesGenerator(userId: string, pageSize: number = 1000) {
  for await (const chunk of localDb.fetchEntriesGenerator(userId, pageSize)) {
    yield chunk;
  }
}

export const getSummary = async (period: 'daily' | 'monthly', key: string) => {
  return localDb.getSummary(period, key);
};

export default {
  getEntries,
  addLocalEntry,
  updateLocalEntry,
  markEntryDeleted,
  markEntrySynced,
  getEntryByLocalId,
  getLocalByRemoteId,
  upsertLocalFromRemote,
  markLocalDeletedByRemoteId: async (remoteId: string) => {
    // Mark local deleted by remote id via localDb
    const rec = await localDb.getLocalByRemoteId(remoteId);
    if (rec && rec.local_id) return localDb.markEntryDeleted(rec.local_id);
    return null;
  },
  getLocalByClientId,
  getUnsyncedEntries,
  deleteLocalEntry,
};

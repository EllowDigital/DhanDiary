// Offline/local DB support disabled: app requires online NeonDB/Clerk.
const offlineError = (fnName = '') => {
  throw new Error(`Offline/local DB disabled (${fnName}). App requires online NeonDB/Clerk.`);
};

export const init = async (): Promise<void> => offlineError('init');
export const isDbOperational = async () => offlineError('isDbOperational');
export const getDb = async () => offlineError('getDb');

export const addLocalEntry = async () => offlineError('addLocalEntry');
export const getEntries = async () => offlineError('getEntries');
export const updateLocalEntry = async () => offlineError('updateLocalEntry');
export const markEntryDeleted = async () => offlineError('markEntryDeleted');
export const markEntrySynced = async () => offlineError('markEntrySynced');
export const getEntryByLocalId = async () => offlineError('getEntryByLocalId');
export const getLocalByRemoteId = async () => offlineError('getLocalByRemoteId');
export const upsertLocalFromRemote = async () => offlineError('upsertLocalFromRemote');
export const getLocalByClientId = async () => offlineError('getLocalByClientId');
export const getUnsyncedEntries = async () => offlineError('getUnsyncedEntries');
export const fetchEntriesGenerator = async function* () {
  offlineError('fetchEntriesGenerator');
};

export const getSummary = async () => offlineError('getSummary');

export const addPendingProfileUpdate = async () => offlineError('addPendingProfileUpdate');
export const getPendingProfileUpdates = async () => offlineError('getPendingProfileUpdates');
export const markPendingProfileProcessed = async () => offlineError('markPendingProfileProcessed');

export const queueRemoteRow = async () => offlineError('queueRemoteRow');
export const getQueuedRemoteRows = async () => offlineError('getQueuedRemoteRows');
export const removeQueuedRemoteRow = async () => offlineError('removeQueuedRemoteRow');
export const flushQueuedRemoteRows = async () => offlineError('flushQueuedRemoteRows');
export const queueLocalRemoteMapping = async () => offlineError('queueLocalRemoteMapping');
export const getQueuedLocalRemoteMappings = async () =>
  offlineError('getQueuedLocalRemoteMappings');
export const removeQueuedLocalRemoteMapping = async () =>
  offlineError('removeQueuedLocalRemoteMapping');
export const flushQueuedLocalRemoteMappings = async () =>
  offlineError('flushQueuedLocalRemoteMappings');

export const flushFallbackLocalEntries = async () => offlineError('flushFallbackLocalEntries');

export const clearAllData = async () => offlineError('clearAllData');
export const wipeLocalDatabase = async () => offlineError('wipeLocalDatabase');

export default {
  init,
  getDb,
  addLocalEntry,
  getEntries,
  updateLocalEntry,
  markEntryDeleted,
  markEntrySynced,
  getEntryByLocalId,
  getLocalByRemoteId,
  upsertLocalFromRemote,
  getUnsyncedEntries,
  fetchEntriesGenerator,
  getSummary,
  addPendingProfileUpdate,
  getPendingProfileUpdates,
  markPendingProfileProcessed,
  queueRemoteRow,
  getQueuedRemoteRows,
  removeQueuedRemoteRow,
  queueLocalRemoteMapping,
  getQueuedLocalRemoteMappings,
  removeQueuedLocalRemoteMapping,
  flushQueuedRemoteRows,
  flushQueuedLocalRemoteMappings,
  flushFallbackLocalEntries,
  clearAllData,
  wipeLocalDatabase,
  isDbOperational,
};

// Offline/local DB support disabled: app requires online NeonDB/Clerk.
const offlineError = (fnName = ''): never => {
  throw new Error(`Offline/local DB disabled (${fnName}). App requires online NeonDB/Clerk.`);
};

// Export functions with compatible signatures so callers across the app compile
export const init = async (..._args: any[]): Promise<void> => offlineError('init');
export const isDbOperational = async (..._args: any[]) => offlineError('isDbOperational');
export const getDb = async (..._args: any[]) => offlineError('getDb');

export const addLocalEntry = async (..._args: any[]) => offlineError('addLocalEntry');
export const getEntries = async (..._args: any[]): Promise<any[]> => offlineError('getEntries');
export const updateLocalEntry = async (..._args: any[]) => offlineError('updateLocalEntry');
export const markEntryDeleted = async (..._args: any[]) => offlineError('markEntryDeleted');
export const markEntrySynced = async (..._args: any[]) => offlineError('markEntrySynced');
export const getEntryByLocalId = async (..._args: any[]): Promise<any | null> =>
  offlineError('getEntryByLocalId');
export const getLocalByRemoteId = async (..._args: any[]): Promise<any | null> =>
  offlineError('getLocalByRemoteId');
export const upsertLocalFromRemote = async (..._args: any[]) =>
  offlineError('upsertLocalFromRemote');
export const getLocalByClientId = async (..._args: any[]): Promise<any | null> =>
  offlineError('getLocalByClientId');
export const getUnsyncedEntries = async (..._args: any[]): Promise<any[]> =>
  offlineError('getUnsyncedEntries');

// eslint-disable-next-line require-yield
export const fetchEntriesGenerator = async function* (
  ..._args: any[]
): AsyncGenerator<any, void, unknown> {
  offlineError('fetchEntriesGenerator');
};

export const getSummary = async (..._args: any[]): Promise<any> => offlineError('getSummary');

export const addPendingProfileUpdate = async (..._args: any[]) =>
  offlineError('addPendingProfileUpdate');
export const getPendingProfileUpdates = async (..._args: any[]): Promise<any[]> =>
  offlineError('getPendingProfileUpdates');
export const markPendingProfileProcessed = async (..._args: any[]) =>
  offlineError('markPendingProfileProcessed');

export const queueRemoteRow = async (..._args: any[]) => offlineError('queueRemoteRow');
export const getQueuedRemoteRows = async (..._args: any[]) => offlineError('getQueuedRemoteRows');
export const removeQueuedRemoteRow = async (..._args: any[]) =>
  offlineError('removeQueuedRemoteRow');
export const flushQueuedRemoteRows = async (..._args: any[]) =>
  offlineError('flushQueuedRemoteRows');
export const queueLocalRemoteMapping = async (..._args: any[]) =>
  offlineError('queueLocalRemoteMapping');
export const getQueuedLocalRemoteMappings = async (..._args: any[]) =>
  offlineError('getQueuedLocalRemoteMappings');
export const removeQueuedLocalRemoteMapping = async (..._args: any[]) =>
  offlineError('removeQueuedLocalRemoteMapping');
export const flushQueuedLocalRemoteMappings = async (..._args: any[]) =>
  offlineError('flushQueuedLocalRemoteMappings');

export const flushFallbackLocalEntries = async (..._args: any[]) =>
  offlineError('flushFallbackLocalEntries');

export const clearAllData = async (..._args: any[]) => offlineError('clearAllData');
export const wipeLocalDatabase = async (..._args: any[]) => offlineError('wipeLocalDatabase');

// Provide compat exports for session helpers (redirect to session module)
import * as session from './session';
export const getSession = session.getSession;
export const saveSession = session.saveSession;
export const clearSession = session.clearSession;

export const deleteLocalEntry = async (..._args: any[]) => offlineError('deleteLocalEntry');

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
  getSession,
  saveSession,
  clearSession,
  deleteLocalEntry,
};

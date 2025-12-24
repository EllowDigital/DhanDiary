// AsyncStorage-backed queueing disabled for online-only mode. Do not persist
// transactions or large objects in AsyncStorage. Keep APIs as no-ops returning
// safe defaults so callers continue to work without error.

export const queueRemoteRow = async (_remote: any) => {
  return null;
};

export const getQueuedRemoteRows = async () => [];

export const removeQueuedRemoteRow = async (_id: number) => {
  return null;
};

export const queueLocalRemoteMapping = async (_localId: string, _remoteId: string) => {
  return null;
};

export const getQueuedLocalRemoteMappings = async () => [];

export const removeQueuedLocalRemoteMapping = async (_id: number) => {
  return null;
};

export const flushQueuedRemoteRows = async () => ({ processed: 0 });

export const flushQueuedLocalRemoteMappings = async () => ({ processed: 0 });

export default {
  queueRemoteRow,
  getQueuedRemoteRows,
  removeQueuedRemoteRow,
  queueLocalRemoteMapping,
  getQueuedLocalRemoteMappings,
  removeQueuedLocalRemoteMapping,
};

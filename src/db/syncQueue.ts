import AsyncStorage from '../utils/AsyncStorageWrapper';

const KEY_QUEUED_REMOTE = 'queued_remote_rows_v1';
const KEY_QUEUED_MAP = 'queued_local_remote_map_v1';

const read = async (key: string) => {
  const raw = await AsyncStorage.getItem(key);
  return raw ? JSON.parse(raw) : [];
};

const write = async (key: string, arr: any[]) => {
  await AsyncStorage.setItem(key, JSON.stringify(arr));
};

export const queueRemoteRow = async (remote: any) => {
  const arr = await read(KEY_QUEUED_REMOTE);
  arr.push({
    id: Date.now() + Math.random(),
    payload: JSON.stringify(remote),
    queued_at: new Date().toISOString(),
    attempts: 0,
  });
  await write(KEY_QUEUED_REMOTE, arr);
};

export const getQueuedRemoteRows = async () => {
  return await read(KEY_QUEUED_REMOTE);
};

export const removeQueuedRemoteRow = async (id: number) => {
  let arr = await read(KEY_QUEUED_REMOTE);
  arr = arr.filter((x: any) => x.id !== id);
  await write(KEY_QUEUED_REMOTE, arr);
};

export const queueLocalRemoteMapping = async (localId: string, remoteId: string) => {
  const arr = await read(KEY_QUEUED_MAP);
  arr.push({
    id: Date.now() + Math.random(),
    local_id: localId,
    remote_id: remoteId,
    queued_at: new Date().toISOString(),
    attempts: 0,
  });
  await write(KEY_QUEUED_MAP, arr);
};

export const getQueuedLocalRemoteMappings = async () => {
  return await read(KEY_QUEUED_MAP);
};

export const removeQueuedLocalRemoteMapping = async (id: number) => {
  let arr = await read(KEY_QUEUED_MAP);
  arr = arr.filter((x: any) => x.id !== id);
  await write(KEY_QUEUED_MAP, arr);
};

export const flushQueuedRemoteRows = async () => {
  await write(KEY_QUEUED_REMOTE, []);
  return { processed: 0 };
};

export const flushQueuedLocalRemoteMappings = async () => {
  await write(KEY_QUEUED_MAP, []);
  return { processed: 0 };
};

export default {
  queueRemoteRow,
  getQueuedRemoteRows,
  removeQueuedRemoteRow,
  queueLocalRemoteMapping,
  getQueuedLocalRemoteMappings,
  removeQueuedLocalRemoteMapping,
};

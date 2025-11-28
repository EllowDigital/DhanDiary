// Flush queued remote rows
export const flushQueuedRemoteRows = async () => {
  const rows = await getQueuedRemoteRows();
  for (const row of rows) {
    // Implement actual remote sync logic here
    // For now, just remove from queue
    await removeQueuedRemoteRow(row.id);
  }
};

// Flush queued local->remote mappings
export const flushQueuedLocalRemoteMappings = async () => {
  const mappings = await getQueuedLocalRemoteMappings();
  for (const map of mappings) {
    // Implement actual mapping sync logic here
    // For now, just remove from queue
    await removeQueuedLocalRemoteMapping(map.id);
  }
};
import sqlite from './sqlite';

export const queueRemoteRow = async (remote: any) => {
  const db = await sqlite.open();
  await db.run('INSERT INTO queued_remote_rows (payload, queued_at, attempts) VALUES (?, ?, 0)', [
    JSON.stringify(remote),
    new Date().toISOString(),
  ]);
};

export const getQueuedRemoteRows = async () => {
  const db = await sqlite.open();
  return await db.all<{ id: number; payload: string; queued_at: string; attempts: number }>(
    'SELECT * FROM queued_remote_rows ORDER BY id ASC'
  );
};

export const removeQueuedRemoteRow = async (id: number) => {
  const db = await sqlite.open();
  await db.run('DELETE FROM queued_remote_rows WHERE id = ?', [id]);
};

export const queueLocalRemoteMapping = async (localId: string, remoteId: string) => {
  const db = await sqlite.open();
  await db.run(
    'INSERT INTO queued_local_remote_map (local_id, remote_id, queued_at, attempts) VALUES (?, ?, ?, 0)',
    [localId, remoteId, new Date().toISOString()]
  );
};

export const getQueuedLocalRemoteMappings = async () => {
  const db = await sqlite.open();
  return await db.all<{
    id: number;
    local_id: string;
    remote_id: string;
    queued_at: string;
    attempts: number;
  }>('SELECT * FROM queued_local_remote_map ORDER BY id ASC');
};

export const removeQueuedLocalRemoteMapping = async (id: number) => {
  const db = await sqlite.open();
  await db.run('DELETE FROM queued_local_remote_map WHERE id = ?', [id]);
};

export default {
  queueRemoteRow,
  getQueuedRemoteRows,
  removeQueuedRemoteRow,
  queueLocalRemoteMapping,
  getQueuedLocalRemoteMappings,
  removeQueuedLocalRemoteMapping,
};

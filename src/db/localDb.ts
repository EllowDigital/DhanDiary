import sqlite from './sqlite';
import migrations from './migrations';
import * as entries from './entries';
import * as session from './session';
import * as syncQueue from './syncQueue';

// Adapter / compatibility layer for existing imports across the codebase.
// New code should import modules from `src/db/{entries,session,syncQueue}` directly.

let _init: Promise<void> | null = null;

export const init = async () => {
  if (_init) return _init;
  _init = (async () => {
    // open DB (sqlite module sets WAL)
    await sqlite.open();
    // run migrations
    await migrations.runMigrations();
  })();
  return _init;
};

export const getDb = async () => {
  const db = await sqlite.open();
  return db.raw;
};

// Re-export entry APIs
export const addLocalEntry = entries.addLocalEntry;
export const getEntries = entries.getEntries;
export const updateLocalEntry = entries.updateLocalEntry;
export const markEntryDeleted = entries.markEntryDeleted;
export const markEntrySynced = entries.markEntrySynced;
export const getEntryByLocalId = entries.getEntryByLocalId;
export const getLocalByRemoteId = entries.getLocalByRemoteId;
export const upsertLocalFromRemote = entries.upsertLocalFromRemote;
export const getUnsyncedEntries = async () => {
  const db = await sqlite.open();
  return await db.all(
    'SELECT * FROM local_entries WHERE need_sync = 1 OR is_deleted = 1 OR (is_synced = 0 AND remote_id IS NULL)'
  );
};

// Pending profile updates table helpers (compat)
export const addPendingProfileUpdate = async (
  userId: string,
  updates: { name?: string; email?: string }
) => {
  const db = await sqlite.open();
  const now = new Date().toISOString();
  await db.run(
    'INSERT INTO pending_profile_updates (user_id, name, email, created_at, processed) VALUES (?, ?, ?, ?, 0)',
    [userId, updates.name || null, updates.email || null, now]
  );
};

export const getPendingProfileUpdates = async () => {
  const db = await sqlite.open();
  return await db.all(
    'SELECT * FROM pending_profile_updates WHERE processed = 0 ORDER BY created_at ASC'
  );
};

export const markPendingProfileProcessed = async (id: number) => {
  const db = await sqlite.open();
  await db.run('UPDATE pending_profile_updates SET processed = 1 WHERE id = ?', [id]);
};

export const clearAllData = async () => {
  const db = await sqlite.open();
  try {
    await db.run('DELETE FROM local_users');
    await db.run('DELETE FROM local_entries');
    await db.run('DELETE FROM pending_profile_updates');
    await db.run('DELETE FROM queued_remote_rows');
    await db.run('DELETE FROM queued_local_remote_map');
  } catch (e) {
    // ignore partial failures
  }
};

export const isDbOperational = async () => {
  try {
    const db = await sqlite.open();
    await db.get('SELECT 1 as v');
    return true;
  } catch (e) {
    return false;
  }
};

// Session
export const getSession = session.getSession;
export const saveSession = session.saveSession;
export const clearSession = session.clearSession;

// Sync queue
export const queueRemoteRow = syncQueue.queueRemoteRow;
export const getQueuedRemoteRows = syncQueue.getQueuedRemoteRows;
export const removeQueuedRemoteRow = syncQueue.removeQueuedRemoteRow;
export const flushQueuedRemoteRows = async () => {
  // compatibility: flush by reading queued rows and upserting into local DB
  const queued = await syncQueue.getQueuedRemoteRows();
  let processed = 0;
  for (const q of queued) {
    try {
      const payload = JSON.parse(q.payload);
      await entries.upsertLocalFromRemote(payload);
      await syncQueue.removeQueuedRemoteRow(q.id);
      processed += 1;
    } catch (e) {
      // increment attempts stored in table
    }
  }
  return { processed };
};

export const queueLocalRemoteMapping = syncQueue.queueLocalRemoteMapping;
export const getQueuedLocalRemoteMappings = syncQueue.getQueuedLocalRemoteMappings;
export const removeQueuedLocalRemoteMapping = syncQueue.removeQueuedLocalRemoteMapping;
export const flushQueuedLocalRemoteMappings = async () => {
  const maps = await syncQueue.getQueuedLocalRemoteMappings();
  let processed = 0;
  for (const m of maps) {
    try {
      await entries.markEntrySynced(m.local_id, m.remote_id);
      await syncQueue.removeQueuedLocalRemoteMapping(m.id);
      processed += 1;
    } catch (e) {
      // ignore; leave for later
    }
  }
  return { processed };
};

export const getLocalByClientId = entries.getLocalByClientId;

// compatibility: read any fallback entries saved by older versions in AsyncStorage
import AsyncStorage from '@react-native-async-storage/async-storage';
export const flushFallbackLocalEntries = async () => {
  const KEY = 'fallback_local_entries';
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!arr || arr.length === 0) return { processed: 0 };
    let processed = 0;
    for (const it of arr) {
      try {
        if (it && it.entry) {
          await entries.addLocalEntry(it.entry);
          processed += 1;
        }
      } catch (e) {
        // leave it
      }
    }
    // persist remaining items (best-effort: clear processed)
    const remaining = arr.slice(processed);
    await AsyncStorage.setItem(KEY, JSON.stringify(remaining));
    if (processed > 0)
      try {
        const { notifyEntriesChanged } = require('../utils/dbEvents');
        notifyEntriesChanged();
      } catch (e) {}
    return { processed };
  } catch (e) {
    return { processed: 0 };
  }
};

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
  getSession,
  saveSession,
  clearSession,
  queueRemoteRow,
  flushQueuedRemoteRows,
  queueLocalRemoteMapping,
  flushQueuedLocalRemoteMappings,
  flushFallbackLocalEntries,
};

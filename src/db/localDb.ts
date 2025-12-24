import sqlite from './sqlite';
import migrations from './migrations';
import * as entries from './entries';
import * as session from './session';
import * as syncQueue from './syncQueue';
import { clearOfflineDbOwner } from './offlineOwner';
import AsyncStorage from '../utils/AsyncStorageWrapper';

// --- Types ---

interface PendingProfileUpdate {
  id: number;
  user_id: string;
  name: string | null;
  email: string | null;
  created_at: string;
  processed: number; // 0 or 1
}

// --- Initialization ---

let _initPromise: Promise<void> | null = null;

export const init = async (): Promise<void> => {
  if (_initPromise) {
    return _initPromise;
  }

  console.log('[localDb] Initializing database...');
  _initPromise = (async () => {
    try {
      // 1. Open Database (SQLite module sets WAL mode)
      const db = await sqlite.open();
      if (!db) throw new Error('Failed to open SQLite database');

      // 2. Run Migrations
      await migrations.runMigrations();
      console.log('[localDb] Initialization complete.');
    } catch (error) {
      console.error('[localDb] Initialization failed:', error);
      // Reset promise so we can retry later if init fails
      _initPromise = null;
      throw error;
    }
  })();

  return _initPromise;
};

export const isDbOperational = async () => {
  try {
    const db = await sqlite.open();
    await db.get('SELECT 1');
    return true;
  } catch (e) {
    return false;
  }
};

export const getDb = async () => {
  const db = await sqlite.open();
  return db.raw;
};

// --- Entries Façade ---

// Re-export specific functions to maintain API surface
export const addLocalEntry = entries.addLocalEntry;
export const getEntries = entries.getEntries;
export const updateLocalEntry = entries.updateLocalEntry;
export const markEntryDeleted = entries.markEntryDeleted;
export const markEntrySynced = entries.markEntrySynced;
export const getEntryByLocalId = entries.getEntryByLocalId;
export const getLocalByRemoteId = entries.getLocalByRemoteId;
export const getLocalByClientId = entries.getLocalByClientId;
export const fetchEntriesGenerator = entries.fetchEntriesGenerator;
export const getSummary = entries.getSummary;
export const upsertLocalFromRemote = entries.upsertLocalFromRemote;

/**
 * Optimized query to find anything that needs to go to the server.
 * Covers:
 * 1. Explicit need_sync flag (Updates)
 * 2. Deleted but not synced (Deletions)
 * 3. Not synced and no remote_id (New Inserts)
 */
export const getUnsyncedEntries = async () => {
  const db = await sqlite.open();
  return await db.all(
    `SELECT * FROM local_entries 
     WHERE need_sync = 1 
        OR (is_deleted = 1 AND is_synced = 0) 
        OR (is_synced = 0 AND remote_id IS NULL)`
  );
};

// --- Session Façade ---

export const getSession = session.getSession;
export const saveSession = session.saveSession;
export const clearSession = session.clearSession;

// --- Pending Profile Updates ---

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

export const getPendingProfileUpdates = async (): Promise<PendingProfileUpdate[]> => {
  const db = await sqlite.open();
  return await db.all<PendingProfileUpdate[]>(
    'SELECT * FROM pending_profile_updates WHERE processed = 0 ORDER BY created_at ASC'
  );
};

export const markPendingProfileProcessed = async (id: number) => {
  const db = await sqlite.open();
  await db.run('UPDATE pending_profile_updates SET processed = 1 WHERE id = ?', [id]);
};

// --- Sync Queue Management ---

export const queueRemoteRow = syncQueue.queueRemoteRow;
export const getQueuedRemoteRows = syncQueue.getQueuedRemoteRows;
export const removeQueuedRemoteRow = syncQueue.removeQueuedRemoteRow;

export const flushQueuedRemoteRows = async () => {
  const queued = await syncQueue.getQueuedRemoteRows();
  let processed = 0;

  for (const q of queued) {
    try {
      const payload = JSON.parse(q.payload);
      // Try to merge the queued row into the main table
      await entries.upsertLocalFromRemote(payload);
      // If successful, remove from queue
      await syncQueue.removeQueuedRemoteRow(q.id);
      processed += 1;
    } catch (e) {
      console.warn('[localDb] Failed to flush queued remote row', q.id, e);
      // We leave it in the queue to try again later, or you could implement a max_retries logic here
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
      // Map the local ID to the new Remote ID in the main table
      await entries.markEntrySynced(m.local_id, m.remote_id);
      await syncQueue.removeQueuedLocalRemoteMapping(m.id);
      processed += 1;
    } catch (e) {
      console.warn('[localDb] Failed to flush mapping', m.id, e);
    }
  }
  return { processed };
};

// --- Legacy / Fallback Support ---

export const flushFallbackLocalEntries = async () => {
  const KEY = 'fallback_local_entries';
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { processed: 0 };

    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length === 0) return { processed: 0 };

    let processed = 0;
    const failedItems: any[] = [];

    for (const it of arr) {
      try {
        if (it && it.entry) {
          await entries.addLocalEntry(it.entry);
          processed += 1;
        }
      } catch (e) {
        // If it fails, keep it to save back to storage
        failedItems.push(it);
      }
    }

    if (failedItems.length > 0) {
      await AsyncStorage.setItem(KEY, JSON.stringify(failedItems));
    } else {
      await AsyncStorage.removeItem(KEY);
    }

    // Notify UI if we recovered data
    if (processed > 0) {
      try {
        const { notifyEntriesChanged } = require('../utils/dbEvents');
        notifyEntriesChanged();
      } catch (e) {}
    }

    return { processed };
  } catch (e) {
    console.warn('[localDb] Failed to flush fallback entries', e);
    return { processed: 0 };
  }
};

// --- Maintenance ---

export const clearAllData = async (opts?: { includeSession?: boolean }) => {
  const db = await sqlite.open();
  try {
    if (opts?.includeSession !== false) {
      await session.clearSession();
    }
    // Use a transaction for atomicity
    await db.transaction(async (tx) => {
      await tx.execute('DELETE FROM local_entries');
      await tx.execute('DELETE FROM pending_profile_updates');
      await tx.execute('DELETE FROM queued_remote_rows');
      await tx.execute('DELETE FROM queued_local_remote_map');
    });
  } catch (e) {
    console.error('[localDb] Failed to clear data', e);
  }
};

export const wipeLocalDatabase = async () => {
  console.log('[localDb] Wiping database...');
  try {
    await clearAllData({ includeSession: true });
    await clearOfflineDbOwner();
  } catch (e) {
    console.warn('[localDb] Error clearing data during wipe', e);
  }

  // Close and delete file
  try {
    await sqlite.close();
    await sqlite.deleteDbFile();
    _initPromise = null;
    console.log('[localDb] Database wiped and deleted.');
  } catch (e) {
    console.error('[localDb] Failed to delete database file', e);
  }
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
  getSession,
  saveSession,
  clearSession,
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

import NetInfo from '@react-native-community/netinfo';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '../utils/AsyncStorageWrapper';
import {
  init as initDb,
  getPendingProfileUpdates,
  markPendingProfileProcessed,
  getSession,
  saveSession,
  queueLocalRemoteMapping,
  queueRemoteRow,
  flushQueuedLocalRemoteMappings,
  flushQueuedRemoteRows,
  getUnsyncedEntries,
} from '../db/localDb';
import {
  getLocalByRemoteId,
  getLocalByClientId,
  upsertLocalFromRemote,
  markLocalDeletedByRemoteId,
  markEntrySynced,
  deleteLocalEntry,
} from '../db/entries';
import { query } from '../api/neonClient';

// --- Types & Constants ---

const CHUNK_SIZE = 50; // Batch operations in groups of 50 to avoid SQL parameter limits

const Q = (sql: string, params: any[] = []) => query(sql, params, { retries: 2, timeoutMs: 15000 });

type SyncConflictEvent = {
  localId?: string;
  remoteId?: string;
  amount?: number;
  category?: string;
  message?: string;
};

type SyncConflictListener = (event: SyncConflictEvent) => void;

// Defined interface to reduce 'any' usage
interface CashEntry {
  local_id: string;
  remote_id?: string;
  user_id: string;
  type: string;
  amount: number;
  category: string;
  note?: string;
  currency?: string;
  created_at: string; // ISO String
  updated_at: string; // ISO String
  date?: string; // ISO String
  is_deleted?: boolean;
  need_sync?: boolean;
  server_version?: number;
}

// --- State Management ---

const conflictListeners = new Set<SyncConflictListener>();
let _unsubscribe: (() => void) | null = null;
let _foregroundTimer: any = null;
let _backgroundFetchInstance: any = null;
let _backgroundFetchWarned = false;
let _pendingSyncRequested: boolean = false;
let _syncInProgress: boolean = false;
// Sync status listeners (UI can subscribe to show progress)
const _syncStatusListeners = new Set<(running: boolean) => void>();

export const subscribeSyncStatus = (listener: (running: boolean) => void) => {
  _syncStatusListeners.add(listener);
  return () => _syncStatusListeners.delete(listener);
};

export const isSyncInProgress = () => !!_syncInProgress;

// --- Helper Functions ---

const safeQ = async (sql: string, params: any[] = []) => {
  try {
    return await Q(sql, params);
  } catch (err) {
    try {
      console.error('Neon query failed', { sql: sql.substring(0, 50) + '...', err });
    } catch (e) {}
    throw err;
  }
};

const chunkArray = <T>(array: T[], size: number): T[][] => {
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
};

export const subscribeSyncConflicts = (listener: SyncConflictListener) => {
  conflictListeners.add(listener);
  return () => {
    conflictListeners.delete(listener);
  };
};

const emitSyncConflict = (event: SyncConflictEvent) => {
  conflictListeners.forEach((listener) => {
    try {
      listener(event);
    } catch (err) {
      console.warn('sync conflict listener failed', err);
    }
  });
};

// --- Core Sync Logic ---

export const syncPending = async () => {
  await initDb();
  const state = await NetInfo.fetch();
  if (!state.isConnected) return { pushed: 0, updated: 0, deleted: 0 };

  const pendingRaw = await getUnsyncedEntries();
  if (pendingRaw.length === 0) return { pushed: 0, updated: 0, deleted: 0 };

  // Cast raw DB results to typed interface
  const pending = pendingRaw as unknown as CashEntry[];

  console.log(`Syncing ${pending.length} entries...`);

  let pushed = 0;
  let updated = 0;
  let deleted = 0;

  // Partition pending rows
  const remoteDeletionEntries = pending.filter((e) => e.is_deleted && e.remote_id);
  const localOnlyDeletions = pending.filter((e) => e.is_deleted && !e.remote_id);
  const inserts = pending.filter((e) => !e.remote_id && !e.is_deleted);
  const updates = pending.filter((e) => e.remote_id && e.need_sync && !e.is_deleted);

  // 1. Handle Deletions
  const localsToDelete = new Set<string>();

  // A. Local-only deletions (never synced, just remove local record)
  if (localOnlyDeletions.length > 0) {
    localOnlyDeletions.forEach((entry) => localsToDelete.add(entry.local_id));
    deleted += localOnlyDeletions.length;
  }

  // B. Remote deletions (Chunked)
  const deleteChunks = chunkArray(remoteDeletionEntries, CHUNK_SIZE);
  for (const chunk of deleteChunks) {
    const remoteIds = chunk.map((e) => String(e.remote_id));
    try {
      await safeQ(
        'UPDATE cash_entries SET deleted = true, updated_at = NOW(), need_sync = false WHERE id = ANY($1::uuid[])',
        [remoteIds]
      );
      deleted += chunk.length;
      chunk.forEach((entry) => localsToDelete.add(entry.local_id));
    } catch (err) {
      console.error('Batch delete failed, falling back to per-row', err);
      // Fallback: per-row
      for (const entry of chunk) {
        try {
          await safeQ(
            'UPDATE cash_entries SET deleted = true, updated_at = NOW(), need_sync = false WHERE id = $1',
            [entry.remote_id]
          );
          deleted++;
          localsToDelete.add(entry.local_id);
        } catch (e) {
          console.error('Failed to delete remote row', entry.remote_id, e);
        }
      }
    }
  }

  // Purge locals
  if (localsToDelete.size > 0) {
    for (const localId of localsToDelete) {
      try {
        await deleteLocalEntry(localId);
      } catch (e) {
        console.error('Failed to purge local entry', localId, e);
      }
    }
  }

  // 2. Handle Inserts (Chunked)
  const insertChunks = chunkArray(inserts, CHUNK_SIZE);
  for (const chunk of insertChunks) {
    try {
      const values: any[] = [];
      const placeholders: string[] = [];
      let idx = 1;

      for (const it of chunk) {
        placeholders.push(
          `($${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++}::timestamptz,$${idx++}::timestamptz,false,$${idx++},$${idx++}::timestamptz)`
        );
        values.push(
          it.user_id,
          it.type,
          Number(it.amount),
          it.category,
          it.note || null,
          it.currency || 'INR',
          it.created_at,
          it.updated_at,
          it.local_id,
          it.date || it.created_at
        );
      }

      const sql = `INSERT INTO cash_entries (user_id, type, amount, category, note, currency, created_at, updated_at, need_sync, client_id, date) 
                   VALUES ${placeholders.join(',')} 
                   ON CONFLICT (client_id) DO NOTHING 
                   RETURNING id, client_id, server_version, updated_at`;

      const res = await safeQ(sql, values);

      if (res && res.length) {
        for (const r of res) {
          const localId = String(r.client_id);
          await markEntrySynced(localId, String(r.id), Number(r.server_version), r.updated_at);
          pushed++;
        }
      }
    } catch (err) {
      console.warn('Batch insert failed; falling back to per-row', err);
      // Fallback: Per-row insert
      for (const it of chunk) {
        try {
          const insertRes = await safeQ(
            `INSERT INTO cash_entries (user_id, type, amount, category, note, currency, created_at, updated_at, need_sync, client_id, date)
             VALUES ($1, $2, $3::numeric, $4, $5, $6, $7::timestamptz, $8::timestamptz, false, $9, $10::timestamptz) 
             RETURNING id, server_version, updated_at`,
            [
              it.user_id,
              it.type,
              Number(it.amount),
              it.category,
              it.note || null,
              it.currency || 'INR',
              it.created_at,
              it.updated_at,
              it.local_id,
              it.date || it.created_at,
            ]
          );

          // Handle response or check for existence (idempotency)
          let remoteData = insertRes?.[0];

          if (!remoteData) {
            const found = await safeQ(
              `SELECT id, server_version, updated_at FROM cash_entries WHERE client_id = $1 LIMIT 1`,
              [it.local_id]
            );
            remoteData = found?.[0];
          }

          if (remoteData) {
            await markEntrySynced(
              it.local_id,
              String(remoteData.id),
              Number(remoteData.server_version),
              remoteData.updated_at
            );
            pushed++;
          }
        } catch (e) {
          console.error('Failed to insert remote entry (fallback)', it.local_id, e);
        }
      }
    }
  }

  // 3. Handle Updates (Chunked)
  const updateChunks = chunkArray(updates, CHUNK_SIZE);
  for (const chunk of updateChunks) {
    const vals: any[] = [];
    const rowPlaceholders: string[] = [];
    let j = 1;

    for (const u of chunk) {
      rowPlaceholders.push(
        `($${j++}::uuid,$${j++}::numeric,$${j++},$${j++},$${j++},$${j++},$${j++}::timestamptz,$${j++}::timestamptz)`
      );
      vals.push(
        u.remote_id,
        Number(u.amount),
        u.type,
        u.category,
        u.note || null,
        u.currency || 'INR',
        u.updated_at,
        u.date || u.created_at
      );
    }

    const updateSql = `
      UPDATE cash_entries AS c 
      SET amount = v.amount, type = v.type, category = v.category, note = v.note, 
          currency = v.currency, updated_at = v.updated_at::timestamptz, need_sync = true, 
          date = v.date::timestamptz 
      FROM (VALUES ${rowPlaceholders.join(',')}) AS v(id, amount, type, category, note, currency, updated_at, date) 
      WHERE c.id = v.id 
      RETURNING c.id, c.server_version, c.updated_at`;

    try {
      const updRes = await safeQ(updateSql, vals);
      if (updRes && updRes.length) {
        // Map remote IDs back to local IDs for marking synced
        const remoteToLocal = new Map<string, string>();
        chunk.forEach((u) => remoteToLocal.set(String(u.remote_id), u.local_id));

        for (const r of updRes) {
          const localId = remoteToLocal.get(String(r.id));
          if (localId) {
            await markEntrySynced(localId, String(r.id), Number(r.server_version), r.updated_at);
            updated++;
          }
        }
      }
    } catch (err) {
      console.warn('Batch update failed; falling back to per-row', err);
      // Fallback: Per-row update
      for (const u of chunk) {
        try {
          const res = await safeQ(
            `UPDATE cash_entries 
             SET amount = $1::numeric, type = $2, category = $3, note = $4, currency = $5, 
                 updated_at = $6::timestamptz, need_sync = true, date = $8::timestamptz 
             WHERE id = $7 
             RETURNING id, server_version, updated_at`,
            [
              Number(u.amount),
              u.type,
              u.category,
              u.note || null,
              u.currency || 'INR',
              u.updated_at,
              u.remote_id,
              u.date || u.created_at,
            ]
          );
          if (res && res[0]) {
            await markEntrySynced(
              u.local_id,
              String(res[0].id),
              Number(res[0].server_version),
              res[0].updated_at
            );
            updated++;
          }
        } catch (e) {
          console.error('Failed to update remote entry', u.local_id, e);
        }
      }
    }
  }

  console.log('Sync push complete');
  return { pushed, updated, deleted };
};

export const pullRemote = async () => {
  await initDb();
  const state = await NetInfo.fetch();
  if (!state.isConnected) return { pulled: 0, merged: 0 };

  const session = await getSession();
  console.log('[pullRemote] using session id=', session?.id);
  if (!session || !session.id) return { pulled: 0, merged: 0 };

  try {
    // Attempt to flush queues
    await flushQueuedLocalRemoteMappings().catch(() => {});
    await flushQueuedRemoteRows().catch(() => {});

    // --- DELTA SYNC IMPLEMENTATION ---
    const lastSyncAt = await AsyncStorage.getItem('last_sync_at');
    // If no last sync, use epoch to fetch all.
    const timeParam = lastSyncAt || '1970-01-01T00:00:00.000Z';

    // Only fetch rows modified strictly AFTER the last sync
    const rows = await Q(
      `SELECT id, user_id, type, amount, category, note, currency, created_at, updated_at, deleted, client_id, server_version, date 
       FROM cash_entries 
       WHERE user_id = $1 AND updated_at > $2::timestamptz`,
      [session.id, timeParam]
    );

    if (!rows || rows.length === 0) return { pulled: 0, merged: 0 };

    console.log(`[pullRemote] Fetched ${rows.length} changed rows from remote`);

    let pulled = 0;
    let merged = 0;

    for (const r of rows) {
      try {
        // 1. Handle Remote Deletion
        if (r.deleted) {
          // Attempt to find local mapping
          let localForDeleted = await getLocalByRemoteId(String(r.id));
          if (!localForDeleted && r.client_id) {
            localForDeleted = await getLocalByClientId(String(r.client_id));
          }

          if (localForDeleted && (localForDeleted as any).need_sync) {
            // Local was modified while remote was deleted. Revive remote.
            // (Revival logic preserved from original code)
            const revivedUpdatedAt = new Date().toISOString();
            await Q(
              `UPDATE cash_entries SET deleted = false, need_sync = false, updated_at = $1::timestamptz WHERE id = $2`,
              [revivedUpdatedAt, r.id]
            );
            // We only update timestamp here for simplicity, assuming data is fixed in next push
            await markEntrySynced(
              localForDeleted.local_id,
              String(r.id),
              undefined,
              revivedUpdatedAt
            );
          } else {
            // Accept deletion
            await markLocalDeletedByRemoteId(String(r.id));
          }
          continue;
        }

        // 2. Handle Merges / Upserts
        let local = await getLocalByRemoteId(String(r.id));
        if (!local && r.client_id) {
          local = await getLocalByClientId(String(r.client_id));
        }

        if (local && local.local_id) {
          const localEntry = local as unknown as CashEntry;

          // Conflict: Local has unsynced changes
          if (localEntry.need_sync) {
            const localTime = new Date(localEntry.updated_at || 0).getTime();
            const remoteTime = new Date(r.updated_at || 0).getTime();

            // If timestamps match, it's the same update
            if (localTime === remoteTime) {
              await markEntrySynced(
                localEntry.local_id,
                String(r.id),
                Number(r.server_version),
                r.updated_at
              );
              merged++;
              continue;
            }

            // Actual Conflict: Client Wins logic (Push local change as update to remote)
            emitSyncConflict({
              localId: localEntry.local_id,
              remoteId: String(r.id),
              message: 'Conflict detected. Preserving local changes.',
            });

            // We skip merging the remote row into local.
            // We ensure the local row triggers a push next time by leaving need_sync=true
            continue;
          }
        }

        // 3. Upsert Local
        await upsertLocalFromRemote({
          id: String(r.id),
          user_id: r.user_id,
          type: r.type,
          amount: Number(r.amount),
          category: r.category,
          note: r.note,
          currency: r.currency,
          created_at: r.created_at,
          updated_at: r.updated_at,
          deleted: !!r.deleted,
          client_id: r.client_id || null,
          server_version: typeof r.server_version === 'number' ? r.server_version : undefined,
          date: r.date,
        });
        pulled++;
      } catch (err) {
        console.error('Failed to merge remote row', r.id, err);
        await queueRemoteRow(r).catch(() => {});
      }
    }
    return { pulled, merged };
  } catch (err) {
    console.error('Failed to pull remote entries', err);
    throw err;
  }
};

const flushPendingProfileUpdates = async () => {
  await initDb();
  const pending = await getPendingProfileUpdates();
  if (!pending || pending.length === 0) return { processed: 0 };

  let processed = 0;
  for (const p of pending) {
    try {
      if (p.email) {
        const existing = await Q('SELECT id FROM users WHERE email = $1 AND id <> $2 LIMIT 1', [
          p.email,
          p.user_id,
        ]);
        if (existing && existing.length > 0) continue; // Skip on conflict
      }

      const fields: string[] = [];
      const params: any[] = [];
      let idx = 1;

      if (p.name) {
        fields.push(`name = $${idx++}`);
        params.push(p.name);
      }
      if (p.email) {
        fields.push(`email = $${idx++}`);
        params.push(p.email);
      }

      if (fields.length > 0) {
        params.push(p.user_id);
        const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, name, email`;
        const res = await Q(sql, params);
        if (res && res.length) {
          await saveSession(res[0].id, res[0].name || '', res[0].email);
          await markPendingProfileProcessed(p.id);
          processed++;
        }
      } else {
        await markPendingProfileProcessed(p.id);
        processed++;
      }
    } catch (err) {
      console.error('Profile update failed', p.id, err);
    }
  }
  return { processed };
};

// --- Main Sync Entry Point ---

export const syncBothWays = async () => {
  if (_syncInProgress) {
    _pendingSyncRequested = true;
    console.log('Sync already running, scheduling follow-up');
    return { pushed: 0, updated: 0, deleted: 0, pulled: 0, merged: 0, total: 0 };
  }

  const state = await NetInfo.fetch();
  if (!state.isConnected) return;

  _syncInProgress = true;
  // notify listeners that sync started
  try {
    _syncStatusListeners.forEach((l) => {
      try {
        l(true);
      } catch (e) {}
    });
  } catch (e) {}

  try {
    await initDb();
    const session = await getSession();
    if (!session || !session.id)
      return { pushed: 0, updated: 0, deleted: 0, pulled: 0, merged: 0, total: 0 };

    // --- Optimization: Quick Probe ---
    // If we haven't synced before, check if remote has ANY data before doing heavy lifting
    const lastSyncCount = await AsyncStorage.getItem('last_sync_count');
    if (!lastSyncCount || lastSyncCount === '0') {
      try {
        const probe = await query(
          'SELECT 1 FROM cash_entries WHERE user_id = $1 LIMIT 1',
          [session.id],
          { timeoutMs: 2000 }
        );
        if (!probe || probe.length === 0) {
          // Remote is empty, just push.
          console.log('Remote empty, skipping pull');
        }
      } catch (e) {}
    }

    // 1. Flush Profiles
    await flushPendingProfileUpdates();

    // 2. Push Local Changes
    const pushStats = await syncPending();

    // 3. Pull Remote Changes (Delta)
    const pullStats = await pullRemote();

    const total =
      (pushStats.pushed || 0) +
      (pushStats.updated || 0) +
      (pushStats.deleted || 0) +
      (pullStats.pulled || 0) +
      (pullStats.merged || 0);

    // 4. Update Sync Metadata
    const now = new Date().toISOString();
    await AsyncStorage.setItem('last_sync_at', now);
    await AsyncStorage.setItem('last_sync_count', String(total));

    // 5. Notify UI
    try {
      const { notifyEntriesChanged } = require('../utils/dbEvents');
      notifyEntriesChanged();
    } catch (e) {}

    return { ...pushStats, ...pullStats, total };
  } catch (err) {
    console.error('Sync failed', err);
    throw err;
  } finally {
    _syncInProgress = false;
    // notify listeners that sync finished
    try {
      _syncStatusListeners.forEach((l) => {
        try {
          l(false);
        } catch (e) {}
      });
    } catch (e) {}
    if (_pendingSyncRequested) {
      _pendingSyncRequested = false;
      setTimeout(() => {
        syncBothWays().catch((e) => console.error('Follow-up sync failed', e));
      }, 500);
    }
  }
};

// --- Listeners & Background Tasks ---

export const getLastSyncTime = async () => AsyncStorage.getItem('last_sync_at');

export const getLastSyncCount = async () => {
  try {
    const v = await AsyncStorage.getItem('last_sync_count');
    return v ? Number(v) : null;
  } catch (e) {
    return null;
  }
};

export const startAutoSyncListener = () => {
  if (_unsubscribe) return;
  let wasOnline = false;
  _unsubscribe = NetInfo.addEventListener((state) => {
    const isOnline = !!state.isConnected;
    if (!wasOnline && isOnline) {
      syncBothWays().catch((err) => console.error('Auto sync failed', err));
    }
    wasOnline = isOnline;
  });
};

export const stopAutoSyncListener = () => {
  if (_unsubscribe) {
    _unsubscribe();
    _unsubscribe = null;
  }
};

export const startForegroundSyncScheduler = (intervalMs: number = 15000) => {
  if (_foregroundTimer) return;
  _foregroundTimer = setInterval(() => {
    if (!_syncInProgress) {
      syncBothWays().catch((err) => console.error('Scheduled sync failed', err));
    }
  }, intervalMs);
};

export const stopForegroundSyncScheduler = () => {
  if (_foregroundTimer) {
    clearInterval(_foregroundTimer);
    _foregroundTimer = null;
  }
};

export const startBackgroundFetch = async () => {
  if (_backgroundFetchInstance) return;

  // Expo Go check
  const isExpoGo = Constants.appOwnership === 'expo';
  if (isExpoGo) return;

  try {
    const BackgroundFetch = require('react-native-background-fetch');
    _backgroundFetchInstance = BackgroundFetch;

    if (BackgroundFetch?.configure) {
      BackgroundFetch.configure(
        {
          minimumFetchInterval: 15,
          stopOnTerminate: false,
          enableHeadless: true,
          requiredNetworkType: BackgroundFetch.NETWORK_TYPE_ANY,
        },
        async (taskId: string) => {
          try {
            if (!_syncInProgress) await syncBothWays();
          } catch (err) {
            console.error('Background fetch sync failed', err);
          } finally {
            BackgroundFetch.finish(taskId);
          }
        },
        (error: any) => console.warn('BackgroundFetch configure failed', error)
      );
    }
  } catch (e) {
    if (!_backgroundFetchWarned) {
      console.warn('BackgroundFetch not available', e);
      _backgroundFetchWarned = true;
    }
  }
};

export const stopBackgroundFetch = async () => {
  if (_backgroundFetchInstance) {
    try {
      _backgroundFetchInstance.stop();
    } catch (e) {}
    _backgroundFetchInstance = null;
  }
};

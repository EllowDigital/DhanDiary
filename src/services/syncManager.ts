import NetInfo from '@react-native-community/netinfo';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '../utils/AsyncStorageWrapper';
import { getPendingProfileUpdates, markPendingProfileProcessed } from '../db/localDb';
import { getSession, saveSession } from '../db/session';
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

const isLocalDbDisabledError = (err: any) =>
  String(err?.message || '').includes('Offline/local DB disabled');

const isUuid = (s: any) =>
  typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);

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
  // Online-only mode: push from local DB is disabled. Transactions must be
  // created directly against NeonDB. This function is kept for API
  // compatibility and is a no-op.
  const state = await NetInfo.fetch();
  if (!state.isConnected) return { pushed: 0, updated: 0, deleted: 0 };
  return { pushed: 0, updated: 0, deleted: 0 };
};

export const pullRemote = async () => {
  const state = await NetInfo.fetch();
  if (!state.isConnected) return { pulled: 0, merged: 0 };

  const session = await getSession();
  console.log('[pullRemote] using session id=', session?.id);
  if (!session || !session.id) return { pulled: 0, merged: 0 };
  if (!isUuid(session.id)) {
    console.log('[pullRemote] session id is not a valid Neon UUID, skipping pull');
    return { pulled: 0, merged: 0 };
  }

  try {
    // Queueing disabled in online-only mode; nothing to flush.

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
          // Attempt to find local mapping if local DB is available
          let localForDeleted: any = null;
          try {
            localForDeleted = await getLocalByRemoteId(String(r.id));
          } catch (e: any) {
            if (isLocalDbDisabledError(e)) {
              localForDeleted = null;
            } else throw e;
          }
          if (!localForDeleted && r.client_id) {
            try {
              localForDeleted = await getLocalByClientId(String(r.client_id));
            } catch (e: any) {
              if (isLocalDbDisabledError(e)) localForDeleted = null;
              else throw e;
            }
          }

          if (localForDeleted && (localForDeleted as any).need_sync) {
            // Local was modified while remote was deleted. Revive remote.
            const revivedUpdatedAt = new Date().toISOString();
            await Q(
              `UPDATE cash_entries SET deleted = false, need_sync = false, updated_at = $1::timestamptz WHERE id = $2`,
              [revivedUpdatedAt, r.id]
            );
            // Attempt to mark local entry as synced; ignore if local DB disabled
            try {
              await markEntrySynced(
                (localForDeleted as any).local_id,
                String(r.id),
                undefined,
                revivedUpdatedAt
              );
            } catch (e: any) {
              if (isLocalDbDisabledError(e)) {
                console.log('[pullRemote] local DB disabled; skipping markEntrySynced');
              } else throw e;
            }
          } else {
            // Accept deletion: try to remove local mapping if possible
            try {
              await markLocalDeletedByRemoteId(String(r.id));
            } catch (e: any) {
              if (isLocalDbDisabledError(e)) {
                // local DB disabled — nothing to do
              } else throw e;
            }
          }
          continue;
        }

        // 2. Handle Merges / Upserts
        let local: any = null;
        try {
          local = await getLocalByRemoteId(String(r.id));
        } catch (e: any) {
          if (isLocalDbDisabledError(e)) {
            local = null;
          } else throw e;
        }
        if (!local && r.client_id) {
          try {
            local = await getLocalByClientId(String(r.client_id));
          } catch (e: any) {
            if (isLocalDbDisabledError(e)) local = null;
            else throw e;
          }
        }

        if (local && local.local_id) {
          const localEntry = local as unknown as CashEntry;

          // Conflict: Local has unsynced changes
          if (localEntry.need_sync) {
            const localTime = new Date(localEntry.updated_at || 0).getTime();
            const remoteTime = new Date(r.updated_at || 0).getTime();

            // If timestamps match, it's the same update
            if (localTime === remoteTime) {
              try {
                await markEntrySynced(
                  localEntry.local_id,
                  String(r.id),
                  Number(r.server_version),
                  r.updated_at
                );
              } catch (e: any) {
                if (isLocalDbDisabledError(e)) {
                  console.log('[pullRemote] local DB disabled; skipping markEntrySynced');
                } else throw e;
              }
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
        // Queueing disabled in online-only mode; skipping queue.
      }
    }
    return { pulled, merged };
  } catch (err) {
    console.error('Failed to pull remote entries', err);
    throw err;
  }
};

const flushPendingProfileUpdates = async () => {
  const pending = await getPendingProfileUpdates();
  if (!pending || pending.length === 0) return { processed: 0 };

  let processed = 0;
  for (const p of pending) {
    try {
      if (p.email) {
        // Guard: ensure user_id passed to SQL is a valid UUID. If it's not, set to null
        // so the query does not attempt to cast an invalid string to UUID.
        const safeUserId = p.user_id && isUuid(p.user_id) ? p.user_id : null;
        const existing = await Q(
          'SELECT id FROM users WHERE email = $1 AND (id <> $2 OR $2 IS NULL) LIMIT 1',
          [p.email, safeUserId]
        );
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
    // local DB init skipped in online-only mode
    const session = await getSession();
    if (!session || !session.id)
      return { pushed: 0, updated: 0, deleted: 0, pulled: 0, merged: 0, total: 0 };
    if (!isUuid(session.id)) {
      console.log('[syncBothWays] session id is not a valid Neon UUID, skipping full sync');
      return { pushed: 0, updated: 0, deleted: 0, pulled: 0, merged: 0, total: 0 };
    }

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
      try {
        // prefer exported binding (so tests can replace it), fallback to internal
        const mod: any = require('./syncManager');
        const fn = mod && typeof mod.syncBothWays === 'function' ? mod.syncBothWays : syncBothWays;
        Promise.resolve(fn()).catch((err) => console.error('Scheduled sync failed', err));
      } catch (err) {
        syncBothWays().catch((e) => console.error('Scheduled sync failed', e));
      }
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

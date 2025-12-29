import NetInfo from '@react-native-community/netinfo';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '../utils/AsyncStorageWrapper';
import { getPendingProfileUpdates, markPendingProfileProcessed } from '../db/localDb';
import { getSession, saveSession } from '../db/session';
// Legacy entry-related DB helpers moved to `src/services/legacySync` to keep
// `syncManager` free of direct Neon/SQLite logic. Import from legacy module
// only when needed.
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
let _lastSuccessfulSyncAt: number | null = null;
let _lastSyncAttemptAt: number | null = null;
let _syncFailureCount = 0;
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

/**
 * DEPRECATED: Legacy pullRemote implementation moved to `src/services/legacySync/pullRemoteLegacy.ts`.
 *
 * Keep this exported wrapper for backward compatibility. Prefer `runFullSync()` as the
 * single source of truth for syncing.
 */
export const pullRemote = async () => {
  if (__DEV__) console.warn('[syncManager] pullRemote() is DEPRECATED. Use runFullSync() instead.');
  const mod = await import('./legacySync/pullRemoteLegacy');
  return mod.pullRemoteLegacy();
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

import runFullSync from '../sync/runFullSync';

export const syncBothWays = async () => {
  if (_syncInProgress) {
    _pendingSyncRequested = true;
    if (__DEV__) console.log('Sync already running, scheduling follow-up');
    return { ok: false } as any;
  }

  _lastSyncAttemptAt = Date.now();

  const state = await NetInfo.fetch();
  if (!state.isConnected) return { ok: false } as any;

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
    // Delegate actual sync work to runFullSync (single source of truth)
    await runFullSync();

    _lastSuccessfulSyncAt = Date.now();
    _syncFailureCount = 0;

    try {
      const { notifyEntriesChanged } = require('../utils/dbEvents');
      notifyEntriesChanged();
    } catch (e) {}

    return { ok: true } as any;
  } catch (err) {
    try {
      console.error('Sync failed', err);
    } catch (e) {}
    _syncFailureCount = Math.min(5, _syncFailureCount + 1);
    return { ok: false } as any;
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
      // Kick off a sync when we come online, but respect recent successful syncs
      const now = Date.now();
      const MIN_ONLINE_SYNC_MS = 30 * 1000; // don't run online sync more often than this
      if (!_lastSuccessfulSyncAt || now - _lastSuccessfulSyncAt > MIN_ONLINE_SYNC_MS) {
        syncBothWays().catch((err) => console.error('Auto sync failed', err));
      }
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
    try {
      // Throttle frequent runs: if we recently synced successfully, skip until MIN_SCHEDULE_MS
      const MIN_SCHEDULE_MS = Math.max(60000, intervalMs); // at least 60s
      const now = Date.now();
      if (_lastSuccessfulSyncAt && now - _lastSuccessfulSyncAt < MIN_SCHEDULE_MS) return;

      // If we recently attempted and failed several times, back off
      if (_syncFailureCount > 0) {
        const backoffMs = Math.min(60000 * _syncFailureCount, 5 * 60 * 1000);
        if (_lastSyncAttemptAt && now - _lastSyncAttemptAt < backoffMs) return;
      }

      if (!_syncInProgress) {
        const mod: any = require('./syncManager');
        const fn = mod && typeof mod.syncBothWays === 'function' ? mod.syncBothWays : syncBothWays;
        Promise.resolve(fn()).catch((err) => console.error('Scheduled sync failed', err));
      }
    } catch (err) {
      if (!_syncInProgress) syncBothWays().catch((e) => console.error('Scheduled sync failed', e));
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

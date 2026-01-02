import NetInfo from '@react-native-community/netinfo';
import { InteractionManager } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '../utils/AsyncStorageWrapper';
import { getPendingProfileUpdates, markPendingProfileProcessed } from '../db/localDb';
import { getSession, saveSession } from '../db/session';
// Legacy entry-related DB helpers moved to `src/services/legacySync` to keep
// `syncManager` free of direct Neon/SQLite logic. Import from legacy module
// only when needed.
import { query } from '../api/neonClient';
import { requestSyncCancel, resetSyncCancel } from '../sync/syncCancel';
import { syncClerkUserToNeon } from './clerkUserSync';

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
let _isOnline = false;
let _entriesUnsubscribe: (() => void) | null = null;
let _entriesSyncTimer: any = null;
let _lastAlreadyRunningLogAt = 0;
let _scheduledSyncTimer: any = null;
let _scheduledSyncPromise: Promise<any> | null = null;
let _scheduledSyncResolve: ((value: any) => void) | null = null;
let _scheduledSyncReject: ((reason?: any) => void) | null = null;
let _scheduledSyncOptions: { force?: boolean; source?: 'manual' | 'auto' } | null = null;
let _pendingSyncForce = false;
const _followUpPullQueuedAtByUser: Record<string, number> = {};
// Sync status listeners (UI can subscribe to show progress or errors)
export type SyncStatus = 'idle' | 'syncing' | 'error';
let _syncStatus: SyncStatus = 'idle';
const _syncStatusListeners = new Set<(status: SyncStatus) => void>();

// Sync state machine controls (offline-first)
let _syncPaused = false;
let _loadedSyncPrefs = false;
const SYNC_PAUSED_KEY = 'sync_paused_v1';

const loadSyncPrefsOnce = async () => {
  if (_loadedSyncPrefs) return;
  _loadedSyncPrefs = true;
  try {
    const v = await AsyncStorage.getItem(SYNC_PAUSED_KEY);
    _syncPaused = v === '1';
  } catch (e) {
    _syncPaused = false;
  }
};

export const subscribeSyncStatus = (listener: (status: SyncStatus) => void) => {
  _syncStatusListeners.add(listener);
  return () => _syncStatusListeners.delete(listener);
};

export const isSyncInProgress = () => _syncStatus === 'syncing';

export const isSyncPaused = () => _syncPaused;

export const getConnectivityState = () =>
  (_isOnline ? 'online' : 'offline') as 'online' | 'offline';

export const setSyncPaused = async (paused: boolean) => {
  _syncPaused = !!paused;
  try {
    if (_syncPaused) await AsyncStorage.setItem(SYNC_PAUSED_KEY, '1');
    else await AsyncStorage.removeItem(SYNC_PAUSED_KEY);
  } catch (e) {
    // best-effort
  }

  // If pausing, cancel any in-flight work.
  if (_syncPaused) {
    try {
      requestSyncCancel();
    } catch (e) {}
  }
};

export const retrySync = () => scheduleSync({ force: true, source: 'manual' });

// Public: request cancellation of any ongoing sync work.
export const cancelSyncWork = () => {
  try {
    requestSyncCancel();
  } catch (e) {}
};

// Public: stop all sync triggers and cancel queued work.
// Used for logout flows to guarantee no background sync continues.
export const stopSyncEngine = async () => {
  try {
    cancelSyncWork();
  } catch (e) {}

  try {
    stopAutoSyncListener();
  } catch (e) {}

  try {
    stopForegroundSyncScheduler();
  } catch (e) {}

  try {
    await stopBackgroundFetch();
  } catch (e) {}

  // Cancel scheduled/debounced timers
  try {
    if (_scheduledSyncTimer) clearTimeout(_scheduledSyncTimer);
  } catch (e) {}
  _scheduledSyncTimer = null;
  _scheduledSyncOptions = null;

  try {
    if (_entriesSyncTimer) clearTimeout(_entriesSyncTimer);
  } catch (e) {}
  _entriesSyncTimer = null;

  _pendingSyncRequested = false;
  _pendingSyncForce = false;
};

// Public: schedule a sync to run after interactions (UI-first) and de-dupe rapid triggers.
export const scheduleSync = (options?: { force?: boolean; source?: 'manual' | 'auto' }) => {
  try {
    // Non-blocking: load persisted paused flag in background.
    void loadSyncPrefsOnce();
    if (_syncPaused) {
      return Promise.resolve({ ok: true, reason: 'throttled', upToDate: true } as any);
    }

    // Merge options across rapid calls during debounce window.
    // - `force`: sticky OR
    // - `source`: prefer 'manual' if any caller is manual (helps analytics/UX decisions)
    const merged: { force?: boolean; source?: 'manual' | 'auto' } = {
      ...(_scheduledSyncOptions || {}),
      ...(options || {}),
    };
    merged.force = Boolean((_scheduledSyncOptions as any)?.force || (options as any)?.force);
    merged.source =
      options?.source === 'manual' || _scheduledSyncOptions?.source === 'manual'
        ? 'manual'
        : options?.source || _scheduledSyncOptions?.source;
    _scheduledSyncOptions = merged;

    if (_scheduledSyncPromise) return _scheduledSyncPromise;

    _scheduledSyncPromise = new Promise((resolve, reject) => {
      _scheduledSyncResolve = resolve;
      _scheduledSyncReject = reject;
    });

    if (_scheduledSyncTimer) return _scheduledSyncPromise;
    _scheduledSyncTimer = setTimeout(() => {
      _scheduledSyncTimer = null;
      const runOpts = _scheduledSyncOptions;
      _scheduledSyncOptions = null;
      InteractionManager.runAfterInteractions(() => {
        syncBothWays(runOpts || undefined)
          .then((res) => {
            try {
              _scheduledSyncResolve?.(res);
            } catch (e) {}
          })
          .catch((err) => {
            try {
              _scheduledSyncReject?.(err);
            } catch (e) {}
          })
          .finally(() => {
            _scheduledSyncPromise = null;
            _scheduledSyncResolve = null;
            _scheduledSyncReject = null;
          });
      });
    }, 250);

    return _scheduledSyncPromise;
  } catch (e) {
    // Best-effort fallback
    try {
      return syncBothWays(options);
    } catch (ee) {
      return Promise.resolve({ ok: false, reason: 'error' } as any);
    }
  }
};

const setSyncStatus = (s: SyncStatus) => {
  if (_syncStatus === s) return;
  _syncStatus = s;
  try {
    _syncStatusListeners.forEach((l) => {
      try {
        l(s);
      } catch (e) {}
    });
  } catch (e) {}
  // Dev-only diagnostic to help QA catch persistent failures
  try {
    if (__DEV__ && s === 'error') {
      console.warn('[sync] Entered error state');
    }
  } catch (e) {}
};

// --- Helper Functions ---

const safeQ = async (sql: string, params: any[] = []) => {
  try {
    return await Q(sql, params);
  } catch (err) {
    try {
      // Avoid console.error here — it triggers LogBox "Console Error" overlays and is too noisy
      // for offline/slow networks. Keep detailed logs behind a verbose flag.
      const verbose = Boolean(
        (globalThis as any).__NEON_VERBOSE__ || (globalThis as any).__SYNC_VERBOSE__
      );
      if (__DEV__ && verbose) {
        console.warn('Neon query failed', { sql: sql.substring(0, 50) + '...', err });
      }
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
import { getNeonHealth } from '../api/neonClient';

export type SyncResult = {
  ok: boolean;
  reason?:
    | 'success'
    | 'up_to_date'
    | 'no_session'
    | 'already_running'
    | 'throttled'
    | 'offline'
    | 'not_configured'
    | 'error';
  upToDate?: boolean;
  counts?: { pushed: number; pulled: number };
};

export const syncBothWays = async (options?: { force?: boolean; source?: 'manual' | 'auto' }) => {
  let syncUserKey: string | null = null;
  // State machine: sync can be paused at any time.
  await loadSyncPrefsOnce();
  if (_syncPaused) {
    return {
      ok: true,
      reason: 'throttled',
      upToDate: true,
      counts: { pushed: 0, pulled: 0 },
    } satisfies SyncResult;
  }

  // Starting a new sync implies we want to clear any previous cancel request.
  try {
    resetSyncCancel();
  } catch (e) {}
  // If cloud sync isn't configured in this build, fail fast with a clear reason.
  try {
    const h = getNeonHealth();
    if (!h.isConfigured) {
      if (__DEV__) console.warn('[sync] cloud sync not configured (missing NEON_URL)');
      return { ok: false, reason: 'not_configured' } satisfies SyncResult;
    }
  } catch (e) {}

  if (_syncInProgress) {
    _pendingSyncRequested = true;
    _pendingSyncForce = _pendingSyncForce || !!options?.force;
    try {
      const verbose = Boolean(
        (globalThis as any).__NEON_VERBOSE__ || (globalThis as any).__SYNC_VERBOSE__
      );
      if (__DEV__ && verbose) {
        const now = Date.now();
        if (now - _lastAlreadyRunningLogAt > 2500) {
          _lastAlreadyRunningLogAt = now;
          console.log('Sync already running, scheduling follow-up');
        }
      }
    } catch (e) {}
    return { ok: true, reason: 'already_running', upToDate: true } satisfies SyncResult;
  }

  _lastSyncAttemptAt = Date.now();

  const state = await NetInfo.fetch();
  _isOnline = !!state.isConnected;
  if (!state.isConnected) return { ok: false, reason: 'offline' } satisfies SyncResult;

  // Identity boundary (NON-NEGOTIABLE): Clerk is the source of truth.
  // Resolve the canonical Neon user UUID by clerk_id, and migrate any local
  // offline-placeholder UUID to the real Neon UUID when it becomes available.
  try {
    const sess: any = await getSession();
    const uid = sess?.id ? String(sess.id) : null;
    const clerkId = sess?.clerk_id ? String(sess.clerk_id) : null;
    const email = sess?.email ? String(sess.email) : '';
    const name = sess?.name ? String(sess.name) : '';

    if (!uid || !clerkId) {
      return { ok: false, reason: 'no_session', upToDate: true, counts: { pushed: 0, pulled: 0 } };
    }

    // Look up by clerk_id (authoritative).
    let realId: string | null = null;
    try {
      const rows = await safeQ('SELECT id, name, email FROM users WHERE clerk_id = $1 LIMIT 1', [
        clerkId,
      ]);
      const v = rows && rows.length ? String((rows as any)[0]?.id || '') : '';
      if (v && isUuid(v)) realId = v;
    } catch (e) {
      // ignore and fall through to optional create
    }

    // If missing on server but we're online, attempt to create the user row.
    if (!realId) {
      try {
        const created = await safeQ(
          "INSERT INTO users (clerk_id, email, name, password_hash, status) VALUES ($1, $2, $3, 'clerk_managed', 'active') RETURNING id",
          [clerkId, String(email || ''), String(name || '')]
        );
        const v = created && created.length ? String((created as any)[0]?.id || '') : '';
        if (v && isUuid(v)) realId = v;
      } catch (e) {
        // If email uniqueness conflicts with an existing legacy row, do not guess ownership here.
        // We'll fall back to the dedicated bridge service below.
      }
    }

    // Final fallback: use the bridge service, which safely links legacy email-only rows
    // ONLY when clerk_id is NULL, otherwise it fails closed.
    if (!realId && email) {
      try {
        const bridged = await syncClerkUserToNeon({
          id: clerkId,
          emailAddresses: [{ emailAddress: email }],
          fullName: name || null,
        });
        if (bridged?.uuid && isUuid(bridged.uuid) && !bridged.isOfflineFallback) {
          realId = bridged.uuid;
        }
      } catch (e) {
        // ignore
      }
    }

    // If still unresolved, skip sync to avoid FK violations when pushing transactions.
    if (!realId || !isUuid(realId)) {
      return {
        ok: false,
        reason: 'no_session',
        upToDate: true,
        counts: { pushed: 0, pulled: 0 },
      } satisfies SyncResult;
    }

    // Keep a stable key for throttling follow-up pulls.
    syncUserKey = realId;

    // If we found a real Neon UUID and it differs from the current session uuid,
    // migrate local rows and reset pull cursors.
    if (realId !== uid) {
      try {
        const { executeSqlAsync } = require('../db/sqlite');
        await executeSqlAsync('UPDATE transactions SET user_id = ? WHERE user_id = ?;', [
          realId,
          uid,
        ]);
        try {
          const oldKey = `last_pull_server_version:${uid}`;
          const newKey = `last_pull_server_version:${realId}`;
          const oldCursor = `last_pull_cursor_v2:${uid}`;
          const newCursor = `last_pull_cursor_v2:${realId}`;
          await executeSqlAsync('DELETE FROM meta WHERE key IN (?, ?, ?, ?);', [
            oldKey,
            newKey,
            oldCursor,
            newCursor,
          ]);
        } catch (e) {}
      } catch (e) {}

      try {
        await saveSession(
          realId,
          name,
          email,
          (sess as any)?.image ?? null,
          (sess as any)?.imageUrl ?? null,
          clerkId
        );
      } catch (e) {}
      try {
        const { notifyEntriesChanged } = require('../utils/dbEvents');
        notifyEntriesChanged();
      } catch (e) {}
    } else {
      // Ensure clerk_id is persisted even when uuid already matches.
      try {
        await saveSession(
          realId,
          name,
          email,
          (sess as any)?.image ?? null,
          (sess as any)?.imageUrl ?? null,
          clerkId
        );
      } catch (e) {}
    }
  } catch (e) {
    return { ok: false, reason: 'no_session', upToDate: true, counts: { pushed: 0, pulled: 0 } };
  }

  // Legacy repair: ensure all local transaction ids are UUIDs before pushing to Neon.
  // (Older builds created ids like "local_..." which Neon rejects.)
  try {
    const { migrateNonUuidTransactionIds } = require('../db/transactions');
    if (typeof migrateNonUuidTransactionIds === 'function') {
      await migrateNonUuidTransactionIds();
    }
  } catch (e) {}

  _syncInProgress = true;
  // notify listeners that sync started
  try {
    setSyncStatus('syncing');
  } catch (e) {}

  try {
    // Delegate actual sync work to runFullSync (single source of truth)
    const runResult = await runFullSync({ force: !!options?.force });

    // If runFullSync was skipped (throttled/already running/no-session), treat as non-error no-op.
    if (runResult?.status === 'skipped') {
      try {
        const verbose = Boolean(
          (globalThis as any).__NEON_VERBOSE__ || (globalThis as any).__SYNC_VERBOSE__
        );
        if (__DEV__ && verbose)
          console.log('[sync] syncBothWays: runFullSync skipped', runResult.reason);
      } catch (e) {}
      _lastSyncAttemptAt = Date.now();
      _syncInProgress = false;
      try {
        setSyncStatus('idle');
      } catch (e) {}
      return {
        ok: true,
        reason:
          runResult.reason === 'no_session' || runResult.reason === 'cancelled'
            ? 'up_to_date'
            : (runResult.reason as any),
        upToDate: true,
        counts: { pushed: 0, pulled: 0 },
      } satisfies SyncResult;
    }

    // If runFullSync reports push/pull failures, treat this as a sync error.
    // (We still allow partial local progress, but UI should prompt the user to retry.)
    try {
      const errs: any = (runResult as any)?.errors || null;
      const pushFailed = !!errs?.push;
      const pullFailed = !!errs?.pull;
      if (pushFailed || pullFailed) {
        try {
          setSyncStatus('error');
        } catch (e) {}
        return { ok: false, reason: 'error' } satisfies SyncResult;
      }
    } catch (e) {}

    _lastSuccessfulSyncAt = Date.now();
    try {
      // Persist last successful sync time so UI can show it after restarts
      await AsyncStorage.setItem('last_sync_at', String(_lastSuccessfulSyncAt));
    } catch (e) {}
    _syncFailureCount = 0;

    // Compute push/pull counts for callers and for last-sync metrics
    let pushedCount = 0;
    let pulledCount = 0;
    try {
      if (runResult && runResult.status === 'ran') {
        // push result may be an object { pushed: string[] } or an array
        const pr: any = runResult.pushed;
        if (pr) {
          if (Array.isArray(pr)) pushedCount = pr.length;
          else if (Array.isArray(pr.pushed)) pushedCount = pr.pushed.length;
          else if (typeof pr === 'number') pushedCount = pr;
        }

        const pl: any = runResult.pulled;
        if (pl) {
          if (typeof pl.pulled === 'number') pulledCount = pl.pulled;
          else if (typeof pl === 'number') pulledCount = pl;
        }
      }
    } catch (e) {}

    try {
      const { notifyEntriesChanged } = require('../utils/dbEvents');
      notifyEntriesChanged();
    } catch (e) {}

    // success -> clear any previous error state
    try {
      setSyncStatus('idle');
    } catch (e) {}

    try {
      // persist last sync counts for diagnostics
      try {
        await AsyncStorage.setItem('last_sync_count', String(pulledCount));
      } catch (e) {}
    } catch (e) {}
    const upToDate = pushedCount === 0 && pulledCount === 0;

    // If the pull stopped early (large account / time budget), queue a single follow-up
    // forced sync to continue pulling more pages.
    try {
      const hasMore = Boolean((runResult as any)?.pulled?.hasMore);
      if (hasMore && pulledCount > 0) {
        const now = Date.now();
        const key = syncUserKey || 'global';
        const last = _followUpPullQueuedAtByUser[key] || 0;
        if (now - last > 5000) {
          _followUpPullQueuedAtByUser[key] = now;
          setTimeout(() => {
            try {
              scheduleSync({ source: 'auto', force: true } as any);
            } catch (e) {}
          }, 500);
        }
      }
    } catch (e) {}

    return {
      ok: true,
      reason: upToDate ? 'up_to_date' : 'success',
      upToDate,
      counts: { pushed: pushedCount, pulled: pulledCount },
    } satisfies SyncResult;
  } catch (err) {
    // Cancellation is a normal outcome (e.g., logout). Do not enter error state.
    try {
      if ((err as any)?.message === 'sync_cancelled') {
        try {
          setSyncStatus('idle');
        } catch (e) {}
        return { ok: true, reason: 'up_to_date', upToDate: true, counts: { pushed: 0, pulled: 0 } };
      }
    } catch (e) {}
    try {
      const verbose = Boolean(
        (globalThis as any).__NEON_VERBOSE__ || (globalThis as any).__SYNC_VERBOSE__
      );
      if (__DEV__ && verbose) console.warn('Sync failed', err);
    } catch (e) {}
    _syncFailureCount = Math.min(5, _syncFailureCount + 1);
    // Enter error state — callers should only set this if runFullSync truly failed
    try {
      setSyncStatus('error');
    } catch (e) {}
    return { ok: false, reason: 'error' } satisfies SyncResult;
  } finally {
    _syncInProgress = false;
    // notify listeners that sync finished (if not errored, set to idle above)
    try {
      if (_syncStatus !== 'error') setSyncStatus('idle');
    } catch (e) {}
    if (_pendingSyncRequested) {
      _pendingSyncRequested = false;
      const forceFollowUp = _pendingSyncForce;
      _pendingSyncForce = false;
      setTimeout(() => {
        // Use the UI-friendly scheduler so follow-up sync doesn't block taps/gestures.
        scheduleSync(forceFollowUp ? { force: true, source: 'auto' } : undefined).catch(() => {
          // Swallow follow-up errors; banner/NetInfo will reflect offline state.
        });
      }, 500);
    }
  }
};

// --- Listeners & Background Tasks ---

export const getLastSyncTime = async () => AsyncStorage.getItem('last_sync_at');

// Synchronous getter for in-memory last-successful-sync timestamp (ms since epoch)
export const getLastSuccessfulSyncAt = (): number | null => _lastSuccessfulSyncAt;

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
  void loadSyncPrefsOnce();
  let wasOnline = false;
  _unsubscribe = NetInfo.addEventListener((state) => {
    const isOnline = !!state.isConnected;
    _isOnline = isOnline;

    // If we go offline mid-sync, cancel in-flight work (best-effort) so we don't hang.
    if (!isOnline && _syncInProgress) {
      try {
        requestSyncCancel();
      } catch (e) {}
    }

    if (!wasOnline && isOnline) {
      // Kick off a sync when we come online, but respect recent successful syncs
      const now = Date.now();
      const MIN_ONLINE_SYNC_MS = 30 * 1000; // don't run online sync more often than this
      if (!_lastSuccessfulSyncAt || now - _lastSuccessfulSyncAt > MIN_ONLINE_SYNC_MS) {
        InteractionManager.runAfterInteractions(() => {
          if (_syncPaused) return;
          syncBothWays().catch(() => {
            // Swallow expected failures (offline/slow network) to avoid LogBox noise.
          });
        });
      }
    }
    wasOnline = isOnline;
  });

  // Also coalesce local DB changes into a debounced sync while online.
  // This avoids "sync only on reconnect" behavior and reduces compute by batching.
  try {
    if (!_entriesUnsubscribe) {
      const events = require('../utils/dbEvents');
      const subscribe =
        events && typeof events.subscribeEntries === 'function' ? events.subscribeEntries : null;
      if (subscribe) {
        _entriesUnsubscribe = subscribe(() => {
          try {
            if (!_isOnline) return;
            if (_syncPaused) return;
            try {
              const h = getNeonHealth();
              if (!h.isConfigured) return;
            } catch (e) {
              return;
            }

            // Debounce rapid edits (adds/updates/deletes) into a single sync.
            if (_entriesSyncTimer) return;

            const MIN_CHANGE_SYNC_MS = __DEV__ ? 15000 : 120000;
            const now = Date.now();
            if (_lastSyncAttemptAt && now - _lastSyncAttemptAt < MIN_CHANGE_SYNC_MS) return;

            _entriesSyncTimer = setTimeout(() => {
              _entriesSyncTimer = null;
              if (_syncPaused) return;
              syncBothWays().catch(() => {
                // Swallow expected failures (offline/slow network) to avoid LogBox noise.
              });
            }, 5000);
          } catch (e) {}
        });
      }
    }
  } catch (e) {}
};

export const stopAutoSyncListener = () => {
  if (_unsubscribe) {
    _unsubscribe();
    _unsubscribe = null;
  }

  if (_entriesSyncTimer) {
    try {
      clearTimeout(_entriesSyncTimer);
    } catch (e) {}
    _entriesSyncTimer = null;
  }

  if (_entriesUnsubscribe) {
    try {
      _entriesUnsubscribe();
    } catch (e) {}
    _entriesUnsubscribe = null;
  }
};

export const startForegroundSyncScheduler = (intervalMs: number = 15000) => {
  if (_foregroundTimer) return;
  void loadSyncPrefsOnce();
  _foregroundTimer = setInterval(() => {
    try {
      if (_syncPaused) return;
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
        Promise.resolve(fn()).catch(() => {
          // Swallow expected failures (offline/slow network) to avoid LogBox noise.
        });
      }
    } catch (err) {
      if (!_syncInProgress)
        syncBothWays().catch(() => {
          // Swallow expected failures (offline/slow network) to avoid LogBox noise.
        });
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
  await loadSyncPrefsOnce();
  if (_syncPaused) return;

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
            if (__DEV__) console.warn('[BackgroundFetch] sync failed', err);
          } finally {
            try {
              // Invalidate React Query caches related to entries so UI refreshes immediately.
              try {
                const holder = require('../utils/queryClientHolder');
                const qc = holder && holder.getQueryClient ? holder.getQueryClient() : null;
                if (qc) {
                  // Invalidate any queries whose key starts with ['entries'] so guest -> real user
                  // switches cause immediate refetch.
                  try {
                    await qc.invalidateQueries({ queryKey: ['entries'] });
                  } catch (e) {}
                  // Also invalidate generic balances/summary keys if present.
                  try {
                    await qc.invalidateQueries({ queryKey: ['balances'] });
                  } catch (e) {}
                }
              } catch (e) {}

              const { notifyEntriesChanged } = require('../utils/dbEvents');
              notifyEntriesChanged();
            } catch (e) {}

            // Signal task complete to BackgroundFetch
            try {
              if (typeof BackgroundFetch.finish === 'function') BackgroundFetch.finish(taskId);
            } catch (e) {}
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

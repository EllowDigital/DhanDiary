import NetInfo from '@react-native-community/netinfo';
// Use AsyncStorage wrapper which falls back to an in-memory store when native
// AsyncStorage isn’t available (Expo Go). This prevents crashes in dev.
import AsyncStorage from '../utils/AsyncStorageWrapper';
import {
  init as initDb,
  getPendingProfileUpdates,
  markPendingProfileProcessed,
  isDbOperational,
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
} from '../db/entries';

import { query } from '../api/neonClient';
import vexoService from './vexo';
const Q = (sql: string, params: any[] = []) => query(sql, params, { retries: 2, timeoutMs: 15000 });

// Module-level state
let _syncInProgress: boolean = false;
let _unsubscribe: (() => void) | null = null;
let _foregroundTimer: any = null;
let _backgroundFetchInstance: any = null;

export const syncPending = async () => {
  await initDb();
  const state = await NetInfo.fetch();
  if (!state.isConnected) return { pushed: 0, updated: 0, deleted: 0 };

  const pending = await getUnsyncedEntries();
  if (pending.length === 0) return { pushed: 0, updated: 0, deleted: 0 };

  console.log(`Syncing ${pending.length} entries...`);

  let pushed = 0;
  let updated = 0;
  let deleted = 0;

  // Partition pending rows into deletions, inserts, updates
  const deletions = pending.filter((e) => e.is_deleted && e.remote_id).map((e) => String(e.remote_id));
  const toMarkLocalDeletedOnly = pending.filter((e) => e.is_deleted && !e.remote_id);
  const inserts = pending.filter((e) => !e.remote_id && !e.is_deleted);
  const updates = pending.filter((e) => e.remote_id && e.need_sync);

  // Batch deletions
  if (deletions.length > 0) {
    try {
      const delRes = await Q('DELETE FROM cash_entries WHERE id = ANY($1) RETURNING id', [deletions]);
      deleted += (delRes && delRes.length) || deletions.length;
    } catch (err) {
      console.error('Failed to batch delete remote rows', err);
      for (const rid of deletions) {
        try {
          await Q('DELETE FROM cash_entries WHERE id = $1', [rid]);
          deleted += 1;
        } catch (e) {
          console.error('Failed to delete remote row', rid, e);
        }
      }
    }
    // Mark local rows as synced where appropriate
    for (const d of pending.filter((e) => e.is_deleted)) {
      try {
        await markEntrySynced(d.local_id, d.remote_id || undefined);
      } catch (e) {}
    }
  }

  // If rows were marked deleted locally but had no remote_id, mark them synced (nothing to delete remotely)
  for (const d of toMarkLocalDeletedOnly) {
    try {
      await markEntrySynced(d.local_id, undefined);
    } catch (e) {}
  }

  // Batch inserts
  if (inserts.length > 0) {
    const values: any[] = [];
    const placeholders: string[] = [];
    let idx = 1;
    for (const it of inserts) {
      placeholders.push(`($${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},false,$${idx++})`);
      values.push(
        it.user_id,
        it.type,
        it.amount,
        it.category,
        it.note || null,
        it.currency || 'INR',
        it.created_at,
        it.updated_at,
        it.local_id
      );
    }
    const sql = `INSERT INTO cash_entries (user_id, type, amount, category, note, currency, created_at, updated_at, need_sync, client_id) VALUES ${placeholders.join(',')} ON CONFLICT (client_id) DO NOTHING RETURNING id, client_id, server_version`;
    try {
      const res = await Q(sql, values);
      if (res && res.length) {
        for (const r of res) {
          const localId = String(r.client_id);
          try {
            await markEntrySynced(localId, String(r.id), typeof r.server_version === 'number' ? Number(r.server_version) : undefined);
            pushed += 1;
          } catch (e) {
            try {
              await queueLocalRemoteMapping(localId, String(r.id));
            } catch (q) {}
          }
        }
      }
    } catch (err: any) {
      if (err && typeof err.message === 'string' && err.message.includes('no unique or exclusion constraint')) {
        // fall back to per-row resilient insert
        for (const it of inserts) {
          try {
            const insertRes = await Q(
              `INSERT INTO cash_entries (user_id, type, amount, category, note, currency, created_at, updated_at, need_sync, client_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, $9) RETURNING id, server_version`,
              [
                it.user_id,
                it.type,
                it.amount,
                it.category,
                it.note || null,
                it.currency || 'INR',
                it.created_at,
                it.updated_at,
                it.local_id,
              ]
            );
            let remoteId = insertRes && insertRes[0] && insertRes[0].id ? insertRes[0].id : undefined;
            if (!remoteId) {
              const found = await Q(`SELECT id, server_version FROM cash_entries WHERE client_id = $1 LIMIT 1`, [it.local_id]);
              if (found && found[0] && found[0].id) {
                remoteId = found[0].id;
              }
            }
            if (remoteId) {
              const sv = insertRes && insertRes[0] && insertRes[0].server_version ? Number(insertRes[0].server_version) : undefined;
              try {
                await markEntrySynced(it.local_id, String(remoteId), sv);
                pushed += 1;
              } catch (e) {
                try {
                  await queueLocalRemoteMapping(it.local_id, String(remoteId));
                } catch (q) {}
              }
            }
          } catch (e) {
            console.error('Failed to insert remote entry (fallback)', it.local_id, e);
          }
        }
      } else {
        console.error('Failed to batch insert remote entries', err);
      }
    }
  }

  // Batch updates using UPDATE ... FROM (VALUES ...)
  if (updates.length > 0) {
    const vals: any[] = [];
    const rowPlaceholders: string[] = [];
    let j = 1;
    for (const u of updates) {
      rowPlaceholders.push(`($${j++},$${j++},$${j++},$${j++},$${j++},$${j++},$${j++})`);
      vals.push(u.remote_id, u.amount, u.type, u.category, u.note || null, u.currency || 'INR', u.updated_at);
    }
    const updateSql = `UPDATE cash_entries AS c SET amount = v.amount, type = v.type, category = v.category, note = v.note, currency = v.currency, updated_at = v.updated_at, need_sync = true FROM (VALUES ${rowPlaceholders.join(',')}) AS v(id, amount, type, category, note, currency, updated_at) WHERE c.id = v.id RETURNING c.id, server_version`;
    try {
      const updRes = await Q(updateSql, vals);
      if (updRes && updRes.length) {
        const remoteToLocal: Record<string, string> = {};
        for (const u of updates) {
          remoteToLocal[String(u.remote_id)] = u.local_id;
        }
        for (const r of updRes) {
          const localId = remoteToLocal[String(r.id)];
          if (localId) {
            try {
              await markEntrySynced(localId, String(r.id), typeof r.server_version === 'number' ? Number(r.server_version) : undefined);
              updated += 1;
            } catch (e) {}
          }
        }
      }
    } catch (err) {
      console.error('Failed to batch update remote entries, falling back to per-row', err);
      for (const u of updates) {
        try {
          const res = await Q(
            `UPDATE cash_entries SET amount = $1, type = $2, category = $3, note = $4, currency = $5, updated_at = $6, need_sync = true WHERE id = $7 RETURNING id, server_version`,
            [u.amount, u.type, u.category, u.note || null, u.currency || 'INR', u.updated_at, u.remote_id]
          );
          if (res && res[0] && res[0].id) {
            const sv = res[0].server_version !== undefined ? Number(res[0].server_version) : undefined;
            try {
              await markEntrySynced(u.local_id, String(res[0].id), sv);
              updated += 1;
            } catch (e) {}
          }
        } catch (e) {
          console.error('Failed to update remote entry', u.local_id, e);
        }
      }
    }
  }

  console.log('Sync complete');
  return { pushed, updated, deleted };
};

const flushPendingProfileUpdates = async () => {
  await initDb();
  const pending = await getPendingProfileUpdates();
  if (!pending || pending.length === 0) return { processed: 0 };
  let processed = 0;
  for (const p of pending) {
    try {
      // try to update remote users table
      // ensure email uniqueness if provided
      if (p.email) {
        const existing = await Q('SELECT id FROM users WHERE email = $1 AND id <> $2 LIMIT 1', [
          p.email,
          p.user_id,
        ]);
        if (existing && existing.length > 0) {
          // skip this pending update (email conflict), leave it pending and notify via console
          console.warn('Pending profile update skipped due to email conflict for', p.user_id);
          continue;
        }
      }
      const fields: string[] = [];
      const params: any[] = [];
      let idx = 1;
      if (p.name !== null && p.name !== undefined) {
        fields.push(`name = $${idx++}`);
        params.push(p.name);
      }
      if (p.email !== null && p.email !== undefined) {
        fields.push(`email = $${idx++}`);
        params.push(p.email);
      }
      if (fields.length === 0) {
        // nothing to do, mark processed
        await markPendingProfileProcessed(p.id);
        processed += 1;
        continue;
      }
      params.push(p.user_id);
      const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, name, email`;
      const res = await Q(sql, params);
      if (res && res.length) {
        const user = res[0];
        try {
          await saveSession(user.id, user.name || '', user.email);
        } catch (e) {}
        await markPendingProfileProcessed(p.id);
        processed += 1;
      }
    } catch (err) {
      console.error('Failed to flush pending profile update', p.id, err);
      // leave pending for next attempt
    }
  }
  return { processed };
};

export const pullRemote = async () => {
  await initDb();
  const state = await NetInfo.fetch();
  if (!state.isConnected) return;

  const session = await getSession();
  if (!session || !session.id) return;

  try {
    // First, attempt to flush any queued remote rows from previous failures
    try {
      // Flush queued local->remote mappings first (these map local rows to remote ids)
      try {
        const mflush = await flushQueuedLocalRemoteMappings();
        if (mflush && mflush.processed)
          console.log('Flushed queued local->remote mappings', mflush.processed);
      } catch (e) {
        console.warn('Failed to flush queued local->remote mappings', e);
      }

      const flush = await flushQueuedRemoteRows();
      if (flush && flush.processed) console.log('Flushed queued remote rows', flush.processed);
    } catch (e) {
      console.warn('Failed to flush queued remote rows', e);
    }
    // fetch all remote rows for this user (including deleted flag)
    const rows = await Q(
      `SELECT id, user_id, type, amount, category, note, currency, created_at, updated_at, deleted, client_id, server_version FROM cash_entries WHERE user_id = $1`,
      [session.id]
    );

    if (!rows || rows.length === 0) return { pulled: 0, merged: 0 };

    let pulled = 0;
    let merged = 0;

    for (const r of rows) {
      try {
        // if deleted remotely, prefer local if local has pending changes
        if (r.deleted) {
          // attempt to find a local row mapped to this remote
          let localForDeleted: any = null;
          try {
            localForDeleted = await getLocalByRemoteId(String(r.id));
          } catch (e) {}
          if (!localForDeleted && r.client_id) {
            try {
              localForDeleted = await getLocalByClientId(String(r.client_id));
            } catch (e) {}
          }

          // If local exists and still needs sync, treat local as intent-to-keep:
          // recreate a remote row from the local copy and map it.
          if (localForDeleted && (localForDeleted as any).need_sync) {
            try {
              const insertRes = await Q(
                `INSERT INTO cash_entries (user_id, type, amount, category, note, currency, created_at, updated_at, need_sync, client_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, $9) RETURNING id, server_version`,
                [
                  localForDeleted.user_id,
                  localForDeleted.type,
                  localForDeleted.amount,
                  localForDeleted.category,
                  localForDeleted.note || null,
                  localForDeleted.currency || 'INR',
                  localForDeleted.created_at,
                  localForDeleted.updated_at,
                  localForDeleted.local_id,
                ]
              );
              const newRemoteId = insertRes && insertRes[0] && insertRes[0].id ? insertRes[0].id : undefined;
              const sv = insertRes && insertRes[0] && insertRes[0].server_version ? Number(insertRes[0].server_version) : undefined;
              if (newRemoteId) {
                try {
                  await markEntrySynced(localForDeleted.local_id, String(newRemoteId), sv);
                } catch (e) {
                  try {
                    await queueLocalRemoteMapping(localForDeleted.local_id, String(newRemoteId));
                    console.log('DB not operational, queued local->remote mapping for', localForDeleted.local_id);
                  } catch (q) {
                    console.warn('Failed to queue local->remote mapping after recreate', localForDeleted.local_id, q);
                  }
                }
              }
            } catch (err) {
              console.error('Failed to recreate remote row for locally-modified deleted remote', localForDeleted.local_id, err);
              // fallback to marking local deleted
              await markLocalDeletedByRemoteId(String(r.id));
            }
            continue;
          }

          // otherwise mark local deleted to mirror remote
          await markLocalDeletedByRemoteId(String(r.id));
          continue;
        }

        // Check local mapping for this remote id or by client_id
        let local = null;
        if (r.id) local = await getLocalByRemoteId(String(r.id));
        if (!local && r.client_id) {
          try {
            local = await getLocalByClientId(String(r.client_id));
          } catch (e) {
            // ignore
          }
        }
        if (local && local.local_id) {
          // If local explicitly needs sync, it's a local change not yet pushed
          if ((local as any).need_sync) {
            // If timestamps match, consider synced
            if (
              new Date(local.updated_at || 0).getTime() === new Date(r.updated_at || 0).getTime()
            ) {
              try {
                await markEntrySynced(local.local_id, String(r.id));
              } catch (e) {}
              merged += 1;
              continue;
            }

            // Conflict: both remote and local changed. To avoid data loss, push local as a new remote row
            try {
              const insertRes = await Q(
                `INSERT INTO cash_entries (user_id, type, amount, category, note, currency, created_at, updated_at, need_sync)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false) RETURNING id`,
                [
                  local.user_id,
                  local.type,
                  local.amount,
                  local.category,
                  local.note || null,
                  local.currency || 'INR',
                  local.created_at,
                  local.updated_at,
                ]
              );
              const newRemoteId =
                insertRes && insertRes[0] && insertRes[0].id ? insertRes[0].id : undefined;
              if (newRemoteId) {
                await markEntrySynced(local.local_id, String(newRemoteId));
                merged += 1;
              }
            } catch (err) {
              console.error('Failed to push local-as-new for conflict', local.local_id, err);
            }
            continue;
          }

          // Compare timestamps to prefer latest
          const localUpdated = new Date(local.updated_at || 0).getTime();
          const remoteUpdated = new Date(r.updated_at || 0).getTime();

          if (localUpdated > remoteUpdated) {
            // Local is newer -> push local state to remote (client wins)
            try {
              await Q(
                `UPDATE cash_entries SET amount = $1, type = $2, category = $3, note = $4, currency = $5, updated_at = $6 WHERE id = $7`,
                [
                  local.amount,
                  local.type,
                  local.category,
                  local.note || null,
                  local.currency || 'INR',
                  local.updated_at,
                  r.id,
                ]
              );
              try {
                await markEntrySynced(local.local_id, String(r.id));
              } catch (e) {}
              merged += 1;
            } catch (err) {
              console.error('Failed to push local change to remote for', local.local_id, err);
            }
            continue;
          }
        }

        // Otherwise remote is same or newer -> upsert into local (including client_id)
        try {
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
          });
          pulled += 1;
        } catch (err) {
          console.error('Failed to merge remote row', r.id, err);
          try {
            await queueRemoteRow(r);
            console.log('Queued remote row for later merge', r.id);
          } catch (e) {
            console.warn('Failed to queue remote row', r.id, e);
          }
        }
      } catch (err) {
        console.error('Failed to merge remote row', r.id, err);
      }
    }
    return { pulled, merged };
  } catch (err) {
    console.error('Failed to pull remote entries', err);
    throw err;
  }
};

const ensureRemoteSchema = async () => {
  await initDb();
  try {
    const col = await query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'cash_entries' AND column_name = 'need_sync' LIMIT 1`,
      []
    );
    if (!col || col.length === 0) {
      try {
        await query(`ALTER TABLE cash_entries ADD COLUMN need_sync boolean DEFAULT false`, []);
      } catch (e) {
        console.warn('Failed to add need_sync column on remote, continuing', e);
      }
    }

    // Ensure remote has client_id column for deduplication (maps local_id -> remote row)
    try {
      const col2 = await query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'cash_entries' AND column_name = 'client_id' LIMIT 1`,
        []
      );
      if (!col2 || col2.length === 0) {
        try {
          await query(`ALTER TABLE cash_entries ADD COLUMN client_id text`, []);
          // create unique index to prevent duplicate client_id rows
          await query(
            `CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_entries_client_id ON cash_entries (client_id)`,
            []
          );
        } catch (e) {
          console.warn('Failed to add client_id column on remote, continuing', e);
        }
      }
    } catch (e) {
      console.warn('Could not verify remote client_id schema', e);
    }
    // Ensure remote has server_version column for deterministic merges
    try {
      const col3 = await query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'cash_entries' AND column_name = 'server_version' LIMIT 1`,
        []
      );
      if (!col3 || col3.length === 0) {
        try {
          await query(`ALTER TABLE cash_entries ADD COLUMN server_version integer DEFAULT 0`, []);
        } catch (e) {
          console.warn('Failed to add server_version column on remote, continuing', e);
        }
      }
    } catch (e) {
      console.warn('Could not verify remote server_version schema', e);
    }
  } catch (e) {
    console.warn('Could not verify remote schema', e);
  }
};

export const syncBothWays = async () => {
  if (_syncInProgress) {
    console.log('syncBothWays: already running, skipping concurrent invocation');
    return { pushed: 0, updated: 0, deleted: 0, pulled: 0, merged: 0, total: 0 };
  }
  const state = await NetInfo.fetch();
  if (!state.isConnected) return;
  _syncInProgress = true;
  let result = { pushed: 0, updated: 0, deleted: 0, pulled: 0, merged: 0, total: 0 };
  try {
    try {
      vexoService.customEvent && vexoService.customEvent('sync_start', { when: new Date().toISOString() });
    } catch (e) {}
    // ensure remote schema can accept our metadata
    await ensureRemoteSchema();
    // Flush any pending profile updates first
    try {
      await flushPendingProfileUpdates();
    } catch (e) {
      console.warn('Failed to flush pending profile updates', e);
    }
    // Push local pending changes first
    const pushStats = await syncPending();
    // Then pull remote and merge into local
    const pullStats = await pullRemote();

    const pushed = pushStats && pushStats.pushed ? pushStats.pushed : 0;
    const updated = pushStats && pushStats.updated ? pushStats.updated : 0;
    const deleted = pushStats && pushStats.deleted ? pushStats.deleted : 0;

    const pulled = pullStats && pullStats.pulled ? pullStats.pulled : 0;
    const merged = pullStats && pullStats.merged ? pullStats.merged : 0;

    const total = pushed + updated + deleted + pulled + merged;

    try {
      const now = new Date().toISOString();
      await AsyncStorage.setItem('last_sync_at', now);
      await AsyncStorage.setItem('last_sync_count', String(total));
    } catch (e) {
      console.warn('Failed to write last_sync metadata', e);
    }

    // Notify UI that entries may have changed due to sync (merge/push/pull)
    try {
      const { notifyEntriesChanged } = require('../utils/dbEvents');
      notifyEntriesChanged();
    } catch (e) {
      // ignore if event module not available
    }

    result = { pushed, updated, deleted, pulled, merged, total };
    try {
      vexoService.customEvent &&
        vexoService.customEvent('sync_complete', { pushed, updated, deleted, pulled, merged, total });
    } catch (e) {}
    return result;
  } finally {
    _syncInProgress = false;
    try {
      // If the sync finished but recorded no activity, emit a small heartbeat
      vexoService.customEvent && vexoService.customEvent('sync_ended', { when: new Date().toISOString() });
    } catch (e) {}
  }
};

export const getLastSyncTime = async () => {
  try {
    const v = await AsyncStorage.getItem('last_sync_at');
    return v;
  } catch (e) {
    return null;
  }
};

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
      // transitioned offline -> online
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

// Foreground scheduler: runs periodic sync while app is in foreground.
export const startForegroundSyncScheduler = (intervalMs: number = 15000) => {
  if (_foregroundTimer) return;
  _foregroundTimer = setInterval(() => {
    if (!_syncInProgress) {
      try {
        // require dynamically so tests can replace the exported implementation
        const mod: any = require('./syncManager');
        if (mod && typeof mod.syncBothWays === 'function') {
          mod.syncBothWays().catch((err: any) => console.error('Foreground scheduled sync failed', err));
        }
      } catch (e) {
        // fallback to direct call
        syncBothWays().catch((err) => console.error('Foreground scheduled sync failed', err));
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

// Background fetch support (optional dependency: react-native-background-fetch)
// If the library isn't available we gracefully no-op.
export const startBackgroundFetch = async () => {
  if (_backgroundFetchInstance) return;
  try {
    // require dynamically to avoid a hard dependency
    const BackgroundFetch = require('react-native-background-fetch');
    _backgroundFetchInstance = BackgroundFetch;
    BackgroundFetch.configure(
      {
        minimumFetchInterval: 15, // minutes (OS-driven)
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
          try {
            BackgroundFetch.finish(taskId);
          } catch (e) {
            // ignore
          }
        }
      },
      (error: any) => {
        console.warn('BackgroundFetch failed to start', error);
      }
    );
  } catch (e) {
    console.warn('react-native-background-fetch not available; background fetch disabled', e);
  }
};

export const stopBackgroundFetch = async () => {
  if (!_backgroundFetchInstance) return;
  try {
    _backgroundFetchInstance.stop();
  } catch (e) {
    // ignore
  } finally {
    _backgroundFetchInstance = null;
  }
};

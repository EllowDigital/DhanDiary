import NetInfo from '@react-native-community/netinfo';
// Use AsyncStorage wrapper which falls back to an in-memory store when native
// AsyncStorage isn’t available (Expo Go). This prevents crashes in dev.
import AsyncStorage from '../utils/AsyncStorageWrapper';
import {
  init as initDb,
  getPendingProfileUpdates,
  markPendingProfileProcessed,
  isDbOperational,
} from '../db/localDb';
import {
  getUnsyncedEntries,
  markEntrySynced,
  upsertLocalFromRemote,
  markLocalDeletedByRemoteId,
  getLocalByRemoteId,
  getLocalByClientId,
} from '../db/entries';
import { getSession, saveSession } from '../db/session';
import {
  queueRemoteRow,
  queueLocalRemoteMapping,
  getQueuedLocalRemoteMappings,
  removeQueuedRemoteRow,
  removeQueuedLocalRemoteMapping,
  flushQueuedRemoteRows,
  flushQueuedLocalRemoteMappings,
} from '../db/localDb';
import { query } from '../api/neonClient';

const Q = (sql: string, params: any[] = []) => query(sql, params, { retries: 2, timeoutMs: 15000 });

let _unsubscribe: (() => void) | null = null;
let _syncInProgress = false;

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

  for (const entry of pending) {
    try {
      // Handle deletions first
      if (entry.is_deleted) {
        if (entry.remote_id) {
          try {
            await Q('DELETE FROM cash_entries WHERE id = $1', [entry.remote_id]);
            deleted += 1;
          } catch (err) {
            console.error('Failed to delete remote row for', entry.local_id, err);
            continue;
          }
        }
        await markEntrySynced(entry.local_id, entry.remote_id || undefined);
        continue;
      }

      // If we have a remote_id and the local row explicitly needs sync, update remote
      if (entry.remote_id && entry.need_sync) {
        try {
          const res = await Q(
            `UPDATE cash_entries SET amount = $1, type = $2, category = $3, note = $4, currency = $5, updated_at = $6, need_sync = true WHERE id = $7 RETURNING id`,
            [
              entry.amount,
              entry.type,
              entry.category,
              entry.note || null,
              entry.currency || 'INR',
              entry.updated_at,
              entry.remote_id,
            ]
          );
          if (res && res[0] && res[0].id) {
            await markEntrySynced(entry.local_id, res[0].id);
            updated += 1;
          }
        } catch (err) {
          console.error('Failed to update remote entry', entry.local_id, err);
        }
        continue;
      }

      // If we have a remote_id but local doesn't need sync, skip
      if (entry.remote_id && !entry.need_sync) {
        continue;
      }

      // Otherwise insert new remote row and update local with returned id
      try {
        // Try to insert with client_id mapping so remote can dedupe.
        // Use ON CONFLICT DO NOTHING to avoid raising unique-constraint errors
        // when another device already created a row with the same client_id.
        const insertRes = await Q(
          `INSERT INTO cash_entries (user_id, type, amount, category, note, currency, created_at, updated_at, need_sync, client_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, $9) ON CONFLICT (client_id) DO NOTHING RETURNING id`,
          [
            entry.user_id,
            entry.type,
            entry.amount,
            entry.category,
            entry.note || null,
            entry.currency || 'INR',
            entry.created_at,
            entry.updated_at,
            entry.local_id,
          ]
        );

        let remoteId = insertRes && insertRes[0] && insertRes[0].id ? insertRes[0].id : undefined;

        if (!remoteId) {
          // Insert did nothing (conflict) or returned no id — try to locate the remote row by client_id
          try {
            const found = await Q(`SELECT id FROM cash_entries WHERE client_id = $1 LIMIT 1`, [
              entry.local_id,
            ]);
            if (found && found[0] && found[0].id) {
              remoteId = String(found[0].id);
            }
          } catch (e) {
            console.error(
              'Failed to locate remote by client_id after insert (no exception path)',
              entry.local_id,
              e
            );
          }
        }

        if (remoteId) {
          pushed += 1;
          try {
            await markEntrySynced(entry.local_id, remoteId);
          } catch (e) {
            // If local DB is not operational, queue mapping for later
            try {
              await queueLocalRemoteMapping(entry.local_id, remoteId);
              console.log('DB not operational, queued local->remote mapping for', entry.local_id);
            } catch (q) {
              console.warn('Failed to queue local->remote mapping after insert', entry.local_id, q);
            }
          }
        }
      } catch (err: any) {
        // Generic failure (network/permission/etc.) — log and continue. We avoid
        // treating unique-constraint errors specially because ON CONFLICT prevents them.
        console.error(`Failed to insert remote entry ${entry.local_id}`, err);
      }
    } catch (error) {
      console.error(`Failed to sync entry ${entry.local_id}`, error);
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
      `SELECT id, user_id, type, amount, category, note, currency, created_at, updated_at, deleted, client_id FROM cash_entries WHERE user_id = $1`,
      [session.id]
    );

    if (!rows || rows.length === 0) return { pulled: 0, merged: 0 };

    let pulled = 0;
    let merged = 0;

    for (const r of rows) {
      try {
        // if deleted remotely, mark local as deleted
        if (r.deleted) {
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
    return result;
  } finally {
    _syncInProgress = false;
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

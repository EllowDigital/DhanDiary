import NetInfo from '@react-native-community/netinfo';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
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
  deleteLocalEntry,
} from '../db/entries';
import { query } from '../api/neonClient';
import vexoService from './vexo';
const Q = (sql: string, params: any[] = []) => query(sql, params, { retries: 2, timeoutMs: 15000 });
type SyncConflictEvent = {
  localId?: string;
  remoteId?: string;
  amount?: number;
  category?: string;
  message?: string;
};

type SyncConflictListener = (event: SyncConflictEvent) => void;

const conflictListeners = new Set<SyncConflictListener>();

let _unsubscribe: (() => void) | null = null;
let _foregroundTimer: any = null;
let _backgroundFetchInstance: any = null;
let _backgroundFetchWarned = false;
// If a sync is requested while one is already running, schedule one extra run
// after the current finishes to pick up any missed changes.
let _pendingSyncRequested: boolean = false;
// Guard that prevents overlapping sync runs
let _syncInProgress: boolean = false;

// Helper that wraps the query call with consistent logging and error propagation.
const safeQ = async (sql: string, params: any[] = []) => {
  try {
    return await Q(sql, params);
  } catch (err) {
    try {
      console.error('Neon query failed', { sql, params, err });
    } catch (e) {}
    throw err;
  }
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

// Run a callback inside a remote transaction. Rolls back on error.
const runRemoteTransaction = async (fn: () => Promise<any>) => {
  await safeQ('BEGIN');
  try {
    const r = await fn();
    await safeQ('COMMIT');
    return r;
  } catch (err) {
    try {
      await safeQ('ROLLBACK');
    } catch (e) {
      console.warn('Failed to rollback transaction', e);
    }
    throw err;
  }
};

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
  const remoteDeletionEntries = pending.filter((e) => e.is_deleted && e.remote_id);
  const localOnlyDeletions = pending.filter((e) => e.is_deleted && !e.remote_id);
  const inserts = pending.filter((e) => !e.remote_id && !e.is_deleted);
  const updates = pending.filter((e) => e.remote_id && e.need_sync);

  const localsToDelete = new Set<string>();

  // Batch deletions (wrapped in transaction to avoid partial deletes)
  if (remoteDeletionEntries.length > 0) {
    const remoteIds = remoteDeletionEntries.map((e) => String(e.remote_id));
    try {
      await runRemoteTransaction(async () => {
        // Soft-delete remotely so other devices can observe deletions via the `deleted` flag.
        const delRes = await safeQ(
          'UPDATE cash_entries SET deleted = true, updated_at = NOW(), need_sync = false WHERE id = ANY($1::uuid[]) RETURNING id',
          [remoteIds]
        );
        deleted += (delRes && delRes.length) || remoteIds.length;
        remoteDeletionEntries.forEach((entry) => localsToDelete.add(entry.local_id));
        return delRes;
      });
    } catch (err) {
      console.error('Failed to batch delete remote rows, falling back to per-row', err);
      for (const entry of remoteDeletionEntries) {
        try {
          const res = await safeQ(
            'UPDATE cash_entries SET deleted = true, updated_at = NOW(), need_sync = false WHERE id = $1 RETURNING id',
            [entry.remote_id]
          );
          deleted += res && res.length ? res.length : 1;
          localsToDelete.add(entry.local_id);
        } catch (e) {
          console.error('Failed to delete remote row', entry.remote_id, e);
        }
      }
    }
  }

  // Locally created entries that were deleted before sync never hit the server — drop them now.
  if (localOnlyDeletions.length > 0) {
    localOnlyDeletions.forEach((entry) => localsToDelete.add(entry.local_id));
    deleted += localOnlyDeletions.length;
  }

  if (localsToDelete.size > 0) {
    for (const localId of localsToDelete) {
      try {
        await deleteLocalEntry(localId);
      } catch (e) {
        console.error('Failed to purge local entry after delete sync', localId, e);
      }
    }
  }

  // Batch inserts (wrap in transaction to avoid partial insert state on failure)
  if (inserts.length > 0) {
    try {
      await runRemoteTransaction(async () => {
        const values: any[] = [];
        const placeholders: string[] = [];
        let idx = 1;
        for (const it of inserts) {
          placeholders.push(
            // cast created_at and updated_at to timestamptz to match remote column type
            `($${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++}::timestamptz,$${idx++}::timestamptz,false,$${idx++})`
          );
          values.push(
            it.user_id,
            it.type,
            // coerce amount to numeric for Postgres
            Number(it.amount),
            it.category,
            it.note || null,
            it.currency || 'INR',
            it.created_at,
            it.updated_at,
            it.local_id
          );
        }
        const sql = `INSERT INTO cash_entries (user_id, type, amount, category, note, currency, created_at, updated_at, need_sync, client_id) VALUES ${placeholders.join(',')} ON CONFLICT (client_id) DO NOTHING RETURNING id, client_id, server_version, updated_at`;
        const res = await safeQ(sql, values);
        if (res && res.length) {
          for (const r of res) {
            const localId = String(r.client_id);
            try {
              await markEntrySynced(
                localId,
                String(r.id),
                typeof r.server_version === 'number' ? Number(r.server_version) : undefined,
                r.updated_at
              );
              pushed += 1;
            } catch (e) {
              try {
                await queueLocalRemoteMapping(localId, String(r.id));
              } catch (q) {}
            }
          }
        }
        return res;
      });
    } catch (err: any) {
      // If batch insert fails due to constraint issues or other, fall back to per-row resilient insert
      console.warn('Batch insert failed; falling back to per-row inserts', err);
      for (const it of inserts) {
        try {
          const insertRes = await safeQ(
            `INSERT INTO cash_entries (user_id, type, amount, category, note, currency, created_at, updated_at, need_sync, client_id)
               VALUES ($1, $2, $3::numeric, $4, $5, $6, $7::timestamptz, $8::timestamptz, false, $9) RETURNING id, server_version, updated_at`,
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
            ]
          );
          let remoteId = insertRes && insertRes[0] && insertRes[0].id ? insertRes[0].id : undefined;
          let remoteUpdatedAt = insertRes && insertRes[0] ? insertRes[0].updated_at : undefined;
          let remoteServerVersion =
            insertRes && insertRes[0] && insertRes[0].server_version !== undefined
              ? Number(insertRes[0].server_version)
              : undefined;
          if (!remoteId) {
            const found = await safeQ(
              `SELECT id, server_version, updated_at FROM cash_entries WHERE client_id = $1 LIMIT 1`,
              [it.local_id]
            );
            if (found && found[0] && found[0].id) {
              remoteId = found[0].id;
              remoteUpdatedAt = found[0].updated_at;
              if (found[0].server_version !== undefined) {
                remoteServerVersion = Number(found[0].server_version);
              }
            }
          }
          if (remoteId) {
            const sv = remoteServerVersion;
            try {
              const syncedAt =
                remoteUpdatedAt || (insertRes && insertRes[0] && insertRes[0].updated_at);
              await markEntrySynced(it.local_id, String(remoteId), sv, syncedAt);
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
    }
  }

  // Batch updates using UPDATE ... FROM (VALUES ...)
  if (updates.length > 0) {
    const vals: any[] = [];
    const rowPlaceholders: string[] = [];
    let j = 1;
    for (const u of updates) {
      // Cast the id column, amount and updated_at timestamp in the VALUES to correct types
      // so Postgres compares types correctly and accepts the timestamp input.
      rowPlaceholders.push(
        `($${j++}::uuid,$${j++}::numeric,$${j++},$${j++},$${j++},$${j++},$${j++}::timestamptz)`
      );
      vals.push(
        u.remote_id,
        // coerce amount to numeric
        Number(u.amount),
        u.type,
        u.category,
        u.note || null,
        u.currency || 'INR',
        u.updated_at
      );
    }

    const updateSql = `UPDATE cash_entries AS c SET amount = v.amount, type = v.type, category = v.category, note = v.note, currency = v.currency, updated_at = v.updated_at::timestamptz, need_sync = true FROM (VALUES ${rowPlaceholders.join(',')}) AS v(id, amount, type, category, note, currency, updated_at) WHERE c.id = v.id RETURNING c.id, c.server_version, c.updated_at`;

    // Batch updates (wrapped in transaction to keep consistency)
    try {
      await runRemoteTransaction(async () => {
        const updRes = await safeQ(updateSql, vals);
        if (updRes && updRes.length) {
          const remoteToLocal: Record<string, string> = {};
          for (const u of updates) {
            remoteToLocal[String(u.remote_id)] = u.local_id;
          }
          for (const r of updRes) {
            const localId = remoteToLocal[String(r.id)];
            if (localId) {
              try {
                await markEntrySynced(
                  localId,
                  String(r.id),
                  typeof r.server_version === 'number' ? Number(r.server_version) : undefined,
                  r.updated_at
                );
                updated += 1;
              } catch (e) {}
            }
          }
        }
        return updRes;
      });
    } catch (err) {
      console.warn('Batch update failed; falling back to per-row updates', err);
      for (const u of updates) {
        try {
          const res = await safeQ(
            `UPDATE cash_entries SET amount = $1::numeric, type = $2, category = $3, note = $4, currency = $5, updated_at = $6::timestamptz, need_sync = true WHERE id = $7 RETURNING id, server_version, updated_at`,
            [
              Number(u.amount),
              u.type,
              u.category,
              u.note || null,
              u.currency || 'INR',
              u.updated_at,
              u.remote_id,
            ]
          );
          if (res && res[0] && res[0].id) {
            const sv =
              res[0].server_version !== undefined ? Number(res[0].server_version) : undefined;
            try {
              await markEntrySynced(u.local_id, String(res[0].id), sv, res[0].updated_at);
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
          // revive the remote row (clear deleted flag) using local data.
          if (localForDeleted && (localForDeleted as any).need_sync) {
            try {
              const revivedUpdatedAt =
                localForDeleted.updated_at ||
                localForDeleted.created_at ||
                new Date().toISOString();
              const revived = await Q(
                `UPDATE cash_entries
                   SET deleted = false,
                       amount = $1::numeric,
                       type = $2,
                       category = $3,
                       note = $4,
                       currency = $5,
                       updated_at = $6::timestamptz,
                       need_sync = false
                 WHERE id = $7
                 RETURNING id, server_version, updated_at`,
                [
                  Number(localForDeleted.amount),
                  localForDeleted.type,
                  localForDeleted.category,
                  localForDeleted.note || null,
                  localForDeleted.currency || 'INR',
                  revivedUpdatedAt,
                  r.id,
                ]
              );
              const revivedRow = revived && revived[0];
              if (revivedRow && revivedRow.id) {
                const sv =
                  revivedRow.server_version !== undefined
                    ? Number(revivedRow.server_version)
                    : undefined;
                try {
                  await markEntrySynced(
                    localForDeleted.local_id,
                    String(revivedRow.id),
                    sv,
                    revivedRow.updated_at
                  );
                } catch (e) {
                  try {
                    await queueLocalRemoteMapping(localForDeleted.local_id, String(r.id));
                    console.log(
                      'DB not operational, queued local->remote mapping for',
                      localForDeleted.local_id
                    );
                  } catch (q) {
                    console.warn(
                      'Failed to queue local->remote mapping after revive',
                      localForDeleted.local_id,
                      q
                    );
                  }
                }
                continue;
              }
              throw new Error('Revive returned no rows');
            } catch (err) {
              console.error(
                'Failed to revive remote row for locally-modified deleted remote',
                localForDeleted.local_id,
                err
              );
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
          const pushLocalToRemote = async () => {
            try {
              const pushed = await Q(
                `UPDATE cash_entries SET amount = $1::numeric, type = $2, category = $3, note = $4, currency = $5, updated_at = $6::timestamptz WHERE id = $7 RETURNING id, server_version, updated_at`,
                [
                  Number(local.amount),
                  local.type,
                  local.category,
                  local.note || null,
                  local.currency || 'INR',
                  local.updated_at,
                  r.id,
                ]
              );
              const pushedRow = pushed && pushed[0];
              if (pushedRow && pushedRow.id) {
                try {
                  await markEntrySynced(
                    local.local_id,
                    String(pushedRow.id),
                    pushedRow.server_version !== undefined
                      ? Number(pushedRow.server_version)
                      : undefined,
                    pushedRow.updated_at
                  );
                } catch (e) {}
              }
              merged += 1;
              return true;
            } catch (err) {
              console.error('Failed to push local change to remote for', local.local_id, err);
              return false;
            }
          };

          // If local explicitly needs sync, it's a local change not yet pushed
          if ((local as any).need_sync) {
            // If timestamps match, consider synced
            if (
              new Date(local.updated_at || 0).getTime() === new Date(r.updated_at || 0).getTime()
            ) {
              try {
                await markEntrySynced(
                  local.local_id,
                  String(r.id),
                  typeof r.server_version === 'number' ? Number(r.server_version) : undefined,
                  r.updated_at
                );
              } catch (e) {}
              merged += 1;
              continue;
            }

            // Conflict: both remote and local changed. To avoid data loss, push local as a new remote row
            emitSyncConflict({
              localId: local.local_id,
              remoteId: String(r.id),
              amount: typeof local.amount === 'number' ? Number(local.amount) : undefined,
              category: local.category,
              message: 'Detected conflicting edits. Keeping your latest change.',
            });
            try {
              // Prefer updating the existing remote row (client-wins) instead of creating duplicates.
              const upd = await Q(
                `UPDATE cash_entries SET amount = $1::numeric, type = $2, category = $3, note = $4, currency = $5, updated_at = $6::timestamptz WHERE id = $7 RETURNING id, server_version, updated_at`,
                [
                  Number(local.amount),
                  local.type,
                  local.category,
                  local.note || null,
                  local.currency || 'INR',
                  local.updated_at,
                  r.id,
                ]
              );
              if (upd && upd[0] && upd[0].id) {
                const newId = upd[0].id;
                const sv =
                  upd[0].server_version !== undefined ? Number(upd[0].server_version) : undefined;
                try {
                  await markEntrySynced(local.local_id, String(newId), sv, upd[0].updated_at);
                  merged += 1;
                } catch (e) {}
              }
            } catch (err) {
              console.error(
                'Failed to push local change to existing remote for conflict',
                local.local_id,
                err
              );
            }
            continue;
          }

          const remoteVersion =
            typeof r.server_version === 'number' ? Number(r.server_version) : null;
          const localVersion =
            typeof local.server_version === 'number' ? Number(local.server_version) : null;

          if (remoteVersion !== null && localVersion !== null && remoteVersion > localVersion) {
            // Remote copy is strictly newer; fall through to upsert.
          } else {
            if (remoteVersion !== null && localVersion !== null && localVersion > remoteVersion) {
              await pushLocalToRemote();
              continue;
            }

            // Compare timestamps to prefer latest when versions are equal or missing
            const localUpdated = new Date(local.updated_at || 0).getTime();
            const remoteUpdated = new Date(r.updated_at || 0).getTime();

            if (localUpdated > remoteUpdated) {
              await pushLocalToRemote();
              continue;
            }
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
    // Another caller requested a sync while one is already running.
    // Schedule a single follow-up run when the current finishes to pick up any new changes.
    _pendingSyncRequested = true;
    console.log('syncBothWays: already running, scheduled follow-up run');
    return { pushed: 0, updated: 0, deleted: 0, pulled: 0, merged: 0, total: 0 };
  }
  const state = await NetInfo.fetch();
  if (!state.isConnected) return;
  _syncInProgress = true;
  let result = { pushed: 0, updated: 0, deleted: 0, pulled: 0, merged: 0, total: 0 };
  try {
    try {
      if (vexoService.customEvent) {
        vexoService.customEvent('sync_start', { when: new Date().toISOString() });
      }
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
      if (vexoService.customEvent) {
        vexoService.customEvent('sync_complete', {
          pushed,
          updated,
          deleted,
          pulled,
          merged,
          total,
        });
      }
    } catch (e) {}
    return result;
  } finally {
    _syncInProgress = false;
    // If another sync was requested while we were running, clear the flag and run once more.
    if (_pendingSyncRequested) {
      _pendingSyncRequested = false;
      // schedule shortly after to let any other quick churn settle
      setTimeout(() => {
        syncBothWays().catch((err) => console.error('Scheduled follow-up sync failed', err));
      }, 200);
    }
    try {
      // If the sync finished but recorded no activity, emit a small heartbeat
      if (vexoService.customEvent) {
        vexoService.customEvent('sync_ended', { when: new Date().toISOString() });
      }
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
          mod
            .syncBothWays()
            .catch((err: any) => console.error('Foreground scheduled sync failed', err));
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
    if (BackgroundFetch && typeof BackgroundFetch.configure === 'function') {
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
    } else {
      // Only warn about missing/incompatible background-fetch on real native
      // devices (Android/iOS) that are NOT running inside Expo Go (which lacks
      // the native module). In Expo Go we silently no-op to avoid noisy logs.
      const isNative = Platform.OS === 'android' || Platform.OS === 'ios';
      const isExpoGo = Constants?.appOwnership === 'expo';
      const isTest = typeof process !== 'undefined' && !!process.env.JEST_WORKER_ID;
      if (isNative && !isExpoGo && !isTest) {
        console.warn(
          'react-native-background-fetch missing or has incompatible API; background fetch disabled'
        );
      }
      // otherwise silently no-op in non-native or test environments
    }
  } catch (e) {
    const isExpoGo = Constants?.appOwnership === 'expo';
    if (!_backgroundFetchWarned && !isExpoGo) {
      _backgroundFetchWarned = true;
      console.warn('react-native-background-fetch not available; background fetch disabled', e);
    }
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

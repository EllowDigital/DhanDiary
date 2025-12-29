import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '../../utils/AsyncStorageWrapper';
import { getSession } from '../../db/session';
import { query } from '../../api/neonClient';
import {
  getLocalByRemoteId,
  getLocalByClientId,
  upsertLocalFromRemote,
  markLocalDeletedByRemoteId,
  markEntrySynced,
} from '../../db/entries';

const Q = (sql: string, params: any[] = []) => query(sql, params, { retries: 2, timeoutMs: 15000 });

const isUuid = (s: any) =>
  typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);

const isLocalDbDisabledError = (err: any) =>
  String(err?.message || '').includes('Offline/local DB disabled');

export const pullRemoteLegacy = async () => {
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
    const lastSyncAt = await AsyncStorage.getItem('last_sync_at');
    const timeParam = lastSyncAt || '1970-01-01T00:00:00.000Z';

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
        if (r.deleted) {
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
            const revivedUpdatedAt = new Date().toISOString();
            await Q(
              `UPDATE cash_entries SET deleted = false, need_sync = false, updated_at = $1::timestamptz WHERE id = $2`,
              [revivedUpdatedAt, r.id]
            );
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
            try {
              await markLocalDeletedByRemoteId(String(r.id));
            } catch (e: any) {
              if (isLocalDbDisabledError(e)) {
              } else throw e;
            }
          }
          continue;
        }

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
          const localEntry = local as any;
          if (localEntry.need_sync) {
            const localTime = new Date(localEntry.updated_at || 0).getTime();
            const remoteTime = new Date(r.updated_at || 0).getTime();
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
            // Conflict: preserve local
            continue;
          }
        }

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
      }
    }
    return { pulled, merged };
  } catch (err) {
    try {
      console.error('Failed to pull remote entries', err);
    } catch (e) {}
    return { pulled: 0, merged: 0 };
  }
};

export default pullRemoteLegacy;

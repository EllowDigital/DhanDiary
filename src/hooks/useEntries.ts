import React from 'react';
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData, // Used for v5 placeholderData, or we use a manual function
} from '@tanstack/react-query';
import { LocalEntry } from '../db/entries';
import {
  getTransactionsByUser,
  addTransaction,
  updateTransaction,
  deleteTransaction as sqliteDeleteTransaction,
  upsertTransactionFromRemote,
} from '../db/transactions';
import { subscribeEntries } from '../utils/dbEvents';
import { getSession, saveSession } from '../db/session';
import { ensureCategory, DEFAULT_CATEGORY } from '../constants/categories';
import { toCanonical, isIncome } from '../utils/transactionType';
import { syncBothWays } from '../services/syncManager';

/* ----------------------------------------------------------
   Types & Interfaces
---------------------------------------------------------- */

interface TransactionRow {
  id: string;
  user_id: string;
  type: 'income' | 'expense';
  amount: number;
  category: string;
  note?: string | null;
  date?: string | number | null;
  created_at?: string | number | null;
  updated_at?: string | number | null;
  sync_status?: number;
  deleted_at?: string | number | null;
}

interface MutationContext {
  key: string[];
  previous: LocalEntry[];
}

/* ----------------------------------------------------------
   Helpers
---------------------------------------------------------- */

// Resolve an effective user ID (explicit → session → guest)
const resolveUserId = async (passedId?: string | null): Promise<string> => {
  if (passedId) return passedId;

  const s = await getSession();
  if (s?.id) return s.id;

  // Create guest session
  const guestId = `guest_${Date.now()}`;
  try {
    await saveSession(guestId, 'Guest', '');
  } catch (e) {
    if (__DEV__) console.warn('[resolveUserId] Failed to save guest session', e);
  }
  return guestId;
};

// Normalize any date input
const normalizeDate = (
  raw: string | number | Date | null | undefined,
  fallback: string
): string => {
  try {
    if (raw === null || raw === undefined) return fallback;
    if (raw instanceof Date) {
      const t = raw.getTime();
      return Number.isFinite(t) ? raw.toISOString() : fallback;
    }
    if (typeof raw === 'number') {
      const d = new Date(raw);
      return Number.isFinite(d.getTime()) ? d.toISOString() : fallback;
    }
    // string
    const s = String(raw);
    const d = new Date(s);
    return Number.isFinite(d.getTime()) ? d.toISOString() : fallback;
  } catch (e) {
    return fallback;
  }
};

const normalizeUpdatedAt = (u: string | number | Date | null | undefined): number => {
  try {
    if (u === null || u === undefined) return 0;
    if (typeof u === 'number') return Number.isFinite(u) ? u : 0;
    if (u instanceof Date) return Number.isFinite(u.getTime()) ? u.getTime() : 0;
    const parsed = new Date(String(u));
    return Number.isFinite(parsed.getTime()) ? parsed.getTime() : 0;
  } catch (e) {
    return 0;
  }
};

// Build optimistic entry
const makeOptimisticEntry = (entry: Partial<LocalEntry>, sid: string): LocalEntry => {
  const now = new Date().toISOString();
  const effectiveDate = normalizeDate(entry.date, now);
  return {
    local_id: entry.local_id || `tmp_${Date.now()}`,
    remote_id: entry.remote_id || null,
    user_id: sid,
    type: toCanonical(entry.type || 'out'),
    amount: Number(entry.amount) || 0,
    category: ensureCategory(entry.category || DEFAULT_CATEGORY),
    note: entry.note || null,
    date: effectiveDate,
    currency: entry.currency || 'INR',
    created_at: effectiveDate,
    updated_at: Date.now(), // LocalEntry usually expects number for updated_at based on usage
    is_synced: false, // Optimistic entries are not synced yet
  };
};

/* ----------------------------------------------------------
   Main Hook
---------------------------------------------------------- */
export const useEntries = (userId?: string | null) => {
  const queryClient = useQueryClient();
  const [resolvedId, setResolvedId] = React.useState<string | null>(null);

  // Resolve effective user id (may create guest) and keep stable for the hook
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const sid = await resolveUserId(userId);
        if (mounted) setResolvedId(sid);
      } catch (e) {
        if (mounted) setResolvedId(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [userId]);

  const syncKickRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Consolidated Sync Logic
  const requestSync = React.useCallback(() => {
    try {
      if (syncKickRef.current) clearTimeout(syncKickRef.current);

      syncKickRef.current = setTimeout(() => {
        syncKickRef.current = null;
        (async () => {
          try {
            // Dynamic import for NetInfo to avoid initial bundle bloat if preferred
            const NetInfo = require('@react-native-community/netinfo');
            const net = await NetInfo.fetch();

            if (net.isConnected) {
              // If online, push local changes immediately and then pull remote updates.
              try {
                const pushMod = await import('../sync/pushToNeon');
                const pullMod = await import('../sync/pullFromNeon');

                try {
                  await pushMod.default();
                } catch (e) {
                  if (__DEV__) console.warn('[useEntries] Immediate push failed', e);
                }

                try {
                  await pullMod.default();
                } catch (e) {
                  if (__DEV__) console.warn('[useEntries] Immediate pull failed', e);
                }
              } catch (e) {
                // Fallback to the full sync manager if dynamic import fails
                try {
                  await syncBothWays();
                } catch (ee) {
                  if (__DEV__) console.warn('[useEntries] Fallback sync failed', ee);
                }
              }
            } else {
              // Offline: queue sync for later via sync manager (auto-sync listener will trigger)
              try {
                // This will no-op if offline and run when connection resumes logic is inside syncManager
                void syncBothWays();
              } catch (e) {
                // Ignore offline errors
              }
            }
          } catch (e) {
            if (__DEV__) console.warn('[useEntries] requestSync execution failed', e);
          }
        })();
      }, 400); // Debounce sync requests
    } catch (e) {
      if (__DEV__) console.warn('[useEntries] requestSync trigger failed', e);
    }
  }, []); // syncBothWays is imported, effectively stable

  // Clean up timeout on unmount
  React.useEffect(() => {
    return () => {
      if (syncKickRef.current) clearTimeout(syncKickRef.current);
    };
  }, []);

  /* ---------------------- Fetch entries ---------------------- */
  const {
    data: entries,
    isLoading,
    refetch,
  } = useQuery<LocalEntry[], Error>({
    queryKey: ['entries', resolvedId],
    queryFn: async () => {
      if (!resolvedId) return [] as LocalEntry[];

      // Always read from local SQLite first for responsive UI.
      try {
        const local = await getTransactionsByUser(resolvedId);

        const mapped: LocalEntry[] = (local || []).map((r: any) => ({
          local_id: r.id,
          remote_id: null,
          user_id: r.user_id,
          type: r.type,
          amount: r.amount,
          category: r.category,
          note: r.note,
          date: normalizeDate(
            r.date,
            r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString()
          ),
          updated_at: normalizeUpdatedAt(r.updated_at),
          currency: 'INR',
          is_synced: r.sync_status === 1,
        }));

        // DEV SAFETY: warn if tombstoned rows appear in the source (they should be filtered)
        if (__DEV__) {
          try {
            const leaked = (local || []).some((rr: any) => rr && rr.sync_status === 2);
            if (leaked) console.warn('[useEntries] Tombstone row leaked into local query result');
          } catch (e) {}
        }

        // SIDE EFFECT: Background Remote Pull
        // In background: if Neon is configured, try to pull remote rows and upsert into local DB.
        // NOTE: This runs asynchronously and does not block the return of local data.
        (async () => {
          try {
            const { getNeonHealth, query } = require('../api/neonClient');
            const health = getNeonHealth();

            if (health.isConfigured) {
              const rows = await query(
                `SELECT id, user_id, type, amount, category, note, created_at, updated_at, date 
                 FROM transactions 
                 WHERE user_id = $1 AND (deleted_at IS NULL) 
                 ORDER BY updated_at DESC LIMIT 1000`,
                [resolvedId]
              );

              if (rows && rows.length > 0) {
                for (const r of rows) {
                  const upd: Partial<TransactionRow> = {
                    id: r.id,
                    user_id: r.user_id,
                    type: r.type,
                    amount: Number(r.amount),
                    category: r.category,
                    note: r.note,
                    date: r.date ?? null,
                    updated_at: r.updated_at ?? Date.now(),
                    sync_status: 1, // Mark as synced since it came from remote
                  };
                  try {
                    await upsertTransactionFromRemote(upd as any);
                  } catch (e) {
                    if (__DEV__)
                      console.warn(
                        '[useEntries] upsertTransactionFromRemote failed for row',
                        r.id,
                        e
                      );
                  }
                }
              }
            }
          } catch (e) {
            // Silently fail remote fetch in background to avoid disrupting UI
            if (__DEV__) console.warn('[useEntries] Background remote fetch failed', e);
          }
        })();

        return mapped;
      } catch (e) {
        if (__DEV__) console.error('[useEntries] queryFn fatal error', e);
        return [] as LocalEntry[];
      }
    },
    enabled: !!resolvedId,
    staleTime: 30_000,
    refetchOnWindowFocus: false, // Prevent infinite loops if window focus triggers refetch -> write -> event -> refetch
    // Modern React Query replacement for keepPreviousData
    placeholderData: (previousData: LocalEntry[] | undefined) => previousData,
  });

  // Keep query data fresh when DB is mutated by background syncs or other processes.
  React.useEffect(() => {
    const unsub = subscribeEntries(() => {
      try {
        refetch();
      } catch (e) {
        if (__DEV__) console.warn('[useEntries] refetch failed inside subscription', e);
      }
    });
    return () => unsub();
  }, [refetch]);

  /* ----------------------------------------------------------
      ADD ENTRY
   ---------------------------------------------------------- */
  const addEntryMutation = useMutation({
    mutationFn: async (
      entry: Omit<
        LocalEntry,
        'is_synced' | 'user_id' | 'created_at' | 'updated_at' | 'local_id' | 'remote_id'
      > & { local_id?: string }
    ) => {
      const sid = await resolveUserId(userId);
      const now = new Date().toISOString();

      const created = normalizeDate((entry as any).date || (entry as any).created_at, now);
      // Simple client-side id for offline mode
      const localId = entry.local_id || `local_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

      const toInsert = {
        id: localId,
        user_id: sid,
        type: toCanonical((entry as any).type),
        amount: Number((entry as any).amount) || 0,
        category: ensureCategory(entry.category),
        note: entry.note || null,
        date: created,
        sync_status: 0, // Pending sync
        updated_at: Date.now(),
        created_at: Date.now(),
      };

      await addTransaction(toInsert as any);
      return toInsert;
    },

    onMutate: async (entry) => {
      const sid = await resolveUserId(userId);
      const key = ['entries', sid];

      await queryClient.cancelQueries({ queryKey: key });

      const previous = queryClient.getQueryData<LocalEntry[]>(key) || [];
      const optimistic = makeOptimisticEntry(entry, sid);

      queryClient.setQueryData(key, [optimistic, ...previous]);

      return { key, previous };
    },

    onError: (_err, _vars, ctx) => {
      const c = ctx as MutationContext | undefined;
      if (c?.key) {
        queryClient.setQueryData(c.key, c.previous);
      }
    },

    onSettled: async () => {
      const sid = await resolveUserId(userId);
      await queryClient.invalidateQueries({ queryKey: ['entries', sid] });
      try {
        // Force immediate refetch so UI reflects DB write right away
        await refetch();
      } catch (e) {}
      requestSync();
    },
  });

  /* ----------------------------------------------------------
      UPDATE ENTRY
   ---------------------------------------------------------- */
  const updateEntryMutation = useMutation({
    mutationFn: async ({
      local_id,
      updates,
    }: {
      local_id: string;
      updates: Partial<LocalEntry & { date?: string | Date | null }>;
    }) => {
      if (!local_id) throw new Error('local_id required');

      const dateVal =
        updates.date !== undefined ? normalizeDate(updates.date, null as any) : undefined;

      const sid = await resolveUserId(userId);
      // Build update payload for sqlite
      const payload: Partial<TransactionRow> = {
        id: local_id,
        user_id: sid,
        amount: updates.amount !== undefined ? Number(updates.amount) : undefined,
        type: updates.type !== undefined ? toCanonical(updates.type as any) : undefined,
        category: updates.category !== undefined ? ensureCategory(updates.category) : undefined,
        note: updates.note !== undefined ? updates.note : undefined,
        date: dateVal,
        updated_at: Date.now(), // Always update timestamp
      };

      // Remove undefined keys to prevent accidental nulling
      Object.keys(payload).forEach(
        (key) => (payload as any)[key] === undefined && delete (payload as any)[key]
      );

      await updateTransaction(payload as any);
    },

    onMutate: async ({ local_id, updates }) => {
      const sid = await resolveUserId(userId);
      const key = ['entries', sid];

      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<LocalEntry[]>(key) || [];

      const now = Date.now();

      const next = previous.map((item) =>
        item.local_id === local_id
          ? {
              ...item,
              ...updates,
              category:
                updates.category !== undefined ? ensureCategory(updates.category) : item.category,
              updated_at: now,
              date: updates.date !== undefined ? normalizeDate(updates.date, item.date) : item.date,
            }
          : item
      );

      queryClient.setQueryData(key, next);
      return { key, previous };
    },

    onError: (_err, _vars, ctx) => {
      const c = ctx as MutationContext | undefined;
      if (c?.key) {
        queryClient.setQueryData(c.key, c.previous);
      }
    },

    onSettled: async () => {
      const sid = await resolveUserId(userId);
      await queryClient.invalidateQueries({ queryKey: ['entries', sid] });
      try {
        await refetch();
      } catch (e) {}
      requestSync();
    },
  });

  /* ----------------------------------------------------------
      DELETE ENTRY
   ---------------------------------------------------------- */
  const deleteEntryMutation = useMutation({
    mutationFn: async (local_id: string) => {
      if (!local_id) throw new Error('local_id required');
      const sid = await resolveUserId(userId);
      await sqliteDeleteTransaction(local_id, sid);
    },

    onMutate: async (local_id: string) => {
      const sid = await resolveUserId(userId);
      const key = ['entries', sid];

      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<LocalEntry[]>(key) || [];

      const next = previous.filter((it) => it.local_id !== local_id);
      queryClient.setQueryData(key, next);

      return { key, previous };
    },

    onError: (_err, _vars, ctx) => {
      const c = ctx as MutationContext | undefined;
      if (c?.key) {
        queryClient.setQueryData(c.key, c.previous);
      }
    },

    onSettled: async () => {
      const sid = await resolveUserId(userId);
      await queryClient.invalidateQueries({ queryKey: ['entries', sid] });
      try {
        await refetch();
      } catch (e) {}
      requestSync();
    },
  });

  return {
    entries: entries as LocalEntry[] | undefined,
    isLoading,
    addEntry: addEntryMutation.mutateAsync,
    updateEntry: updateEntryMutation.mutateAsync,
    deleteEntry: deleteEntryMutation.mutateAsync,
    refetch,
  };
};

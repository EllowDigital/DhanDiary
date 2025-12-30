import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import { toCanonical } from '../utils/transactionType';
import { syncBothWays } from '../services/syncManager';

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
  } catch {}
  return guestId;
};

// Normalize any date input
const normalizeDate = (raw: any, fallback: string) => {
  if (!raw) return fallback;
  if (raw instanceof Date) return raw.toISOString();
  return String(raw);
};

// Build optimistic entry
const makeOptimisticEntry = (entry: any, sid: string) => {
  const now = new Date().toISOString();
  const effectiveDate = normalizeDate(entry.date, now);
  return {
    local_id: entry.local_id || `tmp_${Date.now()}`,
    remote_id: entry.remote_id || null,
    user_id: sid,
    type: toCanonical(entry.type || 'out'),
    amount: entry.amount || 0,
    category: ensureCategory(entry.category || DEFAULT_CATEGORY),
    note: entry.note || null,
    date: effectiveDate,
    currency: entry.currency || 'INR',
    created_at: effectiveDate,
    updated_at: now,
  };
};

/* ----------------------------------------------------------
   Main Hook
---------------------------------------------------------- */
export const useEntries = (userId?: string | null) => {
  const queryClient = useQueryClient();

  const syncKickRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const requestSync = React.useCallback(() => {
    try {
      if (syncKickRef.current) clearTimeout(syncKickRef.current);
      syncKickRef.current = setTimeout(() => {
        syncKickRef.current = null;
        syncBothWays().catch((err) => {
          console.warn('Background sync after mutation failed', err);
        });
      }, 400);
    } catch (e) {}
  }, [syncBothWays]);

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
    queryKey: ['entries', userId],
    queryFn: async () => {
      if (!userId) return [] as LocalEntry[];

      // Always read from local SQLite first for responsive UI.
      try {
        const local = await getTransactionsByUser(userId);
        // Map sqlite rows to LocalEntry shape
        const normalizeRowDate = (d: any) => {
          if (d === null || d === undefined) return null;
          if (typeof d === 'number') return new Date(Number(d)).toISOString();
          const parsed = new Date(d);
          if (!Number.isFinite(parsed.getTime())) return null;
          return parsed.toISOString();
        };
        const normalizeUpdatedAt = (u: any) => {
          if (u === null || u === undefined) return 0;
          if (typeof u === 'number') return Number(u);
          const parsed = new Date(u);
          return Number.isFinite(parsed.getTime()) ? parsed.getTime() : 0;
        };

        const mapped = (local || []).map((r: any) => ({
          local_id: r.id,
          remote_id: null,
          user_id: r.user_id,
          type: r.type,
          amount: r.amount,
          category: r.category,
          note: r.note,
          date:
            normalizeRowDate(r.date) ||
            (r.created_at ? new Date(r.created_at).toISOString() : null),
          updated_at: normalizeUpdatedAt(r.updated_at),
          currency: 'INR',
        }));

        // In background: if Neon is configured, try to pull remote rows and upsert into local DB
        (async () => {
          try {
            const { getNeonHealth, query } = require('../api/neonClient');
            const health = getNeonHealth();
            if (health.isConfigured) {
              const rows = await query(
                `SELECT id, user_id, type, amount, category, note, created_at, updated_at, date FROM transactions WHERE user_id = $1 AND (deleted_at IS NULL) ORDER BY updated_at DESC LIMIT 1000`,
                [userId]
              );
              if (rows && rows.length) {
                for (const r of rows) {
                  // Convert server timestamps to epoch-ms where needed
                  const upd = {
                    id: r.id,
                    user_id: r.user_id,
                    type: r.type,
                    amount: Number(r.amount),
                    category: r.category,
                    note: r.note,
                    date: r.date ?? null,
                    updated_at: r.updated_at ?? Date.now(),
                    sync_status: 1,
                  };
                  try {
                    await upsertTransactionFromRemote(upd as any);
                  } catch (e) {}
                }
              }
            }
          } catch (e) {}
        })();

        return mapped as LocalEntry[];
      } catch (e) {
        return [] as LocalEntry[];
      }
    },
    enabled: !!userId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    // keepPreviousData isn't recognized by some installed @tanstack/react-query types
    // in older versions; cast to any to avoid type incompatibility while preserving runtime behavior.
    keepPreviousData: true,
  } as any);

  // Keep query data fresh when DB is mutated by background syncs or other processes.
  React.useEffect(() => {
    const unsub = subscribeEntries(() => {
      try {
        refetch();
      } catch (e) {}
    });
    return () => unsub();
  }, [refetch]);

  /* ----------------------------------------------------------
     ADD ENTRY
  ---------------------------------------------------------- */
  const addEntryMutation = useMutation({
    mutationFn: async (
      entry: Omit<LocalEntry, 'is_synced' | 'user_id' | 'created_at' | 'updated_at'>
    ) => {
      const sid = await resolveUserId(userId);
      const now = new Date().toISOString();

      const created = normalizeDate((entry as any).date || (entry as any).created_at, now);
      // Simple client-side id for offline mode
      const localId =
        (entry as any).local_id || `local_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

      const toInsert = {
        id: localId,
        user_id: sid,
        type: toCanonical((entry as any).type),
        amount: Number((entry as any).amount) || 0,
        category: ensureCategory(entry.category),
        note: entry.note || null,
        date: created,
        sync_status: 0,
      };

      await addTransaction(toInsert as any);
      return toInsert;
    },

    onMutate: async (entry) => {
      const sid = await resolveUserId(userId);
      const key = ['entries', sid];

      await queryClient.cancelQueries({ queryKey: key });

      const previous = queryClient.getQueryData<any[]>(key) || [];
      const optimistic = makeOptimisticEntry(entry, sid);

      queryClient.setQueryData(key, [optimistic, ...previous]);

      return { key, previous };
    },

    onError: (_err, _vars, ctx) => {
      const c = ctx as any;
      if (c?.key) {
        queryClient.setQueryData(c.key, c.previous);
      }
    },

    onSettled: async () => {
      const sid = await resolveUserId(userId);
      queryClient.invalidateQueries({ queryKey: ['entries', sid] });
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
      const payload: any = {
        id: local_id,
        user_id: sid,
        amount: updates.amount !== undefined ? Number(updates.amount) : undefined,
        type: updates.type !== undefined ? toCanonical(updates.type as any) : undefined,
        category: updates.category !== undefined ? ensureCategory(updates.category) : undefined,
        note: updates.note !== undefined ? updates.note : undefined,
        date: dateVal !== undefined ? dateVal : undefined,
      };
      await updateTransaction(payload as any);
    },

    onMutate: async ({ local_id, updates }) => {
      const sid = await resolveUserId(userId);
      const key = ['entries', sid];

      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<any[]>(key) || [];

      const now = new Date().toISOString();

      const next = previous.map((item) =>
        item.local_id === local_id
          ? {
              ...item,
              ...updates,
              category:
                updates.category !== undefined ? ensureCategory(updates.category) : item.category,
              updated_at: now,
            }
          : item
      );

      queryClient.setQueryData(key, next);
      return { key, previous };
    },

    onError: (_err, _vars, ctx) => {
      const c = ctx as any;
      if (c?.key) {
        queryClient.setQueryData(c.key, c.previous);
      }
    },

    onSettled: async () => {
      const sid = await resolveUserId(userId);
      queryClient.invalidateQueries({ queryKey: ['entries', sid] });
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
      const previous = queryClient.getQueryData<any[]>(key) || [];

      const next = previous.filter((it) => it.local_id !== local_id);
      queryClient.setQueryData(key, next);

      return { key, previous };
    },

    onError: (_err, _vars, ctx) => {
      const c = ctx as any;
      if (c?.key) {
        queryClient.setQueryData(c.key, c.previous);
      }
    },

    onSettled: async () => {
      const sid = await resolveUserId(userId);
      queryClient.invalidateQueries({ queryKey: ['entries', sid] });
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

// (No-op) helper exports removed — subscription is wired directly inside `useEntries`.

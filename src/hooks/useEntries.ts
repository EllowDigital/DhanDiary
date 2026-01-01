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
} from '../db/transactions';
import { subscribeEntries } from '../utils/dbEvents';
import { subscribeSession } from '../utils/sessionEvents';
import { getSession, saveSession } from '../db/session';
import { resetRoot } from '../utils/rootNavigation';
import { ensureCategory, DEFAULT_CATEGORY } from '../constants/categories';
import { toCanonical, isIncome } from '../utils/transactionType';
import { scheduleSync } from '../services/syncManager';
import { uuidv4 } from '../utils/uuid';

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
  need_sync?: number;
  deleted_at?: string | number | null;
}

interface MutationContext {
  key: string[];
  previous: LocalEntry[];
}

/* ----------------------------------------------------------
   Helpers
---------------------------------------------------------- */

// Resolve an effective user ID (explicit → session → existing-local → guest)
const resolveUserId = async (passedId?: string | null): Promise<string> => {
  if (passedId) return passedId;

  // 1) Read persisted fallback session (if any)
  let s: any = null;
  try {
    s = await getSession();
  } catch (e) {
    if (__DEV__) console.warn('[resolveUserId] getSession failed', e);
  }

  // 2) Read any existing user_id already present in local transactions
  let existingUser: string | null = null;
  try {
    const { getAnyUserWithTransactions } = require('../db/transactions');
    try {
      existingUser = await getAnyUserWithTransactions();
    } catch (innerErr: any) {
      // If the DB schema is not yet upgraded (missing column errors), try to run initDB
      // and retry once. This helps races where other modules query the DB before
      // migrations complete.
      const msg = innerErr && innerErr.message ? String(innerErr.message) : String(innerErr);
      if (msg.includes('no such column') || msg.includes('no such table')) {
        try {
          const { initDB } = await import('../db/sqlite');
          if (typeof initDB === 'function') await initDB();
          existingUser = await getAnyUserWithTransactions();
        } catch (e) {
          if (__DEV__) console.warn('[resolveUserId] retry initDB failed', e);
        }
      } else {
        throw innerErr;
      }
    }
  } catch (e) {
    if (__DEV__) console.warn('[resolveUserId] getAnyUserWithTransactions failed', e);
  }

  // If the persisted session contains an original clerk_id that looks like
  // a guest token (guest_...) prefer returning that so it matches rows written
  // earlier (saveSession generates an internal UUID for non-UUID ids).
  if (s?.clerk_id && typeof s.clerk_id === 'string' && s.clerk_id.startsWith('guest_')) {
    return s.clerk_id;
  }

  // If we have local transactions for a user, prefer that id so offline data
  // remains visible on cold start even if the stored session id is a generated UUID.
  if (existingUser) return existingUser;

  // If we have a persisted session id (likely a real user), use it.
  if (s?.id) return s.id;

  // We do not create guest sessions in this app. If no persisted session or
  // local user exists, return null so UI can show the Auth flow.
  try {
    const verbose = Boolean(
      (globalThis as any).__NEON_VERBOSE__ || (globalThis as any).__SYNC_VERBOSE__
    );
    if (__DEV__ && verbose)
      console.log(
        '[resolveUserId] No persisted session or local user — returning null (no guest mode)'
      );
  } catch (e) {}
  return null as any;
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
    sync_status: 0,
    need_sync: 1,
    deleted_at: null,
    is_synced: false, // Optimistic entries are not synced yet
  };
};

/* ----------------------------------------------------------
   Main Hook
---------------------------------------------------------- */
export const useEntries = (userId?: string | null) => {
  const queryClient = useQueryClient();
  const [resolvedId, setResolvedId] = React.useState<string | null>(null);
  const warnedMissingTableRef = React.useRef(false);
  const refetchDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resolve effective user id (may create guest) and keep stable for the hook
  React.useEffect(() => {
    let mounted = true;
    const runResolve = async () => {
      try {
        const sid = await resolveUserId(userId);
        if (mounted) {
          setResolvedId(sid);
          if (sid == null) {
            // No session — ensure user lands on Auth/Login screen
            try {
              resetRoot({
                index: 0,
                routes: [{ name: 'Auth', state: { routes: [{ name: 'Login' }] } }],
              });
            } catch (e) {}
          }
        }
      } catch (e) {
        if (mounted) setResolvedId(null);
      }
    };
    runResolve();

    // Also re-resolve when session changes so UI picks up migrated remote user_id
    const unsubSession = subscribeSession(() => {
      // Re-run resolution; do not await (fire-and-forget)
      void runResolve();
    });
    return () => {
      mounted = false;
      try {
        unsubSession();
      } catch (e) {}
    };
  }, [userId]);

  // Debug: log when the resolved user id changes so we can trace handover
  const _prevResolvedId = React.useRef<string | null>(null);
  React.useEffect(() => {
    const prev = _prevResolvedId.current;
    if (prev !== resolvedId) {
      try {
        const verbose = Boolean(
          (globalThis as any).__NEON_VERBOSE__ || (globalThis as any).__SYNC_VERBOSE__
        );
        if (__DEV__ && verbose)
          console.log(`[useEntries] User ID changed: ${prev} -> ${resolvedId}`);
      } catch (e) {}
      _prevResolvedId.current = resolvedId;
    }
  }, [resolvedId]);

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
              // Use the central sync manager so locks/throttling apply consistently
              // and we avoid overlapping push/pull work across the app.
              scheduleSync({ source: 'auto' } as any);
            }
          } catch (e) {
            if (__DEV__) console.warn('[useEntries] requestSync execution failed', e);
          }
        })();
      }, 400); // Debounce sync requests
    } catch (e) {
      if (__DEV__) console.warn('[useEntries] requestSync trigger failed', e);
    }
  }, []); // scheduleSync is imported, effectively stable

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
          sync_status: Number(r.sync_status ?? 0),
          need_sync: Number(r.need_sync ?? 0),
          deleted_at: r.deleted_at ?? null,
          is_synced: Number(r.sync_status ?? 0) === 1 && Number(r.need_sync ?? 0) === 0,
        }));

        // DEV SAFETY: warn if tombstoned rows appear in the source (they should be filtered)
        if (__DEV__) {
          try {
            const leaked = (local || []).some((rr: any) => rr && rr.sync_status === 2);
            if (leaked) console.warn('[useEntries] Tombstone row leaked into local query result');
          } catch (e) {}
        }

        // Do not pull from Neon here. Central sync manager handles background sync
        // with throttling/cancellation/yielding consistently.

        return mapped;
      } catch (e: any) {
        const msg = String(e?.message || e);

        // Expected during logout/reset: local DB tables can be temporarily dropped.
        if (msg.includes('no such table: transactions')) {
          if (__DEV__ && !warnedMissingTableRef.current) {
            warnedMissingTableRef.current = true;
            console.warn(
              '[useEntries] transactions table missing (logout/reset). Re-initializing DB'
            );
          }
          try {
            const { initDB } = await import('../db/sqlite');
            if (typeof initDB === 'function') await initDB();
          } catch (initErr) {
            // ignore
          }
          return [] as LocalEntry[];
        }

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
        // During logout/reset, resolvedId may be null; avoid refetching.
        if (!resolvedId) return;

        // Coalesce rapid DB change bursts (e.g., pullFromNeon upserting many rows)
        // into a single refetch to keep the UI responsive (drawer button, gestures).
        if (refetchDebounceRef.current) clearTimeout(refetchDebounceRef.current);
        refetchDebounceRef.current = setTimeout(() => {
          refetchDebounceRef.current = null;
          try {
            refetch();
          } catch (e) {}
        }, 250);
      } catch (e) {
        if (__DEV__) console.warn('[useEntries] refetch failed inside subscription', e);
      }
    });
    return () => {
      if (refetchDebounceRef.current) {
        clearTimeout(refetchDebounceRef.current);
        refetchDebounceRef.current = null;
      }
      if (unsub) unsub();
    };
  }, [refetch, resolvedId]);

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
      // Use UUIDs even offline so rows are always syncable to Neon.
      const localId = uuidv4();

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
        created_at: created, // store ISO string for created_at
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
              sync_status: 0,
              need_sync: 1,
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

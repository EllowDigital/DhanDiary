import React from 'react';
import type { FirestoreError } from 'firebase/firestore';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ensureCategory, DEFAULT_CATEGORY } from '../constants/categories';
import {
  createEntry,
  fetchEntries,
  patchEntry,
  removeEntry,
  subscribeEntries,
} from '../services/firestoreEntries';
import { getFirebaseAuth } from '../firebase';
import { EntryUpdate, LocalEntry } from '../types/entries';

/* ----------------------------------------------------------
   Helpers
---------------------------------------------------------- */

// Build optimistic entry
const makeOptimisticEntry = (entry: any, userId: string) => {
  const now = new Date().toISOString();
  const effectiveDate = entry?.date ? String(entry.date) : now;
  return {
    local_id: entry.local_id || `tmp_${Date.now()}`,
    user_id: userId,
    type: entry.type || 'out',
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
  const queryKey = React.useMemo(() => ['entries', userId ?? 'none'], [userId]);
  const [listenerError, setListenerError] = React.useState<FirestoreError | null>(null);
  const lastRefreshRef = React.useRef<number>(0);
  const refreshAttemptsRef = React.useRef<number>(0);

  /* ---------------------- Fetch entries ---------------------- */
  const {
    data: entries,
    isLoading,
    error,
    refetch,
  } = useQuery<LocalEntry[], Error>({
    queryKey,
    queryFn: async () => {
      if (!userId) return [] as LocalEntry[];
      try {
        return await fetchEntries(userId);
      } catch (err: any) {
        const msg = String(err?.message || err || '');
        // If the error is a missing index, surface the console link and fail fast.
        if (msg.includes('requires an index') || msg.includes('create it here')) {
          const match = msg.match(/https:\/\/console\.firebase\.google\.com[^)\s]+/);
          const url = match ? match[0] : undefined;
          console.warn(
            'Firestore index required for entries query.',
            url ? `Create it here: ${url}` : msg
          );
          const friendly = new Error(
            'Firestore query requires a composite index. See console for link.'
          );
          (friendly as any).code = 'missing-index';
          (friendly as any).indexUrl = url;
          throw friendly;
        }

        // Permission/auth issues: attempt a single throttled token refresh to recover from stale tokens.
        const isAuthIssue =
          err?.code === 'permission-denied' ||
          err?.code === 'unauthenticated' ||
          msg.toLowerCase().includes('permission') ||
          msg.toLowerCase().includes('unauthenticated');

        if (isAuthIssue) {
          const now = Date.now();
          // Only attempt refresh at most twice and not more frequently than once per 60s
          if (refreshAttemptsRef.current < 2 && now - (lastRefreshRef.current || 0) > 60_000) {
            refreshAttemptsRef.current += 1;
            lastRefreshRef.current = now;
            try {
              const auth = getFirebaseAuth();
              if (auth.currentUser) {
                await auth.currentUser.getIdToken(true);
                return await fetchEntries(userId);
              }
            } catch (refreshErr: any) {
              console.warn('Failed to refresh id token after fetchEntries error', refreshErr);
              // If auth quota exceeded, avoid further aggressive retries
              if (
                String(refreshErr?.code || refreshErr?.message || '')
                  .toLowerCase()
                  .includes('quota')
              ) {
                refreshAttemptsRef.current = 99;
              }
            }
          }
        }

        throw err;
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
    if (!userId) return;
    let unsub: (() => void) = () => {};
    const startListener = () => {
      try {
        unsub = subscribeEntries(
          userId,
          (payload) => {
            setListenerError(null);
            queryClient.setQueryData(queryKey, payload);
          },
          async (error) => {
            setListenerError(error);
            const msg = String((error as any)?.message || error || '');
            // If error indicates missing index, surface it and do not attempt token refresh
            if (msg.includes('requires an index') || msg.includes('create it here')) {
              const match = msg.match(/https:\/\/console\.firebase\.google\.com[^)\s]+/);
              const url = match ? match[0] : undefined;
              console.warn(
                'Entries listener error: missing Firestore index.',
                url ? `Create it here: ${url}` : msg
              );
              // mark as unrecoverable to avoid spinner/retry storms
              refreshAttemptsRef.current = 99;
              queryClient.invalidateQueries({ queryKey });
              return;
            }

            console.warn('Entries listener error, attempting token refresh', error);

            try {
              const now = Date.now();
              if (refreshAttemptsRef.current < 2 && now - (lastRefreshRef.current || 0) > 60_000) {
                refreshAttemptsRef.current += 1;
                lastRefreshRef.current = now;
                const auth = getFirebaseAuth();
                if (auth.currentUser) {
                  await auth.currentUser.getIdToken(true);
                  // restart listener after a short delay to avoid tight error loop
                  try {
                    unsub();
                  } catch {}
                  setTimeout(() => startListener(), 500);
                  return;
                }
              }
            } catch (refreshErr: any) {
              console.warn('Failed to refresh id token after listener error', refreshErr);
              if (
                String(refreshErr?.code || refreshErr?.message || '')
                  .toLowerCase()
                  .includes('quota')
              ) {
                // stop further refresh attempts
                refreshAttemptsRef.current = 99;
              }
            }

            queryClient.invalidateQueries({ queryKey });
          }
        );
      } catch (e) {
        console.warn('Failed to start entries listener', e);
        setListenerError(e as any);
      }
    };

    startListener();
    return () => {
      try {
        unsub();
      } catch {}
    };
  }, [userId, queryClient, queryKey]);

  // Reset retry counters when user changes (logout/login) so fresh sessions can attempt recovery.
  React.useEffect(() => {
    refreshAttemptsRef.current = 0;
    lastRefreshRef.current = 0;
  }, [userId]);

  // Combine react-query loading with listener/error state to avoid perpetual global spinners
  // when there is a permanent backend issue (like missing index) or listener error.
  const effectiveIsLoading = React.useMemo(() => {
    // If react-query is loading but query error indicates missing-index, stop loading.
    const queryError = error as any;
    const isMissingIndex = queryError && queryError.code === 'missing-index';
    if (isMissingIndex) return false;
    // If listener has a fatal error (we flagged via refreshAttemptsRef), stop loading.
    if (listenerError) {
      const lm = String((listenerError as any)?.message || '');
      if (lm.includes('requires an index') || lm.includes('create it here')) return false;
    }
    return !!isLoading;
  }, [isLoading, error, listenerError]);

  /* ----------------------------------------------------------
     ADD ENTRY
  ---------------------------------------------------------- */
  const addEntryMutation = useMutation({
    mutationFn: async (entry: Omit<LocalEntry, 'user_id' | 'created_at' | 'updated_at'>) => {
      if (!userId) throw new Error('User must be logged in to add entries');
      return await createEntry(userId, entry as any);
    },

    onMutate: async (entry) => {
      if (!userId) return;
      await queryClient.cancelQueries({ queryKey });

      const previous = queryClient.getQueryData<any[]>(queryKey) || [];
      const optimistic = makeOptimisticEntry(entry, userId);
      queryClient.setQueryData(queryKey, [optimistic, ...previous]);
      return { previous };
    },

    onError: (_err, _vars, ctx) => {
      const c = ctx as any;
      if (c?.previous) {
        queryClient.setQueryData(queryKey, c.previous);
      }
    },

    onSettled: async () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  /* ----------------------------------------------------------
     UPDATE ENTRY
  ---------------------------------------------------------- */
  const updateEntryMutation = useMutation({
    mutationFn: async ({ local_id, updates }: { local_id: string; updates: EntryUpdate }) => {
      if (!userId) throw new Error('User must be logged in to update entries');
      if (!local_id) throw new Error('local_id required');
      await patchEntry(userId, local_id, updates);
    },

    onMutate: async ({ local_id, updates }) => {
      if (!userId) return;
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<any[]>(queryKey) || [];

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

      queryClient.setQueryData(queryKey, next);
      return { previous };
    },

    onError: (_err, _vars, ctx) => {
      const c = ctx as any;
      if (c?.previous) {
        queryClient.setQueryData(queryKey, c.previous);
      }
    },

    onSettled: async () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  /* ----------------------------------------------------------
     DELETE ENTRY
  ---------------------------------------------------------- */
  const deleteEntryMutation = useMutation({
    mutationFn: async (local_id: string) => {
      if (!userId) throw new Error('User must be logged in to delete entries');
      if (!local_id) throw new Error('local_id required');
      await removeEntry(userId, local_id);
    },

    onMutate: async (local_id: string) => {
      if (!userId) return;
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<any[]>(queryKey) || [];

      const next = previous.filter((it) => it.local_id !== local_id);
      queryClient.setQueryData(queryKey, next);

      return { previous };
    },

    onError: (_err, _vars, ctx) => {
      const c = ctx as any;
      if (c?.previous) {
        queryClient.setQueryData(queryKey, c.previous);
      }
    },

    onSettled: async () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    entries: entries as LocalEntry[] | undefined,
    isLoading: effectiveIsLoading,
    queryError: error as Error | null,
    addEntry: addEntryMutation.mutateAsync,
    updateEntry: updateEntryMutation.mutateAsync,
    deleteEntry: deleteEntryMutation.mutateAsync,
    refetch,
    listenerError,
  };
};

// (No-op) helper exports removed — subscription is wired directly inside `useEntries`.

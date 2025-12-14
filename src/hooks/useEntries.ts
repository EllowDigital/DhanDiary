import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ensureCategory, DEFAULT_CATEGORY } from '../constants/categories';
import {
  createEntry,
  fetchEntries,
  patchEntry,
  removeEntry,
  subscribeEntries,
} from '../services/firestoreEntries';
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

  /* ---------------------- Fetch entries ---------------------- */
  const {
    data: entries,
    isLoading,
    refetch,
  } = useQuery<LocalEntry[], Error>({
    queryKey,
    queryFn: async () => {
      if (!userId) return [] as LocalEntry[];
      return await fetchEntries(userId);
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
    const unsubscribe = subscribeEntries(userId, (payload) => {
      queryClient.setQueryData(queryKey, payload);
    });
    return () => unsubscribe();
  }, [userId, queryClient, queryKey]);

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
    isLoading,
    addEntry: addEntryMutation.mutateAsync,
    updateEntry: updateEntryMutation.mutateAsync,
    deleteEntry: deleteEntryMutation.mutateAsync,
    refetch,
  };
};

// (No-op) helper exports removed — subscription is wired directly inside `useEntries`.

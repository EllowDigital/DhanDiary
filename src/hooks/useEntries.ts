import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getEntries,
  addLocalEntry,
  LocalEntry,
  updateLocalEntry,
  markEntryDeleted,
} from '../db/entries';
import { getSession, saveSession } from '../db/session';

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
  return {
    local_id: entry.local_id || `tmp_${Date.now()}`,
    remote_id: entry.remote_id || null,
    user_id: sid,
    type: entry.type || 'out',
    amount: entry.amount || 0,
    category: entry.category || 'General',
    note: entry.note || null,
    date: normalizeDate(entry.date, now),
    currency: entry.currency || 'INR',
    created_at: now,
    updated_at: now,
  };
};

/* ----------------------------------------------------------
   Main Hook
---------------------------------------------------------- */
export const useEntries = (userId?: string | null) => {
  const queryClient = useQueryClient();

  /* ---------------------- Fetch entries ---------------------- */
  const {
    data: entries,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['entries', userId],
    queryFn: async () => {
      if (!userId) return [];
      return await getEntries(userId);
    },
    enabled: !!userId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    keepPreviousData: true,
  });

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

      const newEntry = {
        ...entry,
        user_id: sid,
        date: created,
        created_at: now,
        updated_at: now,
      };

      return await addLocalEntry(newEntry);
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
      if (ctx?.key) {
        queryClient.setQueryData(ctx.key, ctx.previous);
      }
    },

    onSettled: async () => {
      const sid = await resolveUserId(userId);
      queryClient.invalidateQueries({ queryKey: ['entries', sid] });
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

      await updateLocalEntry(local_id, {
        ...updates,
        date: dateVal,
      } as any);
    },

    onMutate: async ({ local_id, updates }) => {
      const sid = await resolveUserId(userId);
      const key = ['entries', sid];

      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<any[]>(key) || [];

      const now = new Date().toISOString();

      const next = previous.map((item) =>
        item.local_id === local_id ? { ...item, ...updates, updated_at: now } : item
      );

      queryClient.setQueryData(key, next);
      return { key, previous };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.key) {
        queryClient.setQueryData(ctx.key, ctx.previous);
      }
    },

    onSettled: async () => {
      const sid = await resolveUserId(userId);
      queryClient.invalidateQueries({ queryKey: ['entries', sid] });
    },
  });

  /* ----------------------------------------------------------
     DELETE ENTRY
  ---------------------------------------------------------- */
  const deleteEntryMutation = useMutation({
    mutationFn: async (local_id: string) => {
      if (!local_id) throw new Error('local_id required');
      await markEntryDeleted(local_id);
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
      if (ctx?.key) {
        queryClient.setQueryData(ctx.key, ctx.previous);
      }
    },

    onSettled: async () => {
      const sid = await resolveUserId(userId);
      queryClient.invalidateQueries({ queryKey: ['entries', sid] });
    },
  });

  return {
    entries,
    isLoading,
    addEntry: addEntryMutation.mutateAsync,
    updateEntry: updateEntryMutation.mutateAsync,
    deleteEntry: deleteEntryMutation.mutateAsync,
    refetch,
  };
};

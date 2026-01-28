import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useInternetStatus } from './useInternetStatus';
import {
  scheduleSync,
  startAutoSyncListener,
  stopAutoSyncListener,
  subscribeSyncConflicts,
} from '../services/syncManager';
import { useToast } from '../context/ToastContext';
import { isSyncCancelRequested } from '../sync/syncCancel';

/**
 * useOfflineSync now accepts an optional userId. Auto-sync will only run when a user is present.
 * - If `userId` is provided, the auto-sync listener is started and two-way sync runs when online.
 * - If `userId` is null/undefined, the listener is not started.
 */
export const useOfflineSync = (userId?: string | null) => {
  const isOnline = useInternetStatus();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const prevOnlineRef = useRef<boolean>(false);

  useEffect(() => {
    if (!userId) return;
    const unsubscribeConflicts = subscribeSyncConflicts((event) => {
      const amountLabel =
        typeof event.amount === 'number'
          ? `₹${Number(event.amount).toLocaleString('en-IN')}`
          : undefined;
      const parts = [event.category, amountLabel].filter(Boolean).join(' • ');
      const message = event.message || (parts ? `${parts} updated on another device` : null);
      showToast(message || 'Server kept the latest version of an entry.');
    });
    // start auto sync listener when user is logged in
    startAutoSyncListener();
    return () => {
      unsubscribeConflicts();
      stopAutoSyncListener();
    };
  }, [userId, showToast]);

  useEffect(() => {
    if (!userId) return;
    if (isOnline) {
      // Fast UI refresh on reconnect: force entries queries stale so screens
      // re-read SQLite immediately, then sync and refresh again.
      try {
        const wasOnline = prevOnlineRef.current;
        if (!wasOnline) {
          queryClient.invalidateQueries({ queryKey: ['entries'], exact: false } as any);
          void queryClient.refetchQueries({ queryKey: ['entries'], exact: false } as any);
        }
      } catch (e) {}

      // (async () => {
      //   try {
      //     const res: any = await scheduleSync();

      //     // After sync completes, refresh any active entry lists again.
      //     try {
      //       queryClient.invalidateQueries({ queryKey: ['entries'], exact: false } as any);
      //       void queryClient.refetchQueries({ queryKey: ['entries'], exact: false } as any);
      //     } catch (e) {}

      //     // Only show toast when a real sync ran and moved data.
      //     if (res && res.ok && res.reason === 'success') {
      //       const pushed = res.counts?.pushed || 0;
      //       const pulled = res.counts?.pulled || 0;
      //       if (pulled > 0 || pushed > 0) {
      //         const parts = [] as string[];
      //         if (pulled > 0) parts.push(`${pulled} pulled`);
      //         if (pushed > 0) parts.push(`${pushed} pushed`);
      //         showToast(`Auto-sync complete — ${parts.join(', ')}`);
      //       }
      //     } else {
      //       // Up-to-date / throttled / already-running are normal states; keep logs quiet.
      //       if (__DEV__ && res && res.ok === false && res.reason === 'error') {
      //         console.log('[useOfflineSync] sync error', res);
      //       }
      //     }
      //   } catch (err) {
      //     // If logout/navigation requested cancellation, don't surface as a failure.
      //     try {
      //       if (isSyncCancelRequested() || (err as any)?.message === 'sync_cancelled') return;
      //     } catch (e) {}
      //     if (__DEV__) console.warn('[useOfflineSync] sync failed', err);
      //     showToast('Auto-sync failed');
      //   }
      // })();
      // Redundant trigger removed: syncManager/App.tsx listeners handle this. This hook now only manages
      // conflicts and forcing a query refresh on network restore.
    }

    prevOnlineRef.current = !!isOnline;
  }, [isOnline, userId, showToast]);
};

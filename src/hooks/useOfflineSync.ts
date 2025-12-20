import { useEffect } from 'react';
import { useInternetStatus } from './useInternetStatus';
import {
  syncBothWays,
  startAutoSyncListener,
  stopAutoSyncListener,
  subscribeSyncConflicts,
} from '../services/syncManager';
import { useToast } from '../context/ToastContext';

/**
 * useOfflineSync now accepts an optional userId. Auto-sync will only run when a user is present.
 * - If `userId` is provided, the auto-sync listener is started and two-way sync runs when online.
 * - If `userId` is null/undefined, the listener is not started.
 */
export const useOfflineSync = (userId?: string | null) => {
  const isOnline = useInternetStatus();
  const { showToast } = useToast();

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
      syncBothWays()
        .then(() => showToast('Auto-sync complete'))
        .catch((err) => {
          console.error('Sync failed', err);
          showToast('Auto-sync failed');
        });
    }
  }, [isOnline, userId, showToast]);
};

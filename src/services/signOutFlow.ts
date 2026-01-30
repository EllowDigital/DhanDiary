import AsyncStorageNative from '@react-native-async-storage/async-storage';
import AsyncStorage from '../utils/AsyncStorageWrapper';
import { clearTokenCache } from '../utils/tokenCache';
import { clearBiometricSettings } from '../utils/biometricSettings';
import { setIsSigningOut } from '../utils/authBoundary';
import {
  resetBiometricSessionAll,
  resetBiometricSession,
  setBiometricEnabledSession,
} from '../utils/biometricSession';

export type HardSignOutDeps = {
  clerkSignOut: () => Promise<any>;
  navigateToAuth: () => void;
  beforeNavigate?: () => void | Promise<void>;
  onProgress?: (status: string) => void;
};

/**
 * HARD SECURITY BOUNDARY.
 * Order is mandatory:
 * 1) STOP EVERYTHING
 * 2) CLEAR AUTH SESSION
 * 3) CLEAR LOCAL STATE
 * 4) NAVIGATE
 */
export const performHardSignOut = async (deps: HardSignOutDeps) => {
  setIsSigningOut(true);
  const report = (msg: string) => {
    if (deps.onProgress) deps.onProgress(msg);
  };

  try {
    // 1) STOP EVERYTHING
    report('Stopping sync...');
    // Cancel sync, stop listeners/schedulers, clear debounced tasks.
    try {
      const sync = require('./syncManager');
      if (sync) {
        if (typeof sync.cancelSyncWork === 'function') sync.cancelSyncWork();
        if (typeof sync.stopSyncEngine === 'function') await sync.stopSyncEngine();
        else {
          if (typeof sync.stopAutoSyncListener === 'function') sync.stopAutoSyncListener();
          if (typeof sync.stopForegroundSyncScheduler === 'function')
            sync.stopForegroundSyncScheduler();
          if (typeof sync.stopBackgroundFetch === 'function') await sync.stopBackgroundFetch();
        }
      }
    } catch (e) {
      // best-effort
    }

    report('Signing out...');

    // 2) CLEAR AUTH SESSION & 3) CLEAR LOCAL STATE (PARALLEL FOR SPEED)
    // We run independent robust cleanup tasks in parallel to minimize "frozen" feel.

    const signOutPromise = (async () => {
      try {
        await deps.clerkSignOut();
      } catch (e) {
        /* best effort */
      }
      await clearTokenCache();
    })();

    const cleanupPromise = (async () => {
      // Reset biometric session state immediately.
      resetBiometricSessionAll();
      resetBiometricSession();
      setBiometricEnabledSession(false);

      // Wipe SQLite content (keep schema intact).
      try {
        const db = await import('../db/sqlite');
        if (typeof db.wipeLocalData === 'function') await db.wipeLocalData();
        if (typeof db.initDB === 'function') await db.initDB();
      } catch (e) {
        /* best-effort */
      }

      // Clear persisted storage.
      try {
        await AsyncStorageNative.clear();
      } catch (e) {}
      try {
        await AsyncStorage.clear();
      } catch (e) {}

      // Clear persisted biometric flags.
      await clearBiometricSettings();

      // Clear query cache
      try {
        const holder = require('../utils/queryClientHolder');
        if (holder && typeof holder.clearQueryCache === 'function') {
          await holder.clearQueryCache();
        }
      } catch (e) {}
    })();

    // improved feedback: wait for both
    await Promise.all([signOutPromise, cleanupPromise]);

    report('Finalizing...');

    // Notify UI
    try {
      const { notifyEntriesChanged } = require('../utils/dbEvents');
      notifyEntriesChanged();
    } catch (e) {}
    try {
      const { notifySessionChanged } = require('../utils/sessionEvents');
      await notifySessionChanged();
    } catch (e) {}

    // Give callers a chance to persist flags after storage wipe but before navigation.
    try {
      if (typeof deps.beforeNavigate === 'function') {
        await deps.beforeNavigate();
      }
    } catch (e) {
      // best-effort
    }

    // 4) NAVIGATE
    deps.navigateToAuth();
  } finally {
    // Keep this true only briefly; by this point Clerk should be signed out.
    // If something is still mid-flight, the App-level bridge also checks this.
    setTimeout(() => setIsSigningOut(false), 1500);
  }
};

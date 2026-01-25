/**
 * Hook to manage session recovery on app state changes
 * Ensures that sessions are properly recovered when the app goes to background/foreground
 */

import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { getSession, ensureSessionPersisted, isValidSessionStored } from '../db/session';
import { recoverSessionGracefully } from '../services/sessionRecovery';

export const useSessionRecoveryOnAppStateChange = () => {
  const appStateRef = useRef(AppState.currentState);
  const recoveryInProgressRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      const prevState = appStateRef.current;
      appStateRef.current = nextAppState;

      // App is coming to foreground
      if (prevState.match(/inactive|background/) && nextAppState === 'active') {
        if (__DEV__) console.info('[SessionRecovery] App resumed; checking session');

        // Avoid concurrent recovery attempts
        if (recoveryInProgressRef.current) {
          if (__DEV__) console.info('[SessionRecovery] Recovery already in progress');
          return;
        }

        recoveryInProgressRef.current = true;

        try {
          // First check if we have a valid stored session
          const isValid = await isValidSessionStored();
          if (!isValid) {
            if (__DEV__) console.warn('[SessionRecovery] No valid stored session');
            recoveryInProgressRef.current = false;
            return;
          }

          // Ensure session is still properly persisted
          const persisted = await ensureSessionPersisted();
          if (!persisted?.id) {
            if (__DEV__) console.warn('[SessionRecovery] Failed to ensure session persistence');
            recoveryInProgressRef.current = false;
            return;
          }

          // Attempt graceful recovery if there are any issues
          const recovery = await recoverSessionGracefully();
          if (!recovery.success && __DEV__) {
            console.info('[SessionRecovery] Recovery result:', recovery.reason);
          }
        } catch (e) {
          if (__DEV__) console.error('[SessionRecovery] Error during app state recovery', e);
        } finally {
          recoveryInProgressRef.current = false;
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      mounted = false;
      try {
        subscription.remove();
      } catch (e) {}
    };
  }, []);
};

export default useSessionRecoveryOnAppStateChange;

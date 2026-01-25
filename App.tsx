import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  LogBox,
  View,
  Text,
  Button,
  ActivityIndicator,
  AppState,
  AppStateStatus,
  Platform,
  InteractionManager,
  StyleSheet,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import navigationRef, { resetRoot } from './src/utils/rootNavigation';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClerkProvider, useUser } from '@clerk/clerk-expo';
import Constants from 'expo-constants';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

// --- Local Imports ---
import SplashScreen from './src/screens/SplashScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import VerifyEmailScreen from './src/screens/VerifyEmailScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import PrivacyPolicyScreen from './src/screens/PrivacyPolicyScreen';
import TermsScreen from './src/screens/TermsScreen';
import EulaScreen from './src/screens/EulaScreen';
import AccountDeletedScreen from './src/screens/AccountDeletedScreen';
import AnnouncementScreen from './src/screens/AnnouncementScreen';

import { RootStackParamList, AuthStackParamList } from './src/types/navigation';
import { ToastProvider } from './src/context/ToastContext';
import { enableLegacyLayoutAnimations } from './src/utils/layoutAnimation';
import DrawerNavigator from './src/navigation/DrawerNavigator';
import { useToast } from './src/context/ToastContext';
import { useOfflineSync } from './src/hooks/useOfflineSync';
import { useAuth } from './src/hooks/useAuth';
import { checkNeonConnection } from './src/api/neonClient';
import { syncClerkUserToNeon } from './src/services/clerkUserSync';
import { saveSession as saveLocalSession } from './src/db/session';
import { BiometricAuth } from './src/components/BiometricAuth';
import tokenCache from './src/utils/tokenCache';
import * as SecureStore from 'expo-secure-store';
import { isUuid } from './src/utils/uuid';
import { getBiometricEnabled } from './src/utils/biometricSettings';
import AsyncStorage from './src/utils/AsyncStorageWrapper';
import { getIsSigningOut } from './src/utils/authBoundary';
import {
  getBiometricSessionState,
  subscribeBiometricSession,
  setBiometricEnabledSession,
  setBiometricUnlockedSession,
  resetBiometricSession,
} from './src/utils/biometricSession';

import {
  startForegroundSyncScheduler,
  stopForegroundSyncScheduler,
  startBackgroundFetch,
  stopBackgroundFetch,
} from './src/services/syncManager';
import runFullSync, { isSyncRunning } from './src/sync/runFullSync';
import {
  runBackgroundUpdateCheck,
  runBackgroundUpdateCheckWithResult,
} from './src/services/backgroundUpdates';
import { reloadOtaUpdate } from './src/services/backgroundUpdates';
import * as Updates from 'expo-updates';

// --- Configuration ---
LogBox.ignoreLogs([
  'setLayoutAnimationEnabledExperimental',
  'setLayoutAnimationEnabledExperimental is currently a no-op',
  "The action 'GO_BACK' was not handled",
  'Process ID',
]);

// Enable LayoutAnimation
enableLegacyLayoutAnimations();

// Environment Variables
const CLERK_PUBLISHABLE_KEY = String(
  Constants.expoConfig?.extra?.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ||
  process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ||
  ''
).trim();

const devLogOnce = (key: string, payload: Record<string, unknown>) => {
  if (!__DEV__) return;
  const g = globalThis as typeof globalThis & { __DD_LOG_ONCE__?: Record<string, true> };
  if (!g.__DD_LOG_ONCE__) g.__DD_LOG_ONCE__ = {};
  if (g.__DD_LOG_ONCE__[key]) return;
  g.__DD_LOG_ONCE__[key] = true;
  console.info(key, payload);
};

devLogOnce('[auth] key', {
  hasKey: Boolean(CLERK_PUBLISHABLE_KEY),
  tail:
    CLERK_PUBLISHABLE_KEY && CLERK_PUBLISHABLE_KEY.length >= 6
      ? `...${CLERK_PUBLISHABLE_KEY.slice(-6)}`
      : null,
});

// --- Navigation Stacks ---
const RootStack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();

// --- Sub-Navigators ---
const AuthNavigator = () => (
  <AuthStack.Navigator screenOptions={{ headerShown: false }}>
    <AuthStack.Screen name="Login" component={LoginScreen} />
    <AuthStack.Screen name="Register" component={RegisterScreen} />
    <AuthStack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
    <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    <AuthStack.Screen name="Terms" component={TermsScreen} />
    <AuthStack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
    <AuthStack.Screen name="Eula" component={EulaScreen} />
    <AuthStack.Screen name="AccountDeleted" component={AccountDeletedScreen} />
  </AuthStack.Navigator>
);

const MainNavigator = () => <DrawerNavigator />;

// --- Inner App Content ---
// This component is now a CHILD of NavigationContainer, so hooks using navigation are safe here.
const AppContent = () => {
  const { user } = useAuth();
  const { user: clerkUser, isLoaded: clerkLoaded } = useUser();
  const [localSessionId, setLocalSessionId] = React.useState<string | null>(null);
  const [localSessionClerkId, setLocalSessionClerkId] = React.useState<string | null>(null);
  const [accountDeletedAt, setAccountDeletedAt] = React.useState<string | null>(null);
  const userSyncBlockRef = React.useRef<{ clerkId: string; until: number } | null>(null);
  const lastNetRef = React.useRef<{
    isConnected?: boolean | null;
    isInternetReachable?: boolean | null;
    type?: string | null;
  } | null>(null);
  const [isOnline, setIsOnline] = React.useState<boolean | null>(null);
  const { showActionToast } = useToast();
  const prevClerkIdRef = React.useRef<string | null>(null);
  const clerkIdRef = React.useRef<string | null>(null);
  const clerkLoadedRef = React.useRef(false);
  const onlineRef = React.useRef<boolean | null>(null);
  const sessionExpiredTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const didShowSessionExpiredRef = React.useRef(false);

  // --- Biometric session gate state ---
  const BIOMETRIC_KEY = 'BIOMETRIC_ENABLED'; // legacy fallback key (not used for new per-user storage)
  const BIOMETRIC_TIMEOUT_MS = 60 * 1000; // 30–60s per spec (keep 60s)
  const BIOMETRIC_UNLOCK_KEY_PREFIX = 'BIOMETRIC_LAST_UNLOCK:';
  const [bioState, setBioState] = React.useState(() => getBiometricSessionState());
  const backgroundAtRef = React.useRef<number>(0);
  const appStateRef = React.useRef<AppStateStatus>(AppState.currentState);
  const lastUnlockPersistedRef = React.useRef<number>(0);

  useEffect(() => {
    const unsub = subscribeBiometricSession((s) => setBioState(s));
    return () => {
      try {
        unsub();
      } catch (e) { }
    };
  }, []);

  // subscribe to session changes to keep localSessionId up-to-date
  useEffect(() => {
    let mounted = true;
    let unsub: any = null;
    try {
      const se = require('./src/utils/sessionEvents');
      unsub = se.subscribeSession((s: any) => {
        try {
          setLocalSessionId(s?.id ?? null);
          setLocalSessionClerkId(s?.clerk_id ? String(s.clerk_id) : null);
          try {
            const mod = require('./src/db/session');
            if (mod && typeof mod.getAccountDeletedAt === 'function') {
              mod.getAccountDeletedAt().then((v: any) => setAccountDeletedAt(v));
            }
          } catch (e) { }
        } catch (e) { }
      });
    } catch (e) { }

    return () => {
      mounted = false;
      try {
        if (unsub) unsub();
      } catch (e) { }
    };
  }, []);

  // Track connectivity so we can retry online-only effects (e.g., Clerk->Neon bridge)
  // when the device comes back online.
  useEffect(() => {
    let mounted = true;
    const logNet = (state: NetInfoState) => {
      if (!__DEV__) return;
      const next = {
        isConnected: state.isConnected,
        isInternetReachable: state.isInternetReachable,
        type: state.type,
      };
      const prev = lastNetRef.current;
      if (
        prev &&
        prev.isConnected === next.isConnected &&
        prev.isInternetReachable === next.isInternetReachable &&
        prev.type === next.type
      ) {
        return;
      }
      lastNetRef.current = next;
      console.info('[net] status', next);
    };
    const unsub = NetInfo.addEventListener((state) => {
      if (!mounted) return;
      setIsOnline(!!state.isConnected);
      onlineRef.current = !!state.isConnected;
      logNet(state);
    });
    NetInfo.fetch()
      .then((state) => {
        if (mounted) {
          setIsOnline(!!state.isConnected);
          onlineRef.current = !!state.isConnected;
        }
        logNet(state);
      })
      .catch(() => { });
    return () => {
      mounted = false;
      try {
        unsub();
      } catch (e) { }
    };
  }, []);

  // Track Clerk state in refs to avoid stale values in delayed checks.
  useEffect(() => {
    clerkLoadedRef.current = clerkLoaded;
    clerkIdRef.current = clerkUser?.id ? String(clerkUser.id) : null;
  }, [clerkLoaded, clerkUser]);

  // Session expired edge-case: if Clerk was signed in and becomes signed out unexpectedly,
  // show a message before redirecting to login (after a short grace window).
  useEffect(() => {
    if (!clerkLoaded) return;
    if (__DEV__) {
      console.info('[auth] Clerk loaded', { isSignedIn: Boolean(clerkUser?.id) });
    }
    const prev = prevClerkIdRef.current;
    const next = clerkUser?.id ? String(clerkUser.id) : null;
    prevClerkIdRef.current = next;

    if (next) {
      didShowSessionExpiredRef.current = false;
      if (sessionExpiredTimerRef.current) {
        clearTimeout(sessionExpiredTimerRef.current);
        sessionExpiredTimerRef.current = null;
      }
      return;
    }

    if (prev && !next) {
      if (getIsSigningOut()) return;
      // If we're definitely offline, don't force a logout UX.
      if (isOnline === false) return;
      // Only enforce if this device has a Clerk-backed local session.
      if (!localSessionClerkId) return;

      if (sessionExpiredTimerRef.current) {
        clearTimeout(sessionExpiredTimerRef.current);
        sessionExpiredTimerRef.current = null;
      }

      sessionExpiredTimerRef.current = setTimeout(() => {
        if (getIsSigningOut()) return;
        if (onlineRef.current === false) return;
        if (!clerkLoadedRef.current) return;
        if (clerkIdRef.current) return;
        if (didShowSessionExpiredRef.current) return;

        didShowSessionExpiredRef.current = true;
        showActionToast(
          'Your session has expired. Please log in again.',
          'Log in',
          () => resetRoot({ index: 0, routes: [{ name: 'Auth' }] }),
          'error',
          8000
        );
      }, 4000);
    }

    return () => {
      if (sessionExpiredTimerRef.current) {
        clearTimeout(sessionExpiredTimerRef.current);
        sessionExpiredTimerRef.current = null;
      }
    };
  }, [clerkLoaded, clerkUser, isOnline, showActionToast, localSessionClerkId]);

  // Load biometric enabled setting once, and refresh on foreground.
  const refreshBiometricEnabled = React.useCallback(async () => {
    try {
      // Derive stable session id to use for per-user biometric flag.
      const uid = localSessionId || (user && isUuid(user.id) ? user.id : null);
      if (!uid) {
        setBiometricEnabledSession(false);
        return;
      }

      const enabled = await getBiometricEnabled(String(uid));
      setBiometricEnabledSession(enabled);
    } catch (e) {
      setBiometricEnabledSession(false);
    }
  }, [localSessionId, user]);

  useEffect(() => {
    void refreshBiometricEnabled();
  }, [refreshBiometricEnabled]);

  // Restore biometric unlocked state on cold start if the user reopened quickly
  // after a successful unlock (prevents a redundant prompt/overlay).
  const restoreBiometricUnlock = React.useCallback(async () => {
    try {
      const uid = localSessionId || (user && isUuid(user.id) ? user.id : null);
      if (!uid) return;

      const enabled = await getBiometricEnabled(String(uid));
      if (!enabled) return;

      const key = `${BIOMETRIC_UNLOCK_KEY_PREFIX}${String(uid)}`;
      const raw = await AsyncStorage.getItem(key);
      const ts = raw ? Number(raw) : 0;
      if (ts && Number.isFinite(ts) && Date.now() - ts < BIOMETRIC_TIMEOUT_MS) {
        setBiometricUnlockedSession(true);
      }
    } catch (e) {
      // best-effort only
    }
  }, [localSessionId, user]);

  useEffect(() => {
    void restoreBiometricUnlock();
  }, [restoreBiometricUnlock]);

  const isAuthenticated = !!(user?.id || localSessionId);
  // Account switch boundary: Clerk id is authoritative when present.
  const accountKey = clerkUser?.id ? String(clerkUser.id) : localSessionClerkId || null;
  const lastAccountKeyRef = React.useRef<string | null>(null);

  // Reset biometric session on logout or account switch.
  useEffect(() => {
    const prev = lastAccountKeyRef.current;
    const next = accountKey;
    lastAccountKeyRef.current = next;

    if (!isAuthenticated) {
      resetBiometricSession();
      return;
    }

    if (prev && next && prev !== next) {
      resetBiometricSession();
    }
  }, [accountKey, isAuthenticated]);

  // App lifecycle: lock only after timeout in background.
  useEffect(() => {
    const onChange = (nextState: AppStateStatus) => {
      const prevState = appStateRef.current;
      appStateRef.current = nextState;

      if (!bioState.isBiometricEnabled || !isAuthenticated) return;

      if (prevState === 'active' && nextState.match(/inactive|background/)) {
        backgroundAtRef.current = Date.now();
      }

      if (prevState.match(/inactive|background/) && nextState === 'active') {
        void refreshBiometricEnabled();
        const bgAt = backgroundAtRef.current;
        backgroundAtRef.current = 0;

        if (!bioState.isBiometricUnlocked) return;

        if (bgAt && Date.now() - bgAt > BIOMETRIC_TIMEOUT_MS) {
          resetBiometricSession();
        }
      }
    };

    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [
    bioState.isBiometricEnabled,
    bioState.isBiometricUnlocked,
    isAuthenticated,
    refreshBiometricEnabled,
  ]);

  // Persist biometric unlock timestamp so quick relaunches don't re-prompt.
  useEffect(() => {
    const uid = localSessionId || (user && isUuid(user.id) ? user.id : null);
    if (!uid) return;

    const key = `${BIOMETRIC_UNLOCK_KEY_PREFIX}${String(uid)}`;

    if (!bioState.isBiometricEnabled) {
      lastUnlockPersistedRef.current = 0;
      AsyncStorage.removeItem(key).catch(() => { });
      return;
    }

    if (bioState.isBiometricUnlocked) {
      const ts = bioState.lastUnlockTimestamp || Date.now();
      if (ts && ts !== lastUnlockPersistedRef.current) {
        lastUnlockPersistedRef.current = ts;
        AsyncStorage.setItem(key, String(ts)).catch(() => { });
      }
    } else {
      lastUnlockPersistedRef.current = 0;
      AsyncStorage.removeItem(key).catch(() => { });
    }
  }, [
    bioState.isBiometricEnabled,
    bioState.isBiometricUnlocked,
    bioState.lastUnlockTimestamp,
    localSessionId,
    user,
  ]);

  const biometricLocked =
    bioState.isBiometricEnabled && isAuthenticated && !bioState.isBiometricUnlocked;

  // Some native modules (network/update/sync) can be unstable during the OS biometric prompt
  // on certain Android devices in release builds. Treat the biometric overlay as a hard gate:
  // - do not run background sync/OTA checks while locked
  // - wait a short moment after unlocking before kicking off deferred work
  const biometricGateRef = React.useRef({ locked: biometricLocked, lastUnlockAt: 0 });
  useEffect(() => {
    biometricGateRef.current = {
      locked: biometricLocked,
      lastUnlockAt: bioState.lastUnlockTimestamp || 0,
    };
  }, [biometricLocked, bioState.lastUnlockTimestamp]);

  // Background OTA updates: fetch quietly, then show a toast to install.
  // - No banners
  // - Never blocks core flows
  useEffect(() => {
    let cancelled = false;

    // Don't run while biometric gate is active.
    if (biometricLocked) return;

    InteractionManager.runAfterInteractions(() => {
      (async () => {
        try {
          // Avoid running during biometric prompt / immediately after unlock.
          if (cancelled) return;
          if (AppState.currentState !== 'active') return;
          const gate = biometricGateRef.current;
          if (gate.locked) return;
          if (gate.lastUnlockAt && Date.now() - gate.lastUnlockAt < 1500) return;

          const res = await runBackgroundUpdateCheckWithResult();
          if (cancelled) return;

          if (res.fetched && Updates.isEnabled) {
            showActionToast(
              'Update ready to install.',
              'Install',
              () => {
                reloadOtaUpdate().catch(() => { });
              },
              'info',
              8000
            );
          }
        } catch (e) {
          // Fallback to silent behavior
          runBackgroundUpdateCheck().catch(() => { });
        }
      })();
    });

    return () => {
      cancelled = true;
    };
  }, [biometricLocked, showActionToast]);

  // 1. Setup Offline Sync Hook
  // IMPORTANT: pause sync while biometric lock is active (release crash guard).
  // Prefer Clerk user id when available; otherwise use persisted local session id.
  useOfflineSync(biometricLocked ? null : user?.id || localSessionId);

  // 2. Health Check (Neon)
  useEffect(() => {
    // Avoid running during biometric prompt or immediately after unlock.
    if (biometricLocked) return;
    if (AppState.currentState !== 'active') return;
    const gate = biometricGateRef.current;
    if (gate.lastUnlockAt && Date.now() - gate.lastUnlockAt < 1500) return;

    checkNeonConnection().catch(() => { });
  }, [biometricLocked]);

  // 3. User Synchronization
  useEffect(() => {
    if (!clerkLoaded || !clerkUser) return;
    // Ensure this effect re-runs when connectivity changes (offline -> online).
    if (isOnline === false) return;
    if (getIsSigningOut()) return;

    const block = userSyncBlockRef.current;
    if (block && block.clerkId === String(clerkUser.id) && Date.now() < block.until) {
      return;
    }

    const syncUser = async () => {
      try {
        if (getIsSigningOut()) return;
        const id = clerkUser.id;
        const emails =
          clerkUser.emailAddresses?.map((e) => ({ emailAddress: e.emailAddress })) || [];

        if (emails.length === 0 && clerkUser.primaryEmailAddress?.emailAddress) {
          emails.push({ emailAddress: clerkUser.primaryEmailAddress.emailAddress });
        }

        if (!id) return;

        // IMPORTANT (offline-first):
        // When offline, do NOT attempt to sync Clerk->Neon mapping, because the
        // bridge may fall back and overwrite the local session UUID, causing the
        // app to appear to reset to 0. We keep the existing local session and
        // let sync reconcile once back online.
        try {
          const state = await NetInfo.fetch();
          if (!state.isConnected) {
            return;
          }
        } catch (e) {
          // If NetInfo fails, proceed (best-effort).
        }

        // SECURITY: never reuse local SQLite across different Clerk users.
        // If another user was previously active on this device, wipe local DB before proceeding.
        try {
          const ownerMod = await import('./src/db/offlineOwner');
          const currentOwner = await ownerMod.getOfflineDbOwner();

          const PENDING_PREFIX = 'pending:';
          const currentOwnerStr = currentOwner ? String(currentOwner) : null;
          const isPending = !!currentOwnerStr && currentOwnerStr.startsWith(PENDING_PREFIX);
          const currentOwnerValue =
            isPending && currentOwnerStr
              ? currentOwnerStr.slice(PENDING_PREFIX.length)
              : currentOwnerStr;

          const wipeAndResetCaches = async () => {
            const db = await import('./src/db/sqlite');
            if (typeof db.wipeLocalData === 'function') await db.wipeLocalData();
            try {
              const { notifyEntriesChanged } = require('./src/utils/dbEvents');
              notifyEntriesChanged();
            } catch (e) { }
            try {
              const holder = require('./src/utils/queryClientHolder');
              if (holder && typeof holder.clearQueryCache === 'function') {
                await holder.clearQueryCache();
              }
            } catch (e) { }
          };

          // Crash-safety: mark owner as pending before wiping so a mid-wipe crash
          // can't leave the app thinking the DB belongs to the new user.
          if (isPending) {
            await wipeAndResetCaches();
            await ownerMod.setOfflineDbOwner(String(id));
          } else if (currentOwnerValue && String(currentOwnerValue) !== String(id)) {
            await ownerMod.setOfflineDbOwner(`${PENDING_PREFIX}${String(id)}`);
            await wipeAndResetCaches();
            await ownerMod.setOfflineDbOwner(String(id));
          } else {
            await ownerMod.setOfflineDbOwner(String(id));
          }
        } catch (e) {
          // Best-effort; do not block login flow.
        }

        if (getIsSigningOut()) return;
        const bridgeUser = await syncClerkUserToNeon({
          id,
          emailAddresses: emails,
          fullName: clerkUser.fullName || clerkUser.firstName || null,
        });

        if (bridgeUser?.uuid) {
          await saveLocalSession(
            bridgeUser.uuid,
            bridgeUser.name || 'User',
            bridgeUser.email,
            (clerkUser as any)?.imageUrl || null,
            (clerkUser as any)?.imageUrl || null,
            bridgeUser.clerk_id || id
          );
        }
      } catch (e) {
        const msg = String((e as any)?.message || e || '');
        if (msg.includes('Email is already linked to another account')) {
          // Permanent identity conflict; avoid retrying on every connectivity/auth rerender.
          userSyncBlockRef.current = {
            clerkId: String(clerkUser.id),
            until: Date.now() + 5 * 60 * 1000,
          };
        }
        console.warn('[App] User sync failed:', e);
      }
    };

    syncUser();
  }, [clerkLoaded, clerkUser, isOnline]);

  const handleBiometricUnlocked = React.useCallback(() => {
    setBiometricUnlockedSession(true);
  }, []);

  return (
    <View style={{ flex: 1 }}>
      {/* Main Navigator */}
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        <RootStack.Screen name="Splash" component={SplashScreen} />
        <RootStack.Screen name="Onboarding" component={OnboardingScreen} />
        <RootStack.Screen name="Auth" component={AuthNavigator} />
        <RootStack.Screen name="Announcement" component={AnnouncementScreen} />
        <RootStack.Screen name="Main" component={MainNavigator} />
      </RootStack.Navigator>

      {/* Biometric overlay: session gate (never per-screen) */}
      <BiometricAuth
        enabled={bioState.isBiometricEnabled && isAuthenticated}
        locked={biometricLocked}
        promptMessage="Unlock DhanDiary"
        onUnlocked={handleBiometricUnlocked}
      />

      {/* no modal here: navigation handles account-deleted flow */}
    </View>
  );
};

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    width: '85%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  modalTitle: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  modalBody: { fontSize: 14, color: '#444', textAlign: 'center', marginBottom: 16 },
  modalButton: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  modalButtonText: { color: '#fff', fontWeight: '600' },
});

// --- App Shell (Database, Navigation Container & Service Initialization) ---
function AppWithDb() {
  const [dbReady, setDbReady] = useState(false);
  const [dbInitError, setDbInitError] = useState<string | null>(null);

  const queryClient = useMemo(() => new QueryClient(), []);

  useEffect(() => {
    try {
      const holder = require('./src/utils/queryClientHolder');
      if (holder?.setQueryClient) holder.setQueryClient(queryClient);
    } catch (e) { }
  }, [queryClient]);

  const initializeDatabase = useCallback(async () => {
    try {
      enableLegacyLayoutAnimations();
      const { initDB } = await import('./src/db/sqlite');
      await initDB();
      setDbReady(true);
      setDbInitError(null);
    } catch (e: any) {
      console.error('[App] DB Init Fatal:', e);
      setDbInitError(e.message || 'Unknown database error');
      setDbReady(false);
    }
  }, []);

  useEffect(() => {
    initializeDatabase();
  }, [initializeDatabase]);

  // Sync Schedulers
  useEffect(() => {
    if (!dbReady) return;

    if (AppState.currentState === 'active') {
      runFullSync().catch(() => { });
    }

    startForegroundSyncScheduler(15000);
    // Android background fetch can be a common source of force-closes depending on
    // device/ROM/new-architecture/native module combinations. Keep the app stable
    // by relying on foreground sync on Android.
    if (Platform.OS !== 'android') {
      startBackgroundFetch().catch(() => { });
    }

    // Background Expo Updates: fetch quietly, apply on next restart.
    // Never block app launch.
    InteractionManager.runAfterInteractions(() => {
      runBackgroundUpdateCheck().catch(() => { });
    });

    return () => {
      stopForegroundSyncScheduler();
      stopBackgroundFetch();
    };
  }, [dbReady]);

  // App State Listener
  useEffect(() => {
    if (!dbReady) return;
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active' && !isSyncRunning) {
        setTimeout(() => {
          runFullSync().catch(() => { });
        }, 500);
      }
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [dbReady]);

  // 1. Error State
  if (!dbReady && dbInitError) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Text style={{ marginBottom: 10, fontSize: 16 }}>Initialization Failed</Text>
        <Text style={{ marginBottom: 20, color: 'red', textAlign: 'center' }}>{dbInitError}</Text>
        <Button
          title="Retry"
          onPress={() => {
            setDbInitError(null);
            initializeDatabase();
          }}
        />
      </View>
    );
  }

  // 2. Loading State
  if (!dbReady) {
    return (
      <View
        style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}
      >
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  // 3. Ready State - NavigationContainer lives HERE
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          {/* FIX: NavigationContainer wraps AppContent, providing context to hooks inside AppContent */}
          <NavigationContainer ref={navigationRef}>
            <AppContent />
          </NavigationContainer>
        </ToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

// --- Bootstrap ---
function AppBootstrap() {
  return <AppWithDb />;
}

// --- Root App ---
export default function App() {
  // Install a production-only global JS error handler to avoid showing
  // developer redbox to end-users. We still log minimal info for diagnostics.
  try {
    if (typeof __DEV__ === 'undefined' || !__DEV__) {
      const globalAny: any = globalThis as any;
      try {
        const prevHandler =
          globalAny.ErrorUtils && globalAny.ErrorUtils.getGlobalHandler
            ? globalAny.ErrorUtils.getGlobalHandler()
            : undefined;
        if (globalAny.ErrorUtils && globalAny.ErrorUtils.setGlobalHandler) {
          globalAny.ErrorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
            try {
              // Minimal log in production; do not rethrow or show redbox
              console.warn(
                '[App] JS Error suppressed in production:',
                error && error.message ? error.message : error
              );
            } catch (e) { }
            // Optionally send to analytics here
          });
        }
      } catch (e) { }

      // Catch unhandled promise rejections
      try {
        (globalThis as any).onunhandledrejection = (ev: any) => {
          try {
            const reason = ev && (ev.reason || ev);
            console.warn(
              '[App] Unhandled Promise Rejection suppressed in production:',
              reason && reason.message ? reason.message : reason
            );
          } catch (e) { }
        };
      } catch (e) { }
    }
    // Warn if CLERK_SECRET exists in runtime config — this is insecure for clients
    try {
      const clerkSecret =
        Constants.expoConfig?.extra?.CLERK_SECRET || process.env.CLERK_SECRET || null;
      if (clerkSecret) {
        console.warn(
          '[App] SECURITY WARNING: CLERK_SECRET is present in client runtime. Do NOT ship admin secrets to mobile clients. Prefer a server-side deletion endpoint.'
        );
      }
    } catch (e) { }
  } catch (e) { }
  if (!CLERK_PUBLISHABLE_KEY) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: 'red' }}>Configuration Error: Missing Clerk Key</Text>
      </View>
    );
  }

  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
      <AppBootstrap />
    </ClerkProvider>
  );
}

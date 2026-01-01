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
  UIManager,
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
import NetInfo from '@react-native-community/netinfo';

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
import * as Updates from 'expo-updates';

// --- Configuration ---
LogBox.ignoreLogs([
  'setLayoutAnimationEnabledExperimental',
  'setLayoutAnimationEnabledExperimental is currently a no-op',
  "The action 'GO_BACK' was not handled",
  'Process ID',
]);

// Enable LayoutAnimation
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Environment Variables
const CLERK_PUBLISHABLE_KEY =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ||
  process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ||
  '';

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
  const { showActionToast } = useToast();

  // --- Biometric session gate state ---
  const BIOMETRIC_KEY = 'BIOMETRIC_ENABLED';
  const BIOMETRIC_TIMEOUT_MS = 60 * 1000; // 30–60s per spec (keep 60s)
  const [biometricEnabled, setBiometricEnabled] = React.useState(false);
  const [biometricUnlocked, setBiometricUnlocked] = React.useState(false);
  const lastUnlockTsRef = React.useRef<number>(0);
  const backgroundAtRef = React.useRef<number>(0);
  const appStateRef = React.useRef<AppStateStatus>(AppState.currentState);

  // Load persisted fallback session early so offline sync features work even when Clerk user
  // isn't immediately available (e.g., cold start without internet).
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const s = await import('./src/db/session');
        const sess = await s.getSession();
        if (mounted) {
          setLocalSessionId(sess?.id ?? null);
          setLocalSessionClerkId((sess as any)?.clerk_id ? String((sess as any).clerk_id) : null);
          try {
            const del = await s.getAccountDeletedAt();
            setAccountDeletedAt(del);
          } catch (e) {}
        }
      } catch (e) {
        if (__DEV__) console.warn('[AppContent] failed to load local session', e);
      }
    })();

    // subscribe to session changes to keep localSessionId up-to-date
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
          } catch (e) {}
        } catch (e) {}
      });
    } catch (e) {}

    return () => {
      mounted = false;
      try {
        if (unsub) unsub();
      } catch (e) {}
    };
  }, []);

  // Load biometric enabled setting once, and refresh on foreground.
  const refreshBiometricEnabled = React.useCallback(async () => {
    try {
      const enabledSetting = await SecureStore.getItemAsync(BIOMETRIC_KEY);
      setBiometricEnabled(enabledSetting === 'true');
    } catch (e) {
      setBiometricEnabled(false);
    }
  }, []);

  useEffect(() => {
    void refreshBiometricEnabled();
  }, [refreshBiometricEnabled]);

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
      setBiometricUnlocked(false);
      lastUnlockTsRef.current = 0;
      return;
    }

    if (prev && next && prev !== next) {
      setBiometricUnlocked(false);
      lastUnlockTsRef.current = 0;
    }
  }, [accountKey, isAuthenticated]);

  // App lifecycle: lock only after timeout in background.
  useEffect(() => {
    const onChange = (nextState: AppStateStatus) => {
      const prevState = appStateRef.current;
      appStateRef.current = nextState;

      if (!biometricEnabled || !isAuthenticated) return;

      if (prevState === 'active' && nextState.match(/inactive|background/)) {
        backgroundAtRef.current = Date.now();
      }

      if (prevState.match(/inactive|background/) && nextState === 'active') {
        void refreshBiometricEnabled();
        const bgAt = backgroundAtRef.current;
        backgroundAtRef.current = 0;

        if (!biometricUnlocked) return;

        if (bgAt && Date.now() - bgAt > BIOMETRIC_TIMEOUT_MS) {
          setBiometricUnlocked(false);
          lastUnlockTsRef.current = 0;
        }
      }
    };

    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [biometricEnabled, isAuthenticated, biometricUnlocked, refreshBiometricEnabled]);

  const biometricLocked = biometricEnabled && isAuthenticated && !biometricUnlocked;

  // Background OTA updates: fetch quietly, then show a toast to install.
  // - No banners
  // - Never blocks core flows
  useEffect(() => {
    let cancelled = false;

    InteractionManager.runAfterInteractions(() => {
      (async () => {
        try {
          const res = await runBackgroundUpdateCheckWithResult();
          if (cancelled) return;

          if (res.fetched && Updates.isEnabled) {
            showActionToast(
              'Update ready to install.',
              'Install',
              () => {
                Updates.reloadAsync().catch(() => {});
              },
              'info',
              8000
            );
          }
        } catch (e) {
          // Fallback to silent behavior
          runBackgroundUpdateCheck().catch(() => {});
        }
      })();
    });

    return () => {
      cancelled = true;
    };
  }, [showActionToast]);

  // 1. Setup Offline Sync Hook
  // Prefer Clerk user id when available; otherwise use persisted local session id.
  useOfflineSync(user?.id || localSessionId);

  // 2. Health Check (Neon)
  useEffect(() => {
    checkNeonConnection().catch(() => {});
  }, []);

  // 3. User Synchronization
  useEffect(() => {
    if (!clerkLoaded || !clerkUser) return;

    const syncUser = async () => {
      try {
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
          if (currentOwner && String(currentOwner) !== String(id)) {
            const db = await import('./src/db/sqlite');
            if (typeof db.wipeLocalData === 'function') await db.wipeLocalData();
            try {
              const { notifyEntriesChanged } = require('./src/utils/dbEvents');
              notifyEntriesChanged();
            } catch (e) {}
            try {
              const holder = require('./src/utils/queryClientHolder');
              if (holder && typeof holder.clearQueryCache === 'function') {
                await holder.clearQueryCache();
              }
            } catch (e) {}
          }
          await ownerMod.setOfflineDbOwner(String(id));
        } catch (e) {
          // Best-effort; do not block login flow.
        }

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
        console.warn('[App] User sync failed:', e);
      }
    };

    syncUser();
  }, [clerkLoaded, clerkUser]);

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
        enabled={biometricEnabled && isAuthenticated}
        locked={biometricLocked}
        promptMessage="Unlock DhanDiary"
        onUnlocked={() => {
          const now = Date.now();
          setBiometricUnlocked(true);
          lastUnlockTsRef.current = now;
        }}
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
    } catch (e) {}
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
      runFullSync().catch(() => {});
    }

    startForegroundSyncScheduler(15000);
    startBackgroundFetch().catch(() => {});

    // Background Expo Updates: fetch quietly, apply on next restart.
    // Never block app launch.
    InteractionManager.runAfterInteractions(() => {
      runBackgroundUpdateCheck().catch(() => {});
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
          runFullSync().catch(() => {});
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
            } catch (e) {}
            // Optionally send to analytics here
          });
        }
      } catch (e) {}

      // Catch unhandled promise rejections
      try {
        (globalThis as any).onunhandledrejection = (ev: any) => {
          try {
            const reason = ev && (ev.reason || ev);
            console.warn(
              '[App] Unhandled Promise Rejection suppressed in production:',
              reason && reason.message ? reason.message : reason
            );
          } catch (e) {}
        };
      } catch (e) {}
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
    } catch (e) {}
  } catch (e) {}
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

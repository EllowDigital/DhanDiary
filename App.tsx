import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { LogBox, View, Text, Button, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ClerkProvider, useAuth as useClerkAuth } from '@clerk/clerk-expo';
import Constants from 'expo-constants';

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

import { RootStackParamList, AuthStackParamList, MainStackParamList } from './src/types/navigation';
import { ToastProvider } from './src/context/ToastContext';
import { enableLegacyLayoutAnimations } from './src/utils/layoutAnimation';
import DrawerNavigator from './src/navigation/DrawerNavigator';
import { useOfflineSync } from './src/hooks/useOfflineSync';
import { useAuth } from './src/hooks/useAuth';
import { checkNeonConnection } from './src/api/neonClient';
import { useUser } from '@clerk/clerk-expo';
import { syncClerkUserToNeon } from './src/services/clerkUserSync';
import { saveSession as saveLocalSession } from './src/db/session';
import { BiometricAuth } from './src/components/BiometricAuth';
import tokenCache from './src/utils/tokenCache';

import {
  startForegroundSyncScheduler,
  stopForegroundSyncScheduler,
  startBackgroundFetch,
  stopBackgroundFetch,
} from './src/services/syncManager';
import { AppState } from 'react-native';
import runFullSync, { isSyncRunning } from './src/sync/runFullSync';

// --- Configuration ---
LogBox.ignoreLogs([
  'setLayoutAnimationEnabledExperimental',
  'setLayoutAnimationEnabledExperimental is currently a no-op in the New Architecture.',
  "The action 'GO_BACK' was not handled by any navigator.",
  'Process ID',
]);

if (__DEV__) {
  require('./src/utils/devDiagnostics');
}

// Prefer values injected via app.config.js / app.json
const CLERK_PUBLISHABLE_KEY =
  ((Constants?.expoConfig?.extra as any)?.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY as string) ||
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
  </AuthStack.Navigator>
);

const MainNavigator = () => <DrawerNavigator />;

// --- Inner App Content (Authenticated Logic) ---
const AppContent = () => {
  const { user } = useAuth();
  // Clerk user (when signed in via Clerk SDK)
  const { user: clerkUser, isLoaded: clerkLoaded } = useUser();

  // Provide user id to offline sync so it only runs when a user is present
  useOfflineSync(user?.id);

  // Warm Neon connection and log health (non-blocking)
  React.useEffect(() => {
    (async () => {
      try {
        const ok = await checkNeonConnection();
        console.log('[App] Neon connection ok:', ok);
      } catch (e) {
        console.warn('[App] Neon connection check failed', e);
      }
    })();
  }, []);

  // When Clerk user becomes available, ensure they are synced to Neon and local session saved.
  React.useEffect(() => {
    if (!clerkLoaded || !clerkUser) return;

    (async () => {
      try {
        const id = (clerkUser as any).id || (clerkUser as any).userId || null;
        // Gather email addresses in the shapes Clerk may expose
        let emails: Array<{ emailAddress: string }> = [];
        try {
          if (
            (clerkUser as any).primaryEmailAddress &&
            (clerkUser as any).primaryEmailAddress.emailAddress
          ) {
            emails = [{ emailAddress: (clerkUser as any).primaryEmailAddress.emailAddress }];
          } else if (
            (clerkUser as any).emailAddresses &&
            (clerkUser as any).emailAddresses.length
          ) {
            emails = (clerkUser as any).emailAddresses.map((e: any) => ({
              emailAddress: e.emailAddress,
            }));
          }
        } catch (e) {
          // leave emails empty
        }

        if (!id) {
          console.warn('[App] clerk user missing id, skipping sync');
          return;
        }

        // Call bridge to ensure Neon has the user and save session locally.
        try {
          const bridgeUser = await syncClerkUserToNeon({
            id,
            emailAddresses: emails,
            fullName: (clerkUser as any).fullName || null,
          });
          if (bridgeUser && bridgeUser.uuid) {
            try {
              await saveLocalSession(bridgeUser.uuid, bridgeUser.name || 'User', bridgeUser.email);
              console.log('[App] saved local session for', bridgeUser.email);
            } catch (e) {
              console.warn('[App] failed to save local session', e);
            }
          }
        } catch (e) {
          console.warn('[App] syncClerkUserToNeon failed', e);
        }
      } catch (e) {
        console.warn('[App] clerk sync effect error', e);
      }
    })();
  }, [clerkLoaded, clerkUser]);

  return (
    <>
      <BiometricAuth />
      <SyncStatusBanner />
      <NavigationContainer>
        <RootStack.Navigator screenOptions={{ headerShown: false }}>
          <RootStack.Screen name="Splash" component={SplashScreen} />
          <RootStack.Screen name="Onboarding" component={OnboardingScreen} />
          <RootStack.Screen name="Auth" component={AuthNavigator} />
          <RootStack.Screen name="Main" component={MainNavigator} />
        </RootStack.Navigator>
      </NavigationContainer>
    </>
  );
};

// --- App that initializes DB and app services (runs after Clerk loaded) ---
function AppWithDb() {
  const [dbReady, setDbReady] = useState(false);
  const [dbInitError, setDbInitError] = useState<string | null>(null);

  const queryClient = useMemo(() => new QueryClient(), []);
  // expose queryClient to other modules so logout can clear cache globally
  try {
    const holder = require('./src/utils/queryClientHolder');
    if (holder && typeof holder.setQueryClient === 'function') holder.setQueryClient(queryClient);
  } catch (e) { }

  // Initialize SQLite DB on startup and expose readiness to the app shell.
  const initializeDatabase = useCallback(async () => {
    try {
      const { initDB } = await import('./src/db/sqlite');
      await initDB();
      setDbReady(true);
      setDbInitError(null);
    } catch (e: any) {
      console.warn('[App] DB init failed', e);
      setDbInitError(String(e?.message || e));
      setDbReady(false);
    }
  }, []);

  // 1. Initial Config Logging
  useEffect(() => {
    // Enable legacy LayoutAnimation on Android when appropriate (centralized)
    try {
      enableLegacyLayoutAnimations();
    } catch (e) { }
    try {
      const extra = (Constants?.expoConfig?.extra as any) || {};
      const neonUrl = extra.NEON_URL || process.env.NEON_URL || null;
      let host: string | null = null;
      if (neonUrl) {
        try {
          host = new URL(neonUrl).hostname;
        } catch (e) {
          host = String(neonUrl).split('@').pop()?.split('/')[0] || null;
        }
      }
      console.log(
        'Startup config — neon host:',
        host || '(not configured)',
        'clerkKey present:',
        !!CLERK_PUBLISHABLE_KEY
      );
    } catch (e) {
      // ignore
    }
  }, []);

  // Run DB init on mount (no-op)
  useEffect(() => {
    initializeDatabase();
  }, [initializeDatabase]);

  // Start schedulers when DB is ready
  useEffect(() => {
    if (!dbReady) return;
    // Run a foreground sync once when the DB is ready and app is active.
    try {
      const current = AppState.currentState;
      if (current === 'active') {
        // call but don't await — safe non-blocking
        runFullSync().catch((e) => {
          if (__DEV__) console.warn('[App] initial runFullSync failed', e);
        });
      }
    } catch (e) { }

    try {
      startForegroundSyncScheduler(15000);
    } catch (e) {
      console.warn('Failed to start foreground scheduler', e);
    }

    (async () => {
      try {
        await startBackgroundFetch();
      } catch (e) {
        console.warn('Background fetch start failed or unavailable', e);
      }
    })();

    return () => {
      try {
        stopForegroundSyncScheduler();
        stopBackgroundFetch();
      } catch (e) { }
    };
  }, [dbReady]);

  // Listen for app coming to foreground and trigger a safe sync.
  useEffect(() => {
    if (!dbReady) return;

    const handler = (nextState: string) => {
      if (nextState === 'active') {
        // Avoid overlapping runs — runFullSync has its own lock but check early too.
        if (isSyncRunning) return;
        // Debounce quick state changes
        setTimeout(() => {
          runFullSync().catch((e) => {
            if (__DEV__) console.warn('[App] foreground runFullSync failed', e);
          });
        }, 250);
      }
    };

    // Use the modern subscription API and always call `remove()` on cleanup.
    const sub: any = AppState.addEventListener
      ? AppState.addEventListener('change', handler)
      : { remove: () => { } };

    return () => {
      try {
        if (sub && typeof sub.remove === 'function') sub.remove();
      } catch (e) { }
    };
  }, [dbReady]);

  if (!dbReady && dbInitError) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Text style={{ marginBottom: 12 }}>Database initialization failed:</Text>
        <Text style={{ marginBottom: 18, color: 'red', textAlign: 'center' }}>{dbInitError}</Text>
        <Button
          title="Retry Init"
          onPress={() => {
            setDbInitError(null);
            initializeDatabase();
          }}
        />
      </View>
    );
  }

  if (!dbReady) {
    return (
      <View
        style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}
      >
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={{ marginTop: 12 }}>Starting app...</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AppContent />
        </ToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

// --- Bootstrap: wait for Clerk SDK to load session state before initializing DB ---
function AppBootstrap() {
  const { isLoaded } = useClerkAuth();

  // Wait until Clerk SDK resolves session state. Render nothing (or a splash)
  // while Clerk is initializing so we don't assume logged-out before Clerk is ready.
  // Previously we returned `null` while Clerk initialized which could leave
  // the app as a blank white screen on resume. Instead render the app shell
  // and let internal components handle loading states. This avoids a white
  // screen when the process was backgrounded and resumed.
  return <AppWithDb />;
}

// Top-level App: provide Clerk then bootstrap rest of app
export default function App() {
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
      <AppBootstrap />
    </ClerkProvider>
  );
}

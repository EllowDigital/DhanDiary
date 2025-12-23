import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { 
  LogBox, 
  View, 
  Text, 
  Button, 
  ActivityIndicator 
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ClerkProvider } from '@clerk/clerk-expo';
import Constants from 'expo-constants';

// --- Local Imports ---
import SplashScreen from './src/screens/SplashScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import PrivacyPolicyScreen from './src/screens/PrivacyPolicyScreen';
import TermsScreen from './src/screens/TermsScreen';
import EulaScreen from './src/screens/EulaScreen';

import { RootStackParamList, AuthStackParamList, MainStackParamList } from './src/types/navigation';
import { ToastProvider } from './src/context/ToastContext';
import DrawerNavigator from './src/navigation/DrawerNavigator';
import { useOfflineSync } from './src/hooks/useOfflineSync';
import { useAuth } from './src/hooks/useAuth';
import { checkNeonConnection } from './src/api/neonClient';
import { useUser } from '@clerk/clerk-expo';
import { syncClerkUserToNeon } from './src/services/clerkUserSync';
import { saveSession as saveLocalSession } from './src/db/localDb';
import { BiometricAuth } from './src/components/BiometricAuth';
import tokenCache from './src/utils/tokenCache';

import {
  startForegroundSyncScheduler,
  stopForegroundSyncScheduler,
  startBackgroundFetch,
  stopBackgroundFetch,
} from './src/services/syncManager';

// --- Configuration ---
LogBox.ignoreLogs(['setLayoutAnimationEnabledExperimental', 'Process ID']);

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
          if ((clerkUser as any).primaryEmailAddress && (clerkUser as any).primaryEmailAddress.emailAddress) {
            emails = [{ emailAddress: (clerkUser as any).primaryEmailAddress.emailAddress }];
          } else if ((clerkUser as any).emailAddresses && (clerkUser as any).emailAddresses.length) {
            emails = (clerkUser as any).emailAddresses.map((e: any) => ({ emailAddress: e.emailAddress }));
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
          const bridgeUser = await syncClerkUserToNeon({ id, emailAddresses: emails, fullName: (clerkUser as any).fullName || null });
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

// --- Main App Component ---
export default function App() {
  const [dbReady, setDbReady] = useState(false);
  const [dbInitError, setDbInitError] = useState<string | null>(null);
  
  const queryClient = useMemo(() => new QueryClient(), []);

  // --- Database Initialization Logic ---
  const initializeDatabase = useCallback(async () => {
    try {
      // 1. Clear pending updates if necessary
      const pending = await AsyncStorage.getItem('PENDING_UPDATE');
      if (pending) {
        await AsyncStorage.removeItem('PENDING_UPDATE');
      }

      // 2. Open DB early so UI can render while migrations run in background.
      try {
        const sqlite = require('./src/db/sqlite').default;
        // try open with a short timeout to avoid blocking UI startup
        await Promise.race([
          sqlite.open(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('sqlite open timeout')), 8000)),
        ]);
        // mark DB as ready for UI purposes; migrations/init will continue in background
        setDbReady(true);
        setDbInitError(null);
      } catch (e) {
        console.warn('Early sqlite.open failed (will retry in background):', e);
      }

      // Kick off migrations and localDb.init in background; don't block UI.
      (async () => {
        try {
          const { init } = require('./src/db/localDb');
          await init();
          console.log('[App] background DB init complete');
        } catch (e) {
          console.error('[App] background DB init failed', e);
          // surface error to user if UI still in loading state
          setDbInitError(String(e?.message || e));
        }
      })();
    } catch (e: any) {
      setDbInitError(String(e?.message || 'Unknown DB Error'));
      setDbReady(false);
    }
  }, []);

  // --- Effects ---

  // 1. Initial Config Logging
  useEffect(() => {
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
      console.log('Startup config — neon host:', host || '(not configured)', 'clerkKey present:', !!CLERK_PUBLISHABLE_KEY);
    } catch (e) { 
      // ignore
    }
  }, []);

  // 2. Run Init on Mount
  useEffect(() => {
    initializeDatabase();
  }, [initializeDatabase]);

  // 3. Start Schedulers when DB is Ready
  useEffect(() => {
    if (!dbReady) return;

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

  // --- Render Handling ---

  // 1. Error State
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

  // 2. Loading State (While DB is initializing)
  if (!dbReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={{ marginTop: 12 }}>Starting app...</Text>
      </View>
    );
  }

  // 3. Main App
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <AppContent />
          </ToastProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </ClerkProvider>
  );
}
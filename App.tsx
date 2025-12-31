import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { LogBox, View, Text, Button, ActivityIndicator, AppState, AppStateStatus, Platform, UIManager } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClerkProvider, useAuth as useClerkAuth, useUser } from '@clerk/clerk-expo';
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

import { RootStackParamList, AuthStackParamList } from './src/types/navigation';
import { ToastProvider } from './src/context/ToastContext';
import { enableLegacyLayoutAnimations } from './src/utils/layoutAnimation';
import DrawerNavigator from './src/navigation/DrawerNavigator';
import { useOfflineSync } from './src/hooks/useOfflineSync';
import { useAuth } from './src/hooks/useAuth';
import { checkNeonConnection } from './src/api/neonClient';
import { syncClerkUserToNeon } from './src/services/clerkUserSync';
import { saveSession as saveLocalSession } from './src/db/session';
import { BiometricAuth } from './src/components/BiometricAuth';
import tokenCache from './src/utils/tokenCache';
import SyncStatusBanner from './src/components/SyncStatusBanner';

import {
  startForegroundSyncScheduler,
  stopForegroundSyncScheduler,
  startBackgroundFetch,
  stopBackgroundFetch,
} from './src/services/syncManager';
import runFullSync, { isSyncRunning } from './src/sync/runFullSync';

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
  </AuthStack.Navigator>
);

const MainNavigator = () => <DrawerNavigator />;

// --- Inner App Content ---
// This component is now a CHILD of NavigationContainer, so hooks using navigation are safe here.
const AppContent = () => {
  const { user } = useAuth();
  const { user: clerkUser, isLoaded: clerkLoaded } = useUser();

  // 1. Setup Offline Sync Hook
  useOfflineSync(user?.id);

  // 2. Health Check (Neon)
  useEffect(() => {
    checkNeonConnection().catch(() => { });
  }, []);

  // 3. User Synchronization
  useEffect(() => {
    if (!clerkLoaded || !clerkUser) return;

    const syncUser = async () => {
      try {
        const id = clerkUser.id;
        const emails = clerkUser.emailAddresses?.map(e => ({ emailAddress: e.emailAddress })) || [];

        if (emails.length === 0 && clerkUser.primaryEmailAddress?.emailAddress) {
          emails.push({ emailAddress: clerkUser.primaryEmailAddress.emailAddress });
        }

        if (!id) return;

        const bridgeUser = await syncClerkUserToNeon({
          id,
          emailAddresses: emails,
          fullName: clerkUser.fullName || clerkUser.firstName || null,
        });

        if (bridgeUser?.uuid) {
          await saveLocalSession(bridgeUser.uuid, bridgeUser.name || 'User', bridgeUser.email);
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
        <RootStack.Screen name="Main" component={MainNavigator} />
      </RootStack.Navigator>

      {/* Global Overlays (Must be AFTER Navigator to sit on top) */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100 }} pointerEvents="box-none">
        <SyncStatusBanner />
      </View>
      <BiometricAuth />
    </View>
  );
};

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
    startBackgroundFetch().catch(() => { });

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
        <Button title="Retry" onPress={() => { setDbInitError(null); initializeDatabase(); }} />
      </View>
    );
  }

  // 2. Loading State
  if (!dbReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
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
          <NavigationContainer>
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
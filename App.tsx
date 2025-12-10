import 'react-native-get-random-values';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import SplashScreen from './src/screens/SplashScreen';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import PrivacyPolicyScreen from './src/screens/PrivacyPolicyScreen';
import TermsScreen from './src/screens/TermsScreen';
import { RootStackParamList, AuthStackParamList, MainStackParamList } from './src/types/navigation';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const MainStack = createNativeStackNavigator<MainStackParamList>();

const AuthNavigator = () => (
  <AuthStack.Navigator screenOptions={{ headerShown: false }}>
    <AuthStack.Screen name="Login" component={LoginScreen} />
    <AuthStack.Screen name="Register" component={RegisterScreen} />
    <AuthStack.Screen
      name="Terms"
      component={TermsScreen}
      options={{ headerShown: true, title: 'Terms of Use' }}
    />
    <AuthStack.Screen
      name="PrivacyPolicy"
      component={PrivacyPolicyScreen}
      options={{ headerShown: true, title: 'Privacy Policy' }}
    />
  </AuthStack.Navigator>
);

import { ToastProvider } from './src/context/ToastContext';
import DrawerNavigator from './src/navigation/DrawerNavigator';

// Development-only diagnostics (captures missing-key warnings with stack)
import vexoService from './src/services/vexo';
// Initialize Vexo at module load if a key is available (safe - wrapper handles missing native module)
try {
  // Prefer environment variable, then Expo config extra. Only require the
  // native `vexo-analytics` package when running a non-DEV build so that
  // requiring the package doesn't log native-module warnings in Expo Go.
  const VEXO_KEY =
    process.env.VEXO_API_KEY ||
    (() => {
      try {
        const Constants = require('expo-constants');
        return (
          (Constants &&
            Constants.expoConfig &&
            Constants.expoConfig.extra &&
            Constants.expoConfig.extra.VEXO_API_KEY) ||
          null
        );
      } catch (e) {
        return null;
      }
    })();

  if (VEXO_KEY && !__DEV__) {
    try {
      // require only in non-DEV to avoid noisy runtime warnings when native
      // modules are not linked (Expo Go).

      const _vexo = require('vexo-analytics');
      const vexo = _vexo && (_vexo.vexo || _vexo.default || _vexo);
      if (vexo) {
        try {
          vexo(VEXO_KEY);
        } catch (e) {
          console.warn('Vexo init failed', e);
        }
      }
    } catch (e) {
      // package not installed or native module missing — silently ignore in DEV
    }
  }
} catch (e) {
  // ignore
}
if (__DEV__) {
  // require lazily so production bundles are unaffected

  require('./src/utils/devDiagnostics');
}

const MainNavigator = () => <DrawerNavigator />;

import { useOfflineSync } from './src/hooks/useOfflineSync';
import { useAuth } from './src/hooks/useAuth';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  startForegroundSyncScheduler,
  stopForegroundSyncScheduler,
  startBackgroundFetch,
  stopBackgroundFetch,
} from './src/services/syncManager';
// Telemetry integrations removed
const AppContent = () => {
  const { user, loading } = useAuth();
  // provide user id to offline sync so it only runs when a user is present
  useOfflineSync(user?.id);

  // Telemetry integrations removed

  return (
    <NavigationContainer>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        <RootStack.Screen name="Splash" component={SplashScreen} />
        <RootStack.Screen name="Auth" component={AuthNavigator} />
        <RootStack.Screen name="Main" component={MainNavigator} />
      </RootStack.Navigator>
    </NavigationContainer>
  );
};

export default function App() {
  const [dbReady, setDbReady] = React.useState(false);
  const [dbInitError, setDbInitError] = React.useState<string | null>(null);
  const queryClient = React.useMemo(() => new QueryClient(), []);
  const { user } = useAuth();

  // Run DB migrations early on startup (best-effort). This helps ensure
  // the local tables are present before session or other DB operations
  // attempt to read/write them. Fail silently if migrations can't run.
  React.useEffect(() => {
    (async () => {
      try {
        const migrations = require('./src/db/migrations').default;
        if (migrations && typeof migrations.runMigrations === 'function') {
          await migrations.runMigrations();
        }
      } catch (e) {
        // ignore — migrations are best-effort here
      }
    })();
  }, []);

  // Identify device with Vexo when user logs in/out
  React.useEffect(() => {
    (async () => {
      try {
        await vexoService.identifyDevice(user?.id ?? null);
      } catch (e) {
        // ignore
      }
    })();
  }, [user]);

  // Initialize Vexo analytics only in non-DEV builds to avoid requiring native
  // modules in Expo Go which would log warnings.
  if (!__DEV__) {
    try {
      // Use dynamic require to avoid bundling/throwing during tests.
      const _vexo = require('vexo-analytics');
      const vexo = _vexo && (_vexo.vexo || _vexo.default || _vexo);
      // Prefer environment variable, then Expo config extra.
      const VEXO_KEY =
        process.env.VEXO_API_KEY ||
        (() => {
          try {
            const Constants = require('expo-constants');
            return (
              (Constants &&
                Constants.expoConfig &&
                Constants.expoConfig.extra &&
                Constants.expoConfig.extra.VEXO_API_KEY) ||
              null
            );
          } catch (e) {
            return null;
          }
        })();

      if (vexo && VEXO_KEY) {
        try {
          // vexo is a function exported directly by the package
          vexo(VEXO_KEY);
        } catch (e) {
          console.warn('Vexo init failed', e);
        }
      }
    } catch (e) {
      // If package isn't installed or native code missing, skip initialization silently.
    }
  }

  React.useEffect(() => {
    // If an update was pending (we marked it before applying), clear the flag now
    (async () => {
      try {
        const pending = await AsyncStorage.getItem('PENDING_UPDATE');
        if (pending) {
          // Successfully booted after an update — clear the pending flag
          await AsyncStorage.removeItem('PENDING_UPDATE');
        }
      } catch (e) {
        // ignore
      }
    })();

    const setup = async () => {
      const { init } = require('./src/db/localDb');
      let attempts = 0;
      const maxAttempts = 3;
      while (attempts < maxAttempts) {
        try {
          await init();
          setDbReady(true);
          setDbInitError(null);
          return;
        } catch (e: any) {
          attempts += 1;
          console.error('DB Init Error attempt', attempts, e);
          if (attempts >= maxAttempts) {
            setDbInitError(e && e.message ? String(e.message) : 'DB init failed');
            break;
          }
          // wait a bit and retry

          await new Promise((res) => setTimeout(res, 1000));
        }
      }
    };

    setup();
  }, []);

  // Start schedulers once DB is ready
  React.useEffect(() => {
    if (!dbReady) return;
    // Start foreground scheduler with default 15s interval
    try {
      startForegroundSyncScheduler(15000);
    } catch (e) {
      console.warn('Failed to start foreground scheduler', e);
    }

    // Attempt to start background fetch (safe no-op when library missing)
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
      } catch (e) {}
      try {
        stopBackgroundFetch();
      } catch (e) {}
    };
  }, [dbReady]);

  if (!dbReady) {
    // show minimal fallback while DB initializing or failed
    if (dbInitError) {
      const { View, Text, Button } = require('react-native');
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Text style={{ marginBottom: 12 }}>Database initialization failed:</Text>
          <Text style={{ marginBottom: 18, color: 'red' }}>{dbInitError}</Text>
          <Button
            title="Retry Init"
            onPress={() => {
              setDbInitError(null);
              setDbReady(false);
              // trigger effect by calling setup again via changing state
              // simplest: reload the app by requiring init again
              (async () => {
                try {
                  const { init } = require('./src/db/localDb');
                  await init();
                  setDbReady(true);
                  setDbInitError(null);
                } catch (e: any) {
                  setDbInitError(String(e && e.message));
                }
              })();
            }}
          />
        </View>
      );
    }
    // While DB is starting (no error yet), render a lightweight loading
    // UI instead of returning null so the emulator doesn't show a black screen.
    const { View, ActivityIndicator, Text } = require('react-native');
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
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <SafeAreaProvider>
          <AppContent />
        </SafeAreaProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

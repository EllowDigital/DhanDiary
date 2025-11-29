import 'react-native-get-random-values';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import SplashScreen from './src/screens/SplashScreen';
import LoginScreen from './src/screens/LoginScreen';
import { RootStackParamList, AuthStackParamList, MainStackParamList } from './src/types/navigation';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const MainStack = createNativeStackNavigator<MainStackParamList>();

const AuthNavigator = () => (
  <AuthStack.Navigator>
    <AuthStack.Screen name="Login" component={LoginScreen} />
    <AuthStack.Screen name="Register" component={require('./src/screens/RegisterScreen').default} />
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
      // eslint-disable-next-line @typescript-eslint/no-var-requires
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
import {
  startForegroundSyncScheduler,
  stopForegroundSyncScheduler,
  startBackgroundFetch,
  stopBackgroundFetch,
} from './src/services/syncManager';
let Sentry: any = null;
let LogRocket: any = null;
try {
  // Use dynamic require so missing native modules do not crash the bundle at module-evaluation time.
  // This keeps the app from failing to open if a native dependency isn't linked in a build.

  Sentry = require('@sentry/react-native');
  try {
    Sentry.init({
      dsn: 'https://34b47580512858b155c2c4bcc7c88996@o4510441099886592.ingest.us.sentry.io/4510441165553664',
      sendDefaultPii: true,
      enableLogs: true,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1,
      integrations: [
        // protect integrations which may not be present in every build
        ...(Sentry.mobileReplayIntegration ? [Sentry.mobileReplayIntegration()] : []),
        ...(Sentry.feedbackIntegration ? [Sentry.feedbackIntegration()] : []),
      ],
    });
  } catch (e) {
    // don't crash app if Sentry init fails

    console.warn('Sentry.init failed', e);
  }
} catch (e) {
  // missing Sentry package or require failed — avoid crashing the app

  console.warn('Sentry not available', e);
}

try {
  const _mod = require('@logrocket/react-native');
  LogRocket = _mod && _mod.default ? _mod.default : _mod;
} catch (e) {
  // ignore — LogRocket is optional
}
// Initialize LogRocket if configured. Set `LOGROCKET_APPID` in your local env (.env.local)
const LOGROCKET_APPID = process.env.LOGROCKET_APPID || '';
if (LogRocket && LOGROCKET_APPID) {
  try {
    if (typeof LogRocket.init === 'function') {
      LogRocket.init(LOGROCKET_APPID);
    } else {
      // Some builds may provide a different API shape; avoid crashing
      console.warn('LogRocket.init not available');
    }
  } catch (e) {
    // don't crash the app if LogRocket init fails

    console.warn('LogRocket init failed', e);
  }
}

const AppContent = () => {
  const { user, loading } = useAuth();
  // provide user id to offline sync so it only runs when a user is present
  useOfflineSync(user?.id);

  // Identify user in LogRocket when available so sessions can be searched by name/email
  React.useEffect(() => {
    if (!user) return;
    try {
      if (LogRocket && user.id && typeof LogRocket.identify === 'function') {
        LogRocket.identify(user.id, {
          name: user.name,
          email: user.email,
        });
      }
    } catch (e) {
      console.warn('LogRocket identify failed', e);
    }
  }, [user]);

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

export default Sentry.wrap(function App() {
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
});

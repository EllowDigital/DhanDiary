import 'react-native-get-random-values';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import SplashScreen from './src/screens/SplashScreen';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import PrivacyPolicyScreen from './src/screens/PrivacyPolicyScreen';
import TermsScreen from './src/screens/TermsScreen';
import EulaScreen from './src/screens/EulaScreen';
import { RootStackParamList, AuthStackParamList, MainStackParamList } from './src/types/navigation';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const MainStack = createNativeStackNavigator<MainStackParamList>();

const AuthNavigator = () => (
  <AuthStack.Navigator screenOptions={{ headerShown: false }}>
    <AuthStack.Screen name="Login" component={LoginScreen} />
    <AuthStack.Screen name="Register" component={RegisterScreen} />
    <AuthStack.Screen name="Terms" component={TermsScreen} />
    <AuthStack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
    <AuthStack.Screen name="Eula" component={EulaScreen} />
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
      export default function App() {
        const queryClient = React.useMemo(() => new QueryClient(), []);

        React.useEffect(() => {
          if (__DEV__) return;
          try {
            const _vexo = require('vexo-analytics');
            const vexo = _vexo && (_vexo.vexo || _vexo.default || _vexo);
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
                vexo(VEXO_KEY);
              } catch (e) {
                console.warn('Vexo init failed', e);
              }
            }
          } catch (e) {
            // If package isn't installed or native code missing, skip initialization silently.
          }
        }, []);

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
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AppContent />
        </ToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

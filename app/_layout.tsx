import 'react-native-get-random-values';
import React, { useEffect } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    View,
    ActivityIndicator,
    Text,
    Button,
} from 'react-native';

import { ToastProvider } from '../src/context/ToastContext';
import { useOfflineSync } from '../src/hooks/useOfflineSync';
import { useAuth } from '../src/hooks/useAuth';
import vexoService from '../src/services/vexo';

import {
    startForegroundSyncScheduler,
    stopForegroundSyncScheduler,
    startBackgroundFetch,
    stopBackgroundFetch,
} from '../src/services/syncManager';

// --- Initialization Logic ---

function AppContent() {
    const { user, loading } = useAuth();
    const segments = useSegments();
    const router = useRouter();

    // provide user id to offline sync so it only runs when a user is present
    useOfflineSync(user?.id);

    useEffect(() => {
        if (loading) return;

        const inAuthGroup = segments[0] === '(auth)';

        // If not logged in and not in (auth) group, redirect to login
        if (!user && !inAuthGroup) {
            router.replace('/(auth)/login');
        }
        // If logged in and in (auth) group, redirect to home
        else if (user && inAuthGroup) {
            router.replace('/(drawer)/(tabs)');
        }
    }, [user, loading, segments]);

    // Identify device with Vexo when user logs in/out
    useEffect(() => {
        (async () => {
            try {
                await vexoService.identifyDevice(user?.id ?? null);
            } catch (e) {
                // ignore
            }
        })();
    }, [user]);

    return <Slot />;
}

export default function RootLayout() {
    const [dbReady, setDbReady] = React.useState(false);
    const [dbInitError, setDbInitError] = React.useState<string | null>(null);
    const queryClient = React.useMemo(() => new QueryClient(), []);

    // Run DB migrations
    useEffect(() => {
        (async () => {
            try {
                const migrations = require('../src/db/migrations').default;
                if (migrations && typeof migrations.runMigrations === 'function') {
                    await migrations.runMigrations();
                }
            } catch (e) {
                // ignore
            }
        })();
    }, []);

    // Initialize Vexo
    if (!__DEV__) {
        try {
            const _vexo = require('vexo-analytics');
            const vexo = _vexo && (_vexo.vexo || _vexo.default || _vexo);
            const VEXO_KEY = process.env.VEXO_API_KEY || null; // Simplified for brevity

            if (vexo && VEXO_KEY) {
                try {
                    vexo(VEXO_KEY);
                } catch (e) {
                    console.warn('Vexo init failed', e);
                }
            }
        } catch (e) {
            // ignore
        }
    }

    // Check pending update
    useEffect(() => {
        (async () => {
            try {
                const pending = await AsyncStorage.getItem('PENDING_UPDATE');
                if (pending) {
                    await AsyncStorage.removeItem('PENDING_UPDATE');
                }
            } catch (e) {
                // ignore
            }
        })();

        const setup = async () => {
            const { init } = require('../src/db/localDb');
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
                    await new Promise((res) => setTimeout(res, 1000));
                }
            }
        };

        setup();
    }, []);

    // Start schedulers
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
            } catch (e) { }
            try {
                stopBackgroundFetch();
            } catch (e) { }
        };
    }, [dbReady]);

    if (!dbReady) {
        if (dbInitError) {
            return (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                    <Text style={{ marginBottom: 12 }}>Database initialization failed:</Text>
                    <Text style={{ marginBottom: 18, color: 'red' }}>{dbInitError}</Text>
                    <Button
                        title="Retry Init"
                        onPress={() => {
                            setDbInitError(null);
                            setDbReady(false);
                            (async () => {
                                try {
                                    const { init } = require('../src/db/localDb');
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

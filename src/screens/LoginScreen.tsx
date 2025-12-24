import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSignIn, useOAuth, useUser, useAuth } from '@clerk/clerk-expo';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { useNavigation } from '@react-navigation/native';
import { AppState, AppStateStatus } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { syncClerkUserToNeon, BridgeUser } from '../services/clerkUserSync';
import { saveSession } from '../db/session';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { warmNeonConnection } from '../services/auth';

// --- Configuration & Hooks ---

// Warm up browser for smoother OAuth transitions
WebBrowser.maybeCompleteAuthSession();

const useWarmUpBrowser = () => {
  useEffect(() => {
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);
};

// Debug helper for Auth Redirects (useful for troubleshooting deep links)
const usePrintAuthRedirects = () => {
  useEffect(() => {
    if (__DEV__) {
      try {
        const nativeUri = AuthSession.makeRedirectUri({ scheme: 'dhandiary' });
        console.log('[AuthRedirects] Scheme URI:', nativeUri);
      } catch (e) {
        console.warn('[AuthRedirects] Failed to compute URI', e);
      }
    }
  }, []);
};

// --- Component ---

const LoginScreen = () => {
  useWarmUpBrowser();
  usePrintAuthRedirects();

  const navigation = useNavigation<any>();
  const { signIn, setActive, isLoaded } = useSignIn();
  const { user: clerkUser, isLoaded: clerkLoaded } = useUser();
  const { isSignedIn } = useAuth();

  // OAuth Strategies
  const { startOAuthFlow: startGoogleFlow } = useOAuth({ strategy: 'oauth_google' });
  const { startOAuthFlow: startGithubFlow } = useOAuth({ strategy: 'oauth_github' });

  const isActiveRef = useRef(true);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      isActiveRef.current = next === 'active';
    });
    return () => sub.remove();
  }, []);

  // UI State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // --- Effects ---

  // 1. Pre-warm Neon DB connection (online-only)
  useEffect(() => {
    warmNeonConnection().catch(() => {});
  }, []);

  // 2. Handle Existing Session (Auto-Sync)
  useEffect(() => {
    if (!isSignedIn || !clerkLoaded || !clerkUser) return;

    const processExistingSession = async () => {
      try {
        const id = clerkUser.id;
        const email =
          clerkUser.primaryEmailAddress?.emailAddress || clerkUser.emailAddresses[0]?.emailAddress;

        if (id && email) {
          console.log('[LoginScreen] Detected existing session, syncing...');
          await handleSyncAndNavigate(id, email, clerkUser.fullName);
        } else {
          console.warn('[LoginScreen] Missing user details, navigating to Main safely');
          navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
        }
      } catch (e) {
        console.error('[LoginScreen] Session restoration failed', e);
        setSyncing(false); // ensure overlay is removed
      }
    };

    processExistingSession();
  }, [isSignedIn, clerkLoaded, clerkUser]);

  // --- Core Logic ---

  /**
   * Orchestrates the critical handover from Clerk -> Our Database.
   * This ensures the user is synced to Neon and a session is saved.
   */
  const handleSyncAndNavigate = async (
    userId: string,
    userEmail: string,
    userName?: string | null
  ) => {
    console.log(`[Login] initiating background sync for ${userEmail}`);

    // 1. Start bridge sync in background (do not block navigation)
    const bridgeTimeoutMs = 8000;
    const bridgePromise = Promise.race([
      syncClerkUserToNeon({
        id: userId,
        emailAddresses: [{ emailAddress: userEmail }],
        fullName: userName,
      }),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error('Bridge sync timed out')), bridgeTimeoutMs)
      ),
    ])
      .then(async (resolved: any) => {
        try {
          if (resolved && resolved.uuid) {
            await saveSession(
              resolved.uuid,
              resolved.name || userName || 'User',
              resolved.email || userEmail
            );
            console.log('[Login] bridge persisted Neon UUID to local DB', resolved.uuid);
          }
        } catch (e) {
          console.warn('[Login] persisting bridge result failed', e);
          try {
            await AsyncStorage.setItem(
              'FALLBACK_SESSION',
              JSON.stringify({
                id: resolved?.uuid || userId,
                name: resolved?.name || userName || 'User',
                email: resolved?.email || userEmail,
              })
            );
          } catch (e) {}
        }
      })
      .catch((e) => {
        console.warn('[Login] bridge background sync failed/timeout', e?.message || e);
      });

    // 2. Persist a temporary fallback session so the UI can continue.
    // Use a proper UUID (v4-like) instead of a human-readable fallback string
    // so it won't be accidentally used in UUID-typed DB columns.
    const genUuid = () => {
      const hex = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
      return `${hex()}${hex()}-${hex()}-${hex()}-${hex()}-${hex()}${hex()}${hex()}`;
    };
    const immediateId = genUuid();
    try {
      await Promise.race([
        saveSession(immediateId, userName || 'User', userEmail),
        new Promise((res) => setTimeout(() => res(null), 1500)),
      ]);
      console.log('[Login] fallback session saved (immediate)');
    } catch (e) {
      console.warn('[Login] immediate save failed, falling back to AsyncStorage', e);
      try {
        await AsyncStorage.setItem(
          'FALLBACK_SESSION',
          JSON.stringify({ id: immediateId, name: userName || 'User', email: userEmail })
        );
      } catch (e) {}
    }

    // 3. Navigate immediately so user can start using app; sync will continue in background.
    try {
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    } catch (e) {
      console.warn('[Login] navigation.reset failed', e);
    }

    // 4. Kick off initial background data sync (non-blocking)
    try {
      const { syncBothWays } = require('../services/syncManager');
      // run but don't await; handle errors
      syncBothWays().catch((err: any) =>
        console.warn('[Login] background initial sync failed', err)
      );
    } catch (e) {
      console.warn('[Login] failed to start background sync', e);
    }

    // Allow bridgePromise to finish and persist if possible (already started above)
    void bridgePromise;
  };

  // --- Handlers ---

  const onSignInPress = async () => {
    if (!isLoaded) return;
    if (!email || !password) return Alert.alert('Error', 'Please enter email and password');

    setLoading(true);
    try {
      const result = await signIn.create({ identifier: email, password });

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        // The useEffect hook will detect the new session and trigger handleSyncAndNavigate
        // We return here to avoid race conditions
        return;
      } else {
        Alert.alert('Verification Required', 'Please check your email for verification steps.');
        setLoading(false);
      }
    } catch (err: any) {
      console.error('[Login] Error:', err);
      const msg = err.errors?.[0]?.message || err.message || 'Login failed';

      if (err.errors?.[0]?.code === 'strategy_for_user_invalid') {
        Alert.alert(
          'Login Failed',
          'This account uses Social Login (Google/GitHub). Please use the buttons below.'
        );
      } else {
        Alert.alert('Login Failed', msg);
      }
      setLoading(false);
    }
  };

  const onSocialLogin = async (strategy: 'google' | 'github') => {
    if (!isLoaded || loading) return;
    // Ensure app is in foreground; opening browser from background can fail on Android
    if (!isActiveRef.current) {
      console.warn('[Login] App not active; skipping social login start');
      return;
    }

    setLoading(true);

    try {
      const startFlow = strategy === 'google' ? startGoogleFlow : startGithubFlow;

      const {
        createdSessionId,
        setActive: setSession,
        signIn: signInObj,
        signUp: signUpObj,
      } = await startFlow({
        redirectUrl: 'dhandiary://oauth-callback',
      });

      if (createdSessionId) {
        await setSession!({ session: createdSessionId });

        // Optimistic Sync Trigger
        // Try to extract user info immediately to speed up the UX
        const userData = signInObj?.userData || signUpObj;
        const uid = (signInObj as any)?.createdUserId || (signUpObj as any)?.createdUserId;
        const uEmail = (userData as any)?.identifier || (userData as any)?.emailAddress;

        // If we can't extract it, the useEffect hook will catch it anyway.
        // But if we can, we start sync sooner.
        if (uid && uEmail) {
          // Let the useEffect handle it to be safe and consistent
        }
      } else {
        // Flow cancelled or incomplete
        setLoading(false);
      }
    } catch (err: any) {
      console.log('OAuth Error:', err);
      // Don't alert if user just cancelled or if app not active
      const shouldAlert = isActiveRef.current && !err.message?.includes('cancelled');
      if (shouldAlert) {
        try {
          Alert.alert('Social Login Failed', 'Could not complete login. Please try again.');
        } catch (e) {
          console.warn('Failed to show alert (app may be backgrounded)', e);
        }
      }
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container]}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <LinearGradient colors={['#ffffff', '#f1f5f9']} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 20}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Logo Section */}
            <View style={styles.logoSection}>
              <View style={styles.logoContainer}>
                <Image
                  source={require('../../assets/splash-icon.png')}
                  style={styles.logo}
                  resizeMode="contain"
                />
              </View>
              <Text style={styles.appName}>DhanDiary</Text>
              <Text style={styles.tagline}>Finance, Simplified</Text>
            </View>

            {/* Login Card */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Welcome Back</Text>

              <View style={styles.inputContainer}>
                <Ionicons name="mail-outline" size={20} color="#64748b" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Email Address"
                  placeholderTextColor="#94a3b8"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              </View>

              <View style={styles.inputContainer}>
                <Ionicons
                  name="lock-closed-outline"
                  size={20}
                  color="#64748b"
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Password"
                  placeholderTextColor="#94a3b8"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeBtn}
                >
                  <Ionicons name={showPassword ? 'eye' : 'eye-off'} size={20} color="#64748b" />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.primaryBtn, loading && styles.disabledBtn]}
                onPress={onSignInPress}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Log In</Text>
                )}
              </TouchableOpacity>

              {/* Divider */}
              <View style={styles.dividerContainer}>
                <View style={styles.line} />
                <Text style={styles.dividerText}>OR CONTINUE WITH</Text>
                <View style={styles.line} />
              </View>

              {/* Social Buttons */}
              <View style={styles.socialRow}>
                <TouchableOpacity style={styles.socialBtn} onPress={() => onSocialLogin('google')}>
                  <FontAwesome name="google" size={24} color="#DB4437" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.socialBtn} onPress={() => onSocialLogin('github')}>
                  <FontAwesome name="github" size={24} color="#181717" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Footer */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>Don't have an account?</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Register')}>
                <Text style={styles.linkText}>Sign Up</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Sync Overlay */}
      {syncing && (
        <View style={styles.overlay}>
          <View style={styles.syncBox}>
            <ActivityIndicator size="large" color="#3b82f6" />
            <Text style={styles.syncText}>Syncing your vault...</Text>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
    paddingBottom: 40,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoContainer: {
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    marginBottom: 16,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 20,
  },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  tagline: {
    fontSize: 15,
    color: '#64748b',
    fontWeight: '500',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(241, 245, 249, 1)',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 20,
    textAlign: 'center',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16,
    paddingHorizontal: 14,
    height: 54,
  },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, color: '#0f172a', fontSize: 16, height: '100%' },
  eyeBtn: { padding: 8 },
  primaryBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 14,
    height: 54,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  disabledBtn: { opacity: 0.7 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  line: { flex: 1, height: 1, backgroundColor: '#e2e8f0' },
  dividerText: {
    color: '#94a3b8',
    paddingHorizontal: 12,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  socialRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  socialBtn: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  footerText: { color: '#64748b', fontSize: 14 },
  linkText: {
    color: '#2563eb',
    fontWeight: '700',
    fontSize: 14,
    marginLeft: 6,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  syncBox: {
    backgroundColor: '#fff',
    padding: 32,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  syncText: {
    color: '#0f172a',
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
  },
});

export default LoginScreen;

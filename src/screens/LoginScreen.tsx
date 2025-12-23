import React, { useState, useCallback } from 'react';
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
import * as WebBrowser from 'expo-web-browser'; // Ensure you have this installed
import * as AuthSession from 'expo-auth-session';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';

import { syncClerkUserToNeon } from '../services/clerkUserSync';
import { saveSession, init as initLocalDb } from '../db/localDb';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { warmNeonConnection } from '../services/auth';

// Warm up browser for OAuth
WebBrowser.maybeCompleteAuthSession();

const useWarmUpBrowser = () => {
  React.useEffect(() => {
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);
};

// Print redirect URIs for debugging so you can copy them into Clerk (native-only app)
const usePrintAuthRedirects = () => {
  React.useEffect(() => {
    try {
      // For standalone / dev-client builds we MUST use a native scheme.
      // Compute the native redirect URI using our app scheme.
      const nativeUri = AuthSession.makeRedirectUri(({ scheme: 'dhandiary' } as any));
      const getUri = AuthSession.getRedirectUrl();
      console.log('[AuthRedirects] makeRedirectUri(native, scheme=dhandiary)=', nativeUri);
      console.log('[AuthRedirects] getRedirectUrl()=', getUri);
      console.log(
        '[AuthRedirects] NOTE: Do NOT use auth.expo.io or exp:// URLs in standalone APKs'
      );
    } catch (e) {
      console.warn('[AuthRedirects] failed to compute native redirect URI', e);
    }
  }, []);
};

const LoginScreen = () => {
  useWarmUpBrowser();
  usePrintAuthRedirects();
  const navigation = useNavigation<any>();
  const { signIn, setActive, isLoaded } = useSignIn();

  // OAuth Hooks
  const { startOAuthFlow: startGoogleFlow } = useOAuth({ strategy: 'oauth_google' });
  const { startOAuthFlow: startGithubFlow } = useOAuth({ strategy: 'oauth_github' });

  // Clerk session hooks to detect existing sign-in state
  const { user: clerkUser, isLoaded: clerkLoaded } = useUser();
  const { isSignedIn } = useAuth();

  // State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Pre-warm DB
  React.useEffect(() => {
    warmNeonConnection().catch(() => {});
  }, []);

  // If Clerk already has a signed-in session, use it to sync and navigate immediately
  React.useEffect(() => {
    if (!isSignedIn || !clerkLoaded || !clerkUser) return;

    (async () => {
      try {
        const id = (clerkUser as any).id || (clerkUser as any).userId || null;
        let email: string | null = null;
        try {
          if (
            (clerkUser as any).primaryEmailAddress &&
            (clerkUser as any).primaryEmailAddress.emailAddress
          ) {
            email = (clerkUser as any).primaryEmailAddress.emailAddress;
          } else if (
            (clerkUser as any).emailAddresses &&
            (clerkUser as any).emailAddresses.length
          ) {
            email = (clerkUser as any).emailAddresses[0]?.emailAddress || null;
          }
        } catch (e) {
          // ignore
        }

        if (id && email) {
          console.log('[LoginScreen] detected existing Clerk session, syncing user', email);
          await handleSyncAndNavigate(id, email, (clerkUser as any).fullName || null);
        } else {
          console.warn(
            '[LoginScreen] Clerk session exists but missing id/email, navigating to Main'
          );
          const rootNav: any = (navigation as any).getParent
            ? (navigation as any).getParent()
            : null;
          try {
            // Use navigate so React Navigation resolves the correct parent navigator
            navigation.navigate('Main' as any);
          } catch (e) {
            console.warn('[LoginScreen] navigation.navigate(Main) failed', e);
          }
        }
      } catch (e) {
        console.warn('[LoginScreen] error handling existing Clerk session', e);
      }
    })();
  }, [isSignedIn, clerkLoaded, clerkUser]);

  // --- HANDLERS ---

  const handleSyncAndNavigate = async (
    userId: string,
    userEmail: string,
    userName?: string | null
  ) => {
    // Attempt to sync Clerk user to Neon and persist the Neon uuid BEFORE navigating.
    // Use timeouts so we don't block forever on slow networks.
    console.log('[Login] initiating bridge sync for', userEmail);
    setSyncing(true);

    const bridgeTimeoutMs = 10000; // wait up to 10s for bridge
    let resolvedBridgeUser: any = null;
    try {
      // Ensure local DB is initialized before attempting to save session or run sync
      try {
        await initLocalDb();
      } catch (e) {
        console.warn('[Login] initLocalDb failed (continuing):', e);
      }
      resolvedBridgeUser = await Promise.race([
        syncClerkUserToNeon({
          id: userId,
          emailAddresses: [{ emailAddress: userEmail }],
          fullName: userName,
        }),
        new Promise((_, rej) =>
          setTimeout(() => rej(new Error('Bridge sync timed out')), bridgeTimeoutMs)
        ),
      ] as any);
      console.log('[Login] bridge sync completed', resolvedBridgeUser?.uuid || '<no-uuid>');
    } catch (e) {
      console.warn('[Login] bridge sync failed or timed out', (e as any)?.message || String(e));
      resolvedBridgeUser = null;
    }

    // Persist session: prefer Neon uuid from bridge if available, otherwise use Clerk id as fallback.
    const targetId = resolvedBridgeUser?.uuid || userId || `local-${Date.now()}`;
    try {
      // Try to persist to sqlite; give migrations a bit longer to complete during login (5s)
      const savePromise = saveSession(
        targetId,
        userName || 'User',
        resolvedBridgeUser?.email || userEmail
      );
      const saved = await Promise.race([
        savePromise.then(() => true),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5000)),
      ]);
      if (!saved) {
        // Fallback to AsyncStorage so app can continue and later migrate into sqlite
        try {
          await AsyncStorage.setItem(
            'FALLBACK_SESSION',
            JSON.stringify({
              id: targetId,
              name: userName || 'User',
              email: resolvedBridgeUser?.email || userEmail,
            })
          );
          console.log('[Login] saved fallback session to AsyncStorage', targetId);
        } catch (e) {
          console.warn('[Login] saving fallback session to AsyncStorage failed', e);
        }
      } else {
        console.log('[Login] saved session', targetId);
      }
    } catch (e) {
      console.warn('[Login] saveSession failed', e);
    }

    // Kick off an initial sync (best-effort) before navigating so the app has
    // recent data available. Don't block more than a few seconds.
    try {
      const { syncBothWays } = require('../services/syncManager');
      await Promise.race([
        syncBothWays(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Initial sync timed out')), 4000)),
      ]).catch((e) => {
        console.warn('[Login] initial sync failed or timed out', (e as any)?.message || String(e));
      });
    } catch (e) {
      console.warn('[Login] failed to start initial sync', e);
    }

    setSyncing(false);
    try {
      console.log('[Login] navigating to Main');
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    } catch (e) {
      console.warn('[Login] navigation.reset failed', e);
    }
  };

  const onSignInPress = async () => {
    if (!isLoaded) return;
    if (!email || !password) return Alert.alert('Error', 'Please enter email and password');

    setLoading(true);
    try {
      const completeSignIn = await signIn.create({
        identifier: email,
        password,
      });

      // This is for simple email/password.
      // If 2FA is enabled, you'd need to handle 'needs_second_factor' status.
      if (completeSignIn.status === 'complete') {
        await setActive({ session: completeSignIn.createdSessionId });

        // We can't easily get the user object synchronously from signIn result
        // effectively without a fetch, but let's pass what we know.
        // Actually, we can get it from the session user later,
        // but let's rely on the bridged info we have.
        const uid = (completeSignIn as any).createdUserId;
        await handleSyncAndNavigate(uid, email, 'User');
      } else {
        Alert.alert('Login Info', 'Further verification required. Please check your email.');
      }
    } catch (err: any) {
      console.error('[Login] signIn.create error', err);
      // Clerk returns structured errors like { clerkError: true, code, errors: [...] }
      const clerkCode = err?.code || (err?.errors && err.errors[0]?.code);
      const clerkMessage =
        err?.message || (err?.errors && err.errors[0]?.message) || 'Unexpected error during login';

      if (clerkCode === 'strategy_for_user_invalid') {
        Alert.alert(
          'Login Failed',
          'This account was created with a social provider and cannot sign in with a password. Please use Sign in with GitHub / Google or reset your password.'
        );
      } else {
        Alert.alert('Login Failed', clerkMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const onSocialLogin = async (strategy: 'google' | 'github') => {
    if (!isLoaded) return;
    setLoading(true);
    try {
      const startFlow = strategy === 'google' ? startGoogleFlow : startGithubFlow;
      console.log('Starting OAuth flow for', strategy);

      let flowResult: any = null;
      try {
        // If Clerk already has a session, don't start a new flow — use existing
        if (isSignedIn) {
          console.log('[LoginScreen] startOAuthFlow skipped: already signed in');
          // Let the existing-session effect handle sync/navigation
          setLoading(false);
          return;
        }

        // Explicitly provide the native redirect URL for standalone / dev-client builds.
        // Use the app scheme `dhandiary://oauth-callback` and do NOT use the Expo proxy.
        flowResult = await startFlow({ redirectUrl: 'dhandiary://oauth-callback' });
      } catch (e: any) {
        console.error('startFlow threw', e);
        if (e && (e as any).stack) console.error((e as any).stack);

        const text = String((e && (e.message || e)) || '');
        if (
          text.toLowerCase().includes('already signed in') ||
          text.toLowerCase().includes("you're already signed in")
        ) {
          console.log(
            '[LoginScreen] startFlow error: already signed in — deferring to existing session handler'
          );
          setLoading(false);
          return;
        }

        throw e;
      }
      console.log('OAuth startFlow result:', flowResult);

      // If Clerk returns a URL, open it in the browser (fallback)
      if (flowResult && typeof flowResult.url === 'string') {
        try {
          await WebBrowser.openBrowserAsync(flowResult.url);
        } catch (e) {
          console.warn('Failed to open OAuth URL in browser', e);
        }
      }

      const { createdSessionId, signIn, signUp, setActive } = flowResult || {};

      if (createdSessionId) {
        try {
          await setActive!({ session: createdSessionId });
        } catch (e) {
          console.warn('setActive failed after OAuth', e);
        }

        // For OAuth, we might need to fetch the user details if they aren't readily available
        // Clerk usually populates basic info.
        // We'll optimistically try to sync.
        // Actually, for OAuth, the email might be in signIn.identifier or we rely on syncClerkUserToNeon to fetch/upsert?
        // Note: `syncClerkUserToNeon` takes {id, email, name}.
        // The `useUser()` hook would give us this, but handleSyncAndNavigate is async.
        // A better approach for OAuth implies we are logged in.
        // The App wrapper `ClerkProvider` -> `useAuth` user object will populate.
        // BUT we want to force the Neon sync *before* navigating.

        // We can use the return values from startFlow carefully.
        // If it was a sign up, `signUp` is populated. If sign in, `signIn`.
        const userObj = signIn || signUp || {};
        const uid = (userObj as any)?.createdUserId || (userObj as any)?.userData?.id || null;
        // OAuth might return email in a different spot depending on provider?
        // Let's assume the user is valid.
        // A safer bet: The `syncbothWays` or `App.tsx` logic also handles checks,
        // but here we want to ensure the DB row exists.

        // We can't easily get the email *address* string here without making a call if it's not in the response.
        // However, `syncClerkUserToNeon` REQUIRES email.
        // Let's defer strict syncing to `App.tsx` or `useUser` hook effect
        // OR try to extract it from the object if possible.
        // `signIn.userData.identifier` usually holds it.

        // Try multiple places for an email value safely
        let bestEmail: string | null = null;
        try {
          if (signIn && (signIn as any).userData && (signIn as any).userData.identifier) {
            bestEmail = (signIn as any).userData.identifier;
          } else if (signUp && (signUp as any).emailAddress) {
            bestEmail = (signUp as any).emailAddress;
          } else if ((userObj as any).emailAddresses && (userObj as any).emailAddresses.length) {
            bestEmail = (userObj as any).emailAddresses[0]?.emailAddress || null;
          }
        } catch (e) {
          console.warn('Error extracting email from OAuth result', e);
          bestEmail = null;
        }

        if (uid && bestEmail) {
          await handleSyncAndNavigate(uid, bestEmail, (userObj as any)?.firstName || null);
        } else {
          console.warn('OAuth flow returned incomplete user data, uid=', uid, 'email=', bestEmail);
          const rootNav: any = (navigation as any).getParent
            ? (navigation as any).getParent()
            : null;
          try {
            navigation.navigate('Auth' as any);
          } catch (e) {
            console.warn('[LoginScreen] navigation.navigate(Auth) failed', e);
          }
        }
      } else {
        // Flow did not immediately create a session — let background hooks handle it,
        // but inform the user we started the flow.
        console.log('OAuth flow started but no immediate session; waiting for Clerk update');
        setLoading(false);
      }
    } catch (err: any) {
      console.error('OAuth Error', err);
      const msg =
        (err && (err.message || (typeof err === 'string' ? err : null))) ||
        String(err) ||
        'Unexpected error during social login';
      Alert.alert('Social Login Failed', msg);
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: '#fff' }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <LinearGradient colors={['#ffffff', '#f8fafc']} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 100}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            {/* Header / Logo */}
            <View style={styles.logoSection}>
              <Image
                source={require('../../assets/splash-icon.png')}
                style={styles.logo}
                resizeMode="contain"
              />
              <Text style={styles.appName}>DhanDiary</Text>
              <Text style={styles.tagline}>Finance, Simplified</Text>
            </View>

            {/* Login Form */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Welcome Back</Text>

              <View style={styles.inputContainer}>
                <Ionicons name="mail-outline" size={20} color="#64748b" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Email Address"
                  placeholderTextColor="#64748b"
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
                  placeholderTextColor="#64748b"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword((s) => !s)}
                  style={styles.eyeBtn}
                  accessibilityLabel="Toggle password visibility"
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

              {/* Social Login Divider */}
              <View style={styles.dividerContainer}>
                <View style={styles.line} />
                <Text style={styles.dividerText}>OR CONTINUE WITH</Text>
                <View style={styles.line} />
              </View>

              <View style={styles.socialRow}>
                <TouchableOpacity style={styles.socialBtn} onPress={() => onSocialLogin('google')}>
                  <FontAwesome name="google" size={22} color="#DB4437" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.socialBtn} onPress={() => onSocialLogin('github')}>
                  <FontAwesome name="github" size={22} color="#111111" />
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

      {/* Syncing Overlay */}
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

export default LoginScreen;

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
    minHeight: '100%',
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logo: {
    width: 80,
    height: 80,
    marginBottom: 16,
    borderRadius: 20,
  },
  appName: {
    fontSize: 32,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 4,
  },
  tagline: {
    fontSize: 16,
    color: '#64748b',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.04)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 24,
    textAlign: 'center',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
    marginBottom: 12,
    paddingHorizontal: 12,
    height: 52,
  },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, color: '#0f172a', fontSize: 16 },
  eyeBtn: {
    marginLeft: 8,
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  disabledBtn: { opacity: 0.7 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 24,
  },
  line: { flex: 1, height: 1, backgroundColor: '#e6eef8' },
  dividerText: {
    color: '#94a3b8',
    paddingHorizontal: 12,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
  },
  socialRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  socialBtn: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 32,
  },
  footerText: { color: '#64748b', fontSize: 14 },
  linkText: {
    color: '#2563eb',
    fontWeight: '600',
    fontSize: 14,
    marginLeft: 6,
  },

  // Overlay
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  syncBox: {
    backgroundColor: '#1e293b',
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3b82f6',
  },
  syncText: {
    color: '#fff',
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
  },
});

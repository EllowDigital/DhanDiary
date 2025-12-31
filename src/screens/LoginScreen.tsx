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
  AppState,
  AppStateStatus,
  Dimensions,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { subscribeBanner, isBannerVisible } from '../utils/bannerState';
import { useSignIn, useOAuth, useUser, useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import NetInfo from '@react-native-community/netinfo';
import OfflineNotice from '../components/OfflineNotice';

// --- CUSTOM IMPORTS ---
// Ensure these paths match your project structure
import { syncClerkUserToNeon } from '../services/clerkUserSync';
import { saveSession } from '../db/session';
import { warmNeonConnection } from '../services/auth';
import { colors } from '../utils/design';

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

const { width, height } = Dimensions.get('window');

const LoginScreen = () => {
  useWarmUpBrowser();

  const navigation = useNavigation<any>();
  const { signIn, setActive, isLoaded } = useSignIn();
  const { user: clerkUser, isLoaded: clerkLoaded } = useUser();
  const { isSignedIn } = useAuth();

  // OAuth Strategies
  const { startOAuthFlow: startGoogleFlow } = useOAuth({ strategy: 'oauth_google' });
  const { startOAuthFlow: startGithubFlow } = useOAuth({ strategy: 'oauth_github' });

  // App State Management (for Android background handling)
  const isActiveRef = useRef(true);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      isActiveRef.current = next === 'active';
    });
    return () => sub.remove();
  }, []);

  // --- STATE ---
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [offlineVisible, setOfflineVisible] = useState(false);
  const [offlineRetrying, setOfflineRetrying] = useState(false);
  const [offlineAttemptsLeft, setOfflineAttemptsLeft] = useState<number | undefined>(undefined);

  // --- ANIMATIONS ---
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    // Entrance Animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        easing: Easing.out(Easing.exp),
        useNativeDriver: true,
      }),
    ]).start();

    // Pre-warm DB connection
    warmNeonConnection().catch(() => {});
  }, []);

  const [bannerVisible, setBannerVisible] = React.useState<boolean>(false);
  React.useEffect(() => {
    setBannerVisible(isBannerVisible());
    const unsub = subscribeBanner((v: boolean) => setBannerVisible(v));
    return () => {
      if (unsub) unsub();
    };
  }, []);

  // --- AUTO-SYNC LOGIC ---
  useEffect(() => {
    if (!isSignedIn || !clerkLoaded || !clerkUser) return;

    const processSession = async () => {
      setSyncing(true);
      try {
        const id = clerkUser.id;
        const userEmail = clerkUser.primaryEmailAddress?.emailAddress || '';
        const fullName = clerkUser.fullName;

        if (id && userEmail) {
          await handleSyncAndNavigate(id, userEmail, fullName);
        } else {
          navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
        }
      } catch (e) {
        console.error('Session restore failed', e);
        setSyncing(false);
      }
    };

    processSession();
  }, [isSignedIn, clerkLoaded, clerkUser]);

  // --- CORE HANDLERS ---

  const handleSyncAndNavigate = async (
    userId: string,
    userEmail: string,
    userName?: string | null
  ) => {
    try {
      await saveSession(userId, userName || 'User', userEmail);
    } catch (e) {
      console.warn('Local session save failed', e);
    }

    const syncPromise = syncClerkUserToNeon({
      id: userId,
      emailAddresses: [{ emailAddress: userEmail }],
      fullName: userName,
    }).catch((err) => console.warn('Background sync failed', err));

    setSyncing(false);
    setLoading(false);
    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    await syncPromise;
  };

  const offlineManualRetry = async () => {
    setOfflineRetrying(true);
    setOfflineAttemptsLeft((v) => (typeof v === 'number' ? Math.max(0, v - 1) : undefined));
    try {
      const net = await NetInfo.fetch();
      if (net.isConnected) {
        setOfflineVisible(false);
        setOfflineRetrying(false);
        setLoading(true);
        try {
          if (!signIn) {
            setLoading(false);
            return;
          }
          const result = await signIn.create({ identifier: email, password });
          if (result.status === 'complete') {
            await setActive({ session: result.createdSessionId });
          } else if (
            result.status === 'needs_first_factor' ||
            result.status === 'needs_second_factor'
          ) {
            navigation.navigate('VerifyEmail', { email, mode: 'signin' });
          } else {
            Alert.alert(
              'Verification Required',
              `Status: ${result.status}. Please check your email.`
            );
            setLoading(false);
          }
        } catch (err: any) {
          const msg = err.errors?.[0]?.message || 'Invalid credentials.';
          try {
            const net = await NetInfo.fetch();
            if (!net.isConnected) {
              setOfflineAttemptsLeft(3);
              setOfflineVisible(true);
              setLoading(false);
              return false;
            }
          } catch (e) {}
          Alert.alert('Login Failed', msg);
          setLoading(false);
        }
      }
    } catch (e) {
      setOfflineRetrying(false);
    }
  };

  const onSignInPress = async () => {
    if (!isLoaded) return;
    if (!email || !password)
      return Alert.alert('Missing Info', 'Please enter both email and password.');

    setLoading(true);

    const MAX_ATTEMPTS = 3;

    const doSignIn = async () => {
      try {
        if (!signIn) {
          setLoading(false);
          return false;
        }
        const result = await signIn.create({ identifier: email, password });

        if (result.status === 'complete') {
          await setActive({ session: result.createdSessionId });
          return true;
        }

        if (result.status === 'needs_first_factor' || result.status === 'needs_second_factor') {
          navigation.navigate('VerifyEmail', { email, mode: 'signin' });
          setLoading(false);
          return true;
        }

        Alert.alert('Verification Required', `Status: ${result.status}. Please check your email.`);
        setLoading(false);
        return false;
      } catch (err: any) {
        const msg = err.errors?.[0]?.message || 'Invalid credentials.';
        const code = err.errors?.[0]?.code;
        try {
          const net = await NetInfo.fetch();
          if (!net.isConnected) {
            setOfflineAttemptsLeft(3);
            setOfflineVisible(true);
            setLoading(false);
            return false;
          }
        } catch (e) {}

        if (code === 'strategy_for_user_invalid') {
          Alert.alert(
            'Wrong Method',
            'This email uses social login. Please click the Google or GitHub button below.'
          );
        } else if (code === 'form_identifier_not_found') {
          Alert.alert(
            'Account Not Found',
            'No account found with this email. Please create an account.'
          );
        } else {
          Alert.alert('Login Failed', msg);
        }
        setLoading(false);
        return false;
      }
    };

    try {
      const net = await NetInfo.fetch();
      if (net.isConnected) {
        await doSignIn();
        return;
      }
    } catch (e) {
      // ignore net check error
    }

    // Offline: show OfflineNotice and attempt exponential backoff retries
    setOfflineVisible(true);
    setOfflineRetrying(true);
    setOfflineAttemptsLeft(MAX_ATTEMPTS);

    let attemptsLeft = MAX_ATTEMPTS;
    while (attemptsLeft > 0) {
      const waitMs = Math.pow(2, MAX_ATTEMPTS - attemptsLeft) * 1000; // 1s,2s,4s
      await new Promise((r) => setTimeout(r, waitMs));
      try {
        const net = await NetInfo.fetch();
        if (net.isConnected) {
          setOfflineVisible(false);
          setOfflineRetrying(false);
          await doSignIn();
          return;
        }
      } catch (e) {
        // continue
      }
      attemptsLeft -= 1;
      setOfflineAttemptsLeft(attemptsLeft);
    }

    // exhausted
    setOfflineRetrying(false);
    setLoading(false);
  };

  const onSocialLogin = async (strategy: 'google' | 'github') => {
    if (!isLoaded || loading) return;
    if (Platform.OS === 'android' && !isActiveRef.current) return;

    setLoading(true);
    try {
      const startFlow = strategy === 'google' ? startGoogleFlow : startGithubFlow;
      const { createdSessionId, setActive: setSession } = await startFlow({
        redirectUrl: AuthSession.makeRedirectUri({ path: 'oauth-callback' }),
      });

      if (createdSessionId && setSession) {
        await setSession({ session: createdSessionId });
      } else {
        setLoading(false);
      }
    } catch (err: any) {
      if (!err.message?.includes('cancelled')) {
        Alert.alert('Social Login Failed', 'Please try again.');
      }
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      {/* Background Gradient */}
      <LinearGradient
        colors={['#E0F2FE', '#F0F9FF', '#FFFFFF']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      <SafeAreaView
        style={{ flex: 1 }}
        edges={bannerVisible ? (['left', 'right'] as any) : (['top', 'left', 'right'] as any)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Top Brand Section */}
            <Animated.View style={[styles.brandSection, { opacity: fadeAnim }]}>
              <View style={styles.logoCircle}>
                <Image
                  source={require('../../assets/splash-icon.png')}
                  style={styles.logo}
                  resizeMode="contain"
                />
              </View>
              <Text style={styles.brandTitle}>DhanDiary</Text>
              <Text style={styles.brandSubtitle}>Master your finances</Text>
            </Animated.View>

            {/* Bottom Sheet Form */}
            <Animated.View
              style={[
                styles.formSheet,
                {
                  opacity: fadeAnim,
                  transform: [{ translateY: slideAnim }],
                },
              ]}
            >
              <Text style={styles.welcomeText}>Welcome Back!</Text>
              <Text style={styles.promptText}>Please sign in to continue</Text>

              {/* Inputs */}
              <View style={styles.inputGroup}>
                <View style={styles.inputContainer}>
                  <Ionicons
                    name="mail"
                    size={20}
                    color={colors.muted || '#94A3B8'}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Email Address"
                    placeholderTextColor="#94A3B8"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                </View>

                <View style={styles.inputContainer}>
                  <Ionicons
                    name="lock-closed"
                    size={20}
                    color={colors.muted || '#94A3B8'}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Password"
                    placeholderTextColor="#94A3B8"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    style={styles.eyeBtn}
                  >
                    <Ionicons name={showPassword ? 'eye' : 'eye-off'} size={20} color="#94A3B8" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Login Button */}
              <TouchableOpacity
                style={[styles.primaryBtn, loading && styles.disabledBtn]}
                onPress={onSignInPress}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Sign In</Text>
                )}
              </TouchableOpacity>

              {/* Forgot Password Link - ADDED HERE */}
              <TouchableOpacity
                style={styles.forgotPasswordContainer}
                onPress={() => navigation.navigate('ForgotPassword', { email })}
              >
                <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
              </TouchableOpacity>

              {/* Divider */}
              <View style={styles.dividerContainer}>
                <View style={styles.line} />
                <Text style={styles.dividerText}>or continue with</Text>
                <View style={styles.line} />
              </View>

              {/* Social Buttons */}
              <View style={styles.socialRow}>
                <TouchableOpacity style={styles.socialBtn} onPress={() => onSocialLogin('google')}>
                  <Image
                    source={{ uri: 'https://cdn-icons-png.flaticon.com/512/300/300221.png' }}
                    style={styles.socialIcon}
                  />
                  <Text style={styles.socialBtnText}>Google</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.socialBtn} onPress={() => onSocialLogin('github')}>
                  <Image
                    source={{ uri: 'https://cdn-icons-png.flaticon.com/512/25/25231.png' }}
                    style={styles.socialIcon}
                  />
                  <Text style={styles.socialBtnText}>GitHub</Text>
                </TouchableOpacity>
              </View>

              {/* Footer */}
              <View style={styles.footer}>
                <Text style={styles.footerText}>New user? </Text>
                <TouchableOpacity onPress={() => navigation.navigate('Register')}>
                  <Text style={styles.linkText}>Create Account</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Offline Notice */}
      <OfflineNotice
        visible={offlineVisible}
        retrying={offlineRetrying}
        attemptsLeft={offlineAttemptsLeft}
        onRetry={offlineManualRetry}
        onClose={() => {
          setOfflineVisible(false);
          setOfflineRetrying(false);
          setLoading(false);
        }}
      />

      {/* Sync Overlay */}
      {syncing && (
        <View style={styles.overlay}>
          <View style={styles.syncBox}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.syncText}>Syncing your vault...</Text>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
  },

  /* BRAND SECTION */
  brandSection: {
    alignItems: 'center',
    marginTop: height * 0.08,
    marginBottom: 40,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    marginBottom: 16,
    elevation: 10,
  },
  logo: {
    width: 50,
    height: 50,
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  brandSubtitle: {
    fontSize: 16,
    color: '#64748B',
    marginTop: 4,
    fontWeight: '500',
  },

  /* FORM SHEET */
  formSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 20,
    flex: 1,
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  promptText: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 24,
  },

  /* INPUTS */
  inputGroup: {
    gap: 16,
    marginBottom: 24,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    height: 56,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    height: '100%',
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '500',
  },
  eyeBtn: {
    padding: 8,
  },

  /* BUTTONS */
  primaryBtn: {
    backgroundColor: '#2563EB',
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  disabledBtn: {
    opacity: 0.7,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  /* FORGOT PASSWORD */
  forgotPasswordContainer: {
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  forgotPasswordText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '600',
  },

  /* DIVIDER */
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  dividerText: {
    marginHorizontal: 16,
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },

  /* SOCIAL */
  socialRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 32,
  },
  socialBtn: {
    flex: 1,
    flexDirection: 'row',
    height: 50,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  socialIcon: {
    width: 20,
    height: 20,
    marginRight: 8,
  },
  socialBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
  },

  /* FOOTER */
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: {
    color: '#64748B',
    fontSize: 14,
  },
  linkText: {
    color: '#2563EB',
    fontWeight: '700',
    fontSize: 14,
  },

  /* OVERLAY */
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  syncBox: {
    backgroundColor: '#fff',
    padding: 32,
    borderRadius: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 10,
  },
  syncText: {
    color: '#0F172A',
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
  },
});

export default LoginScreen;

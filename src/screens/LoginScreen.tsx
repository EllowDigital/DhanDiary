import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  Image,
  AppState,
  useWindowDimensions,
  Animated,
  Easing,
  Keyboard,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSignIn, useOAuth, useUser, useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import NetInfo from '@react-native-community/netinfo';

// --- CUSTOM IMPORTS ---
// Ensure these paths match your project structure
import OfflineNotice from '../components/OfflineNotice';
import { syncClerkUserToNeon } from '../services/clerkUserSync';
import { saveSession } from '../db/session';
import { warmNeonConnection } from '../services/auth';
import { colors } from '../utils/design';
import { validateEmail } from '../utils/emailValidation';
import { useToast } from '../context/ToastContext';
import { mapLoginErrorToUi, mapSocialLoginErrorToUi } from '../utils/authUi';

// Warm up browser
WebBrowser.maybeCompleteAuthSession();

const useWarmUpBrowser = () => {
  useEffect(() => {
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);
};

const LoginScreen = () => {
  useWarmUpBrowser();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { showToast, showActionToast } = useToast();

  // --- RESPONSIVE DIMENSIONS ---
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const isTablet = width >= 600; // Standard tablet breakpoint

  // Specific check for Tablet Portrait vs Phone Portrait
  const isTabletPortrait = isTablet && !isLandscape;

  // --- CLERK HOOKS ---
  const { signIn, setActive, isLoaded } = useSignIn();
  const { user: clerkUser, isLoaded: clerkLoaded } = useUser();
  const { isSignedIn } = useAuth();

  // OAuth Strategies
  const { startOAuthFlow: startGoogleFlow } = useOAuth({ strategy: 'oauth_google' });
  const { startOAuthFlow: startGithubFlow } = useOAuth({ strategy: 'oauth_github' });

  // --- STATE ---
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [emailSuggestion, setEmailSuggestion] = useState<string | null>(null);

  const inFlightRef = useRef(false);
  const didShowRedirectRef = useRef(false);

  // Offline State
  const [offlineVisible, setOfflineVisible] = useState(false);

  // --- ANIMATIONS ---
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  // App State
  const isActiveRef = useRef(true);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      isActiveRef.current = next === 'active';
    });

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    warmNeonConnection().catch(() => { });
    return () => sub.remove();
  }, []);

  // --- AUTO SYNC LOGIC ---
  useEffect(() => {
    if (!isSignedIn || !clerkLoaded || !clerkUser) return;
    const processSession = async () => {
      setSyncing(true);
      try {
        const id = clerkUser.id;
        const userEmail = clerkUser.primaryEmailAddress?.emailAddress || '';
        if (id && userEmail) {
          await handleSyncAndNavigate(
            id,
            userEmail,
            clerkUser.fullName,
            (clerkUser as any)?.imageUrl
          );
        } else {
          navigation.reset({ index: 0, routes: [{ name: 'Announcement' }] });
        }
      } catch (e) {
        setSyncing(false);
      }
    };
    processSession();
  }, [isSignedIn, clerkLoaded, clerkUser]);

  // --- HANDLERS ---
  const handleSyncAndNavigate = async (
    userId: string,
    userEmail: string,
    userName?: string | null,
    userImageUrl?: string | null
  ) => {
    let bridged = null as any;
    try {
      bridged = await syncClerkUserToNeon({
        id: userId,
        emailAddresses: [{ emailAddress: userEmail }],
        fullName: userName,
      });
    } catch (e) {
      bridged = null;
    }

    try {
      if (bridged?.uuid) {
        await saveSession(
          bridged.uuid,
          bridged.name || userName || 'User',
          bridged.email || userEmail,
          userImageUrl ?? undefined,
          userImageUrl ?? undefined,
          userId
        );
      }
    } catch (e) {
      console.warn('Session save failed', e);
    }

    setSyncing(false);
    setLoading(false);
    if (!didShowRedirectRef.current) {
      didShowRedirectRef.current = true;
      showToast('Signed in successfully. Redirecting…', 'success', 2500);
    }
    navigation.reset({ index: 0, routes: [{ name: 'Announcement' }] });
  };

  const onSignInPress = async () => {
    if (!isLoaded) return;
    if (loading || inFlightRef.current) return;

    setEmailError(null);
    setPasswordError(null);
    setFormError(null);

    const v = validateEmail(email);
    if (!v.isValidFormat) {
      setEmailError('Please enter a valid email address.');
      return;
    }
    if (!v.isSupportedDomain) {
      setEmailError('This email domain is not supported. Please use a valid email provider.');
      return;
    }
    if (!password) {
      setPasswordError('Please enter your password.');
      return;
    }

    setLoading(true);
    inFlightRef.current = true;
    Keyboard.dismiss();

    try {
      const result = await signIn.create({ identifier: v.normalized, password });
      if (result.status === 'complete') {
        showToast('Welcome back! Signed in successfully.', 'success', 2500);
        await setActive({ session: result.createdSessionId });
      } else {
        // Requires verification (email code flow)
        const factor = (result as any)?.supportedFirstFactors?.find(
          (f: any) => f?.strategy === 'email_code' && f?.safeIdentifier === v.normalized
        );
        showToast('Please verify your email before logging in.', 'info', 3500);
        navigation.navigate('VerifyEmail', {
          email: v.normalized,
          mode: 'signin',
          emailAddressId: factor?.emailAddressId,
        });
        setLoading(false);
      }
    } catch (err: any) {
      handleLoginError(err);
    } finally {
      inFlightRef.current = false;
    }
  };

  const handleLoginError = async (err: any) => {
    const net = await NetInfo.fetch();
    if (!net.isConnected) {
      setOfflineVisible(true);
      setLoading(false);
      return;
    }

    const ui = mapLoginErrorToUi(err);
    if (ui.field === 'password') setPasswordError(ui.message);
    else if (ui.field === 'email') setEmailError(ui.message);
    else setFormError(ui.message);

    if (ui.action?.type === 'go_register') {
      showActionToast(
        'Account not found. Please register first.',
        'Register',
        () => navigation.navigate('Register', { email: validateEmail(email).normalized }),
        'info',
        7000
      );
    } else if (ui.action?.type === 'go_verify_email') {
      showActionToast(
        'Please verify your email before logging in.',
        'Verify',
        () => navigation.navigate('VerifyEmail', { email: validateEmail(email).normalized, mode: 'signin' }),
        'info',
        7000
      );
    }

    setLoading(false);
  };

  const onSocialLogin = async (strategy: 'google' | 'github') => {
    if (!isLoaded) return;
    if (loading || inFlightRef.current) return;
    if (Platform.OS === 'android' && !isActiveRef.current) return;
    setLoading(true);
    inFlightRef.current = true;
    try {
      const startFlow = strategy === 'google' ? startGoogleFlow : startGithubFlow;
      const res: any = await startFlow({
        redirectUrl: AuthSession.makeRedirectUri({ scheme: 'dhandiary', path: 'oauth-callback' }),
      });
      const createdSessionId = res?.createdSessionId;
      const setSession = res?.setActive;

      // Best-effort heuristic: if Clerk provided a SignUp resource with createdUserId, treat as first-time.
      const createdUserId = res?.signUp?.createdUserId || res?.signUp?.createdUser?.id || null;
      if (createdUserId) {
        showToast(
          `Account created successfully using ${strategy === 'google' ? 'Google' : 'GitHub'}.`,
          'success',
          3000
        );
      } else {
        showToast('Welcome back! Signed in successfully.', 'success', 2500);
      }

      if (createdSessionId && setSession) {
        await setSession({ session: createdSessionId });
      } else {
        setLoading(false);
      }
    } catch (err: any) {
      const ui = mapSocialLoginErrorToUi(err);
      if (ui) {
        const lower = ui.message.toLowerCase();
        const type = lower.includes('please log in using email') ? 'info' : 'error';
        showToast(ui.message, type, 6000);
      }
      setLoading(false);
    } finally {
      inFlightRef.current = false;
    }
  };

  const renderBrand = () => (
    <Animated.View style={[styles.brandContainer, { opacity: fadeAnim }]}>
      <View style={[styles.logoCircle, isLandscape && styles.logoCircleSmall]}>
        <Image
          source={require('../../assets/splash-icon.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>
      <View>
        <Text
          style={[
            styles.brandTitle,
            isLandscape && styles.brandTitleSmall,
            isTablet && styles.brandTitleTablet,
          ]}
        >
          DhanDiary
        </Text>
        <Text
          style={[
            styles.brandSubtitle,
            isLandscape && styles.brandSubtitleSmall,
            isTablet && styles.brandSubtitleTablet,
          ]}
        >
          Master your finances
        </Text>
      </View>
    </Animated.View>
  );

  // --- DYNAMIC STYLES CALCULATION ---

  // 1. Determine Content Container Style for ScrollView
  let contentContainerStyle;
  if (isLandscape) {
    contentContainerStyle = styles.rowContentContainer; // Split View
  } else if (isTabletPortrait) {
    contentContainerStyle = styles.centerContentContainer; // Centered Card
  } else {
    contentContainerStyle = styles.columnContentContainer; // Bottom Sheet (Phone)
  }

  // 2. Determine Wrapper Style (Positioning of Brand vs Form)
  let brandWrapperStyle, formWrapperStyle;

  if (isLandscape) {
    // Landscape: Side by Side
    brandWrapperStyle = styles.brandWrapperSplit;
    formWrapperStyle = styles.formWrapperSplit;
  } else if (isTabletPortrait) {
    // Tablet Portrait: Stacked but Centered vertically
    brandWrapperStyle = styles.brandWrapperCenter;
    formWrapperStyle = styles.formWrapperCenter;
  } else {
    // Phone Portrait: Stacked, Brand Top, Form Bottom
    brandWrapperStyle = styles.brandWrapperStacked;
    formWrapperStyle = styles.formWrapperBottom;
  }

  // 3. Card Styling (Borders & Widths)
  // On Tablet (Portrait or Landscape), we want a "Card" look (all corners rounded).
  // On Phone Portrait, we want a "Sheet" look (top corners rounded only).
  const isCardStyle = isTablet || isLandscape;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      <LinearGradient
        colors={['#E0F2FE', '#F0F9FF', '#FFFFFF']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right', 'bottom']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <ScrollView
            contentContainerStyle={[styles.scrollBase, contentContainerStyle]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* BRAND SECTION */}
            <View style={[styles.brandWrapper, brandWrapperStyle]}>{renderBrand()}</View>

            {/* FORM SECTION */}
            <View style={[styles.formWrapper, formWrapperStyle]}>
              <Animated.View
                style={[
                  styles.formCard,
                  {
                    opacity: fadeAnim,
                    transform: [{ translateY: slideAnim }],
                  },
                  // Width Constraints
                  isCardStyle && { maxWidth: 480, width: '100%', alignSelf: 'center' },
                  !isCardStyle && { width: '100%' },

                  // Border Radius & Padding Logic
                  isCardStyle
                    ? { borderRadius: 24, padding: 32 } // Card Look
                    : {
                      borderTopLeftRadius: 32,
                      borderTopRightRadius: 32,
                      padding: 32,
                      paddingBottom: Math.max(insets.bottom + 20, 32),
                    }, // Sheet Look
                ]}
              >
                <Text style={styles.welcomeText}>Welcome Back!</Text>
                <Text style={styles.promptText}>Please sign in to continue</Text>

                <View style={styles.inputGroup}>
                  <View style={styles.inputContainer}>
                    <Ionicons name="mail" size={20} color={colors.muted} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="Email Address"
                      placeholderTextColor="#94A3B8"
                      value={email}
                      onChangeText={(t) => {
                        const v = validateEmail(t);
                        setEmail(v.normalized);
                        setEmailSuggestion(v.suggestion || null);
                        setEmailError(null);
                        setFormError(null);
                      }}
                      autoCapitalize="none"
                      keyboardType="email-address"
                    />
                  </View>

                  {(emailError || emailSuggestion) && (
                    <View style={{ marginTop: 6 }}>
                      {!!emailError && <Text style={styles.fieldError}>{emailError}</Text>}
                      {!!emailSuggestion && (
                        <TouchableOpacity
                          onPress={() => {
                            setEmail(emailSuggestion);
                            setEmailSuggestion(null);
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.suggestionText}>Did you mean {emailSuggestion}?</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}

                  <View style={styles.inputContainer}>
                    <Ionicons
                      name="lock-closed"
                      size={20}
                      color={colors.muted}
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Password"
                      placeholderTextColor="#94A3B8"
                      value={password}
                      onChangeText={(t) => {
                        setPassword(t);
                        setPasswordError(null);
                        setFormError(null);
                      }}
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

                  {!!passwordError && <Text style={styles.fieldError}>{passwordError}</Text>}
                </View>

                <TouchableOpacity
                  style={[styles.primaryBtn, loading && styles.disabledBtn]}
                  onPress={onSignInPress}
                  disabled={
                    loading ||
                    !password ||
                    !validateEmail(email).isValidFormat ||
                    !validateEmail(email).isSupportedDomain
                  }
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryBtnText}>Sign In</Text>
                  )}
                </TouchableOpacity>

                {!!formError && <Text style={styles.formError}>{formError}</Text>}

                <TouchableOpacity
                  style={styles.forgotBtn}
                  onPress={() => navigation.navigate('ForgotPassword', { email })}
                >
                  <Text style={styles.forgotText}>Forgot Password?</Text>
                </TouchableOpacity>

                <View style={styles.divider}>
                  <View style={styles.line} />
                  <Text style={styles.dividerText}>or continue with</Text>
                  <View style={styles.line} />
                </View>

                <View style={styles.socialRow}>
                  <SocialButton
                    label="Google"
                    icon="https://cdn-icons-png.flaticon.com/512/300/300221.png"
                    onPress={() => onSocialLogin('google')}
                  />
                  <SocialButton
                    label="GitHub"
                    icon="https://cdn-icons-png.flaticon.com/512/25/25231.png"
                    onPress={() => onSocialLogin('github')}
                  />
                </View>

                <View style={styles.footer}>
                  <Text style={styles.footerText}>New user? </Text>
                  <TouchableOpacity onPress={() => navigation.navigate('Register')}>
                    <Text style={styles.linkText}>Create Account</Text>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <OfflineNotice
        visible={offlineVisible}
        onRetry={() => {
          setOfflineVisible(false);
          setLoading(true);
          onSignInPress();
        }}
        onClose={() => setOfflineVisible(false)}
        retrying={false}
        attemptsLeft={undefined}
      />

      {syncing && (
        <View style={styles.overlay}>
          <View style={styles.syncBox}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.syncText}>Syncing vault...</Text>
          </View>
        </View>
      )}
    </View>
  );
};

const SocialButton = ({ label, icon, onPress }: any) => (
  <TouchableOpacity style={styles.socialBtn} onPress={onPress}>
    <Image source={{ uri: icon }} style={styles.socialIcon} resizeMode="contain" />
    <Text style={styles.socialBtnText}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollBase: { flexGrow: 1 },

  // --- SCROLL CONTENT LAYOUTS ---
  columnContentContainer: {
    flexDirection: 'column',
    justifyContent: 'space-between', // Pushes brand up, form down (Phone)
  },
  centerContentContainer: {
    flexDirection: 'column',
    justifyContent: 'center', // Centers everything (Tablet Portrait)
    paddingVertical: 40,
  },
  rowContentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center', // Centers split view (Landscape)
    paddingVertical: 40,
    paddingHorizontal: 60,
  },

  // --- BRAND WRAPPERS ---
  brandWrapper: {},
  brandWrapperStacked: {
    alignItems: 'center',
    marginTop: 60,
    marginBottom: 40,
    flexShrink: 0,
  },
  brandWrapperCenter: {
    alignItems: 'center',
    marginBottom: 40, // Space between logo and card on Tablet
    flexShrink: 0,
  },
  brandWrapperSplit: {
    flex: 1,
    paddingRight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // --- FORM WRAPPERS ---
  formWrapper: { width: '100%' },
  formWrapperBottom: {
    flex: 1,
    justifyContent: 'flex-end', // Pushes to bottom (Phone)
  },
  formWrapperCenter: {
    alignItems: 'center',
    justifyContent: 'center', // Centers in middle (Tablet)
  },

  fieldError: {
    color: '#B91C1C',
    fontSize: 13,
    marginTop: 6,
    marginLeft: 4,
  },
  formError: {
    color: '#B91C1C',
    fontSize: 13,
    marginTop: 12,
    textAlign: 'center',
  },
  suggestionText: {
    color: '#1D4ED8',
    fontSize: 13,
    marginTop: 6,
    marginLeft: 4,
  },
  formWrapperSplit: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // --- BRAND VISUALS ---
  brandContainer: { alignItems: 'center', flexDirection: 'column' },
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
    elevation: 10,
    marginBottom: 16,
  },
  logoCircleSmall: { width: 70, height: 70, borderRadius: 20, marginBottom: 12 },
  logo: { width: 50, height: 50 },

  brandTitle: { fontSize: 28, fontWeight: '800', color: '#0F172A', textAlign: 'center' },
  brandTitleSmall: { fontSize: 24 },
  brandTitleTablet: { fontSize: 32 },

  brandSubtitle: {
    fontSize: 16,
    color: '#64748B',
    marginTop: 4,
    fontWeight: '500',
    textAlign: 'center',
  },
  brandSubtitleSmall: { fontSize: 14 },
  brandSubtitleTablet: { fontSize: 18 },

  // --- FORM CARD ---
  formCard: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 20,
  },
  welcomeText: { fontSize: 24, fontWeight: '700', color: '#0F172A', marginBottom: 8 },
  promptText: { fontSize: 14, color: '#64748B', marginBottom: 24 },

  inputGroup: { gap: 16, marginBottom: 24 },
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
  inputIcon: { marginRight: 12 },
  input: { flex: 1, height: '100%', color: '#0F172A', fontSize: 16, fontWeight: '500' },
  eyeBtn: { padding: 8 },

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
  disabledBtn: { opacity: 0.7 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  forgotBtn: { alignItems: 'center', marginTop: 16, marginBottom: 8 },
  forgotText: { color: '#64748B', fontSize: 14, fontWeight: '600' },

  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 24 },
  line: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
  dividerText: {
    marginHorizontal: 16,
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },

  socialRow: { flexDirection: 'row', gap: 16, marginBottom: 32 },
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
  socialIcon: { width: 20, height: 20, marginRight: 8 },
  socialBtnText: { fontSize: 14, fontWeight: '600', color: '#1E293B' },

  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  footerText: { color: '#64748B', fontSize: 14 },
  linkText: { color: '#2563EB', fontWeight: '700', fontSize: 14 },

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
  syncText: { color: '#0F172A', marginTop: 16, fontSize: 16, fontWeight: '600' },
});

export default LoginScreen;

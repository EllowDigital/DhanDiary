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
  useWindowDimensions,
  Animated,
  Easing,
  InteractionManager,
  Keyboard,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import NetInfo from '@react-native-community/netinfo';
import { Ionicons } from '@expo/vector-icons';
import { useOAuth, useSignUp } from '@clerk/clerk-expo';
import { useNavigation } from '@react-navigation/native';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import Constants from 'expo-constants';

// --- CUSTOM IMPORTS ---
import { colors } from '../utils/design';
import { validateEmail } from '../utils/emailValidation';
import { mapRegisterErrorToUi, mapSocialLoginErrorToUi } from '../utils/authUi';
import { useToast } from '../context/ToastContext';
import { isNetOnline } from '../utils/netState';
import { AuthGateScreen } from '../components/AuthGateScreen';
import { debugAuthError, isLikelyServiceDownError } from '../utils/serviceIssue';
import { getNeonHealth } from '../api/neonClient';
import { warmNeonConnection } from '../services/auth';

// Warm up browser (OAuth)
WebBrowser.maybeCompleteAuthSession();

const useWarmUpBrowser = () => {
  useEffect(() => {
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);
};

const RegisterScreen = () => {
  useWarmUpBrowser();
  const navigation = useNavigation<any>();
  const { isLoaded, signUp } = useSignUp();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();

  // OAuth Strategies
  const { startOAuthFlow: startGoogleFlow } = useOAuth({ strategy: 'oauth_google' });
  const { startOAuthFlow: startGithubFlow } = useOAuth({ strategy: 'oauth_github' });

  // --- RESPONSIVE LAYOUT LOGIC ---
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const isTablet = width >= 600;

  // Switch to "Card Mode" on Tablets or Landscape phones
  const isCardLayout = isTablet || isLandscape;

  // --- STATE ---
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [gate, setGate] = useState<null | 'offline' | 'service'>(null);
  const [gateLoading, setGateLoading] = useState(false);

  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [emailSuggestion, setEmailSuggestion] = useState<string | null>(null);

  const inFlightRef = useRef(false);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  // Entrance Animation
  useEffect(() => {
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
  }, []);

  useEffect(() => {
    let mounted = true;
    NetInfo.fetch()
      .then((s) => {
        if (!mounted) return;
        const ok = isNetOnline(s);
        setIsOnline(ok);
        setGate((prev) => (!ok ? 'offline' : prev === 'offline' ? null : prev));
      })
      .catch(() => {
        if (!mounted) return;
        setIsOnline(null);
      });

    const unsub = NetInfo.addEventListener((s) => {
      if (!mounted) return;
      const ok = isNetOnline(s);
      setIsOnline(ok);
      setGate((prev) => (!ok ? 'offline' : prev === 'offline' ? null : prev));
    });

    return () => {
      mounted = false;
      try {
        unsub();
      } catch (e) { }
    };
  }, []);

  const retryGate = async () => {
    setGateLoading(true);
    try {
      const net = await NetInfo.fetch();
      const ok = isNetOnline(net);
      setIsOnline(ok);
      if (!ok) {
        setGate('offline');
        return;
      }

      try {
        const health = getNeonHealth();
        if (health.isConfigured) {
          const warmed = await warmNeonConnection({ force: true, timeoutMs: 8000 });
          if (!warmed) {
            setGate('service');
            return;
          }
        }
      } catch (e) { }

      setGate(null);
    } finally {
      setGateLoading(false);
    }
  };

  if (gate === 'offline') {
    return (
      <AuthGateScreen
        variant="offline"
        description="Sign up requires internet (Clerk + Neon)."
        primaryLabel="Try Again"
        onPrimary={retryGate}
        loading={gateLoading}
      />
    );
  }

  if (gate === 'service') {
    return (
      <AuthGateScreen
        variant="service"
        description="Sorry, we are facing some issue. Try again after some time."
        primaryLabel="Try Again"
        onPrimary={retryGate}
        secondaryLabel="Back to Sign Up"
        onSecondary={() => setGate(null)}
        loading={gateLoading}
      />
    );
  }

  const onSignUpPress = async () => {
    if (!isLoaded) return;
    if (loading || inFlightRef.current) return;

    setFormError(null);
    setEmailError(null);
    setPasswordError(null);

    if (!firstName || !lastName || !email || !password) {
      setFormError('Please fill in all fields to continue.');
      return;
    }

    const v = validateEmail(email);
    if (!v.isValidFormat) {
      setEmailError('Please enter a valid email address.');
      return;
    }
    if (!v.isSupportedDomain) {
      setEmailError('This email domain is not supported. Please use a valid email provider.');
      return;
    }

    if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    inFlightRef.current = true;
    Keyboard.dismiss();

    try {
      // Check connection before starting
      const net = await NetInfo.fetch();
      if (!isNetOnline(net)) {
        setGate('offline');
        return;
      }

      // If Neon is configured, fail fast with a friendly screen when DB is down.
      try {
        const health = getNeonHealth();
        if (health.isConfigured) {
          const warmed = await warmNeonConnection({ force: true, timeoutMs: 8000 });
          if (!warmed) {
            setGate('service');
            return;
          }
        }
      } catch (e) {
        setGate('service');
        return;
      }

      await attemptSignUp();
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  };

  const onSocialSignUp = async (strategy: 'google' | 'github') => {
    if (!isLoaded) {
      showToast('Auth is not ready yet. Check Clerk publishable key.', 'info', 3500);
      return;
    }
    if (loading || inFlightRef.current) return;

    setFormError(null);
    setEmailError(null);
    setPasswordError(null);

    setLoading(true);
    inFlightRef.current = true;
    Keyboard.dismiss();

    try {
      const net = await NetInfo.fetch();
      if (!isNetOnline(net)) {
        setGate('offline');
        return;
      }

      if (Platform.OS === 'android') {
        await new Promise<void>((resolve) => InteractionManager.runAfterInteractions(() => resolve()));
      }

      const startFlow = strategy === 'google' ? startGoogleFlow : startGithubFlow;
      const scheme =
        (Constants.expoConfig as any)?.scheme ||
        (Constants.expoConfig as any)?.android?.scheme ||
        'dhandiary';

      const res: any = await startFlow({
        redirectUrl: AuthSession.makeRedirectUri({ scheme, path: 'oauth-callback' }),
      });

      const createdSessionId = res?.createdSessionId;
      const setSession = res?.setActive;
      const createdUserId = res?.signUp?.createdUserId || res?.signUp?.createdUser?.id || null;

      if (createdUserId) {
        showToast(
          `Account created successfully using ${strategy === 'google' ? 'Google' : 'GitHub'}.`,
          'success',
          3000
        );
      } else {
        showToast('Signed in successfully. Redirecting…', 'success', 2500);
      }

      if (createdSessionId && setSession) {
        await setSession({ session: createdSessionId });
      }

      // Leave Auth stack after OAuth.
      try {
        const { resetRoot } = await import('../utils/rootNavigation');
        resetRoot({ index: 0, routes: [{ name: 'Announcement' }] });
      } catch (e) {
        // ignore
      }
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.toLowerCase().includes('current activity is no longer available')) {
        console.warn(`[Register] OAuth failed (${strategy}): activity unavailable`, err);
        showToast('Please try again. (App was busy switching screens)', 'info', 4000);
        return;
      }

      debugAuthError(`[Register] OAuth failed (${strategy})`, err);
      const ui = mapSocialLoginErrorToUi(err);
      if (ui) {
        const lower = ui.message.toLowerCase();
        const type = lower.includes('please log in using email') ? 'info' : 'error';
        showToast(ui.message, type as any, 6000);
      }

      try {
        const net = await NetInfo.fetch();
        if (isNetOnline(net) && isLikelyServiceDownError(err)) {
          setGate('service');
        }
      } catch (e) { }
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  };

  const attemptSignUp = async () => {
    try {
      if (!signUp) return;
      const normalizedEmail = validateEmail(email).normalized;
      await signUp.create({ firstName, lastName, emailAddress: normalizedEmail, password });
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });

      setLoading(false);
      navigation.navigate('VerifyEmail', {
        email: normalizedEmail,
        mode: 'signup',
        firstName,
        lastName,
      });
    } catch (err: any) {
      handleSignUpError(err);
    }
  };

  const handleSignUpError = (err: any) => {
    debugAuthError('[Register] sign-up failed', err);
    if (isLikelyServiceDownError(err)) {
      setGate('service');
      setLoading(false);
      return;
    }

    const ui = mapRegisterErrorToUi(err);

    if (ui.kind === 'already_registered') {
      Alert.alert('Already Registered', ui.message, [
        {
          text: 'OK',
          onPress: () => navigation.navigate('Login', { email: validateEmail(email).normalized }),
        },
      ]);
    } else if (ui.kind === 'weak_password') {
      setPasswordError(ui.message);
    } else {
      Alert.alert('Registration Failed', ui.message);
    }
    setLoading(false);
  };

  const onBack = React.useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('Login');
  }, [navigation]);

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
            contentContainerStyle={[
              styles.scrollContent,
              // If Card Layout, center content vertically
              isCardLayout ? styles.centerContent : null,
              { paddingBottom: Math.max(20, insets.bottom + 20) },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* MAIN CONTENT CONTAINER 
              - Constrains width on tablets/landscape
              - Aligns self center
            */}
            <View style={[styles.responsiveContainer, isCardLayout && styles.cardContainer]}>
              {/* Header */}
              <View style={styles.header}>
                <TouchableOpacity onPress={onBack} style={styles.backBtn}>
                  <Ionicons name="arrow-back" size={24} color="#0F172A" />
                </TouchableOpacity>

                {/* Step Indicator */}
                <View style={styles.stepContainer}>
                  <View style={styles.stepDotActive} />
                  <View style={styles.stepLine} />
                  <View style={styles.stepDotInactive} />
                </View>
              </View>

              <Animated.View
                style={[
                  styles.formWrapper,
                  { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
                ]}
              >
                <Text style={styles.title}>Create Account</Text>
                <Text style={styles.subtitle}>Start your financial journey today.</Text>

                <View style={styles.divider}>
                  <View style={styles.line} />
                  <Text style={styles.dividerText}>or continue with</Text>
                  <View style={styles.line} />
                </View>

                <View style={styles.socialRow}>
                  <SocialButton
                    label="Google"
                    iconName="logo-google"
                    onPress={() => onSocialSignUp('google')}
                    disabled={!isLoaded || loading}
                  />
                  <SocialButton
                    label="GitHub"
                    iconName="logo-github"
                    onPress={() => onSocialSignUp('github')}
                    disabled={!isLoaded || loading}
                  />
                </View>

                <Text style={styles.emailAltText}>Or create your account with email</Text>

                <View style={styles.formContainer}>
                  {/* Name Row */}
                  <View style={styles.row}>
                    <View style={[styles.inputContainer, { flex: 1 }]}>
                      <Ionicons
                        name="person-outline"
                        size={20}
                        color={colors.muted || '#94A3B8'}
                        style={styles.inputIcon}
                      />
                      <TextInput
                        style={styles.input}
                        placeholder="First Name"
                        placeholderTextColor="#94A3B8"
                        value={firstName}
                        onChangeText={setFirstName}
                        autoCapitalize="words"
                        autoComplete="name-given"
                      />
                    </View>
                    <View style={{ width: 12 }} />
                    <View style={[styles.inputContainer, { flex: 1 }]}>
                      <TextInput
                        style={styles.input}
                        placeholder="Last Name"
                        placeholderTextColor="#94A3B8"
                        value={lastName}
                        onChangeText={setLastName}
                        autoCapitalize="words"
                        autoComplete="name-family"
                      />
                    </View>
                  </View>

                  {/* Email */}
                  <View style={styles.inputContainer}>
                    <Ionicons
                      name="mail-outline"
                      size={20}
                      color={colors.muted || '#94A3B8'}
                      style={styles.inputIcon}
                    />
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
                      autoComplete="email"
                    />
                  </View>

                  {(emailError || emailSuggestion) && (
                    <View style={{ marginTop: -6 }}>
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

                  {/* Password */}
                  <View style={styles.inputContainer}>
                    <Ionicons
                      name="lock-closed-outline"
                      size={20}
                      color={colors.muted || '#94A3B8'}
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Create Password"
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

                  {/* Action Button */}
                  <TouchableOpacity
                    style={[styles.primaryBtn, loading && styles.disabledBtn]}
                    onPress={onSignUpPress}
                    disabled={
                      loading ||
                      !firstName ||
                      !lastName ||
                      !password ||
                      !validateEmail(email).isValidFormat ||
                      !validateEmail(email).isSupportedDomain
                    }
                    activeOpacity={0.8}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.primaryBtnText}>Continue</Text>
                    )}
                  </TouchableOpacity>

                  {!!formError && <Text style={styles.formError}>{formError}</Text>}
                </View>

                {/* Footer */}
                <View style={styles.footer}>
                  <Text style={styles.footerText}>Already have an account? </Text>
                  <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                    <Text style={styles.linkText}>Log In</Text>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
};

const SocialButton = ({ label, iconName, onPress, disabled }: any) => (
  <TouchableOpacity
    style={[styles.socialBtn, disabled && styles.disabledBtn]}
    onPress={onPress}
    disabled={disabled}
    activeOpacity={0.8}
  >
    <Ionicons name={iconName} size={18} color={disabled ? '#94A3B8' : '#0F172A'} />
    <Text style={[styles.socialBtnText, disabled && { color: '#94A3B8' }]}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flex: 1 },

  scrollContent: {
    flexGrow: 1,
    padding: 24,
  },

  // Center content vertically for Card Layout
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Responsive Container
  responsiveContainer: {
    width: '100%',
  },
  // Card Styles (Tablets/Landscape)
  cardContainer: {
    maxWidth: 480,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 32,
    // Shadow for card look
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 32,
    marginTop: 8,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  stepContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepDotActive: {
    width: 24,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary || '#2563EB',
  },
  stepDotInactive: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#CBD5E1',
  },
  stepLine: {
    width: 16,
    height: 2,
    backgroundColor: '#E2E8F0',
  },

  /* Form Content */
  formWrapper: {
    width: '100%',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748B',
    marginBottom: 32,
    lineHeight: 24,
  },

  divider: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  line: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
  dividerText: {
    marginHorizontal: 16,
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },

  socialRow: { flexDirection: 'row', gap: 16, marginBottom: 16 },
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
  socialBtnText: { fontSize: 14, fontWeight: '600', color: '#1E293B', marginLeft: 8 },

  emailAltText: {
    marginTop: -4,
    marginBottom: 16,
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    textAlign: 'center',
  },

  /* Inputs */
  formContainer: {
    gap: 16,
    marginBottom: 24,
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
    marginTop: 10,
    textAlign: 'center',
  },
  suggestionText: {
    color: '#1D4ED8',
    fontSize: 13,
    marginTop: 6,
    marginLeft: 4,
  },
  row: {
    flexDirection: 'row',
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

  /* Button */
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
    marginTop: 8,
  },
  disabledBtn: {
    opacity: 0.7,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  /* Footer */
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
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
});

export default RegisterScreen;

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
  InteractionManager,
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
import Constants from 'expo-constants';

// --- CUSTOM IMPORTS ---
// Ensure these paths match your project structure
import { syncClerkUserToNeon } from '../services/clerkUserSync';
import { saveSession } from '../db/session';
import { warmNeonConnection } from '../services/auth';
import { colors } from '../utils/design';
import { validateEmail } from '../utils/emailValidation';
import { useToast } from '../context/ToastContext';
import { mapLoginErrorToUi, mapSocialLoginErrorToUi } from '../utils/authUi';
import { isNetOnline } from '../utils/netState';
import { debugAuthError, isLikelyServiceDownError } from '../utils/serviceIssue';
import { getNeonHealth } from '../api/neonClient';

// Warm up browser
WebBrowser.maybeCompleteAuthSession();

const GOOGLE_ICON = require('../../assets/google0-icon.png');
const GITHUB_ICON = require('../../assets/github-icon.png');

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

  const [didWaitForClerk, setDidWaitForClerk] = useState(false);

  // --- RESPONSIVE DIMENSIONS ---
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const isTablet = width >= 600; // Standard tablet breakpoint
  const isWideLandscape = isLandscape && width >= 700;

  // Specific check for Tablet Portrait vs Phone Portrait
  const isTabletPortrait = isTablet && !isLandscape;

  // --- CLERK HOOKS ---
  const { signIn, setActive, isLoaded } = useSignIn();
  const { user: clerkUser, isLoaded: clerkLoaded } = useUser();
  const { isSignedIn } = useAuth();
  const signInRef = useRef(signIn);
  const setActiveRef = useRef(setActive);
  const isLoadedRef = useRef(isLoaded);
  useEffect(() => {
    signInRef.current = signIn;
    setActiveRef.current = setActive;
    isLoadedRef.current = isLoaded;
  }, [signIn, isLoaded]);
  const hasClerkKey = Boolean(
    Constants.expoConfig?.extra?.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ||
    process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
  );

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
  const [authInitPending, setAuthInitPending] = useState(false);

  const inFlightRef = useRef(false);
  const didShowRedirectRef = useRef(false);
  const authInitToastRef = useRef(false);

  // Offline State
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [gate, setGate] = useState<null | 'offline' | 'service'>(null);
  const [gateLoading, setGateLoading] = useState(false);

  // --- ANIMATIONS ---
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  // App State
  const isActiveRef = useRef(true);

  const ensureClerkReady = async () => {
    if (isLoadedRef.current && signInRef.current) return true;
    setAuthInitPending(true);
    const start = Date.now();
    while (Date.now() - start < 5000) {
      await new Promise((r) => setTimeout(r, 200));
      if (isLoadedRef.current && signInRef.current) break;
    }
    setAuthInitPending(false);
    if (!isLoadedRef.current || !signInRef.current) {
      if (!authInitToastRef.current) {
        authInitToastRef.current = true;
        showToast(
          hasClerkKey
            ? 'Auth is still initializing. Please try again in a moment.'
            : 'Auth is not configured. Set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY and rebuild.',
          'info',
          3500
        );
      }
      return false;
    }
    return true;
  };

  useEffect(() => {
    const t = setTimeout(() => setDidWaitForClerk(true), 1500);
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

    warmNeonConnection({ soft: true, timeoutMs: 3000 }).catch(() => { });
    return () => {
      clearTimeout(t);
      sub.remove();
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const handleState = (ok: boolean | null) => {
      if (!mounted) return;
      setIsOnline(ok);

      if (ok === false) {
        // If connectivity drops during an auth attempt, stop the spinner and show gate.
        if (loading || inFlightRef.current) {
          setLoading(false);
          inFlightRef.current = false;
          showToast('Connection lost. Please try again.', 'error', 3500);
        }
        setGate('offline');
        return;
      }

      // Restore from offline gate when back online.
      setGate((prev) => (prev === 'offline' ? null : prev));
    };

    NetInfo.fetch()
      .then((s) => handleState(isNetOnline(s)))
      .catch(() => handleState(null));

    const unsub = NetInfo.addEventListener((s) => handleState(isNetOnline(s)));

    return () => {
      mounted = false;
      try {
        unsub();
      } catch (e) { }
    };
  }, [loading, showToast]);

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

      // If Neon is configured in this build, ensure it's reachable.
      try {
        const health = getNeonHealth();
        if (health.isConfigured) {
          const warmed = await warmNeonConnection({ force: true, timeoutMs: 3000, soft: true });
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
    if (!isLoadedRef.current || !signInRef.current) {
      const start = Date.now();
      while (Date.now() - start < 4000) {
        await new Promise((r) => setTimeout(r, 200));
        if (isLoadedRef.current && signInRef.current) break;
      }
      if (!isLoadedRef.current || !signInRef.current) {
        showToast(
          hasClerkKey
            ? 'Auth is still initializing. Please try again in a moment.'
            : 'Auth is not configured. Set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY and rebuild.',
          'info',
          3500
        );
        return;
      }
    }
    if (loading || inFlightRef.current) return;

    // Sign-in requires internet (Clerk + Neon).
    try {
      const net = await NetInfo.fetch();
      if (!isNetOnline(net)) {
        setGate('offline');
        setLoading(false);
        return;
      }
    } catch (e) {
      // If we can't determine connectivity, allow the request to proceed and fail gracefully.
    }

    // If Neon is configured, fail fast with a friendly screen when DB is down.
    try {
      const health = getNeonHealth();
      if (health.isConfigured) {
        const warmed = await warmNeonConnection({ force: true, timeoutMs: 3000, soft: true });
        if (!warmed) {
          setGate('service');
          setLoading(false);
          return;
        }
      }
    } catch (e) {
      // If warm-up logic throws, treat as service issue.
      setGate('service');
      setLoading(false);
      return;
    }

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
      const signInClient = signInRef.current;
      if (!signInClient) {
        throw new Error('Auth is not ready yet. Please try again.');
      }
      const result = await signInClient.create({ identifier: v.normalized, password });
      if (result.status === 'complete') {
        const setActiveFn = setActiveRef.current;
        if (!setActiveFn) {
          throw new Error('Auth session could not be activated. Please try again.');
        }
        await setActiveFn({ session: result.createdSessionId });
        showToast('Welcome back! Signed in successfully.', 'success', 2500);
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
    debugAuthError('[Login] sign-in failed', err);
    const net = await NetInfo.fetch();
    if (!isNetOnline(net)) {
      setGate('offline');
      setLoading(false);
      return;
    }

    // Online but upstream failing
    if (isLikelyServiceDownError(err)) {
      setGate('service');
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
        () =>
          navigation.navigate('VerifyEmail', {
            email: validateEmail(email).normalized,
            mode: 'signin',
          }),
        'info',
        7000
      );
    }

    setLoading(false);
  };

  const onSocialLogin = async (strategy: 'google' | 'github') => {
    if (!isLoadedRef.current) {
      const start = Date.now();
      while (Date.now() - start < 4000) {
        await new Promise((r) => setTimeout(r, 200));
        if (isLoadedRef.current) break;
      }
      if (!isLoadedRef.current) {
        showToast(
          hasClerkKey
            ? 'Auth is still initializing. Please try again in a moment.'
            : 'Auth is not configured. Set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY and rebuild.',
          'info',
          3500
        );
        return;
      }
    }
    if (loading || inFlightRef.current) return;
    if (Platform.OS === 'android' && !isActiveRef.current) return;

    // OAuth requires internet.
    try {
      const net = await NetInfo.fetch();
      if (!isNetOnline(net)) {
        setGate('offline');
        setLoading(false);
        return;
      }
    } catch (e) {
      // allow flow to proceed if NetInfo fails
    }

    setLoading(true);
    inFlightRef.current = true;
    Keyboard.dismiss();
    try {
      // On Android, launching the Custom Tab while the Activity is transitioning
      // can fail with "current activity is no longer available".
      if (Platform.OS === 'android') {
        await new Promise<void>((resolve) =>
          InteractionManager.runAfterInteractions(() => resolve())
        );
        if (!isActiveRef.current) {
          setLoading(false);
          return;
        }
      }

      const startFlow = strategy === 'google' ? startGoogleFlow : startGithubFlow;
      const scheme =
        (Constants.expoConfig as any)?.scheme ||
        (Constants.expoConfig as any)?.android?.scheme ||
        'dhandiary';
      const res: any = await startFlow({
        // Keep a stable native redirect URL for dev builds and production builds.
        // Ensure this matches the redirect URL configured in your Clerk OAuth settings.
        redirectUrl: AuthSession.makeRedirectUri({ scheme, path: 'oauth-callback' }),
      });
      const createdSessionId = res?.createdSessionId;
      const setSession = res?.setActive;

      const authSessionType = String(res?.authSessionResult?.type || '').toLowerCase();
      const isCancelled = authSessionType === 'cancel' || authSessionType === 'dismiss';
      if (isCancelled || !createdSessionId || !setSession) {
        // User cancelled/closed the browser, or Clerk didn't finish creating a session.
        // Do not show a success message.
        if (isCancelled) {
          showToast('Login cancelled.', 'info', 2500);
        } else {
          showToast("Couldn't complete login. Please try again.", 'error', 4000);
        }
        setLoading(false);
        return;
      }

      await setSession({ session: createdSessionId });

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
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.toLowerCase().includes('current activity is no longer available')) {
        console.warn(`[Login] OAuth failed (${strategy}): activity unavailable`, err);
        showToast('Please try again. (App was busy switching screens)', 'info', 4000);
        setLoading(false);
        return;
      }

      debugAuthError(`[Login] OAuth failed (${strategy})`, err);
      const ui = mapSocialLoginErrorToUi(err);
      if (ui) {
        const lower = ui.message.toLowerCase();
        const type = lower.includes('please log in using email') ? 'info' : 'error';
        showToast(ui.message, type, 6000);
      }

      try {
        const net = await NetInfo.fetch();
        if (isNetOnline(net) && isLikelyServiceDownError(err)) {
          setGate('service');
        }
      } catch (e) { }
      setLoading(false);
    } finally {
      inFlightRef.current = false;
    }
  };

  const renderGateBanner = () => {
    if (!gate) return null;

    const isOffline = gate === 'offline';
    const title = isOffline ? 'You are offline' : 'Service issue';
    const description = isOffline
      ? 'Sign in needs internet. We will keep retrying in background.'
      : 'We are facing issues. We will keep retrying in background.';

    return (
      <View
        style={[styles.gateBanner, isOffline ? styles.gateBannerOffline : styles.gateBannerService]}
      >
        <View style={styles.gateBannerLeft}>
          <Ionicons
            name={isOffline ? 'cloud-offline-outline' : 'alert-circle-outline'}
            size={18}
            color={isOffline ? '#9A3412' : '#9F1239'}
          />
          <View style={styles.gateBannerTextWrap}>
            <Text style={styles.gateBannerTitle}>{title}</Text>
            <Text style={styles.gateBannerText}>{description}</Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={retryGate}
          disabled={gateLoading}
          style={styles.gateBannerAction}
        >
          {gateLoading ? (
            <ActivityIndicator size="small" color="#2563EB" />
          ) : (
            <Text style={styles.gateBannerActionText}>Retry</Text>
          )}
        </TouchableOpacity>
      </View>
    );
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
  if (isWideLandscape) {
    contentContainerStyle = styles.rowContentContainer; // Split View
  } else if (isTabletPortrait) {
    contentContainerStyle = styles.centerContentContainer; // Centered Card
  } else {
    contentContainerStyle = styles.columnContentContainer; // Bottom Sheet (Phone)
  }

  // 2. Determine Wrapper Style (Positioning of Brand vs Form)
  let brandWrapperStyle, formWrapperStyle;

  if (isWideLandscape) {
    // Landscape: Side by Side
    brandWrapperStyle = styles.brandWrapperSplit;
    formWrapperStyle = styles.formWrapperSplit;
  } else if (isTabletPortrait) {
    // Tablet Portrait: Stacked but Centered vertically
    brandWrapperStyle = styles.brandWrapperCenter;
    formWrapperStyle = styles.formWrapperCenter;
  } else {
    // Phone Portrait: Stacked, Brand Top, Form Bottom
    const brandTop = isLandscape ? 24 : height < 700 ? 40 : 60;
    brandWrapperStyle = [styles.brandWrapperStacked, { marginTop: brandTop }];
    formWrapperStyle = styles.formWrapperBottom;
  }

  // 3. Card Styling (Borders & Widths)
  // On Tablet (Portrait or Landscape), we want a "Card" look (all corners rounded).
  // On Phone Portrait, we want a "Sheet" look (top corners rounded only).
  const isCardStyle = isTablet || isWideLandscape;
  const rowPaddingX = Math.min(60, Math.max(24, Math.round(width * 0.06)));
  const rowPaddingY = Math.min(40, Math.max(24, Math.round(height * 0.06)));

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
              styles.scrollBase,
              contentContainerStyle,
              isWideLandscape
                ? { paddingHorizontal: rowPaddingX, paddingVertical: rowPaddingY }
                : null,
            ]}
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

                {renderGateBanner()}

                {didWaitForClerk && !isLoaded && !hasClerkKey && (
                  <View style={styles.configBanner}>
                    <Ionicons name="warning-outline" size={16} color="#B45309" />
                    <Text style={styles.configBannerText}>
                      Auth is not configured. Set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY and rebuild.
                    </Text>
                  </View>
                )}

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
                    imageSource={GOOGLE_ICON}
                    onPress={() => onSocialLogin('google')}
                    disabled={loading}
                  />
                  <SocialButton
                    label="GitHub"
                    imageSource={GITHUB_ICON}
                    onPress={() => onSocialLogin('github')}
                    disabled={loading}
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

const SocialButton = ({ label, iconName, imageSource, onPress, disabled }: any) => (
  <TouchableOpacity
    style={[styles.socialBtn, disabled && styles.disabledBtn]}
    onPress={onPress}
    disabled={disabled}
    activeOpacity={0.8}
  >
    {imageSource ? (
      <Image
        source={imageSource}
        style={[styles.socialIcon, disabled && { opacity: 0.55 }]}
        resizeMode="contain"
      />
    ) : (
      <Ionicons name={iconName} size={18} color={disabled ? '#94A3B8' : '#0F172A'} />
    )}
    <Text style={[styles.socialBtnText, disabled && { color: '#94A3B8' }]}>{label}</Text>
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

  configBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 16,
  },
  configBannerText: { flex: 1, color: '#92400E', fontSize: 12, fontWeight: '600' },

  gateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    gap: 12,
  },
  gateBannerOffline: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FDBA74',
  },
  gateBannerService: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FDA4AF',
  },
  gateBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  gateBannerTextWrap: { flex: 1 },
  gateBannerTitle: { color: '#0F172A', fontSize: 13, fontWeight: '700' },
  gateBannerText: { color: '#475569', fontSize: 12, marginTop: 2 },
  gateBannerAction: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#E0E7FF',
  },
  gateBannerActionText: { color: '#1D4ED8', fontSize: 12, fontWeight: '700' },

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

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Animated,
  Easing,
  ScrollView,
  StatusBar,
  useWindowDimensions,
  Keyboard,
} from 'react-native';
import { Button, Text } from '@rneui/themed';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import FirebaseAuth from '../components/firebase-auth/FirebaseAuth';

// Types & Services
import { AuthStackParamList } from '../types/navigation';
import { useToast } from '../context/ToastContext';
import { useInternetStatus } from '../hooks/useInternetStatus';
import { loginWithEmail, sendPasswordReset } from '../services/auth';
import { SHOW_GOOGLE_LOGIN, SHOW_GITHUB_LOGIN } from '../config/featureFlags';
import { isGithubConfigured } from '../services/githubAuth';

// Components & Utils
import { colors } from '../utils/design';
import FullScreenSpinner from '../components/FullScreenSpinner';
import AuthField from '../components/AuthField';

type LoginScreenNavigationProp = NativeStackNavigationProp<AuthStackParamList>;

const getProviderErrorMessage = (error: unknown, fallback: string) => {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as any).message;
    if (typeof message === 'string' && message.trim().length) {
      return message;
    }
  }
  if (typeof error === 'string' && error.trim().length) {
    return error;
  }
  return fallback;
};

const LoginScreen = () => {
  const navigation = useNavigation<LoginScreenNavigationProp>();
  const route: any = useRoute();
  const { showToast } = useToast();
  const isOnline = useInternetStatus();

  // Dimensions
  const { height } = useWindowDimensions();
  const isSmallScreen = height < 700;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [socialLoading, setSocialLoading] = useState(false);

  const showGithub = SHOW_GITHUB_LOGIN && isGithubConfigured();
  const showGoogle = SHOW_GOOGLE_LOGIN;

  // --- ANIMATION ---
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    // Prefill email if navigated here after social conflict
    try {
      const pre = route?.params?.prefillEmail;
      if (pre && typeof pre === 'string') setEmail(pre);
    } catch (err) {
      // ignore
    }
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // --- HANDLERS ---
  const handleLogin = async () => {
    if (loading) return;
    Keyboard.dismiss();

    if (!email || !password)
      return Alert.alert('Missing Fields', 'Please enter both email and password.');

    if (!isOnline) {
      return Alert.alert('Offline', 'An internet connection is required to sign in.');
    }

    setLoading(true);
    try {
      await loginWithEmail(email, password);
      // If we were navigated here with a pending OAuth credential, link it now
      try {
        const pending: any = (route as any)?.params?.pendingCredential;
        if (pending) {
          const authMod: any = await import('../services/auth');
          await authMod.linkPendingCredentialWithPassword(email, password, pending);
        }
      } catch (linkErr) {
        // linking failed - allow normal login but surface a toast
          try {
          const msg = (linkErr as any)?.message || 'Linking failed';
          showToast('Account linked failed.');
        } catch (e) {}
      }
      showToast('Welcome back!');
      // Navigation is typically handled by auth state listener in App.tsx
      // But explicit replace is safe if auth state updates slowly
      (navigation.getParent() as any)?.replace('Main');
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.toLowerCase().includes('timed out')) {
        Alert.alert('Connection Timeout', 'The request took too long.', [
          { text: 'Retry', onPress: handleLogin },
          { text: 'Cancel', style: 'cancel' },
        ]);
      } else {
        Alert.alert('Login Failed', 'Invalid credentials or server error.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      return Alert.alert('Enter Email', 'Add your account email above so we can send reset steps.');
    }
    setResettingPassword(true);
    try {
      await sendPasswordReset(email);
      Alert.alert('Email Sent', 'Check your inbox for reset instructions.');
    } catch (err: any) {
      const msg = err?.message || 'Unable to send reset email right now.';
      Alert.alert('Reset Failed', msg);
    } finally {
      setResettingPassword(false);
    }
  };

  const handleGithubLogin = async () => {
    if (!showGithub) return;
    setSocialLoading(true);
    try {
      const mod = await import('../services/auth');
      await mod.startGithubSignIn('signIn');
    } catch (err) {
      const e: any = err || {};
      if (
        e?.message &&
        typeof e.message === 'string' &&
        e.message.includes('native module not available')
      ) {
        Alert.alert(
          'Google Sign-In Unavailable',
          'Google Sign-In native module is not available in this build. Use a development build / dev-client or run a native build (prebuild) so native modules are linked.'
        );
        return;
      }
      if (e.code === 'auth/account-exists-with-different-credential') {
        Alert.alert(
          'Account already exists',
          'You previously signed up using a different method.\n\nPlease sign in using your original method to securely link your accounts.'
        );
      } else {
        Alert.alert(
          'GitHub Login Failed',
          getProviderErrorMessage(err, 'Unable to connect to GitHub right now.')
        );
      }
    } finally {
      setSocialLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setSocialLoading(true);
    try {
      const mod = await import('../services/auth');
      await mod.startGoogleSignIn('signIn');
      showToast('Welcome!');
      (navigation.getParent() as any)?.replace('Main');
    } catch (err) {
      const e: any = err || {};
      // Try to read statusCodes if available
      // If account exists with different credential, redirect user to Login to enter password and link
      if (e && e.code === 'auth/account-exists-with-different-credential') {
        const prefill = e.email || undefined;
        (navigation as any).navigate('Login', { prefillEmail: prefill, pendingCredential: e.pendingCredential });
        Alert.alert('Account exists', 'An account with this email exists. Sign in with your existing method to link Google.');
        return;
      }

      try {
        const googleMod: any = require('@react-native-google-signin/google-signin');
        const { statusCodes } = googleMod;
        if (e && e.code) {
          if (e.code === statusCodes?.IN_PROGRESS) {
            Alert.alert('Sign-in in progress', 'A sign-in operation is already in progress.');
            return;
          }
          if (e.code === statusCodes?.PLAY_SERVICES_NOT_AVAILABLE) {
            Alert.alert('Play Services', 'Google Play Services not available or outdated.');
            return;
          }
        }
      } catch (err2) {
        // ignore module load errors
      }

      Alert.alert('Google Login Failed', getProviderErrorMessage(err, 'Unable to sign in with Google.'));
    } finally {
      setSocialLoading(false);
    }
  };

  const spinnerVisible = loading || socialLoading;
  const spinnerMessage = loading
    ? 'Authenticating...'
    : socialLoading
      ? 'Contacting provider...'
      : 'Authenticating...';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { minHeight: isSmallScreen ? '100%' : '90%', justifyContent: 'center' },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          <Animated.View
            style={[styles.card, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
          >
            {/* --- CARD HEADER: Centered Logo + Title --- */}
            <View style={styles.cardHeaderCenter}>
              <View style={styles.logoBadgeCentered}>
                <Image
                  source={require('../../assets/splash-icon.png')}
                  style={styles.logoCentered}
                  resizeMode="contain"
                  defaultSource={{ uri: 'https://via.placeholder.com/60' }}
                />
              </View>
              <Text style={styles.appName}>Welcome Back</Text>
              <Text style={styles.appTagline}>Sign in to continue to your finance vault</Text>
            </View>

            {/* --- FORM SECTION --- */}
            <View style={styles.formContainer}>
              <AuthField
                icon="mail-outline"
                placeholder="Email Address"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                value={email}
                onChangeText={setEmail}
                containerStyle={styles.fieldSpacing}
              />

              <AuthField
                icon="lock-outline"
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPass}
                containerStyle={styles.fieldSpacing}
                rightAccessory={
                  <TouchableOpacity
                    onPress={() => setShowPass(!showPass)}
                    style={styles.eyeIcon}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <MaterialIcon
                      name={showPass ? 'visibility' : 'visibility-off'}
                      color={colors.muted || '#9CA3AF'}
                      size={20}
                    />
                  </TouchableOpacity>
                }
              />

              <TouchableOpacity
                style={styles.forgotPassContainer}
                onPress={handleForgotPassword}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                disabled={resettingPassword}
              >
                <Text style={styles.forgotPassText}>
                  {resettingPassword ? 'Sending reset link...' : 'Forgot Password?'}
                </Text>
              </TouchableOpacity>

              <Button
                title={loading ? 'Verifying...' : 'Sign In'}
                onPress={handleLogin}
                loading={loading}
                disabled={loading || socialLoading || !isOnline}
                buttonStyle={styles.primaryButton}
                containerStyle={styles.buttonContainer}
                titleStyle={styles.buttonText}
                icon={
                  !loading ? (
                    <MaterialIcon name="login" size={20} color="white" style={{ marginRight: 8 }} />
                  ) : undefined
                }
              />

              {(showGithub || showGoogle) && (
                <FirebaseAuth
                  showGoogle={showGoogle}
                  showGithub={showGithub}
                  socialLoading={socialLoading}
                  onGooglePress={handleGoogleLogin}
                  onGithubPress={handleGithubLogin}
                />
              )}
            </View>

            {/* --- FOOTER INSIDE CARD --- */}
            <View style={styles.footerRow}>
              <Text style={styles.footerText}>Don't have an account?</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Register')}>
                <Text style={styles.linkText}>Create Account</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      <FullScreenSpinner visible={spinnerVisible} message={spinnerMessage} />
    </SafeAreaView>
  );
};

export default LoginScreen;

/* -------------------------------------
   STYLES
------------------------------------- */
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F0F2F5', // Consistent light grey background
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    paddingBottom: 50,
  },

  /* MAIN CARD STYLE */
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20, // Slightly more rounded
    padding: 24,
    width: '100%',
    maxWidth: 480, // Limit width for tablets
    alignSelf: 'center',

    // Shadows
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, // Softer shadow
    shadowRadius: 16,
    elevation: 6,
  },

  cardHeaderCenter: { alignItems: 'center', marginBottom: 24 },
  logoBadgeCentered: {
    width: 72,
    height: 72,
    borderRadius: 18,
    backgroundColor: '#F3F4F6', // Light background for logo container
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  logoCentered: { width: 44, height: 44 },
  appName: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text || '#111827',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  appTagline: {
    fontSize: 14,
    color: colors.muted || '#6B7280',
    fontWeight: '500',
    textAlign: 'center',
  },

  /* FORM */
  formContainer: {
    width: '100%',
  },
  fieldSpacing: {
    marginBottom: 16,
  },
  eyeIcon: {
    padding: 8,
  },
  forgotPassContainer: {
    alignSelf: 'flex-end',
    marginBottom: 24,
    marginTop: -4, // Pull up slightly
  },
  forgotPassText: {
    color: colors.primary || '#2563EB',
    fontSize: 13,
    fontWeight: '600',
  },

  /* SOCIAL BUTTONS */
  socialWrapper: {
    marginTop: 24,
  },
  socialDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  socialLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  socialText: {
    marginHorizontal: 12,
    fontSize: 12,
    color: colors.muted || '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
  },
  socialButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  socialButton: {
    borderRadius: 12,
    borderColor: '#E5E7EB',
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  socialButtonText: {
    color: colors.text || '#111827',
    fontWeight: '600',
    fontSize: 14,
  },
  socialButtonContainer: {
    flex: 1,
  },

  /* BUTTONS */
  primaryButton: {
    backgroundColor: colors.primary || '#2563EB',
    paddingVertical: 14,
    borderRadius: 12,
    elevation: 2,
  },
  buttonContainer: {
    width: '100%',
    borderRadius: 12,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
  },

  /* FOOTER */
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  footerText: {
    color: colors.muted || '#6B7280',
    fontSize: 14,
    marginRight: 6,
  },
  linkText: {
    color: colors.primary || '#2563EB',
    fontWeight: '700',
    fontSize: 14,
  },
});

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

// Types & Services
import { AuthStackParamList } from '../types/navigation';
import { useToast } from '../context/ToastContext';
import { useInternetStatus } from '../hooks/useInternetStatus';
import { loginWithEmail, sendPasswordReset, useGithubAuth } from '../services/firebaseAuth';

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
  // If screen is short (like older Androids), we reduce padding
  const isSmallScreen = height < 700;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [socialLoading, setSocialLoading] = useState(false);

  const { githubAvailable, signIn: startGithubSignIn } = useGithubAuth();

  // --- ANIMATION ---
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

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
        easing: Easing.out(Easing.quad),
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 7,
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
      showToast('Welcome back!');
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

  // Google login removed. Use only Firebase-native Google login elsewhere.

  const handleGithubLogin = async () => {
    if (!githubAvailable) return;
    setSocialLoading(true);
    try {
      await startGithubSignIn();
    } catch (err) {
      const e: any = err || {};
      if (e.code === 'auth/account-exists-with-different-credential') {
        const methods = e.methods || [];
        const email = e.email || '';
        const providerText = methods.join(', ') || 'another provider';
        Alert.alert(
          'Account Exists',
          `An account already exists for ${email} using ${providerText}. Sign in with that provider to link GitHub to your account.`,
          [
            {
              text: 'OK',
            },
            ...(methods.includes('password')
              ? [
                  {
                    text: 'Sign in with Email',
                    onPress: () => navigation.navigate('Login' as any, { prefillEmail: email }),
                  },
                ]
              : []),
          ]
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
            style={[styles.card, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}
          >
            {/* --- HEADER ROW (Logo Left | Text Right) --- */}
            <View style={styles.brandHeader}>
              <View style={styles.logoContainer}>
                <Image
                  source={require('../../assets/splash-icon.png')}
                  style={styles.logo}
                  resizeMode="contain"
                />
              </View>
              <View style={styles.brandTexts}>
                <Text style={styles.appName}>DhanDiary</Text>
                <Text style={styles.appTagline}>Sign in to continue</Text>
              </View>
            </View>

            {/* TRUST BADGES */}
            <View style={styles.trustRow}>
              <View style={styles.trustBadge}>
                <MaterialIcon name="lock" size={14} color={colors.primary} />
                <Text style={styles.trustText}>Encrypted</Text>
              </View>
              <View style={styles.dividerVertical} />
              <View style={styles.trustBadge}>
                <MaterialIcon name="cloud-sync" size={14} color={colors.accentGreen || '#4CAF50'} />
                <Text style={styles.trustText}>Cloud Sync</Text>
              </View>
            </View>

            {/* DIVIDER */}
            <View style={styles.divider} />

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
                rightAccessory={
                  <TouchableOpacity onPress={() => setShowPass(!showPass)} style={styles.eyeIcon}>
                    <MaterialIcon
                      name={showPass ? 'visibility' : 'visibility-off'}
                      color={colors.muted || '#999'}
                      size={22}
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
                  {resettingPassword ? 'Sending reset...' : 'Forgot Password?'}
                </Text>
              </TouchableOpacity>

              <Button
                title={loading ? 'Verifying...' : 'Sign In'}
                onPress={handleLogin}
                loading={loading}
                disabled={loading || !isOnline}
                buttonStyle={styles.primaryButton}
                containerStyle={styles.buttonContainer}
                titleStyle={styles.buttonText}
                icon={
                  !loading ? (
                    <MaterialIcon name="login" size={20} color="white" style={{ marginRight: 8 }} />
                  ) : undefined
                }
              />

              {githubAvailable && (
                <View style={styles.socialWrapper}>
                  <View style={styles.socialDivider}>
                    <View style={styles.socialLine} />
                    <Text style={styles.socialText}>or continue with</Text>
                    <View style={styles.socialLine} />
                  </View>

                  <View style={styles.socialButtonsRow}>
                    {/* Google login removed */}
                    {githubAvailable && (
                      <Button
                        type="outline"
                        icon={
                          <FontAwesome
                            name="github"
                            size={18}
                            color={colors.primary}
                            style={{ marginRight: 8 }}
                          />
                        }
                        title="GitHub"
                        onPress={handleGithubLogin}
                        disabled={socialLoading}
                        buttonStyle={styles.socialButton}
                        titleStyle={styles.socialButtonText}
                        containerStyle={styles.socialButtonContainer}
                      />
                    )}
                  </View>
                </View>
              )}
            </View>

            {/* --- FOOTER INSIDE CARD --- */}
            <View style={styles.footerRow}>
              <Text style={styles.footerText}>New here?</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Register')}>
                <Text style={styles.linkText}>Create Account</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>

          {/* SECURITY BADGE (Outside card, at bottom) */}
          <View style={styles.securityBadge}>
            <MaterialIcon name="security" size={14} color={colors.muted || '#999'} />
            <Text style={styles.securityText}>Secured by DhanDiary</Text>
          </View>
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
    backgroundColor: '#F0F2F5', // Light grey background for the whole screen
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    paddingBottom: 50, // Extra space at bottom for scrolling
  },

  /* MAIN CARD STYLE */
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 450, // Limits width on tablets
    alignSelf: 'center',

    // Smooth shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },

  /* HEADER ROW: LOGO + TEXT */
  brandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  // --- UPDATED LOGO CONTAINER (No Border, Transparent) ---
  logoContainer: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    // Removed borderWidth, borderColor, and backgroundColor
  },
  logo: {
    width: 56, // Full size of container
    height: 56,
  },
  brandTexts: {
    flex: 1,
    justifyContent: 'center',
  },
  appName: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  appTagline: {
    fontSize: 14,
    color: colors.muted || '#666',
    fontWeight: '500',
  },

  /* TRUST BADGES */
  trustRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 50,
    alignSelf: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  trustBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dividerVertical: {
    width: 1,
    height: 12,
    backgroundColor: '#DDE2E5',
    marginHorizontal: 12,
  },
  trustText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.subtleText || '#555',
  },

  divider: {
    height: 1,
    backgroundColor: '#F0F0F0',
    width: '100%',
    marginBottom: 24,
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
    marginTop: 4,
  },
  forgotPassText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },

  socialWrapper: {
    marginTop: 24,
  },
  socialDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  socialLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E0E0E0',
  },
  socialText: {
    marginHorizontal: 12,
    fontSize: 12,
    color: colors.muted || '#777',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  socialButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  socialButton: {
    borderRadius: 10,
    borderColor: colors.border || '#DDD',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  socialButtonText: {
    color: colors.primary,
    fontWeight: '700',
  },
  socialButtonContainer: {
    flex: 1,
  },

  /* BUTTONS */
  primaryButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
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
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F5F5F5',
  },
  footerText: {
    color: colors.muted || '#888',
    fontSize: 14,
    marginRight: 6,
  },
  linkText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 14,
  },

  /* BOTTOM BADGE */
  securityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    gap: 6,
    opacity: 0.6,
  },
  securityText: {
    fontSize: 12,
    color: colors.muted || '#999',
    fontWeight: '500',
  },
});

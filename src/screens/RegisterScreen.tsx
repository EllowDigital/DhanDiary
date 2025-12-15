import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Image,
  Animated,
  Easing,
  ScrollView,
  StatusBar,
  useWindowDimensions,
  Keyboard,
  LayoutAnimation,
} from 'react-native';
import { Button, Text } from '@rneui/themed';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import FontAwesome from '@expo/vector-icons/FontAwesome';

// Types & Services
import { AuthStackParamList } from '../types/navigation';
import { useToast } from '../context/ToastContext';
import { useInternetStatus } from '../hooks/useInternetStatus';
import { registerWithEmail } from '../services/firebaseAuth';
import { SHOW_GITHUB_LOGIN } from '../config/featureFlags';

// Components & Utils
import { colors } from '../utils/design';
import FullScreenSpinner from '../components/FullScreenSpinner';
import AuthField from '../components/AuthField';

type RegisterScreenNavigationProp = NativeStackNavigationProp<AuthStackParamList>;

const readProviderError = (error: unknown, fallback: string) => {
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

const RegisterScreen = () => {
  const navigation = useNavigation<RegisterScreenNavigationProp>();
  const { showToast } = useToast();
  const isOnline = useInternetStatus();

  // Responsive Layout Logic
  const { height } = useWindowDimensions();
  const isSmallScreen = height < 700;

  // --- STATE ---
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState(false);

  // Validation State
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // --- ANIMATION REFS ---
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    // Entrance Animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
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

  // --- LOGIC ---
  const getPasswordStrength = (pass: string) => {
    if (pass.length === 0) return 0;
    let score = 0;
    if (pass.length >= 8) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    return score; // Max 3
  };
  const passStrength = getPasswordStrength(password);

  const showGithub = SHOW_GITHUB_LOGIN;

  // Optimized Handlers
  const handleEmailChange = useCallback(
    (text: string) => {
      setEmail(text);
      if (emailError) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setEmailError(null);
      }
    },
    [emailError]
  );

  const handlePasswordChange = useCallback(
    (text: string) => {
      // Smoothly animate the strength meter appearing/changing
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setPassword(text);
      if (passwordError) setPasswordError(null);
    },
    [passwordError]
  );

  const handleRegister = useCallback(async () => {
    if (loading || socialLoading) return;
    if (!isOnline)
      return Alert.alert('Offline', 'Internet connection required to create an account.');

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setEmailError(null);
    setPasswordError(null);
    Keyboard.dismiss();

    if (!name.trim()) return Alert.alert('Missing Name', 'Please enter your full name.');

    if (!email.trim()) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
      setEmailError('Email is required');
      return;
    }

    if (password.length < 8) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
      setPasswordError('Must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      await registerWithEmail(name.trim(), email.trim(), password);
      showToast('Account created!');
      (navigation.getParent() as any)?.replace('Main');
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('timed out')) {
        Alert.alert('Timeout', 'Server took too long to respond. Try again?');
      } else {
        Alert.alert('Registration Failed', msg);
      }
    } finally {
      setLoading(false);
    }
  }, [loading, socialLoading, isOnline, name, email, password, navigation, showToast]);

  const handleOpenTerms = useCallback(() => navigation.navigate('Terms'), [navigation]);
  const handleOpenPrivacy = useCallback(() => navigation.navigate('PrivacyPolicy'), [navigation]);

  // Google signup removed. Use only Firebase-native Google login elsewhere.

  const handleGithubSignup = async () => {
    if (!showGithub) return;
    setSocialLoading(true);
    try {
      const mod = await import('../services/firebaseAuth');
      await mod.startGithubSignIn('signIn');
    } catch (err) {
      const e: any = err || {};
      if (e.code === 'auth/account-exists-with-different-credential') {
        Alert.alert(
          'Account already exists',
          'You previously signed up using a different method.\n\nPlease sign in using your original method to securely link your accounts.\n\nIf the app was closed, just retry the social sign-in.'
        );
      } else {
        Alert.alert(
          'GitHub Sign-up Failed',
          readProviderError(err, 'Unable to reach GitHub right now.')
        );
      }
    } finally {
      setSocialLoading(false);
    }
  };

  const spinnerVisible = loading || socialLoading;
  const spinnerMessage = loading
    ? 'Creating your vault...'
    : socialLoading
      ? 'Contacting provider...'
      : 'Creating your vault...';

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
            {/* --- HEADER ROW (Logo Left | Text Right) --- */}
            <View style={styles.brandHeader}>
              <View style={styles.logoContainer}>
                <Image
                  source={(() => {
                    try {
                      const req: any = typeof globalThis !== 'undefined' && typeof (globalThis as any).require === 'function' ? (globalThis as any).require : typeof require === 'function' ? require : null;
                      return req ? req('../../assets/splash-icon.png') : undefined;
                    } catch (e) {
                      return undefined;
                    }
                  })()}
                  style={styles.logo}
                  resizeMode="contain"
                />
              </View>
              <View style={styles.brandTexts}>
                <Text style={styles.appName}>Join DhanDiary</Text>
                <Text style={styles.appTagline}>Start your journey today</Text>
              </View>
            </View>

            {/* DIVIDER */}
            <View style={styles.divider} />

            {/* --- TRUST BADGES (Pill Style) --- */}
            <View style={styles.trustRow}>
              <View style={styles.trustBadge}>
                <MaterialIcon
                  name="verified-user"
                  size={12}
                  color={colors.accentGreen || 'green'}
                />
                <Text style={styles.trustText}>Free Forever</Text>
              </View>
              <View style={styles.verticalDivider} />
              <View style={styles.trustBadge}>
                <MaterialIcon name="lock" size={12} color={colors.primary} />
                <Text style={styles.trustText}>Encrypted</Text>
              </View>
            </View>

            {/* --- FORM --- */}
            <View style={styles.formContainer}>
              <AuthField
                icon="person-outline"
                placeholder="Full Name"
                value={name}
                onChangeText={setName}
                containerStyle={styles.fieldSpacing}
              />

              <AuthField
                icon="mail-outline"
                placeholder="Email Address"
                value={email}
                onChangeText={handleEmailChange}
                keyboardType="email-address"
                autoCapitalize="none"
                error={emailError}
                containerStyle={styles.fieldSpacing}
              />

              <AuthField
                icon="lock-outline"
                placeholder="Create Password"
                value={password}
                secureTextEntry={!showPass}
                onChangeText={handlePasswordChange}
                error={passwordError}
                rightAccessory={
                  <TouchableOpacity onPress={() => setShowPass(!showPass)} style={styles.eyeIcon}>
                    <MaterialIcon
                      name={showPass ? 'visibility' : 'visibility-off'}
                      size={20}
                      color={colors.muted || '#999'}
                    />
                  </TouchableOpacity>
                }
              />

              {/* PASSWORD STRENGTH */}
              {password.length > 0 && (
                <View style={styles.strengthWrapper}>
                  <View style={styles.strengthContainer}>
                    <View
                      style={[
                        styles.strengthBar,
                        {
                          backgroundColor:
                            passStrength >= 1
                              ? passStrength >= 2
                                ? colors.accentGreen || '#4CAF50'
                                : colors.accentOrange || '#FF9800'
                              : colors.accentRed || '#F44336',
                          flex: passStrength,
                        },
                      ]}
                    />
                    <View
                      style={[
                        styles.strengthBar,
                        { backgroundColor: '#E0E0E0', flex: 3 - passStrength },
                      ]}
                    />
                  </View>
                  <Text style={styles.strengthText}>
                    {passStrength === 0
                      ? 'Too short'
                      : passStrength === 1
                        ? 'Weak'
                        : passStrength === 2
                          ? 'Good'
                          : 'Strong'}
                  </Text>
                </View>
              )}

              <Button
                title={loading ? 'Creating...' : 'Create Account'}
                onPress={handleRegister}
                loading={loading}
                disabled={loading || socialLoading || !isOnline}
                buttonStyle={styles.primaryButton}
                containerStyle={styles.buttonContainer}
                titleStyle={styles.buttonText}
                icon={
                  !loading ? (
                    <MaterialIcon
                      name="arrow-forward"
                      size={18}
                      color="white"
                      style={{ marginRight: 8 }}
                    />
                  ) : undefined
                }
              />

              {showGithub && (
                <View style={styles.socialWrapper}>
                  <View style={styles.socialDivider}>
                    <View style={styles.socialLine} />
                    <Text style={styles.socialText}>or sign up with</Text>
                    <View style={styles.socialLine} />
                  </View>

                  <View style={styles.socialButtonsRow}>
                    {/* Google signup removed */}
                    {showGithub && (
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
                        onPress={handleGithubSignup}
                        disabled={socialLoading}
                        buttonStyle={styles.socialButton}
                        titleStyle={styles.socialButtonText}
                        containerStyle={styles.socialButtonContainer}
                      />
                    )}
                  </View>
                </View>
              )}

              {/* TERMS TEXT */}
              <View style={styles.termsContainer}>
                <Text style={styles.termsText}>
                  By signing up, you agree to our{' '}
                  <Text style={styles.termsLink} onPress={handleOpenTerms}>
                    Terms
                  </Text>{' '}
                  and{' '}
                  <Text style={styles.termsLink} onPress={handleOpenPrivacy}>
                    Privacy Policy
                  </Text>
                  .
                </Text>
              </View>
            </View>

            {/* --- FOOTER INSIDE CARD --- */}
            <View style={styles.footerRow}>
              <Text style={styles.footerText}>Already have an account?</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                <Text style={styles.linkText}>Log In</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>

          {/* SECURITY BADGE */}
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

export default RegisterScreen;

/* -----------------------------
   STYLES
----------------------------- */
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F0F2F5',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    paddingBottom: 50,
  },

  /* MAIN CARD */
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 450,
    alignSelf: 'center',

    // Shadows
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },

  /* HEADER */
  brandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  // --- UPDATED LOGO CONTAINER (Clean, No Border) ---
  logoContainer: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12, // Adjusted margin for transparent look
    // Removed borderWidth, borderColor, backgroundColor
  },
  logo: {
    width: 56, // Full fill
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

  divider: {
    height: 1,
    backgroundColor: '#F0F0F0',
    width: '100%',
    marginBottom: 20,
  },

  /* TRUST PILLS */
  trustRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 50,
    alignSelf: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  trustBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  verticalDivider: {
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

  /* STRENGTH METER */
  strengthWrapper: {
    marginTop: 4,
    marginBottom: 16,
  },
  strengthContainer: {
    flexDirection: 'row',
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    gap: 4,
  },
  strengthBar: {
    height: '100%',
    borderRadius: 2,
  },
  strengthText: {
    fontSize: 11,
    color: colors.muted || '#888',
    marginTop: 6,
    textAlign: 'right',
  },

  /* SOCIAL BUTTONS */
  socialWrapper: {
    marginTop: 20,
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
    marginTop: 8,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
  },

  /* TERMS */
  termsContainer: {
    marginTop: 16,
    paddingHorizontal: 4,
  },
  termsText: {
    fontSize: 12,
    color: colors.muted || '#888',
    textAlign: 'center',
    lineHeight: 18,
  },
  termsLink: {
    color: colors.primary,
    fontWeight: '700',
  },

  /* FOOTER */
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
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

  /* BADGE OUTSIDE CARD */
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

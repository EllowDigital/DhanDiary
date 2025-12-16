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
  UIManager,
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

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setPassword(text);
      if (passwordError) setPasswordError(null);
    },
    [passwordError]
  );

  const performRegister = useCallback(async () => {
    if (loading || socialLoading) return;
    if (!isOnline) return Alert.alert('Offline', 'Internet connection required.');

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
      // Navigation is usually handled by auth state listener
    } catch (err: any) {
      const msg = err?.message || String(err);
      Alert.alert('Registration Failed', msg);
    } finally {
      setLoading(false);
    }
  }, [loading, socialLoading, isOnline, name, email, password, showToast]);

  const handleRegister = useCallback(() => {
    Alert.alert(
      'Create Account',
      'By continuing, you agree to our Terms and Privacy Policy.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Agree & Create', onPress: performRegister },
      ],
      { cancelable: true }
    );
  }, [performRegister]);

  const handleGithubSignup = async () => {
    if (!showGithub) return;
    setSocialLoading(true);
    try {
      const mod = await import('../services/firebaseAuth');
      await mod.startGithubSignIn('signIn');
    } catch (err: any) {
      Alert.alert('GitHub Sign-up Failed', readProviderError(err, 'Unable to reach GitHub.'));
    } finally {
      setSocialLoading(false);
    }
  };

  const spinnerVisible = loading || socialLoading;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background || '#F0F2F5'} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { minHeight: isSmallScreen ? '100%' : '90%' },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View
            style={[styles.card, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
          >
            {/* --- HEADER --- */}
            <View style={styles.cardHeaderCenter}>
              <View style={styles.logoBadgeCentered}>
                <Image
                  source={require('../../assets/splash-icon.png')}
                  style={styles.logoCentered}
                  resizeMode="contain"
                  defaultSource={{ uri: 'https://via.placeholder.com/60' }}
                />
              </View>
              <Text style={styles.appName}>Create Account</Text>
              <Text style={styles.appTagline}>Join DhanDiary today</Text>
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
                                ? passStrength >= 3
                                  ? '#4CAF50'
                                  : '#FF9800'
                                : '#F44336'
                              : '#E0E0E0',
                          flex: passStrength || 0.1,
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
                </View>
              )}

              <View style={styles.termsContainer}>
                <Text style={styles.termsText}>
                  By joining, you agree to our{' '}
                  <Text style={styles.termsLink} onPress={() => navigation.navigate('Terms')}>
                    Terms
                  </Text>{' '}
                  &{' '}
                  <Text
                    style={styles.termsLink}
                    onPress={() => navigation.navigate('PrivacyPolicy')}
                  >
                    Privacy Policy
                  </Text>
                  .
                </Text>
              </View>
            </View>

            {/* --- FOOTER --- */}
            <View style={styles.footerRow}>
              <Text style={styles.footerText}>Already have an account?</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                <Text style={styles.linkText}>Log In</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      <FullScreenSpinner
        visible={spinnerVisible}
        message={loading ? 'Creating account...' : 'Connecting...'}
      />
    </SafeAreaView>
  );
};

export default RegisterScreen;

/* STYLES */
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F0F2F5' },
  scrollContent: { flexGrow: 1, padding: 20, justifyContent: 'center' },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 5,
  },

  /* HEADER */
  cardHeaderCenter: { alignItems: 'center', marginBottom: 20 },
  logoBadgeCentered: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  logoCentered: { width: 40, height: 40 },
  appName: { fontSize: 22, fontWeight: '800', color: colors.text || '#111827', marginBottom: 4 },
  appTagline: { fontSize: 14, color: colors.muted || '#6B7280', fontWeight: '500' },

  /* FORM */
  formContainer: { width: '100%' },
  fieldSpacing: { marginBottom: 16 },
  eyeIcon: { padding: 8 },

  /* STRENGTH METER */
  strengthWrapper: { marginTop: 4, marginBottom: 16 },
  strengthContainer: {
    flexDirection: 'row',
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    gap: 4,
  },
  strengthBar: { height: '100%', borderRadius: 2 },
  strengthText: { fontSize: 11, color: colors.muted || '#888', marginTop: 6, textAlign: 'right' },

  /* BUTTONS */
  primaryButton: {
    backgroundColor: colors.primary || '#2563EB',
    paddingVertical: 12,
    borderRadius: 12,
  },
  buttonContainer: { marginTop: 8, borderRadius: 12 },
  buttonText: { fontSize: 16, fontWeight: '700' },

  /* SOCIAL */
  socialWrapper: { marginTop: 24 },
  socialDivider: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  socialLine: { flex: 1, height: 1, backgroundColor: '#E5E7EB' },
  socialText: {
    marginHorizontal: 12,
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  socialButton: { borderRadius: 10, borderColor: '#E5E7EB', paddingVertical: 12, borderWidth: 1 },
  socialButtonText: { color: colors.text || '#111827', fontWeight: '600' },
  socialButtonContainer: { width: '100%' },

  /* TERMS */
  termsContainer: { marginTop: 16, paddingHorizontal: 4 },
  termsText: {
    fontSize: 12,
    color: colors.muted || '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
  },
  termsLink: { color: colors.primary || '#2563EB', fontWeight: '700' },

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
  footerText: { color: '#6B7280', fontSize: 14, marginRight: 6 },
  linkText: { color: colors.primary || '#2563EB', fontWeight: '700', fontSize: 14 },
});

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Animated,
  Easing,
  ScrollView,
  StatusBar,
  Keyboard,
  Image,
} from 'react-native';
import { Button, Text } from '@rneui/themed';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import { useToast } from '../context/ToastContext';
import { useNavigation } from '@react-navigation/native';
import { useInternetStatus } from '../hooks/useInternetStatus';
import AuthField from '../components/AuthField';
import FullScreenSpinner from '../components/FullScreenSpinner';

import { colors } from '../utils/design';
import { loginWithEmail, registerWithEmail, sendPasswordReset } from '../services/auth';
import { SHOW_GOOGLE_LOGIN, SHOW_GITHUB_LOGIN } from '../config/featureFlags';

const AuthScreen: React.FC = () => {
  const { showToast } = useToast();
  const navigation: any = useNavigation();
  const isOnline = useInternetStatus();

  // State
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState(false);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 8, tension: 40, useNativeDriver: true }),
    ]).start();
  }, []);

  // --- ACTIONS ---

  const handleLogin = async () => {
    if (loading) return;
    Keyboard.dismiss();

    if (!email || !password)
      return Alert.alert('Missing Fields', 'Please enter both email and password.');
    if (!isOnline) return Alert.alert('Offline', 'An internet connection is required.');

    setLoading(true);
    try {
      await loginWithEmail(email, password);
      // Ensure we navigate to Main after successful login
      try {
        (navigation.getParent() as any)?.reset({ index: 0, routes: [{ name: 'Main' }] });
      } catch (err) {
        // ignore navigation errors in unusual setups
      }
    } catch (err: any) {
      Alert.alert('Login Failed', err?.message || 'Invalid credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (loading) return;
    Keyboard.dismiss();

    if (!name.trim()) return Alert.alert('Missing Name', 'Please enter your full name.');
    if (!email.trim()) return Alert.alert('Missing Email', 'Please enter your email.');
    if (password.length < 8)
      return Alert.alert('Weak Password', 'Password must be at least 8 characters.');
    if (!isOnline) return Alert.alert('Offline', 'Internet connection required.');

    setLoading(true);
    try {
      await registerWithEmail(name.trim(), email.trim(), password);
      showToast('Account created successfully!');
      try {
        (navigation.getParent() as any)?.reset({ index: 0, routes: [{ name: 'Main' }] });
      } catch (err) {
        // ignore
      }
    } catch (err: any) {
      Alert.alert('Registration Failed', err?.message || 'Unable to create account.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) return Alert.alert('Enter Email', 'Please enter your email to reset password.');

    setLoading(true);
    try {
      await sendPasswordReset(email);
      Alert.alert('Email Sent', 'Check your inbox for password reset instructions.');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to send reset email.');
    } finally {
      setLoading(false);
    }
  };

  const handleSocialLogin = async (provider: 'google' | 'github') => {
    if (loading || socialLoading) return;
    setSocialLoading(true);
    try {
      if (provider === 'google') {
        const mod = await import('../services/googleAuth');
        await mod.signInWithGoogle();
      } else {
        const mod = await import('../services/auth');
        await mod.startGithubSignIn('signIn');
      }
      try {
        (navigation.getParent() as any)?.reset({ index: 0, routes: [{ name: 'Main' }] });
      } catch (err) {
        // ignore
      }
    } catch (err: any) {
      Alert.alert(`${provider === 'google' ? 'Google' : 'GitHub'} Sign-in Failed`, err?.message);
    } finally {
      setSocialLoading(false);
    }
  };

  const isLoading = loading || socialLoading;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background || '#F0F2F5'} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={[styles.card, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}
          >
            {/* LOGO & TITLE */}
            <View style={styles.headerContainer}>
              <View style={styles.logoBadge}>
                <Image
                  source={require('../../assets/splash-icon.png')} // Ensure this path is correct
                  style={styles.logoImage}
                  resizeMode="contain"
                  defaultSource={{ uri: 'https://via.placeholder.com/60' }} // Fallback
                />
              </View>
              <Text style={styles.appName}>Welcome Back</Text>
              <Text style={styles.appTagline}>
                {mode === 'login'
                  ? 'Sign in to access your finances'
                  : 'Create an account to get started'}
              </Text>
            </View>

            {/* FORM FIELDS */}
            <View style={styles.formContainer}>
              {mode === 'register' && (
                <AuthField
                  icon="person-outline"
                  placeholder="Full Name"
                  value={name}
                  onChangeText={setName}
                  containerStyle={styles.fieldSpacing}
                  autoCapitalize="words"
                />
              )}

              <AuthField
                icon="mail-outline"
                placeholder="Email Address"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
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

              {mode === 'login' && (
                <TouchableOpacity style={styles.forgotPassContainer} onPress={handleForgotPassword}>
                  <Text style={styles.forgotPassText}>Forgot Password?</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* ACTION BUTTON */}
            <Button
              title={
                loading
                  ? mode === 'login'
                    ? 'Signing In...'
                    : 'Creating...'
                  : mode === 'login'
                    ? 'Sign In'
                    : 'Create Account'
              }
              onPress={mode === 'login' ? handleLogin : handleRegister}
              disabled={isLoading}
              loading={loading}
              buttonStyle={styles.primaryButton}
              containerStyle={styles.buttonContainer}
              titleStyle={styles.buttonText}
              icon={
                !loading ? (
                  <MaterialIcon
                    name={mode === 'login' ? 'login' : 'person-add'}
                    size={20}
                    color="white"
                    style={{ marginRight: 8 }}
                  />
                ) : undefined
              }
            />

            {/* TERMS (Register Only) */}
            {mode === 'register' && (
              <Text style={styles.termsText}>
                By joining, you agree to our{' '}
                <Text style={styles.linkText} onPress={() => navigation.navigate('Terms')}>
                  Terms
                </Text>{' '}
                and{' '}
                <Text style={styles.linkText} onPress={() => navigation.navigate('PrivacyPolicy')}>
                  Privacy Policy
                </Text>
                .
              </Text>
            )}

            {/* SOCIAL LOGIN */}
            {(SHOW_GOOGLE_LOGIN || SHOW_GITHUB_LOGIN) && (
              <View style={styles.socialSection}>
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>OR</Text>
                  <View style={styles.dividerLine} />
                </View>

                <View style={styles.socialRow}>
                  {SHOW_GOOGLE_LOGIN && (
                    <Button
                      type="outline"
                      title="Google"
                      icon={
                        <FontAwesome
                          name="google"
                          size={16}
                          color={colors.text}
                          style={{ marginRight: 8 }}
                        />
                      }
                      buttonStyle={styles.socialButton}
                      titleStyle={styles.socialButtonText}
                      containerStyle={{ flex: 1 }}
                      onPress={() => handleSocialLogin('google')}
                      disabled={isLoading}
                    />
                  )}
                  {SHOW_GITHUB_LOGIN && (
                    <Button
                      type="outline"
                      title="GitHub"
                      icon={
                        <FontAwesome
                          name="github"
                          size={16}
                          color={colors.text}
                          style={{ marginRight: 8 }}
                        />
                      }
                      buttonStyle={styles.socialButton}
                      titleStyle={styles.socialButtonText}
                      containerStyle={{ flex: 1 }}
                      onPress={() => handleSocialLogin('github')}
                      disabled={isLoading}
                    />
                  )}
                </View>
              </View>
            )}

            {/* SWITCH MODE */}
            <View style={styles.footerRow}>
              <Text style={styles.footerText}>
                {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
              </Text>
              <TouchableOpacity onPress={() => setMode(mode === 'login' ? 'register' : 'login')}>
                <Text style={styles.switchModeText}>{mode === 'login' ? 'Sign Up' : 'Log In'}</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      <FullScreenSpinner visible={isLoading} />
    </SafeAreaView>
  );
};

export default AuthScreen;

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F0F2F5' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 20 },

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
  headerContainer: { alignItems: 'center', marginBottom: 24 },
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  logoImage: { width: 40, height: 40 },
  appName: { fontSize: 22, fontWeight: '800', color: colors.text || '#111827' },
  appTagline: { fontSize: 14, color: colors.muted || '#6B7280', marginTop: 4, textAlign: 'center' },

  /* FORM */
  formContainer: { marginBottom: 20 },
  fieldSpacing: { marginBottom: 16 },
  eyeIcon: { padding: 8 },
  forgotPassContainer: { alignSelf: 'flex-end', marginTop: -8, marginBottom: 8 },
  forgotPassText: { color: colors.primary || '#2563EB', fontSize: 13, fontWeight: '600' },

  /* BUTTONS */
  buttonContainer: { marginTop: 8 },
  primaryButton: {
    backgroundColor: colors.primary || '#2563EB',
    paddingVertical: 14,
    borderRadius: 12,
    elevation: 2,
  },
  buttonText: { fontSize: 16, fontWeight: '700' },

  /* TERMS */
  termsText: {
    fontSize: 12,
    color: colors.muted || '#6B7280',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18,
  },
  linkText: { color: colors.primary || '#2563EB', fontWeight: '700' },

  /* SOCIAL */
  socialSection: { marginTop: 24 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E5E7EB' },
  dividerText: { marginHorizontal: 12, fontSize: 12, color: '#9CA3AF', fontWeight: '600' },
  socialRow: { flexDirection: 'row', gap: 12 },
  socialButton: { borderColor: '#E5E7EB', borderRadius: 10, paddingVertical: 10, borderWidth: 1 },
  socialButtonText: { color: colors.text || '#111827', fontSize: 14, fontWeight: '600' },

  /* FOOTER */
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
    alignItems: 'center',
  },
  footerText: { color: '#6B7280', fontSize: 14 },
  switchModeText: {
    color: colors.primary || '#2563EB',
    fontWeight: '700',
    marginLeft: 6,
    fontSize: 14,
  },
});

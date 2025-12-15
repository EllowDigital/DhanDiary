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
  useWindowDimensions,
  Keyboard,
} from 'react-native';
import { Button, Text } from '@rneui/themed';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Image } from 'react-native';

import { useToast } from '../context/ToastContext';
import { useNavigation } from '@react-navigation/native';
import { useInternetStatus } from '../hooks/useInternetStatus';
import AuthField from '../components/AuthField';
import FullScreenSpinner from '../components/FullScreenSpinner';
import ScreenHeader from '../components/ScreenHeader';

import { colors } from '../utils/design';
import { loginWithEmail, registerWithEmail, sendPasswordReset } from '../services/firebaseAuth';
import { SHOW_GOOGLE_LOGIN, SHOW_GITHUB_LOGIN } from '../config/featureFlags';

const AuthScreen: React.FC = () => {
  const { showToast } = useToast();
  const navigation: any = useNavigation();
  const isOnline = useInternetStatus();
  const showGithub = SHOW_GITHUB_LOGIN;
  const showGoogle = SHOW_GOOGLE_LOGIN;

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
        easing: Easing.out(Easing.quad),
      }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 7, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleLogin = async () => {
    if (loading) return;
    Keyboard.dismiss();
    if (!email || !password)
      return Alert.alert('Missing Fields', 'Please enter both email and password.');
    if (!isOnline) return Alert.alert('Offline', 'An internet connection is required to sign in.');
    setLoading(true);
    try {
      await loginWithEmail(email, password);
      showToast('Welcome back!');
      // Navigate to main app after successful login
      try {
        const parent = navigation.getParent?.();
        if (parent?.replace) parent.replace('Main');
        else navigation.navigate?.('Main');
      } catch (navErr) {
        // ignore navigation errors
      }
    } catch (err: any) {
      Alert.alert('Login Failed', err?.message || 'Invalid credentials or server error.');
    } finally {
      setLoading(false);
    }
  };

  const performRegister = async () => {
    if (loading) return;
    Keyboard.dismiss();
    if (!name.trim()) return Alert.alert('Missing Name', 'Please enter your full name.');
    if (!email.trim()) return Alert.alert('Missing Email', 'Please enter your email.');
    if (password.length < 8)
      return Alert.alert('Weak Password', 'Password must be at least 8 characters.');
    if (!isOnline)
      return Alert.alert('Offline', 'Internet connection required to create an account.');
    setLoading(true);
    try {
      await registerWithEmail(name.trim(), email.trim(), password);
      showToast('Account created!');
      try {
        const parent = navigation.getParent?.();
        if (parent?.replace) parent.replace('Main');
        else navigation.navigate?.('Main');
      } catch (navErr) {}
    } catch (err: any) {
      Alert.alert('Registration Failed', err?.message || 'Unable to register.');
    } finally {
      setLoading(false);
    }
  };

  // Use `performRegister` directly; show inline consent text below the button.

  const handleForgotPassword = async () => {
    if (!email)
      return Alert.alert('Enter Email', 'Add your account email so we can send reset steps.');
    setLoading(true);
    try {
      await sendPasswordReset(email);
      Alert.alert('Email Sent', 'Check your inbox for reset instructions.');
    } catch (err: any) {
      Alert.alert('Reset Failed', err?.message || 'Unable to send reset email right now.');
    } finally {
      setLoading(false);
    }
  };

  const handleGithub = async () => {
    if (!showGithub) return;
    setSocialLoading(true);
    try {
      const mod = await import('../services/firebaseAuth');
      await mod.startGithubSignIn('signIn');
    } catch (err: any) {
      Alert.alert('GitHub Sign-in Failed', err?.message || 'Unable to sign in with GitHub.');
    } finally {
      setSocialLoading(false);
    }
  };

  const handleGoogle = async () => {
    setSocialLoading(true);
    try {
      const mod = await import('../services/googleAuth');
      await mod.signInWithGoogle();
    } catch (err: any) {
      Alert.alert('Google Sign-in Failed', err?.message || 'Unable to sign in with Google.');
    } finally {
      setSocialLoading(false);
    }
  };

  const spinnerVisible = loading || socialLoading;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <ScreenHeader
            title="Welcome"
            subtitle={mode === 'login' ? 'Sign in to continue' : 'Create your account'}
            hideLeftAction={true}
            showAppIcon={true}
          />

          <Animated.View
            style={[
              styles.card,
              { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
            ]}
          >
            {mode === 'register' && (
              <AuthField
                icon="person-outline"
                placeholder="Full name"
                value={name}
                onChangeText={setName}
                containerStyle={styles.fieldSpacing}
              />
            )}

            <View style={styles.logoRow}>
              <View style={styles.logoBadge}>
                <Image
                  source={(() => {
                    try {
                      if (typeof require !== 'function') return undefined;
                      return require('../../assets/splash-icon.png');
                    } catch (e) {
                      return undefined;
                    }
                  })()}
                  style={styles.logoBadgeImage}
                  resizeMode="contain"
                />
              </View>
              <View style={styles.brandTitleCol}>
                <Text style={styles.appName}>Welcome</Text>
                <Text style={styles.appTagline}>{mode === 'login' ? 'Sign in to continue' : 'Create your account'}</Text>
              </View>
            </View>

            <View style={styles.spacer} />

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

            {mode === 'login' && (
              <TouchableOpacity style={styles.forgotPassContainer} onPress={handleForgotPassword}>
                <Text style={styles.forgotPassText}>Forgot Password?</Text>
              </TouchableOpacity>
            )}

            <View style={{ marginTop: 12 }}>
              <Button
                title={
                  mode === 'login'
                    ? loading
                      ? 'Verifying...'
                      : 'Sign In'
                    : loading
                      ? 'Creating...'
                      : 'Create Account'
                }
                onPress={mode === 'login' ? handleLogin : performRegister}
                loading={loading}
                disabled={loading || socialLoading}
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
            </View>

            {mode === 'register' && (
              <View style={styles.termsContainer}>
                <Text style={styles.termsText}>
                  By registering you accept our{' '}
                  <Text style={styles.termsLink} onPress={() => navigation.navigate('Terms')}>
                    Terms
                  </Text>{' '}
                  and{' '}
                  <Text style={styles.termsLink} onPress={() => navigation.navigate('PrivacyPolicy')}>
                    Privacy Policy
                  </Text>
                  .
                </Text>
              </View>
            )}

            {(showGithub || showGoogle) && (
              <View style={styles.socialWrapper}>
                <View style={styles.socialDivider}>
                  <View style={styles.socialLine} />
                  <Text style={styles.socialText}>or continue with</Text>
                  <View style={styles.socialLine} />
                </View>
                <View style={styles.socialButtonsRow}>
                  {showGoogle && (
                    <Button
                      type="outline"
                      icon={
                        <FontAwesome
                          name="google"
                          size={18}
                          color={colors.primary}
                          style={{ marginRight: 8 }}
                        />
                      }
                      title="Google"
                      onPress={handleGoogle}
                      disabled={socialLoading}
                      buttonStyle={styles.socialButton}
                      titleStyle={styles.socialButtonText}
                      containerStyle={styles.socialButtonContainer}
                    />
                  )}
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
                      onPress={handleGithub}
                      disabled={socialLoading}
                      buttonStyle={styles.socialButton}
                      titleStyle={styles.socialButtonText}
                      containerStyle={styles.socialButtonContainer}
                    />
                  )}
                </View>
              </View>
            )}

            <View style={styles.footerRow}>
              <Text style={styles.footerText}>
                {mode === 'login' ? 'New here?' : 'Already have an account?'}
              </Text>
              <TouchableOpacity onPress={() => setMode(mode === 'login' ? 'register' : 'login')}>
                <Text style={styles.linkText}>
                  {mode === 'login' ? 'Create Account' : 'Sign In'}
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
      <FullScreenSpinner
        visible={spinnerVisible}
        message={
          loading
            ? mode === 'login'
              ? 'Authenticating...'
              : 'Creating account...'
            : 'Contacting provider...'
        }
      />
    </SafeAreaView>
  );
};

export default AuthScreen;

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F0F2F5' },
  scrollContent: { flexGrow: 1, padding: 20, justifyContent: 'center', alignItems: 'center' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 22,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    // soft shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 6,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center' },
  logoBadge: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: '#EAF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  logoBadgeImage: { width: 36, height: 36 },
  brandTitleCol: { marginLeft: 12 },
  appName: { fontSize: 18, fontWeight: '800', color: colors.text },
  appTagline: { fontSize: 13, color: colors.muted, marginTop: 2 },
  spacer: { height: 12 },
  fieldSpacing: { marginBottom: 12 },
  forgotPassContainer: { marginTop: 8 },
  forgotPassText: { color: '#64748B' },
  primaryButton: { backgroundColor: colors.primary },
  buttonContainer: { marginTop: 12 },
  buttonText: { fontWeight: '800', color: '#fff' },
  socialWrapper: { marginTop: 14 },
  socialDivider: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  socialLine: { flex: 1, height: 1, backgroundColor: '#E6EEF8' },
  socialText: { marginHorizontal: 8, color: '#6B7280' },
  socialButtonsRow: { flexDirection: 'row', gap: 8 },
  socialButton: { borderColor: '#E2E8F0' },
  socialButtonText: { color: colors.primary },
  socialButtonContainer: { flex: 1 },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 14,
  },
  footerText: { color: '#64748B', marginRight: 8 },
  linkText: { color: colors.primary, fontWeight: '700' },
  eyeIcon: { padding: 6 },
  termsContainer: { marginTop: 12, paddingHorizontal: 6 },
  termsText: { fontSize: 12, color: colors.muted || '#666', textAlign: 'center' },
  termsLink: { color: colors.primary, fontWeight: '700' },
});

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
  useWindowDimensions,
  Animated,
  Easing,
  Keyboard,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSignIn } from '@clerk/clerk-expo';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import OfflineNotice from '../components/OfflineNotice';

import { useToast } from '../context/ToastContext';

// --- CUSTOM IMPORTS ---
import { colors } from '../utils/design';

const ForgotPasswordScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { signIn, isLoaded, setActive } = useSignIn();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();

  // --- RESPONSIVE LAYOUT LOGIC ---
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const isTablet = width >= 600;

  // "Card Layout" activates on Tablets or Landscape phones
  const isCardLayout = isTablet || isLandscape;

  // --- STATE ---
  const [email, setEmail] = useState(route?.params?.email || '');
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // UI State
  const [loading, setLoading] = useState(false);
  const [resendDisabled, setResendDisabled] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // Offline Handling
  const [offlineVisible, setOfflineVisible] = useState(false);
  const [offlineRetrying, setOfflineRetrying] = useState(false);
  const [offlineAttemptsLeft, setOfflineAttemptsLeft] = useState<number | undefined>(undefined);
  const [lastOfflineAction, setLastOfflineAction] = useState<'request' | 'reset' | null>(null);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  // Timer Ref
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Entrance Animation
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 90,
      }),
    ]).start();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // --- LOGIC ---

  const getErrorMessage = (err: any) => {
    const clerkMessage = err?.errors?.[0]?.message;
    const message = clerkMessage || err?.message;
    return typeof message === 'string' ? message : '';
  };

  const getFriendlyResetRequestMessage = (err: any): string | null => {
    const msg = getErrorMessage(err);
    const lower = msg.toLowerCase();

    if (lower.includes('account not found') || lower.includes('password reset not supported')) {
      return "We couldn’t start a password reset for that email. Double-check the address, or try signing in with the method you used when creating the account.";
    }

    return null;
  };

  const startCooldown = (seconds = 30) => {
    setResendDisabled(true);
    setCountdown(seconds);
    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          setResendDisabled(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const onRequestReset = async () => {
    if (!isLoaded) return;
    if (!email) return Alert.alert('Missing Email', 'Please enter your email address.');

    setLoading(true);
    Keyboard.dismiss();

    try {
      // 1. Ensure a sign-in attempt exists (creates one if needed)
      try {
        await signIn.create({ identifier: email });
      } catch (e: any) {
        // Only suppress known "already signed in" style warnings; otherwise propagate.
        const msg = getErrorMessage(e).toLowerCase();
        const isAlreadySignedIn = msg.includes('already') && msg.includes('signed');
        if (!isAlreadySignedIn) throw e;
      }

      // 2. Find the correct reset factor
      const factor = signIn.supportedFirstFactors?.find(
        (f: any) => f.strategy === 'reset_password_email_code'
      );

      if (!factor) {
        showToast(
          "We couldn’t start a password reset for that email. Double-check the address, or try signing in with the method you used when creating the account.",
          'error'
        );
        return;
      }

      // 3. Send the code
      const { emailAddressId } = factor as any;
      await signIn.prepareFirstFactor({
        strategy: 'reset_password_email_code',
        emailAddressId,
      });

      setStep('reset');
      startCooldown(30);
      Alert.alert('Code Sent', `Check ${email} for your recovery code.`);
    } catch (err: any) {
      const friendly = getFriendlyResetRequestMessage(err);
      if (friendly) {
        showToast(friendly, 'error');
        return;
      }

      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.error('Reset request error:', err);
      }
      const msg = err.errors?.[0]?.message || err.message || 'Failed to send reset code.';

      const net = await NetInfo.fetch();
      if (!net.isConnected) {
        setLastOfflineAction('request');
        setOfflineAttemptsLeft(3);
        setOfflineVisible(true);
        return;
      }
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  const onResetPassword = async () => {
    if (!isLoaded) return;
    if (!code || code.length < 6)
      return Alert.alert('Invalid Code', 'Please enter the 6-digit code.');
    if (!newPassword || newPassword.length < 8)
      return Alert.alert('Weak Password', 'Password must be at least 8 characters.');

    setLoading(true);
    Keyboard.dismiss();

    try {
      const result = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code,
        password: newPassword,
      });

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        Alert.alert('Success', 'Password reset successfully!');
        navigation.reset({ index: 0, routes: [{ name: 'Announcement' }] });
      } else {
        Alert.alert('Success', 'Password updated. Please sign in with your new password.');
        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
      }
    } catch (err: any) {
      console.error('Reset confirm error:', err);
      const msg = err.errors?.[0]?.message || 'Failed to reset password.';

      const net = await NetInfo.fetch();
      if (!net.isConnected) {
        setLastOfflineAction('reset');
        setOfflineAttemptsLeft(3);
        setOfflineVisible(true);
        return;
      }
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  const offlineManualRetry = async () => {
    setOfflineRetrying(true);
    setOfflineAttemptsLeft((v) => (typeof v === 'number' ? Math.max(0, v - 1) : undefined));
    try {
      const net = await NetInfo.fetch();
      if (net.isConnected) {
        setOfflineVisible(false);
        setOfflineRetrying(false);
        if (lastOfflineAction === 'request') await onRequestReset();
        else if (lastOfflineAction === 'reset') await onResetPassword();
      }
    } catch (e) {
      setOfflineRetrying(false);
    }
  };

  // --- SUB-COMPONENTS ---

  // 1. The Brand Section (Logo + Text)
  const BrandContent = ({ style }: { style?: any }) => (
    <View style={[styles.brandContainer, style]}>
      <View style={styles.logoCircle}>
        <Image
          source={require('../../assets/splash-icon.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>
      <Text style={styles.brandTitle}>Recover Account</Text>
      <Text style={styles.brandSubtitle}>Don't worry, it happens to the best of us.</Text>
    </View>
  );

  // 2. The Form Section (Inputs + Buttons)
  const FormContent = () => (
    <View style={styles.formContentContainer}>
      {step === 'request' ? (
        /* STEP 1: REQUEST EMAIL */
        <>
          <Text style={styles.sectionTitle}>Reset Password</Text>
          <Text style={styles.sectionDesc}>Enter your email to receive a recovery code.</Text>

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
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, loading && styles.disabledBtn]}
            onPress={onRequestReset}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Send Code</Text>
            )}
          </TouchableOpacity>
        </>
      ) : (
        /* STEP 2: ENTER CODE & NEW PASSWORD */
        <>
          <Text style={styles.sectionTitle}>Set New Password</Text>
          <Text style={styles.sectionDesc}>
            Code sent to <Text style={{ fontWeight: '700' }}>{email}</Text>
          </Text>

          <View style={styles.inputGroup}>
            {/* Code Input */}
            <View style={styles.inputContainer}>
              <Ionicons
                name="keypad-outline"
                size={20}
                color={colors.muted || '#94A3B8'}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="6-digit Code"
                placeholderTextColor="#94A3B8"
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                maxLength={6}
                autoComplete="sms-otp"
              />
            </View>

            {/* New Password Input */}
            <View style={styles.inputContainer}>
              <Ionicons
                name="lock-closed-outline"
                size={20}
                color={colors.muted || '#94A3B8'}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="New Password"
                placeholderTextColor="#94A3B8"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry={!showPassword}
                autoComplete="password-new"
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeBtn}
              >
                <Ionicons name={showPassword ? 'eye' : 'eye-off'} size={20} color="#94A3B8" />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, loading && styles.disabledBtn]}
            onPress={onResetPassword}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Reset Password</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onRequestReset}
            disabled={resendDisabled || loading}
            style={styles.resendBtn}
          >
            <Text style={[styles.linkText, resendDisabled && { opacity: 0.5 }]}>
              {resendDisabled ? `Resend code in ${countdown}s` : "Didn't receive code? Resend"}
            </Text>
          </TouchableOpacity>
        </>
      )}

      {/* Footer Link */}
      <View style={styles.footer}>
        <TouchableOpacity onPress={() => navigation.navigate('Login')}>
          <Text style={styles.backToLogin}>Back to Sign In</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

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
              isCardLayout ? styles.centerContent : { flexGrow: 1 }, // Phone fills space
              { paddingBottom: isCardLayout ? Math.max(20, insets.bottom + 20) : 0 },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Header / Back Button */}
            <View style={styles.header}>
              <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                <Ionicons name="arrow-back" size={24} color="#0F172A" />
              </TouchableOpacity>
            </View>

            {/* LAYOUT SWITCHER */}
            {isCardLayout ? (
              // --- TABLET / LANDSCAPE CARD ---
              <Animated.View
                style={[
                  styles.cardContainer,
                  {
                    opacity: fadeAnim,
                    transform: [
                      {
                        scale: slideAnim.interpolate({
                          inputRange: [0, 50],
                          outputRange: [1, 0.95],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <BrandContent style={{ marginBottom: 32 }} />
                <FormContent />
              </Animated.View>
            ) : (
              // --- PHONE PORTRAIT SHEET ---
              // Flex layout ensures sheet pins to bottom
              <View style={styles.phoneLayoutContainer}>
                <Animated.View style={{ opacity: fadeAnim, paddingBottom: 20 }}>
                  <BrandContent style={{ marginTop: 20 }} />
                </Animated.View>

                <Animated.View
                  style={[
                    styles.sheetContainer,
                    { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
                  ]}
                >
                  <FormContent />
                </Animated.View>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <OfflineNotice
        visible={offlineVisible}
        retrying={offlineRetrying}
        attemptsLeft={offlineAttemptsLeft}
        onRetry={offlineManualRetry}
        onClose={() => {
          setOfflineVisible(false);
          setOfflineRetrying(false);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
  },

  // Center content vertically for Card Layout
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },

  // --- CARD LAYOUT (Tablets) ---
  cardContainer: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#fff',
    borderRadius: 32,
    padding: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 12,
    alignItems: 'center',
    marginBottom: 40,
  },

  // --- PHONE LAYOUT ---
  phoneLayoutContainer: {
    flex: 1,
    justifyContent: 'space-between', // Pushes sheet to bottom
    flexDirection: 'column',
  },
  sheetContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 40, // Extra padding for safety
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 20,
    // Ensure it fills remaining vertical space comfortably
    minHeight: 400,
    width: '100%',
  },

  /* Header */
  header: {
    width: '100%',
    paddingHorizontal: 24,
    paddingTop: 10,
    alignItems: 'flex-start',
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
  },

  /* BRAND CONTENT */
  brandContainer: {
    alignItems: 'center',
    width: '100%',
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    marginBottom: 16,
    elevation: 8,
  },
  logo: { width: 44, height: 44 },
  brandTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  brandSubtitle: {
    fontSize: 15,
    color: '#64748B',
    marginTop: 4,
    fontWeight: '500',
    textAlign: 'center',
  },

  /* FORM CONTENT */
  formContentContainer: {
    width: '100%',
  },
  sectionTitle: { fontSize: 22, fontWeight: '700', color: '#0F172A', marginBottom: 8 },
  sectionDesc: { fontSize: 14, color: '#64748B', marginBottom: 24, lineHeight: 20 },

  /* INPUTS */
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
    marginBottom: 16,
  },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, height: '100%', color: '#0F172A', fontSize: 16, fontWeight: '500' },
  eyeBtn: { padding: 8 },

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
    marginTop: 8,
  },
  disabledBtn: { opacity: 0.7 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  resendBtn: { marginTop: 16, alignItems: 'center' },

  /* FOOTER */
  footer: { marginTop: 24, alignItems: 'center', paddingBottom: 20 },
  backToLogin: { color: '#64748B', fontSize: 14, fontWeight: '600' },
  linkText: { color: '#2563EB', fontWeight: '600', fontSize: 14 },
});

export default ForgotPasswordScreen;

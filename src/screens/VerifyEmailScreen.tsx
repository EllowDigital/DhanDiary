import React, { useEffect, useState, useRef } from 'react';
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
  StatusBar,
  Dimensions,
  Animated,
  Easing,
  useWindowDimensions,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSignIn, useSignUp } from '@clerk/clerk-expo';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import NetInfo from '@react-native-community/netinfo';
import OfflineNotice from '../components/OfflineNotice';

// --- CUSTOM IMPORTS ---
import { syncClerkUserToNeon } from '../services/clerkUserSync';
import { saveSession } from '../db/session';
import { colors } from '../utils/design';
import { useToast } from '../context/ToastContext';

const VerifyEmailScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();

  // --- RESPONSIVE LAYOUT LOGIC ---
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const isTablet = width >= 600;

  // Card Mode for Tablet or Landscape
  const isCardLayout = isTablet || isLandscape;

  // Params
  const params = route?.params || {};
  const email = params.email as string;
  const mode = (params.mode as 'signup' | 'signin') || 'signin';
  const firstName = params.firstName as string | undefined;
  const lastName = params.lastName as string | undefined;
  const emailAddressIdParam = params.emailAddressId as string | undefined;

  // Clerk Hooks
  const { isLoaded: signInLoaded, signIn, setActive: setActiveSignIn } = useSignIn();
  const { isLoaded: signUpLoaded, signUp, setActive: setActiveSignUp } = useSignUp();

  // State
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendDisabled, setResendDisabled] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const [offlineVisible, setOfflineVisible] = useState(false);
  const [offlineRetrying, setOfflineRetrying] = useState(false);
  const [offlineAttemptsLeft, setOfflineAttemptsLeft] = useState<number | undefined>(undefined);
  const [lastOfflineAction, setLastOfflineAction] = useState<'resend' | 'verify' | null>(null);

  const resendTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  // --- ANIMATION ON MOUNT ---
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
      }),
    ]).start();
  }, []);

  // --- SMART PREPARE LOGIC ---
  const prepareVerification = async () => {
    if (mode === 'signup') return;

    if (mode === 'signin') {
      if (!signInLoaded || !signIn) return;

      try {
        const factorStrategy = 'email_code';
        if (signIn.status === 'needs_second_factor') {
          await signIn.prepareSecondFactor({ strategy: factorStrategy });
        } else if (signIn.status === 'needs_first_factor') {
          const factor = signIn.supportedFirstFactors?.find(
            (f: any) => f.strategy === 'email_code' && f.safeIdentifier === email
          );

          if (factor) {
            const { emailAddressId } = factor as any;
            await signIn.prepareFirstFactor({ strategy: factorStrategy, emailAddressId } as any);
          } else if (emailAddressIdParam) {
            await signIn.prepareFirstFactor({
              strategy: factorStrategy,
              emailAddressId: emailAddressIdParam,
            } as any);
          } else {
            await signIn.prepareFirstFactor({ strategy: factorStrategy } as any);
          }
        }
      } catch (err: any) {
        console.log('Prepare Info:', err?.errors?.[0]?.message || err);
      }
    }
  };

  useEffect(() => {
    prepareVerification();
    startResendCooldown();
    return () => {
      if (resendTimer.current) clearInterval(resendTimer.current);
    };
  }, [mode, signInLoaded, signUpLoaded]);

  // --- TIMERS ---
  const startResendCooldown = () => {
    setResendDisabled(true);
    setCountdown(30);
    if (resendTimer.current) clearInterval(resendTimer.current);
    resendTimer.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (resendTimer.current) clearInterval(resendTimer.current);
          setResendDisabled(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // --- HANDLERS ---
  const onResend = async () => {
    if (resendDisabled) {
      showToast('Please wait before requesting another verification email.', 'info', 3500);
      return;
    }
    try {
      setLoading(true);
      setCode('');

      if (mode === 'signup') {
        if (!signUpLoaded) return;
        await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      } else {
        await prepareVerification();
      }

      Alert.alert('Code Sent', `A new verification code has been sent to ${email}`);
      startResendCooldown();
    } catch (err: any) {
      const msg = err?.errors?.[0]?.message || 'Failed to resend code.';
      const net = await NetInfo.fetch();
      if (!net.isConnected) {
        setLastOfflineAction('resend');
        setOfflineAttemptsLeft(3);
        setOfflineVisible(true);
        return;
      }
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  const onVerify = async () => {
    if (!code || code.length < 6)
      return Alert.alert('Invalid Input', 'Please enter the 6-digit code.');
    setLoading(true);

    try {
      if (mode === 'signup') {
        const result = await signUp?.attemptEmailAddressVerification({ code });
        if (result?.status === 'complete') {
          await setActiveSignUp?.({ session: result.createdSessionId });
          const fullName = `${firstName || ''} ${lastName || ''}`.trim();
          try {
            const bridgeUser = await syncClerkUserToNeon({
              id: result.createdUserId!,
              emailAddresses: [{ emailAddress: email }],
              fullName,
            });
            await saveSession(
              bridgeUser.uuid,
              bridgeUser.name || 'User',
              bridgeUser.email,
              undefined,
              undefined,
              bridgeUser.clerk_id || result.createdUserId!
            );
          } catch (syncErr) {
            console.warn('Sync failed (non-fatal):', syncErr);
          }
          navigation.reset({ index: 0, routes: [{ name: 'Announcement' }] });
        } else {
          throw new Error('Verification status incomplete.');
        }
      } else {
        let result;
        if (signIn?.status === 'needs_second_factor') {
          result = await signIn.attemptSecondFactor({ strategy: 'email_code', code });
        } else {
          result = await signIn?.attemptFirstFactor({ strategy: 'email_code', code });
        }

        if (result?.status === 'complete') {
          await setActiveSignIn?.({ session: result.createdSessionId });
          navigation.reset({ index: 0, routes: [{ name: 'Announcement' }] });
        } else if (result?.status === 'needs_second_factor') {
          Alert.alert('One More Step', 'Please check your email for the second verification code.');
          await prepareVerification();
          setCode('');
        } else {
          throw new Error(`Verification status: ${result?.status}`);
        }
      }
    } catch (err: any) {
      const errCode = err?.errors?.[0]?.code;
      const net = await NetInfo.fetch();
      if (!net.isConnected) {
        setLastOfflineAction('verify');
        setOfflineAttemptsLeft(3);
        setOfflineVisible(true);
        return;
      }
      if (errCode === 'verification_failed') {
        Alert.alert('Incorrect Code', 'The code you entered is invalid. Please try again.');
      } else if (errCode === 'verification_expired' || String(err?.errors?.[0]?.message || '').toLowerCase().includes('expired')) {
        Alert.alert('Expired Code', 'Verification link expired. Please request a new one.');
      } else {
        Alert.alert('Error', err?.errors?.[0]?.message || 'Verification failed. Please try again.');
      }
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
        if (lastOfflineAction === 'resend') await onResend();
        else if (lastOfflineAction === 'verify') await onVerify();
      }
    } catch (e) {
      setOfflineRetrying(false);
    }
  };

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
            {/* Header / Back Button */}
            <View style={styles.header}>
              <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                <Ionicons name="arrow-back" size={24} color="#0F172A" />
              </TouchableOpacity>
            </View>

            {/* Main Content Area */}
            <View style={[styles.responsiveContainer, isCardLayout && styles.cardContainer]}>
              <Animated.View
                style={[
                  styles.mainBody,
                  { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
                ]}
              >
                {/* Icon */}
                <View style={styles.iconCircle}>
                  <Ionicons name="shield-checkmark" size={36} color={colors.primary || '#2563EB'} />
                </View>

                {/* Texts */}
                <Text style={styles.title}>Verify it's you</Text>
                <Text style={styles.subtitle}>
                  We sent a 6-digit code to{'\n'}
                  <Text style={styles.emailHighlight}>{email}</Text>
                </Text>

                {/* Code Input */}
                <TextInput
                  style={styles.codeInput}
                  placeholder="000000"
                  placeholderTextColor="#CBD5E1"
                  keyboardType="number-pad"
                  value={code}
                  onChangeText={setCode}
                  maxLength={6}
                  autoFocus
                />

                {/* Verify Button */}
                <TouchableOpacity
                  style={[styles.primaryBtn, loading && styles.disabled]}
                  onPress={onVerify}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryText}>Verify Code</Text>
                  )}
                </TouchableOpacity>

                {/* Resend Link */}
                <TouchableOpacity
                  onPress={onResend}
                  disabled={loading}
                  style={styles.resendRow}
                  activeOpacity={0.6}
                >
                  <Text style={[styles.resendText, resendDisabled && { opacity: 0.5 }]}>
                    {resendDisabled
                      ? `Resend code in ${countdown}s`
                      : "Didn't receive code? Resend"}
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            </View>
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
    padding: 24,
  },

  // Centers content vertically for Card Layout
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Responsive Layout
  responsiveContainer: {
    width: '100%',
    alignItems: 'center',
  },
  cardContainer: {
    maxWidth: 480,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },

  /* Header */
  header: {
    width: '100%',
    alignItems: 'flex-start',
    marginBottom: 20,
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
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },

  /* Body */
  mainBody: {
    width: '100%',
    alignItems: 'center',
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748B',
    marginBottom: 40,
    textAlign: 'center',
    lineHeight: 24,
  },
  emailHighlight: { color: '#0F172A', fontWeight: '700' },

  /* Inputs */
  codeInput: {
    width: '100%',
    height: 72,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#fff',
    textAlign: 'center',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 10,
    color: '#0F172A',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },

  /* Buttons */
  primaryBtn: {
    width: '100%',
    backgroundColor: '#2563EB',
    height: 60,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  disabled: { opacity: 0.7 },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 17 },

  resendRow: { padding: 12 },
  resendText: { color: '#64748B', fontWeight: '600', fontSize: 14 },
});

export default VerifyEmailScreen;

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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSignIn, useSignUp } from '@clerk/clerk-expo';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
// Sync banner is a floating overlay now; no per-screen layout adjustments needed.
import NetInfo from '@react-native-community/netinfo';
import OfflineNotice from '../components/OfflineNotice';

// --- CUSTOM IMPORTS ---
// Ensure these point to your actual file paths
import { syncClerkUserToNeon } from '../services/clerkUserSync';
import { saveSession } from '../db/session';
import { colors } from '../utils/design';

const { height } = Dimensions.get('window');

const VerifyEmailScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

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
  // Detects if we need to trigger a code send on arrival
  const prepareVerification = async () => {
    if (mode === 'signup') {
      // Signup usually prepares in the previous screen.
      // We do nothing here to avoid double-sending, unless user hits Resend.
      return;
    }

    if (mode === 'signin') {
      if (!signInLoaded || !signIn) return;

      try {
        const factorStrategy = 'email_code';

        // CASE 1: 2FA (Password entered previously, now needs email code)
        if (signIn.status === 'needs_second_factor') {
          await signIn.prepareSecondFactor({ strategy: factorStrategy });
        }
        // CASE 2: First Factor (Passwordless or forced verification)
        else if (signIn.status === 'needs_first_factor') {
          // Robustly find the correct email ID to avoid "strategy not allowed" errors
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
            // Fallback: call with minimal body and let Clerk infer (cast to any to satisfy TS)
            await signIn.prepareFirstFactor({ strategy: factorStrategy } as any);
          }
        }
      } catch (err: any) {
        // Suppress "already prepared" errors
        console.log('Prepare Info:', err?.errors?.[0]?.message || err);
      }
    }
  };

  // Trigger preparation ONCE on mount
  useEffect(() => {
    prepareVerification();
    startResendCooldown(); // Start the timer immediately so user can't spam instantly

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
    if (resendDisabled) return;

    try {
      setLoading(true);
      setCode('');

      if (mode === 'signup') {
        if (!signUpLoaded) return;
        await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      } else {
        await prepareVerification(); // Re-run smart logic
      }

      Alert.alert('Code Sent', `A new verification code has been sent to ${email}`);
      startResendCooldown();
    } catch (err: any) {
      const msg = err?.errors?.[0]?.message || 'Failed to resend code.';
      try {
        const net = await NetInfo.fetch();
        if (!net.isConnected) {
          setLastOfflineAction('resend');
          setOfflineAttemptsLeft(3);
          setOfflineVisible(true);
          return;
        }
      } catch (e) { }
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
        // --- SIGN UP FLOW ---
        const result = await signUp?.attemptEmailAddressVerification({ code });

        if (result?.status === 'complete') {
          await setActiveSignUp?.({ session: result.createdSessionId });

          // Background Sync: Create User in Neon DB
          const fullName = `${firstName || ''} ${lastName || ''}`.trim();
          try {
            const bridgeUser = await syncClerkUserToNeon({
              id: result.createdUserId!,
              emailAddresses: [{ emailAddress: email }],
              fullName,
            });
            // Save local session for offline access
            await saveSession(bridgeUser.uuid, bridgeUser.name || 'User', bridgeUser.email);
          } catch (syncErr) {
            console.warn('Sync failed (non-fatal):', syncErr);
          }

          navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
        } else {
          throw new Error('Verification status incomplete.');
        }
      } else {
        // --- SIGN IN FLOW ---
        let result;

        // Determine if we are verifying 1FA or 2FA
        if (signIn?.status === 'needs_second_factor') {
          result = await signIn.attemptSecondFactor({ strategy: 'email_code', code });
        } else {
          result = await signIn?.attemptFirstFactor({ strategy: 'email_code', code });
        }

        if (result?.status === 'complete') {
          await setActiveSignIn?.({ session: result.createdSessionId });
          // LoginScreen logic will handle the sync on mount, but we reset here to be safe
          navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
        } else {
          // Edge case: If 1FA succeeds but 2FA is suddenly required
          if (result?.status === 'needs_second_factor') {
            Alert.alert(
              'One More Step',
              'Please check your email for the second verification code.'
            );
            await prepareVerification(); // Prepare next step
            setCode('');
          } else {
            throw new Error(`Verification status: ${result?.status}`);
          }
        }
      }
    } catch (err: any) {
      console.error('Verify failed', err);
      const errCode = err?.errors?.[0]?.code;
      try {
        const net = await NetInfo.fetch();
        if (!net.isConnected) {
          setLastOfflineAction('verify');
          setOfflineAttemptsLeft(3);
          setOfflineVisible(true);
          return;
        }
      } catch (e) { }

      if (errCode === 'verification_failed') {
        Alert.alert('Incorrect Code', 'The code you entered is invalid. Please try again.');
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
        if (lastOfflineAction === 'resend') {
          await onResend();
        } else if (lastOfflineAction === 'verify') {
          await onVerify();
        }
      }
    } catch (e) {
      setOfflineRetrying(false);
    }
  };

  // --- RENDER ---
  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      {/* Background Gradient */}
      <LinearGradient
        colors={['#E0F2FE', '#F0F9FF', '#FFFFFF']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      <SafeAreaView
        style={{ flex: 1 }}
        edges={['top', 'left', 'right'] as any}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <View style={styles.content}>
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                <Ionicons name="arrow-back" size={24} color="#0F172A" />
              </TouchableOpacity>
            </View>

            {/* Main Content with Animation */}
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
                disabled={resendDisabled || loading}
                style={styles.resendRow}
                activeOpacity={0.6}
              >
                <Text style={[styles.resendText, resendDisabled && { opacity: 0.5 }]}>
                  {resendDisabled ? `Resend code in ${countdown}s` : "Didn't receive code? Resend"}
                </Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
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
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 24,
  },

  /* Header */
  header: {
    marginBottom: 20,
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
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },

  /* Body */
  mainBody: {
    flex: 1,
    alignItems: 'center',
    marginTop: height * 0.05,
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
  emailHighlight: {
    color: '#0F172A',
    fontWeight: '700',
  },

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
  disabled: {
    opacity: 0.7,
  },
  primaryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 17,
  },
  resendRow: {
    padding: 12,
  },
  resendText: {
    color: '#64748B',
    fontWeight: '600',
    fontSize: 14,
  },
});

export default VerifyEmailScreen;

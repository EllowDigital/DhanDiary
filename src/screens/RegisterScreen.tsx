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
  Dimensions,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { subscribeBanner, isBannerVisible } from '../utils/bannerState';
import { LinearGradient } from 'expo-linear-gradient';
import NetInfo from '@react-native-community/netinfo';
import { Ionicons } from '@expo/vector-icons';
import { useSignUp } from '@clerk/clerk-expo';
import { useNavigation } from '@react-navigation/native';
import OfflineNotice from '../components/OfflineNotice';

// --- CUSTOM IMPORTS ---
import { colors } from '../utils/design';

const { height } = Dimensions.get('window');

const RegisterScreen = () => {
  const navigation = useNavigation<any>();
  const { isLoaded, signUp } = useSignUp();

  // --- STATE ---
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [offlineVisible, setOfflineVisible] = useState(false);
  const [offlineRetrying, setOfflineRetrying] = useState(false);
  const [offlineAttemptsLeft, setOfflineAttemptsLeft] = useState<number | undefined>(undefined);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  // Entrance Animation
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        easing: Easing.out(Easing.exp),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const [bannerVisible, setBannerVisible] = React.useState<boolean>(false);
  React.useEffect(() => {
    setBannerVisible(isBannerVisible());
    const unsub = subscribeBanner((v: boolean) => setBannerVisible(v));
    return () => unsub();
  }, []);

  const onSignUpPress = async () => {
    if (!isLoaded) return;

    // Basic Validation
    if (!firstName || !lastName || !email || !password) {
      return Alert.alert('Missing Fields', 'Please fill in all fields to continue.');
    }

    setLoading(true);

    const MAX_ATTEMPTS = 3;

    const doSignUp = async () => {
      try {
        // 1. Create the user in Clerk
        await signUp.create({
          firstName,
          lastName,
          emailAddress: email,
          password,
        });

        // 2. Prepare the email verification (Send Code)
        await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });

        // 3. Navigate to Verification Screen
        navigation.navigate('VerifyEmail', {
          email,
          mode: 'signup',
          firstName,
          lastName,
        });
        return true;
      } catch (err: any) {
        console.error('Registration error:', err);

        const errors = err?.errors || [];
        const errorMsg = errors.length > 0 ? errors[0].message : err.message;

        // User-friendly error mapping
        if (errorMsg.includes('already exists')) {
          Alert.alert('Account Exists', 'That email is already in use. Please log in instead.');
        } else if (errorMsg.includes('password')) {
          Alert.alert(
            'Weak Password',
            'Please choose a stronger password (min 8 chars, mixed case/numbers).'
          );
        } else {
          Alert.alert('Registration Failed', errorMsg);
        }
        return false;
      }
    };

    try {
      const net = await NetInfo.fetch();
      if (net.isConnected) {
        await doSignUp();
        return;
      }
    } catch (e) {
      // ignore
    }

    // Offline: show modal and attempt exponential backoff retries
    setOfflineVisible(true);
    setOfflineRetrying(true);
    setOfflineAttemptsLeft(MAX_ATTEMPTS);

    let attemptsLeft = MAX_ATTEMPTS;
    while (attemptsLeft > 0) {
      const waitMs = Math.pow(2, MAX_ATTEMPTS - attemptsLeft) * 1000; // 1s,2s,4s
      await new Promise((r) => setTimeout(r, waitMs));
      try {
        const net = await NetInfo.fetch();
        if (net.isConnected) {
          setOfflineVisible(false);
          setOfflineRetrying(false);
          await doSignUp();
          return;
        }
      } catch (e) {
        // continue
      }
      attemptsLeft -= 1;
      setOfflineAttemptsLeft(attemptsLeft);
    }

    setOfflineRetrying(false);
    setLoading(false);
  };

  const offlineManualRetry = async () => {
    setOfflineRetrying(true);
    setOfflineAttemptsLeft((v) => (typeof v === 'number' ? Math.max(0, v - 1) : undefined));
    try {
      const net = await NetInfo.fetch();
      if (net.isConnected) {
        setOfflineVisible(false);
        setOfflineRetrying(false);
        setLoading(true);
        try {
          // attempt signup once
          await signUp.create({
            firstName,
            lastName,
            emailAddress: email,
            password,
          });
          await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
          navigation.navigate('VerifyEmail', { email, mode: 'signup', firstName, lastName });
        } catch (err: any) {
          const errors = err?.errors || [];
          const errorMsg = errors.length > 0 ? errors[0].message : err.message;
          Alert.alert('Registration Failed', errorMsg);
          setLoading(false);
        }
      }
    } catch (e) {
      setOfflineRetrying(false);
    }
  };

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

      <SafeAreaView style={{ flex: 1 }} edges={bannerVisible ? (['left', 'right'] as any) : (['top', 'left', 'right'] as any)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                <Ionicons name="arrow-back" size={24} color="#0F172A" />
              </TouchableOpacity>

              {/* Step Indicator */}
              <View style={styles.stepContainer}>
                <View style={styles.stepDotActive} />
                <View style={styles.stepLine} />
                <View style={styles.stepDotInactive} />
              </View>
            </View>

            <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
              <Text style={styles.title}>Create Account</Text>
              <Text style={styles.subtitle}>Start your financial journey today.</Text>

              <View style={styles.formContainer}>
                {/* Name Row */}
                <View style={styles.row}>
                  <View style={[styles.inputContainer, { flex: 1 }]}>
                    <Ionicons
                      name="person-outline"
                      size={20}
                      color={colors.muted || '#94A3B8'}
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="First Name"
                      placeholderTextColor="#94A3B8"
                      value={firstName}
                      onChangeText={setFirstName}
                      autoCapitalize="words"
                      textContentType="givenName"
                      autoComplete="name-given"
                      importantForAutofill="yes"
                    />
                  </View>
                  <View style={{ width: 12 }} />
                  <View style={[styles.inputContainer, { flex: 1 }]}>
                    <TextInput
                      style={styles.input}
                      placeholder="Last Name"
                      placeholderTextColor="#94A3B8"
                      value={lastName}
                      onChangeText={setLastName}
                      autoCapitalize="words"
                      textContentType="familyName"
                      autoComplete="name-family"
                      importantForAutofill="yes"
                    />
                  </View>
                </View>

                {/* Email */}
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
                    textContentType="emailAddress"
                    autoComplete="email"
                    importantForAutofill="yes"
                  />
                </View>

                {/* Password */}
                <View style={styles.inputContainer}>
                  <Ionicons
                    name="lock-closed-outline"
                    size={20}
                    color={colors.muted || '#94A3B8'}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Create Password"
                    placeholderTextColor="#94A3B8"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    textContentType="newPassword"
                    autoComplete="password-new"
                    importantForAutofill="yes"
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    style={styles.eyeBtn}
                  >
                    <Ionicons name={showPassword ? 'eye' : 'eye-off'} size={20} color="#94A3B8" />
                  </TouchableOpacity>
                </View>

                {/* Action Button */}
                <TouchableOpacity
                  style={[styles.primaryBtn, loading && styles.disabledBtn]}
                  onPress={onSignUpPress}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryBtnText}>Continue</Text>
                  )}
                </TouchableOpacity>
              </View>

              {/* Footer */}
              <View style={styles.footer}>
                <Text style={styles.footerText}>Already have an account? </Text>
                <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                  <Text style={styles.linkText}>Log In</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
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
          setLoading(false);
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

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 40,
    marginTop: 10,
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
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  stepContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepDotActive: {
    width: 24,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary || '#2563EB',
  },
  stepDotInactive: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#CBD5E1',
  },
  stepLine: {
    width: 16,
    height: 2,
    backgroundColor: '#E2E8F0',
  },

  /* Titles */
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748B',
    marginBottom: 32,
    lineHeight: 24,
  },

  /* Form */
  formContainer: {
    gap: 16,
    marginBottom: 24,
  },
  row: {
    flexDirection: 'row',
  },
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
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    height: '100%',
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '500',
  },
  eyeBtn: {
    padding: 8,
  },

  /* Button */
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
  disabledBtn: {
    opacity: 0.7,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  /* Footer */
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  footerText: {
    color: '#64748B',
    fontSize: 14,
  },
  linkText: {
    color: '#2563EB',
    fontWeight: '700',
    fontSize: 14,
  },
});

export default RegisterScreen;

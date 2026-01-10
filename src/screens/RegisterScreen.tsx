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
  useWindowDimensions,
  Animated,
  Easing,
  Keyboard,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import NetInfo from '@react-native-community/netinfo';
import { Ionicons } from '@expo/vector-icons';
import { useSignUp } from '@clerk/clerk-expo';
import { useNavigation } from '@react-navigation/native';
import OfflineNotice from '../components/OfflineNotice';

// --- CUSTOM IMPORTS ---
import { colors } from '../utils/design';
import { validateEmail } from '../utils/emailValidation';

const RegisterScreen = () => {
  const navigation = useNavigation<any>();
  const { isLoaded, signUp } = useSignUp();
  const insets = useSafeAreaInsets();

  // --- RESPONSIVE LAYOUT LOGIC ---
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const isTablet = width >= 600;

  // Switch to "Card Mode" on Tablets or Landscape phones
  const isCardLayout = isTablet || isLandscape;

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

  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [emailSuggestion, setEmailSuggestion] = useState<string | null>(null);

  const inFlightRef = useRef(false);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

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
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const onSignUpPress = async () => {
    if (!isLoaded) return;
    if (loading || inFlightRef.current) return;

    setFormError(null);
    setEmailError(null);
    setPasswordError(null);

    if (!firstName || !lastName || !email || !password) {
      setFormError('Please fill in all fields to continue.');
      return;
    }

    const v = validateEmail(email);
    if (!v.isValidFormat) {
      setEmailError('Please enter a valid email address.');
      return;
    }
    if (!v.isSupportedDomain) {
      setEmailError('This email domain is not supported. Please use a valid email provider.');
      return;
    }

    if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    inFlightRef.current = true;
    Keyboard.dismiss();

    try {
      // Check connection before starting
      const net = await NetInfo.fetch();
      if (!net.isConnected) {
        startOfflineFlow();
        return;
      }

      await attemptSignUp();
    } finally {
      inFlightRef.current = false;
    }
  };

  const attemptSignUp = async () => {
    try {
      if (!signUp) return;
      const normalizedEmail = validateEmail(email).normalized;
      await signUp.create({ firstName, lastName, emailAddress: normalizedEmail, password });
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });

      setLoading(false);
      navigation.navigate('VerifyEmail', {
        email: normalizedEmail,
        mode: 'signup',
        firstName,
        lastName,
      });
    } catch (err: any) {
      handleSignUpError(err);
    }
  };

  const handleSignUpError = (err: any) => {
    const errors = err?.errors || [];
    const code = errors?.[0]?.code;
    const rawMsg = errors.length > 0 ? errors[0].message : err?.message;
    const msg = String(rawMsg || '').trim();
    const lower = msg.toLowerCase();

    // Clerk: identifier already exists (email taken)
    if (code === 'form_identifier_exists' || lower.includes('already exists') || lower.includes('already in use')) {
      const looksLikeSocial = lower.includes('oauth') || lower.includes('google') || lower.includes('github');
      const body = looksLikeSocial
        ? 'This email is already registered using social login. Please sign in using Google/GitHub.'
        : 'You are already registered. Please log in.';
      Alert.alert('Already Registered', body, [
        {
          text: 'OK',
          onPress: () => navigation.navigate('Login', { email: validateEmail(email).normalized }),
        },
      ]);
    } else if (
      code?.includes('password') ||
      lower.includes('password') ||
      code === 'form_password_pwned' ||
      code === 'form_password_length_too_short'
    ) {
      Alert.alert('Weak Password', 'Please choose a stronger password.');
    } else {
      Alert.alert('Registration Failed', 'Something went wrong. Please try again later.');
    }
    setLoading(false);
  };

  const startOfflineFlow = async () => {
    setOfflineVisible(true);
    setOfflineRetrying(true);
    setLoading(false);

    // Simple retry logic simulation
    const MAX_ATTEMPTS = 3;
    setOfflineAttemptsLeft(MAX_ATTEMPTS);

    // (In a real app, you might loop check NetInfo here,
    // but typically we wait for user manual retry)
    setOfflineRetrying(false);
  };

  const offlineManualRetry = async () => {
    setOfflineRetrying(true);
    const net = await NetInfo.fetch();
    if (net.isConnected) {
      setOfflineVisible(false);
      setOfflineRetrying(false);
      setLoading(true);
      await attemptSignUp();
    } else {
      setTimeout(() => setOfflineRetrying(false), 1000);
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
            {/* MAIN CONTENT CONTAINER 
              - Constrains width on tablets/landscape
              - Aligns self center
            */}
            <View style={[styles.responsiveContainer, isCardLayout && styles.cardContainer]}>
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

              <Animated.View
                style={[
                  styles.formWrapper,
                  { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
                ]}
              >
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
                        autoComplete="name-given"
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
                        autoComplete="name-family"
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
                      onChangeText={(t) => {
                        const v = validateEmail(t);
                        setEmail(v.normalized);
                        setEmailSuggestion(v.suggestion || null);
                        setEmailError(null);
                        setFormError(null);
                      }}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      autoComplete="email"
                    />
                  </View>

                  {(emailError || emailSuggestion) && (
                    <View style={{ marginTop: -6 }}>
                      {!!emailError && <Text style={styles.fieldError}>{emailError}</Text>}
                      {!!emailSuggestion && (
                        <TouchableOpacity
                          onPress={() => {
                            setEmail(emailSuggestion);
                            setEmailSuggestion(null);
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.suggestionText}>
                            Did you mean {emailSuggestion}?
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}

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
                      onChangeText={(t) => {
                        setPassword(t);
                        setPasswordError(null);
                        setFormError(null);
                      }}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword(!showPassword)}
                      style={styles.eyeBtn}
                    >
                      <Ionicons name={showPassword ? 'eye' : 'eye-off'} size={20} color="#94A3B8" />
                    </TouchableOpacity>
                  </View>

                  {!!passwordError && <Text style={styles.fieldError}>{passwordError}</Text>}

                  {/* Action Button */}
                  <TouchableOpacity
                    style={[styles.primaryBtn, loading && styles.disabledBtn]}
                    onPress={onSignUpPress}
                    disabled={
                      loading ||
                      !firstName ||
                      !lastName ||
                      !password ||
                      !validateEmail(email).isValidFormat ||
                      !validateEmail(email).isSupportedDomain
                    }
                    activeOpacity={0.8}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.primaryBtnText}>Continue</Text>
                    )}
                  </TouchableOpacity>

                  {!!formError && <Text style={styles.formError}>{formError}</Text>}
                </View>

                {/* Footer */}
                <View style={styles.footer}>
                  <Text style={styles.footerText}>Already have an account? </Text>
                  <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                    <Text style={styles.linkText}>Log In</Text>
                  </TouchableOpacity>
                </View>
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

  // Center content vertically for Card Layout
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Responsive Container
  responsiveContainer: {
    width: '100%',
  },
  // Card Styles (Tablets/Landscape)
  cardContainer: {
    maxWidth: 480,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 32,
    // Shadow for card look
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 32,
    marginTop: 8,
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

  /* Form Content */
  formWrapper: {
    width: '100%',
  },
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

  /* Inputs */
  formContainer: {
    gap: 16,
    marginBottom: 24,
  },
  fieldError: {
    color: '#B91C1C',
    fontSize: 13,
    marginTop: 6,
    marginLeft: 4,
  },
  formError: {
    color: '#B91C1C',
    fontSize: 13,
    marginTop: 10,
    textAlign: 'center',
  },
  suggestionText: {
    color: '#1D4ED8',
    fontSize: 13,
    marginTop: 6,
    marginLeft: 4,
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
    marginTop: 8,
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

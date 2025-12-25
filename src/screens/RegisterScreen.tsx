import React, { useState } from 'react';
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
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSignUp } from '@clerk/clerk-expo';
import { useNavigation } from '@react-navigation/native';

// --- CUSTOM IMPORTS ---
import { syncClerkUserToNeon } from '../services/clerkUserSync';
import { saveSession } from '../db/session';
import { colors } from '../utils/design'; // Assumed shared colors

const { width, height } = Dimensions.get('window');

const RegisterScreen = () => {
  const navigation = useNavigation<any>();
  const { isLoaded, signUp, setActive } = useSignUp();

  // --- STATE ---
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Verification State
  const [pendingVerification, setPendingVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');

  // UI State
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Animations
  const fadeAnim = React.useRef(new Animated.Value(1)).current;
  const slideAnim = React.useRef(new Animated.Value(0)).current;

  // --- LOGIC ---

  const animateTransition = (toStep2: boolean) => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: toStep2 ? -50 : 50,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setPendingVerification(toStep2);
      slideAnim.setValue(toStep2 ? 50 : -50);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true }),
      ]).start();
    });
  };

  const onSignUpPress = async () => {
    if (!isLoaded) return;
    if (!firstName || !email || !password) {
      return Alert.alert('Missing Fields', 'Please fill in your name, email, and password.');
    }

    setLoading(true);
    try {
      await signUp.create({
        firstName,
        lastName,
        emailAddress: email,
        password,
      });

      await signUp.prepareEmailAddressVerification({
        strategy: 'email_code',
      });

      animateTransition(true); // Move to Step 2
    } catch (err: any) {
      console.error(err);
      const msg = err?.errors?.[0]?.message || err.message || 'Registration failed';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  const onVerifyPress = async () => {
    if (!isLoaded || !verificationCode) return Alert.alert('Error', 'Please enter the code.');

    setLoading(true);
    try {
      const result = await signUp.attemptEmailAddressVerification({
        code: verificationCode,
      });

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });

        // Start Sync
        setSyncing(true);
        const fullName = `${firstName} ${lastName}`.trim();

        // 1. Sync to Neon DB
        const bridgeUser = await syncClerkUserToNeon({
          id: result.createdUserId!,
          emailAddresses: [{ emailAddress: email }],
          fullName: fullName,
        });

        // 2. Save Local Session
        await saveSession(bridgeUser.uuid, bridgeUser.name || 'User', bridgeUser.email);

        // 3. Navigate
        setSyncing(false);
        navigation.reset({
          index: 0,
          routes: [{ name: 'Main' }],
        });
      } else {
        throw new Error('Verification status is incomplete.');
      }
    } catch (err: any) {
      console.error(err);
      const msg = err?.errors?.[0]?.message || err.message || 'Verification failed';
      Alert.alert('Error', msg);
      setLoading(false);
      setSyncing(false);
    }
  };

  // --- RENDERERS ---

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

      <SafeAreaView style={{ flex: 1 }}>
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
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity
                onPress={() =>
                  pendingVerification ? animateTransition(false) : navigation.goBack()
                }
                style={styles.backBtn}
              >
                <Ionicons name="arrow-back" size={24} color="#0F172A" />
              </TouchableOpacity>

              {/* Progress Indicator */}
              <View style={styles.progressContainer}>
                <View style={[styles.progressDot, !pendingVerification && styles.progressActive]} />
                <View
                  style={[styles.progressLine, pendingVerification && styles.progressLineActive]}
                />
                <View style={[styles.progressDot, pendingVerification && styles.progressActive]} />
              </View>
            </View>

            <Animated.View style={{ opacity: fadeAnim, transform: [{ translateX: slideAnim }] }}>
              {!pendingVerification ? (
                /* --- STEP 1: CREATE ACCOUNT --- */
                <View>
                  <Text style={styles.title}>Create Account</Text>
                  <Text style={styles.subtitle}>Start your financial journey today.</Text>

                  <View style={styles.formContainer}>
                    <View style={styles.row}>
                      <View style={[styles.inputContainer, { flex: 1 }]}>
                        <Ionicons
                          name="person-outline"
                          size={20}
                          color="#94A3B8"
                          style={styles.inputIcon}
                        />
                        <TextInput
                          style={styles.input}
                          placeholder="First Name"
                          placeholderTextColor="#94A3B8"
                          value={firstName}
                          onChangeText={setFirstName}
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
                        />
                      </View>
                    </View>

                    <View style={styles.inputContainer}>
                      <Ionicons
                        name="mail-outline"
                        size={20}
                        color="#94A3B8"
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
                      />
                    </View>

                    <View style={styles.inputContainer}>
                      <Ionicons
                        name="lock-closed-outline"
                        size={20}
                        color="#94A3B8"
                        style={styles.inputIcon}
                      />
                      <TextInput
                        style={styles.input}
                        placeholder="Create Password"
                        placeholderTextColor="#94A3B8"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry={!showPassword}
                      />
                      <TouchableOpacity
                        onPress={() => setShowPassword(!showPassword)}
                        style={styles.eyeBtn}
                      >
                        <Ionicons
                          name={showPassword ? 'eye' : 'eye-off'}
                          size={20}
                          color="#94A3B8"
                        />
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                      style={[styles.primaryBtn, loading && styles.disabledBtn]}
                      onPress={onSignUpPress}
                      disabled={loading}
                    >
                      {loading ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.primaryBtnText}>Continue</Text>
                      )}
                    </TouchableOpacity>
                  </View>

                  <View style={styles.footer}>
                    <Text style={styles.footerText}>Already have an account? </Text>
                    <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                      <Text style={styles.linkText}>Log In</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                /* --- STEP 2: VERIFICATION --- */
                <View style={styles.centerContent}>
                  <View style={styles.iconCircle}>
                    <Ionicons name="mail-open" size={32} color="#2563EB" />
                  </View>

                  <Text style={styles.titleCenter}>Verify Email</Text>
                  <Text style={styles.subtitleCenter}>
                    We sent a code to{' '}
                    <Text style={{ fontWeight: '700', color: '#0F172A' }}>{email}</Text>
                  </Text>

                  <View style={styles.formContainer}>
                    <TextInput
                      style={styles.codeInput}
                      placeholder="1 2 3 4 5 6"
                      placeholderTextColor="#CBD5E1"
                      keyboardType="number-pad"
                      maxLength={6}
                      value={verificationCode}
                      onChangeText={setVerificationCode}
                      autoFocus
                    />

                    <TouchableOpacity
                      style={[styles.primaryBtn, loading && styles.disabledBtn]}
                      onPress={onVerifyPress}
                      disabled={loading}
                    >
                      {loading ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.primaryBtnText}>Verify & Create</Text>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.resendBtn}>
                      <Text style={styles.resendText}>Didn't receive code? Resend</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Full Screen Sync Overlay */}
      {syncing && (
        <View style={styles.overlay}>
          <View style={styles.syncBox}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={styles.syncText}>Creating your secure vault...</Text>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
  },

  /* HEADER */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 40,
    marginTop: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#CBD5E1',
  },
  progressActive: {
    backgroundColor: '#2563EB',
    width: 12, // slightly larger
  },
  progressLine: {
    width: 24,
    height: 2,
    backgroundColor: '#E2E8F0',
  },
  progressLineActive: {
    backgroundColor: '#2563EB',
  },

  /* TEXT */
  title: { fontSize: 28, fontWeight: '800', color: '#0F172A', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#64748B', marginBottom: 32 },

  titleCenter: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitleCenter: {
    fontSize: 15,
    color: '#64748B',
    marginBottom: 32,
    textAlign: 'center',
    lineHeight: 22,
  },
  centerContent: { alignItems: 'center', marginTop: 20 },

  /* FORM */
  formContainer: { gap: 16, width: '100%' },
  row: { flexDirection: 'row' },
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
  inputIcon: { marginRight: 12 },
  input: { flex: 1, height: '100%', color: '#0F172A', fontSize: 16, fontWeight: '500' },
  eyeBtn: { padding: 8 },

  /* CODE INPUT */
  codeInput: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    height: 64,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 8,
    color: '#0F172A',
    marginBottom: 8,
  },

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

  resendBtn: { padding: 12, alignItems: 'center' },
  resendText: { color: '#64748B', fontSize: 14, fontWeight: '600' },

  /* ICON */
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 4,
    borderColor: '#fff',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 4,
  },

  /* FOOTER */
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 32,
  },
  footerText: { color: '#64748B', fontSize: 14 },
  linkText: { color: '#2563EB', fontWeight: '700', fontSize: 14 },

  /* OVERLAY */
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  syncBox: {
    backgroundColor: '#fff',
    padding: 32,
    borderRadius: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 10,
  },
  syncText: { color: '#0F172A', marginTop: 16, fontSize: 16, fontWeight: '600' },
});

export default RegisterScreen;

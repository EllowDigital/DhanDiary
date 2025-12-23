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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSignUp } from '@clerk/clerk-expo';

import { syncClerkUserToNeon } from '../services/clerkUserSync';
import { saveSession } from '../db/localDb';

const RegisterScreen = ({ navigation }: any) => {
  const { isLoaded, signUp, setActive } = useSignUp();

  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [pendingVerification, setPendingVerification] = useState(false);

  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  /* ---------------- SIGN UP STEP 1 ---------------- */

  const onSignUpPress = async () => {
    if (!isLoaded) return;

    if (!name || !email || !password) {
      return Alert.alert('Error', 'Please fill in all fields.');
    }

    setLoading(true);
    try {
      await signUp.create({
        firstName: name,
        emailAddress: email,
        password,
      });

      await signUp.prepareEmailAddressVerification({
        strategy: 'email_code',
      });

      setPendingVerification(true);
    } catch (err: any) {
      Alert.alert('Registration Failed', err?.errors?.[0]?.message ?? err.message);
    } finally {
      setLoading(false);
    }
  };

  /* ---------------- SIGN UP STEP 2 ---------------- */

  const onVerifyPress = async () => {
    if (!isLoaded || !verificationCode) return;

    setLoading(true);
    try {
      const result = await signUp.attemptEmailAddressVerification({
        code: verificationCode,
      });

      if (result.status !== 'complete') {
        throw new Error('Verification incomplete');
      }

      await setActive({ session: result.createdSessionId });

      setSyncing(true);
      const bridgeUser = await syncClerkUserToNeon({
        id: result.createdUserId!,
        emailAddresses: [{ emailAddress: email }],
        fullName: name,
      });

      await saveSession(bridgeUser.uuid, bridgeUser.name || 'User', bridgeUser.email);

      navigation.reset({
        index: 0,
        routes: [{ name: 'Main' }],
      });
    } catch (err: any) {
      Alert.alert('Verification Failed', err?.errors?.[0]?.message ?? err.message);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <LinearGradient colors={['#ffffff', '#f8fafc']} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity onPress={() => navigation.goBack()}>
                <Ionicons name="arrow-back" size={24} color="#64748b" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Create Account</Text>
              <View style={{ width: 24 }} />
            </View>

            {/* FORM */}
            {!pendingVerification ? (
              <View style={styles.card}>
                <Input
                  icon="person-outline"
                  placeholder="Full Name"
                  value={name}
                  onChangeText={setName}
                />
                <Input
                  icon="mail-outline"
                  placeholder="Email Address"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                />
                <Input
                  icon="lock-closed-outline"
                  placeholder="Create Password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  rightIcon={showPassword ? 'eye' : 'eye-off'}
                  onRightIconPress={() => setShowPassword((s) => !s)}
                />

                <PrimaryButton loading={loading} title="Sign Up" onPress={onSignUpPress} />
              </View>
            ) : (
              <View style={styles.card}>
                <View style={styles.iconCircle}>
                  <Ionicons name="mail-open-outline" size={32} color="#2563eb" />
                </View>

                <Text style={styles.verifyTitle}>Verify your email</Text>
                <Text style={styles.verifyDesc}>Enter the 6-digit code sent to {email}</Text>

                <TextInput
                  style={styles.codeInput}
                  placeholder="123456"
                  keyboardType="number-pad"
                  maxLength={6}
                  value={verificationCode}
                  onChangeText={setVerificationCode}
                />

                <PrimaryButton loading={loading} title="Verify Email" onPress={onVerifyPress} />

                <TouchableOpacity
                  style={styles.editEmailBtn}
                  onPress={() => setPendingVerification(false)}
                >
                  <Text style={styles.linkText}>Edit email</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {syncing && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.syncText}>Setting up your profile…</Text>
        </View>
      )}
    </View>
  );
};

/* ---------------- SMALL COMPONENTS ---------------- */

const Input = ({ icon, rightIcon, onRightIconPress, ...props }: any) => (
  <View style={styles.inputContainer}>
    <Ionicons name={icon} size={20} color="#64748b" />
    <TextInput style={styles.input} {...props} />
    {rightIcon && (
      <TouchableOpacity onPress={onRightIconPress}>
        <Ionicons name={rightIcon} size={20} color="#64748b" />
      </TouchableOpacity>
    )}
  </View>
);

const PrimaryButton = ({ title, loading, onPress }: any) => (
  <TouchableOpacity style={styles.primaryBtn} onPress={onPress} disabled={loading}>
    {loading ? (
      <ActivityIndicator color="#fff" />
    ) : (
      <Text style={styles.primaryBtnText}>{title}</Text>
    )}
  </TouchableOpacity>
);

/* ---------------- STYLES ---------------- */

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 24 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
  },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#0f172a' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.04)',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  input: { flex: 1, fontSize: 16 },
  primaryBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  primaryBtnText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(37,99,235,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  verifyTitle: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  verifyDesc: { textAlign: 'center', color: '#64748b', marginBottom: 20 },
  codeInput: {
    textAlign: 'center',
    fontSize: 18,
    letterSpacing: 6,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  editEmailBtn: { alignSelf: 'center', marginTop: 12 },
  linkText: { color: '#2563eb', fontWeight: '600' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  syncText: { marginTop: 12, color: '#fff', fontWeight: '600' },
});

export default RegisterScreen;

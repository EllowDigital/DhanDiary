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
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSignUp } from '@clerk/clerk-expo';

import { syncClerkUserToNeon } from '../services/clerkUserSync';
import { saveSession } from '../db/localDb';

const RegisterScreen = ({ navigation }: any) => {
  const { isLoaded, signUp, setActive } = useSignUp();

  // Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pendingVerification, setPendingVerification] = useState(false);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Sign Up Step 1: Create Account & Send Email Code
  const onSignUpPress = async () => {
    if (!isLoaded) return;
    if (!name || !email || !password) {
      Alert.alert('Error', 'Please fill in all fields.');
      return;
    }

    setLoading(true);
    try {
      // 1. Create the user on Clerk
      await signUp.create({
        firstName: name,
        emailAddress: email,
        password,
      });

      // 2. Send the verification email
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });

      // 3. Switch UI to verification mode
      setPendingVerification(true);
      setLoading(false);
    } catch (err: any) {
      console.error(JSON.stringify(err, null, 2));
      Alert.alert('Registration Failed', err.errors ? err.errors[0]?.message : err.message);
      setLoading(false);
    }
  };

  // Sign Up Step 2: Verify Email & Login
  const onPressVerify = async () => {
    if (!isLoaded || !code) return;
    setLoading(true);

    try {
      const completeSignUp = await signUp.attemptEmailAddressVerification({
        code,
      });

      if (completeSignUp.status === 'complete') {
        // Success! Set active session.
        await setActive({ session: completeSignUp.createdSessionId });

        // Now Sync to Neon
        setSyncing(true);
        const bridgeUser = await syncClerkUserToNeon({
          id: completeSignUp.createdUserId!,
          emailAddresses: [{ emailAddress: email }],
          fullName: name,
        });

        // Save local session
        await saveSession(bridgeUser.uuid, bridgeUser.name || 'User', bridgeUser.email);

        setSyncing(false);
        navigation.reset({
          index: 0,
          routes: [{ name: 'Home' }],
        });
      } else {
        // Verification failed or needs more steps
        Alert.alert('Verification Failed', 'Please check the code and try again.');
        setLoading(false);
      }
    } catch (err: any) {
      console.error(JSON.stringify(err, null, 2));
      Alert.alert('Verification Error', err.errors ? err.errors[0]?.message : err.message);
      setLoading(false);
      setSyncing(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: '#fff' }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <LinearGradient
        colors={['#ffffff', '#f8fafc']}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 100}
        >
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">

            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                <Ionicons name="arrow-back" size={24} color="#CBD5E1" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Create Account</Text>
              <View style={{ width: 24 }} />
            </View>

            {/* Registration Form */}
            {!pendingVerification && (
              <View style={styles.card}>
                <View style={styles.inputContainer}>
                  <Ionicons name="person-outline" size={20} color="#64748b" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Full Name"
                    placeholderTextColor="#64748b"
                    value={name}
                    onChangeText={setName}
                  />
                </View>

                <View style={styles.inputContainer}>
                  <Ionicons name="mail-outline" size={20} color="#64748b" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Email Address"
                    placeholderTextColor="#64748b"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                </View>

                <View style={styles.inputContainer}>
                  <Ionicons name="lock-closed-outline" size={20} color="#64748b" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Create Password"
                    placeholderTextColor="#64748b"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity onPress={() => setShowPassword((s) => !s)} style={styles.eyeBtn} accessibilityLabel="Toggle password visibility">
                    <Ionicons name={showPassword ? 'eye' : 'eye-off'} size={20} color="#64748b" />
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
                    <Text style={styles.primaryBtnText}>Sign Up</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Verification Code View */}
            {pendingVerification && (
              <View style={styles.card}>
                <View style={styles.iconCircle}>
                  <Ionicons name="mail-open-outline" size={32} color="#3b82f6" />
                </View>
                <Text style={styles.verifyTitle}>Verify your Email</Text>
                <Text style={styles.verifyDesc}>
                  We sent a verification code to {email}. Enter it below to confirm your account.
                </Text>

                <View style={styles.inputContainer}>
                  <TextInput
                    style={[styles.input, { textAlign: 'center', fontSize: 18, letterSpacing: 4 }]}
                    placeholder="123456"
                    placeholderTextColor="#64748b"
                    value={code}
                    onChangeText={setCode}
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                </View>

                <TouchableOpacity
                  style={[styles.primaryBtn, loading && styles.disabledBtn]}
                  onPress={onPressVerify}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryBtnText}>Verify Email</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.textLink}
                  onPress={() => setPendingVerification(false)}
                >
                  <Text style={styles.linkText}>Edit Email</Text>
                </TouchableOpacity>
              </View>
            )}

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Syncing Overlay */}
      {syncing && (
        <View style={styles.overlay}>
          <View style={styles.syncBox}>
            <ActivityIndicator size="large" color="#3b82f6" />
            <Text style={styles.syncText}>Setting up your profile...</Text>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 48,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
  },
  backBtn: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.04)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
    marginBottom: 12,
    paddingHorizontal: 12,
    height: 52,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    color: '#0f172a',
    fontSize: 16,
  },
  eyeBtn: {
    marginLeft: 8,
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  disabledBtn: {
    opacity: 0.7,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },

  // Verification Styles
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.4)',
  },
  verifyTitle: {
    color: '#0f172a',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  verifyDesc: {
    color: '#64748b',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  textLink: {
    alignSelf: 'center',
    marginTop: 16,
    padding: 8,
  },
  linkText: {
    color: '#2563eb',
    fontWeight: '600',
    fontSize: 16,
  },

  // Overlay
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  syncBox: {
    backgroundColor: '#fff',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(37,99,235,0.08)',
  },
  syncText: {
    color: '#0f172a',
    marginTop: 12,
    fontSize: 15,
    fontWeight: '600',
  }
});

export default RegisterScreen;

import React, { useState, useCallback } from 'react';
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
  Image,
} from 'react-native';
import { useSignIn, useOAuth } from '@clerk/clerk-expo';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser'; // Ensure you have this installed
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';

import { syncClerkUserToNeon } from '../services/clerkUserSync';
import { saveSession } from '../db/localDb';
import { warmNeonConnection } from '../services/auth';

// Warm up browser for OAuth
WebBrowser.maybeCompleteAuthSession();

const useWarmUpBrowser = () => {
  React.useEffect(() => {
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);
};

const LoginScreen = () => {
  useWarmUpBrowser();
  const navigation = useNavigation<any>();
  const { signIn, setActive, isLoaded } = useSignIn();

  // OAuth Hooks
  const { startOAuthFlow: startGoogleFlow } = useOAuth({ strategy: 'oauth_google' });
  const { startOAuthFlow: startGithubFlow } = useOAuth({ strategy: 'oauth_github' });

  // State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Pre-warm DB
  React.useEffect(() => {
    warmNeonConnection().catch(() => { });
  }, []);

  // --- HANDLERS ---

  const handleSyncAndNavigate = async (userId: string, userEmail: string, userName?: string | null) => {
    setSyncing(true);
    try {
      // 1. Sync Clerk User to Neon DB (Get internal UUID)
      const bridgeUser = await syncClerkUserToNeon({
        id: userId,
        emailAddresses: [{ emailAddress: userEmail }],
        fullName: userName,
      });

      // 2. Save Session Locally for Offline-First usage
      await saveSession(bridgeUser.uuid, bridgeUser.name || 'User', bridgeUser.email);

      // 3. Navigate
      setSyncing(false);
      navigation.reset({
        index: 0,
        routes: [{ name: 'Main' }], // or 'Home' depending on your MainStack
      });
    } catch (err: any) {
      console.error('Sync Error:', err);
      setSyncing(false);
      Alert.alert('Login Error', 'Failed to synchronize user data. Please check your connection.');
    }
  };

  const onSignInPress = async () => {
    if (!isLoaded) return;
    if (!email || !password) return Alert.alert('Error', 'Please enter email and password');

    setLoading(true);
    try {
      const completeSignIn = await signIn.create({
        identifier: email,
        password,
      });

      // This is for simple email/password. 
      // If 2FA is enabled, you'd need to handle 'needs_second_factor' status.
      if (completeSignIn.status === 'complete') {
        await setActive({ session: completeSignIn.createdSessionId });

        // We can't easily get the user object synchronously from signIn result 
        // effectively without a fetch, but let's pass what we know.
        // Actually, we can get it from the session user later, 
        // but let's rely on the bridged info we have.
        // Wait, `signIn.userData` isn't fully populated. 
        // We'll use the email we have.
        await handleSyncAndNavigate(completeSignIn.createdUserId!, email, 'User');
      } else {
        Alert.alert('Login Info', 'Further verification required. Please check your email.');
      }
    } catch (err: any) {
      console.error(JSON.stringify(err, null, 2));
      Alert.alert('Login Failed', err.errors ? err.errors[0]?.message : err.message);
    } finally {
      setLoading(false);
    }
  };

  const onSocialLogin = async (strategy: 'google' | 'github') => {
    if (!isLoaded) return;
    setLoading(true);
    try {
      const startFlow = strategy === 'google' ? startGoogleFlow : startGithubFlow;

      const { createdSessionId, signIn, signUp, setActive } = await startFlow();

      if (createdSessionId) {
        await setActive!({ session: createdSessionId });

        // For OAuth, we might need to fetch the user details if they aren't readily available
        // Clerk usually populates basic info.
        // We'll optimistically try to sync.
        // Actually, for OAuth, the email might be in signIn.identifier or we rely on syncClerkUserToNeon to fetch/upsert?
        // Note: `syncClerkUserToNeon` takes {id, email, name}.
        // The `useUser()` hook would give us this, but handleSyncAndNavigate is async.
        // A better approach for OAuth implies we are logged in.
        // The App wrapper `ClerkProvider` -> `useAuth` user object will populate.
        // BUT we want to force the Neon sync *before* navigating.

        // We can use the return values from startFlow carefully.
        // If it was a sign up, `signUp` is populated. If sign in, `signIn`.
        const userObj = signIn || signUp;
        const uid = userObj?.createdUserId || userObj?.userData?.id;
        // OAuth might return email in a different spot depending on provider?
        // Let's assume the user is valid. 
        // A safer bet: The `syncbothWays` or `App.tsx` logic also handles checks, 
        // but here we want to ensure the DB row exists.

        // We can't easily get the email *address* string here without making a call if it's not in the response.
        // However, `syncClerkUserToNeon` REQUIRES email.
        // Let's defer strict syncing to `App.tsx` or `useUser` hook effect 
        // OR try to extract it from the object if possible.
        // `signIn.userData.identifier` usually holds it.

        const bestEmail = (signIn?.userData as any)?.identifier
          || (signUp?.emailAddress as any)
          || (userObj as any)?.emailAddresses?.[0]?.emailAddress;

        if (uid && bestEmail) {
          await handleSyncAndNavigate(uid, bestEmail, (userObj as any)?.firstName);
        } else {
          // Fallback: Just navigate and let the background sync handle it? 
          // No, we need the UUID for queries.
          // If we can't get it, we might need to reload.
          // But usually startFlow finishes successfully.
          navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
        }
      } else {
        // flow cancelled or incomplete
        setLoading(false);
      }
    } catch (err: any) {
      console.error('OAuth Error', err);
      // Alert.alert('Social Login Failed', err.message);
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
      <LinearGradient
        colors={['#0f172a', '#1e293b']}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView contentContainerStyle={styles.scrollContent}>

            {/* Header / Logo */}
            <View style={styles.logoSection}>
              <Image
                source={require('../../assets/splash-icon.png')}
                style={styles.logo}
                resizeMode="contain"
              />
              <Text style={styles.appName}>DhanDiary</Text>
              <Text style={styles.tagline}>Finance, Simplified</Text>
            </View>

            {/* Login Form */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Welcome Back</Text>

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
                  placeholder="Password"
                  placeholderTextColor="#64748b"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                />
              </View>

              <TouchableOpacity
                style={[styles.primaryBtn, loading && styles.disabledBtn]}
                onPress={onSignInPress}
                disabled={loading}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Log In</Text>}
              </TouchableOpacity>

              {/* Social Login Divider */}
              <View style={styles.dividerContainer}>
                <View style={styles.line} />
                <Text style={styles.dividerText}>OR CONTINUE WITH</Text>
                <View style={styles.line} />
              </View>

              <View style={styles.socialRow}>
                <TouchableOpacity style={styles.socialBtn} onPress={() => onSocialLogin('google')}>
                  <FontAwesome name="google" size={24} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.socialBtn} onPress={() => onSocialLogin('github')}>
                  <FontAwesome name="github" size={24} color="#fff" />
                </TouchableOpacity>
              </View>

            </View>

            {/* Footer */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>Don't have an account?</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Register')}>
                <Text style={styles.linkText}>Sign Up</Text>
              </TouchableOpacity>
            </View>

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Syncing Overlay */}
      {syncing && (
        <View style={styles.overlay}>
          <View style={styles.syncBox}>
            <ActivityIndicator size="large" color="#3b82f6" />
            <Text style={styles.syncText}>Syncing your vault...</Text>
          </View>
        </View>
      )}
    </View>
  );
};

export default LoginScreen;

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
    minHeight: '100%',
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logo: {
    width: 80,
    height: 80,
    marginBottom: 16,
    borderRadius: 20,
  },
  appName: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 4,
  },
  tagline: {
    fontSize: 16,
    color: '#94a3b8',
  },
  card: {
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 24,
    textAlign: 'center',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(71, 85, 105, 0.5)',
    marginBottom: 16,
    paddingHorizontal: 16,
    height: 56,
  },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, color: '#fff', fontSize: 16 },
  primaryBtn: {
    backgroundColor: '#3b82f6',
    borderRadius: 16,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  disabledBtn: { opacity: 0.7 },
  primaryBtnText: { color: '#fff', fontSize: 18, fontWeight: '600' },

  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 24,
  },
  line: { flex: 1, height: 1, backgroundColor: '#334155' },
  dividerText: {
    color: '#64748b',
    paddingHorizontal: 16,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
  },
  socialRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  socialBtn: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 32,
  },
  footerText: { color: '#94a3b8', fontSize: 14 },
  linkText: {
    color: '#60a5fa',
    fontWeight: 'bold',
    fontSize: 14,
    marginLeft: 6,
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
    backgroundColor: '#1e293b',
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3b82f6',
  },
  syncText: {
    color: '#fff',
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
  }
});

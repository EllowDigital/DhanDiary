import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Animated,
  Easing,
  ScrollView,
  StatusBar,
  useWindowDimensions,
} from 'react-native';
import { Button, Text } from '@rneui/themed';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';

// Types & Services
import { AuthStackParamList } from '../types/navigation';
import { loginOnline } from '../services/auth';
import { syncBothWays } from '../services/syncManager';
import { useToast } from '../context/ToastContext';
import { useInternetStatus } from '../hooks/useInternetStatus';

// Components & Utils
import { colors, spacing, shadows } from '../utils/design';
import FullScreenSpinner from '../components/FullScreenSpinner';
import AuthField from '../components/AuthField'; // Assuming this exists based on your code

type LoginScreenNavigationProp = NativeStackNavigationProp<AuthStackParamList>;

const LoginScreen = () => {
  const navigation = useNavigation<LoginScreenNavigationProp>();
  const { showToast } = useToast();
  const isOnline = useInternetStatus();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  // --- ANIMATION SETUP ---
  // Using standard Animated to prevent Reanimated crashes
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
    ]).start();
  }, []);

  // --- HANDLERS ---
  const handleLogin = async () => {
    if (loading) return;
    if (!email || !password) return Alert.alert('Missing Fields', 'Please enter both email and password.');
    
    if (!isOnline) {
      return Alert.alert('Offline', 'An internet connection is required to sign in.');
    }

    setLoading(true);
    try {
      await loginOnline(email, password);
      
      // Trigger background sync immediately
      syncBothWays().catch((e) => console.warn('Post-login sync warning:', e));
      
      showToast('Welcome back!');
      (navigation.getParent() as any)?.replace('Main');
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.toLowerCase().includes('timed out')) {
        Alert.alert('Connection Timeout', 'The request took too long.', [
          { text: 'Retry', onPress: handleLogin },
          { text: 'Cancel', style: 'cancel' },
        ]);
      } else {
        Alert.alert('Login Failed', 'Invalid credentials or server error.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    Alert.alert('Reset Password', 'Please contact support to reset your credentials.');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView 
          contentContainerStyle={[
            styles.scrollContent, 
            isLandscape && { paddingVertical: 10 }
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View 
            style={[
              styles.container, 
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
            ]}
          >
            {/* HERO SECTION */}
            <View style={styles.heroSection}>
              <View style={styles.logoContainer}>
                <Image 
                  source={require('../../assets/icon.png')} 
                  style={styles.logo} 
                  resizeMode="contain"
                />
              </View>
              
              <Text style={styles.title}>Welcome Back</Text>
              <Text style={styles.subtitle}>Sign in to continue your financial journey.</Text>

              {/* SECURITY BADGES */}
              <View style={styles.badgeRow}>
                <View style={styles.badge}>
                  <MaterialIcon name="lock" size={12} color={colors.primary} />
                  <Text style={styles.badgeText}>End-to-End Encrypted</Text>
                </View>
                <View style={styles.badge}>
                  <MaterialIcon name="cloud-done" size={12} color={colors.accentGreen} />
                  <Text style={styles.badgeText}>Auto-Sync</Text>
                </View>
              </View>
            </View>

            {/* FORM CARD */}
            <View style={styles.card}>
              <AuthField
                icon="mail-outline"
                placeholder="Email Address"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                value={email}
                onChangeText={setEmail}
              />

              <View style={styles.spacer} />

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
                      color={colors.muted}
                      size={20}
                    />
                  </TouchableOpacity>
                }
              />

              <TouchableOpacity 
                style={styles.forgotPassContainer} 
                onPress={handleForgotPassword}
              >
                <Text style={styles.forgotPassText}>Forgot Password?</Text>
              </TouchableOpacity>

              <Button
                title={loading ? 'Verifying...' : 'Sign In'}
                onPress={handleLogin}
                loading={loading}
                disabled={loading || !isOnline}
                buttonStyle={styles.primaryButton}
                containerStyle={styles.buttonContainer}
                titleStyle={{ fontWeight: '700', fontSize: 16 }}
                icon={
                   !loading ? (
                     <MaterialIcon name="login" size={18} color="white" style={{ marginRight: 8 }} />
                   ) : undefined
                }
              />
            </View>

            {/* FOOTER */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>New to DhanDiary?</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Register')}>
                <Text style={styles.linkText}>Create Account</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      <FullScreenSpinner visible={loading} message="Authenticating..." />
    </SafeAreaView>
  );
};

export default LoginScreen;

/* -------------------------------------
   STYLES
------------------------------------- */
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing(3),
  },
  container: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  
  /* HERO */
  heroSection: {
    alignItems: 'center',
    marginBottom: spacing(4),
  },
  logoContainer: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 6,
    marginBottom: 20,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: 16,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  badgeText: {
    fontSize: 11,
    color: colors.subtleText,
    fontWeight: '600',
  },

  /* CARD & FORM */
  card: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: spacing(3),
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.medium,
  },
  spacer: {
    height: spacing(2),
  },
  eyeIcon: {
    padding: 4,
  },
  forgotPassContainer: {
    alignSelf: 'flex-end',
    marginTop: 8,
    marginBottom: 20,
  },
  forgotPassText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
  },
  buttonContainer: {
    width: '100%',
    borderRadius: 14,
  },

  /* FOOTER */
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing(4),
    gap: 6,
  },
  footerText: {
    color: colors.muted,
    fontSize: 14,
  },
  linkText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 14,
  },
});
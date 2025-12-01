import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { Button, Text } from '@rneui/themed';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../types/navigation';
import { loginOnline } from '../services/auth';
import { syncBothWays } from '../services/syncManager';
import { useToast } from '../context/ToastContext';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  FadeInDown,
} from 'react-native-reanimated';

import { spacing, colors, shadows, fonts } from '../utils/design';
import FullScreenSpinner from '../components/FullScreenSpinner';
import { useInternetStatus } from '../hooks/useInternetStatus';
import AuthField from '../components/AuthField';

type LoginScreenNavigationProp = NativeStackNavigationProp<AuthStackParamList>;

const LoginScreen = () => {
  const navigation = useNavigation<LoginScreenNavigationProp>();
  const { showToast } = useToast();
  const isOnline = useInternetStatus();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  // Animation
  const anim = useSharedValue(0);
  React.useEffect(() => {
    anim.value = withTiming(1, {
      duration: 450,
      easing: Easing.out(Easing.cubic),
    });
  }, []);

  const aStyle = useAnimatedStyle(() => ({
    opacity: anim.value,
    transform: [{ translateY: (1 - anim.value) * 20 }],
  }));

  const handleLogin = async () => {
    if (loading) return;
    if (!email || !password) return Alert.alert('Validation', 'Please enter email and password');
    if (!isOnline) {
      return Alert.alert('Offline', 'Connect to the internet to sign in.');
    }

    setLoading(true);
    try {
      await loginOnline(email, password);
      // Immediately sync after successful login so UI and remote state are up-to-date
      syncBothWays().catch((e: unknown) => {
        console.warn('Immediate post-login sync failed', e);
      });
      showToast('Logged in successfully!');
      (navigation.getParent() as any)?.replace('Main');
    } catch (err: any) {
      const msg = err && err.message ? String(err.message) : String(err);
      if (msg.toLowerCase().includes('timed out')) {
        Alert.alert('Login Failed', 'Request timed out', [
          { text: 'Retry', onPress: () => handleLogin() },
          { text: 'OK', style: 'cancel' },
        ]);
      } else {
        Alert.alert('Login Failed', msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <Animated.View style={[styles.container, aStyle]}>
          <View style={styles.card}>
            <Animated.View entering={FadeInDown.duration(500)} style={styles.heroRow}>
              <Image source={require('../../assets/icon.png')} style={styles.logo} />
              <View style={styles.heroCopy}>
                <Text style={styles.kicker}>Welcome back</Text>
                <Text style={styles.title}>Log into DhanDiary</Text>
                <Text style={styles.subtitle}>Pick up your cash flow in seconds.</Text>
                <View style={styles.heroBullets}>
                  <View style={styles.heroBullet}>
                    <MaterialIcon name="shield" size={16} color={colors.primary} />
                    <Text style={styles.heroBulletText}>AES-256 vault security</Text>
                  </View>
                  <View style={styles.heroBullet}>
                    <MaterialIcon name="flash-on" size={16} color={colors.secondary} />
                    <Text style={styles.heroBulletText}>Instant resume across devices</Text>
                  </View>
                </View>
              </View>
            </Animated.View>

            {/* Email Input */}
            <Animated.View entering={FadeInDown.delay(180).springify().damping(16)}>
              <AuthField
                icon="mail-outline"
                placeholder="Email"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                value={email}
                onChangeText={setEmail}
                accessibilityLabel="Email input"
                accessible
              />
            </Animated.View>

            {/* Password Input */}
            <Animated.View entering={FadeInDown.delay(220).springify().damping(16)}>
              <AuthField
                icon="lock"
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPass}
                autoComplete="password"
                textContentType="password"
                accessibilityLabel="Password input"
                accessible
                rightAccessory={
                  <TouchableOpacity onPress={() => setShowPass(!showPass)}>
                    <MaterialIcon
                      name={showPass ? 'visibility' : 'visibility-off'}
                      color={colors.muted}
                      size={22}
                    />
                  </TouchableOpacity>
                }
              />
            </Animated.View>

            {/* Login Button */}
            <Animated.View
              entering={FadeInDown.delay(260).springify().damping(16)}
              style={{ width: '100%' }}
            >
              <Button
                title={loading ? 'Signing in…' : 'Login'}
                onPress={handleLogin}
                loading={loading}
                disabled={loading || !isOnline}
                accessibilityLabel="Login button"
                accessibilityRole="button"
                icon={
                  <MaterialIcon
                    name="arrow-forward"
                    size={18}
                    color={colors.white}
                    style={{ marginRight: 6 }}
                  />
                }
                buttonStyle={styles.primaryButton}
                containerStyle={styles.buttonContainer}
              />
            </Animated.View>

            {/* Register Link */}
            <Animated.View entering={FadeInDown.delay(320).springify().damping(16)}>
              <TouchableOpacity
                onPress={() => navigation.navigate('Register')}
                style={{ marginTop: spacing(2) }}
              >
                <Text style={styles.link}>Don't have an account? Create one</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </Animated.View>
        <FullScreenSpinner visible={loading} message="Securing your session..." />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default LoginScreen;

/* -------------------------------------
   STYLES – Modern NeoBank Login UI
------------------------------------- */
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },

  container: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing(2),
  },

  card: {
    backgroundColor: colors.card,
    padding: spacing(3),
    borderRadius: 20,
    alignItems: 'stretch',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.large,
  },

  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: spacing(2),
    gap: 12,
  },

  logo: {
    width: 72,
    height: 72,
    borderRadius: 20,
  },

  heroCopy: {
    flex: 1,
  },

  kicker: {
    color: colors.muted,
    textTransform: 'uppercase',
    fontSize: 12,
    letterSpacing: 1.3,
    marginBottom: 4,
    fontWeight: '600',
  },

  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    fontFamily: fonts.heading,
  },

  subtitle: {
    color: colors.muted,
    marginTop: 4,
    fontSize: 15,
  },

  heroBullets: {
    marginTop: spacing(1.5),
    gap: spacing(1),
  },

  heroBullet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  heroBulletText: {
    color: colors.subtleText,
    fontSize: 14,
    fontWeight: '600',
  },

  primaryButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
  },

  buttonContainer: {
    width: '100%',
    marginTop: spacing(2),
  },

  link: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 15,
    textAlign: 'center',
  },
});

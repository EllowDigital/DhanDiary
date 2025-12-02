import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Image,
} from 'react-native';
import { Button, Text } from '@rneui/themed';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../types/navigation';
import { registerOnline } from '../services/auth';
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

type RegisterScreenNavigationProp = NativeStackNavigationProp<AuthStackParamList>;

const RegisterScreen = () => {
  const navigation = useNavigation<RegisterScreenNavigationProp>();
  const { showToast } = useToast();
  const isOnline = useInternetStatus();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

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
    transform: [{ translateY: (1 - anim.value) * 18 }],
  }));

  const handleRegister = async () => {
    if (loading) return;
    if (!isOnline) {
      Alert.alert('Offline', 'Connect to the internet to create an account.');
      return;
    }

    // clear previous inline errors
    setEmailError(null);
    setPasswordError(null);

    if (!name || !email || !password) {
      if (!name) {
        return Alert.alert('Validation', 'Please complete all fields');
      }
      if (!email) setEmailError('Email is required');
      if (!password) setPasswordError('Password is required');
      return;
    }

    const gmailRegex = /^[A-Za-z0-9._%+-]+@gmail\.com$/i;
    if (!gmailRegex.test(email.trim())) {
      setEmailError('Please provide a Gmail address (e.g. user@gmail.com)');
      return;
    }

    if ((password || '').length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }

    try {
      setLoading(true);
      await registerOnline(name, email, password);
      showToast('Account created successfully!');

      (navigation.getParent() as any)?.replace('Main');
    } catch (err: any) {
      const msg = err && err.message ? String(err.message) : String(err);
      if (msg.toLowerCase().includes('timed out')) {
        Alert.alert('Registration Failed', 'Request timed out', [
          { text: 'Retry', onPress: () => handleRegister() },
          { text: 'OK', style: 'cancel' },
        ]);
      } else {
        Alert.alert('Registration Failed', msg || 'Something went wrong');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Animated.View style={[styles.container, aStyle]}>
          <View style={styles.card}>
            <Animated.View entering={FadeInDown.duration(500)} style={styles.heroRow}>
              <Image source={require('../../assets/icon.png')} style={styles.logo} />
              <View style={styles.heroCopy}>
                <Text style={styles.kicker}>Create your vault</Text>
                <Text style={styles.title}>Join DhanDiary</Text>
                <Text style={styles.subtitle}>Fresh, fast onboarding with encrypted backups.</Text>
                <View style={styles.heroBullets}>
                  <View style={styles.heroBullet}>
                    <MaterialIcon name="stars" size={16} color={colors.primary} />
                    <Text style={styles.heroBulletText}>Guided signup in two steps</Text>
                  </View>
                  <View style={styles.heroBullet}>
                    <MaterialIcon name="lock" size={16} color={colors.secondary} />
                    <Text style={styles.heroBulletText}>Encrypted cloud backups</Text>
                  </View>
                </View>
              </View>
            </Animated.View>

            {/* Full Name */}
            <Animated.View entering={FadeInDown.delay(180).springify().damping(16)}>
              <AuthField
                icon="person"
                placeholder="Full Name"
                value={name}
                onChangeText={setName}
                accessibilityLabel="Full name input"
                accessible
              />
            </Animated.View>

            {/* Email */}
            <Animated.View entering={FadeInDown.delay(220).springify().damping(16)}>
              <AuthField
                icon="mail-outline"
                placeholder="Email"
                value={email}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                onChangeText={(v) => {
                  setEmail(v);
                  if (emailError) setEmailError(null);
                }}
                error={emailError}
                accessibilityLabel="Email input"
                accessible
              />
            </Animated.View>

            {/* Password */}
            <Animated.View entering={FadeInDown.delay(260).springify().damping(16)}>
              <AuthField
                icon="lock"
                placeholder="Password"
                value={password}
                secureTextEntry={!showPass}
                autoComplete="password"
                textContentType="password"
                onChangeText={(v) => {
                  setPassword(v);
                  if (passwordError && v.length >= 8) setPasswordError(null);
                }}
                error={passwordError}
                accessibilityLabel="Password input"
                accessible
                rightAccessory={
                  <View style={styles.passwordActions}>
                    <TouchableOpacity onPress={() => setShowPass(!showPass)}>
                      <MaterialIcon
                        name={showPass ? 'visibility' : 'visibility-off'}
                        size={22}
                        color={colors.muted}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() =>
                        Alert.alert(
                          'Password example',
                          'Use at least 8 characters. Example: MyP@ssw0rd'
                        )
                      }
                    >
                      <MaterialIcon name="info-outline" size={20} color={colors.muted} />
                    </TouchableOpacity>
                  </View>
                }
              />
            </Animated.View>

            {/* Register Button */}
            <Animated.View entering={FadeInDown.delay(300).springify().damping(16)}>
              <Button
                title={loading ? 'Creating…' : 'Create Account'}
                loading={loading}
                onPress={handleRegister}
                disabled={loading || !isOnline}
                buttonStyle={styles.primaryButton}
                containerStyle={styles.btnContainer}
                icon={
                  <MaterialIcon
                    name="person-add"
                    size={18}
                    color={colors.white}
                    style={{ marginRight: 6 }}
                  />
                }
                accessibilityLabel="Create account button"
                accessibilityRole="button"
              />
            </Animated.View>

            {/* Back to Login */}
            <Animated.View entering={FadeInDown.delay(340).springify().damping(16)}>
              <TouchableOpacity onPress={() => navigation.goBack()}>
                <Text style={styles.link}>Already have an account? Log in</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </Animated.View>
        <FullScreenSpinner visible={loading} message="Creating account..." />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default RegisterScreen;

/* -----------------------------
        Modern UI Styles
----------------------------- */
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
    borderRadius: 20,
    padding: spacing(3),
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'stretch',
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
    borderRadius: 12,
    paddingVertical: 14,
  },

  btnContainer: {
    width: '100%',
    marginTop: spacing(2),
  },

  link: {
    color: colors.primary,
    textAlign: 'center',
    marginTop: spacing(2),
    fontWeight: '600',
    fontSize: 15,
  },

  passwordActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
  },
});

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Image,
  Animated,
  Easing,
  ScrollView,
  StatusBar,
  useWindowDimensions,
  Keyboard,
} from 'react-native';
import { Button, Text } from '@rneui/themed';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';

// Types & Services
import { AuthStackParamList } from '../types/navigation';
import { registerOnline } from '../services/auth';
import { useToast } from '../context/ToastContext';
import { useInternetStatus } from '../hooks/useInternetStatus';

// Components & Utils
import { colors, spacing, shadows } from '../utils/design';
import FullScreenSpinner from '../components/FullScreenSpinner';
import AuthField from '../components/AuthField';

type RegisterScreenNavigationProp = NativeStackNavigationProp<AuthStackParamList>;

const RegisterScreen = () => {
  const navigation = useNavigation<RegisterScreenNavigationProp>();
  const { showToast } = useToast();
  const isOnline = useInternetStatus();
  const { width } = useWindowDimensions();

  // State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  // Validation State
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Animation Refs
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

  // Password Strength Logic
  const getPasswordStrength = (pass: string) => {
    if (pass.length === 0) return 0;
    let score = 0;
    if (pass.length >= 8) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    return score; // Max 3
  };
  const passStrength = getPasswordStrength(password);

  const handleRegister = async () => {
    if (loading) return;
    if (!isOnline)
      return Alert.alert('Offline', 'Internet connection required to create an account.');

    // Clear previous errors
    setEmailError(null);
    setPasswordError(null);
    Keyboard.dismiss();

    // Validation
    if (!name.trim()) return Alert.alert('Missing Name', 'Please enter your full name.');
    if (!email.trim()) {
      setEmailError('Email is required');
      return;
    }

    if (password.length < 8) {
      setPasswordError('Must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      await registerOnline(name, email, password);
      showToast('Account created!');
      (navigation.getParent() as any)?.replace('Main');
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('timed out')) {
        Alert.alert('Timeout', 'Server took too long to respond. Try again?');
      } else {
        Alert.alert('Registration Failed', msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View
            style={[
              styles.container,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
            ]}
          >
            {/* HERO SECTION */}
            <View style={styles.heroSection}>
              <Image source={require('../../assets/icon.png')} style={styles.logo} />
              <Text style={styles.title}>Join DhanDiary</Text>
              <Text style={styles.subtitle}>Secure financial tracking starts here.</Text>
            </View>

            {/* FORM CARD */}
            <View style={styles.card}>
              <View style={styles.heroBullets}>
                <View style={styles.heroBullet}>
                  <MaterialIcon name="verified-user" size={14} color={colors.accentGreen} />
                  <Text style={styles.heroBulletText}>Free Forever</Text>
                </View>
                <View style={styles.heroBullet}>
                  <MaterialIcon name="lock" size={14} color={colors.accentBlue} />
                  <Text style={styles.heroBulletText}>Encrypted Backup</Text>
                </View>
              </View>

              <AuthField
                icon="person-outline"
                placeholder="Full Name"
                value={name}
                onChangeText={setName}
              />

              <View style={styles.spacer} />

              <AuthField
                icon="mail-outline"
                placeholder="Email Address"
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  if (emailError) setEmailError(null);
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                error={emailError}
              />

              <View style={styles.spacer} />

              <AuthField
                icon="lock-outline"
                placeholder="Create Password"
                value={password}
                secureTextEntry={!showPass}
                onChangeText={(text) => {
                  setPassword(text);
                  if (passwordError) setPasswordError(null);
                }}
                error={passwordError}
                rightAccessory={
                  <TouchableOpacity onPress={() => setShowPass(!showPass)}>
                    <MaterialIcon
                      name={showPass ? 'visibility' : 'visibility-off'}
                      size={20}
                      color={colors.muted}
                    />
                  </TouchableOpacity>
                }
              />

              {/* Password Strength Indicator */}
              {password.length > 0 && (
                <View style={styles.strengthContainer}>
                  <View
                    style={[
                      styles.strengthBar,
                      {
                        backgroundColor:
                          passStrength >= 1
                            ? passStrength >= 2
                              ? colors.accentGreen
                              : colors.accentOrange
                            : colors.accentRed,
                        flex: passStrength,
                      },
                    ]}
                  />
                  <View
                    style={[
                      styles.strengthBar,
                      { backgroundColor: '#E0E0E0', flex: 3 - passStrength },
                    ]}
                  />
                </View>
              )}
              {password.length > 0 && (
                <Text style={styles.strengthText}>
                  {passStrength === 0
                    ? 'Too short'
                    : passStrength === 1
                      ? 'Weak'
                      : passStrength === 2
                        ? 'Good'
                        : 'Strong'}
                </Text>
              )}

              <Button
                title={loading ? 'Creating...' : 'Create Account'}
                onPress={handleRegister}
                loading={loading}
                disabled={loading || !isOnline}
                buttonStyle={styles.primaryButton}
                containerStyle={styles.buttonContainer}
                titleStyle={{ fontWeight: '700', fontSize: 16 }}
                icon={
                  !loading ? (
                    <MaterialIcon
                      name="arrow-forward"
                      size={18}
                      color="white"
                      style={{ marginRight: 8 }}
                    />
                  ) : undefined
                }
              />

              <View style={styles.termsContainer}>
                <Text style={styles.termsText}>
                  By signing up, you agree to our <Text style={styles.termsLink}>Terms</Text> and{' '}
                  <Text style={styles.termsLink}>Privacy Policy</Text>.
                </Text>
              </View>
            </View>

            {/* FOOTER */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>Already have an account?</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                <Text style={styles.linkText}>Log In</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
      <FullScreenSpinner visible={loading} message="Creating your vault..." />
    </SafeAreaView>
  );
};

export default RegisterScreen;

/* -----------------------------
   STYLES
----------------------------- */
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center', // Centers when content is small
    padding: spacing(3),
    paddingBottom: spacing(8), // Extra padding at bottom so keyboard doesn't hide last element
  },
  container: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },

  /* HERO */
  heroSection: {
    alignItems: 'center',
    marginBottom: spacing(3),
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 18,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: colors.muted,
  },

  /* CARD */
  card: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: spacing(3),
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.medium,
  },
  heroBullets: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 20,
  },
  heroBullet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  heroBulletText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },

  spacer: {
    height: spacing(2),
  },

  /* STRENGTH METER */
  strengthContainer: {
    flexDirection: 'row',
    height: 4,
    borderRadius: 2,
    marginTop: 10,
    overflow: 'hidden',
    gap: 4,
  },
  strengthBar: {
    height: '100%',
    borderRadius: 2,
  },
  strengthText: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 4,
    marginBottom: 10,
    textAlign: 'right',
  },

  primaryButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
  },
  buttonContainer: {
    marginTop: 20,
    borderRadius: 14,
  },

  /* TERMS */
  termsContainer: {
    marginTop: 16,
  },
  termsText: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 18,
  },
  termsLink: {
    color: colors.primary,
    fontWeight: '600',
  },

  /* FOOTER */
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing(3),
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

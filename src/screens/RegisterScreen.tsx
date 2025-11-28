import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { Input, Button, Text } from '@rneui/themed';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../types/navigation';
import { registerOnline } from '../services/auth';
import { useToast } from '../context/ToastContext';
import MaterialIcon from 'react-native-vector-icons/MaterialIcons';
import { SafeAreaView } from 'react-native-safe-area-context';

import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';

import { spacing, colors, shadows, fonts } from '../utils/design';

type RegisterScreenNavigationProp = NativeStackNavigationProp<AuthStackParamList>;

const RegisterScreen = () => {
  const navigation = useNavigation<RegisterScreenNavigationProp>();
  const { showToast } = useToast();

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
      Alert.alert('Registration Failed', err.message || 'Something went wrong');
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
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Join DhanDiary today</Text>

            {/* Full Name */}
            <Input
              placeholder="Full Name"
              value={name}
              onChangeText={setName}
              leftIcon={<MaterialIcon name="person" size={22} color="#64748B" />}
              containerStyle={styles.inputWrap}
              inputContainerStyle={styles.inputContainer}
              inputStyle={styles.inputText}
            />

            {/* Email */}
            <Input
              placeholder="Email"
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                if (emailError) setEmailError(null);
              }}
              autoCapitalize="none"
              leftIcon={<MaterialIcon name="email" size={22} color="#64748B" />}
              containerStyle={styles.inputWrap}
              inputContainerStyle={styles.inputContainer}
              inputStyle={styles.inputText}
              errorMessage={emailError || ''}
              errorStyle={styles.inputError}
            />

            {/* Password */}
            <Input
              placeholder="Password"
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                if (passwordError && v.length >= 8) setPasswordError(null);
              }}
              secureTextEntry={!showPass}
              leftIcon={<MaterialIcon name="lock" size={22} color="#64748B" />}
              rightIcon={
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TouchableOpacity
                    onPress={() => setShowPass(!showPass)}
                    style={{ marginRight: 8 }}
                  >
                    <MaterialIcon
                      name={showPass ? 'visibility' : 'visibility-off'}
                      size={22}
                      color="#64748B"
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
                    <MaterialIcon name="info-outline" size={20} color="#64748B" />
                  </TouchableOpacity>
                </View>
              }
              containerStyle={styles.inputWrap}
              inputContainerStyle={styles.inputContainer}
              inputStyle={styles.inputText}
              errorMessage={passwordError || ''}
              errorStyle={styles.inputError}
            />

            {/* Register Button */}
            <Button
              title="Create Account"
              loading={loading}
              onPress={handleRegister}
              buttonStyle={styles.primaryButton}
              containerStyle={styles.btnContainer}
              icon={
                <MaterialIcon
                  name="person-add"
                  size={18}
                  color="white"
                  style={{ marginRight: 6 }}
                />
              }
            />

            {/* Back to Login */}
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Text style={styles.link}>Already have an account? Log in</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
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
    backgroundColor: '#EEF3FF',
  },

  container: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing(2),
  },

  card: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 20,
    padding: spacing(3),
    ...shadows.large,
  },

  title: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    color: '#0F172A',
    fontFamily: fonts.heading,
  },

  subtitle: {
    textAlign: 'center',
    color: '#64748B',
    marginBottom: spacing(3),
    fontSize: 15,
  },

  inputWrap: {
    width: '100%',
    marginTop: spacing(1),
  },

  inputContainer: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 0,
  },

  inputText: {
    fontSize: 16,
    color: '#1E293B',
    paddingLeft: 6,
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
  inputError: {
    color: '#EF4444',
    marginLeft: 6,
    fontSize: 12,
  },
});

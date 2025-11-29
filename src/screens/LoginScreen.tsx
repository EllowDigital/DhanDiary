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
import { Input, Button, Text } from '@rneui/themed';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../types/navigation';
import { loginOnline } from '../services/auth';
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
import FullScreenSpinner from '../components/FullScreenSpinner';

type LoginScreenNavigationProp = NativeStackNavigationProp<AuthStackParamList>;

const LoginScreen = () => {
  const navigation = useNavigation<LoginScreenNavigationProp>();
  const { showToast } = useToast();

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
    if (!email || !password) return Alert.alert('Validation', 'Please enter email and password');

    setLoading(true);
    try {
      await loginOnline(email, password);
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
            {/* App Icon */}
            <Image source={require('../../assets/icon.png')} style={styles.logo} />

            <Text style={styles.title}>Welcome Back 👋</Text>
            <Text style={styles.subtitle}>Login to continue</Text>

            {/* Email Input */}
            <Input
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              leftIcon={<MaterialIcon name="email" size={22} color="#64748B" />}
              containerStyle={styles.inputWrap}
              inputContainerStyle={styles.inputContainer}
              inputStyle={styles.inputText}
              autoComplete="email"
              textContentType="emailAddress"
              accessibilityLabel="Email input"
              accessible
            />

            {/* Password Input */}
            <Input
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPass}
              leftIcon={<MaterialIcon name="lock" size={22} color="#64748B" />}
              rightIcon={
                <TouchableOpacity onPress={() => setShowPass(!showPass)}>
                  <MaterialIcon
                    name={showPass ? 'visibility' : 'visibility-off'}
                    color="#64748B"
                    size={22}
                  />
                </TouchableOpacity>
              }
              containerStyle={styles.inputWrap}
              inputContainerStyle={styles.inputContainer}
              inputStyle={styles.inputText}
              autoComplete="password"
              textContentType="password"
              accessibilityLabel="Password input"
              accessible
            />

            {/* Login Button */}
            <Button
              title="Login"
              onPress={handleLogin}
              loading={loading}
              accessibilityLabel="Login button"
              accessibilityRole="button"
              icon={
                <MaterialIcon
                  name="arrow-forward"
                  size={18}
                  color="white"
                  style={{ marginRight: 6 }}
                />
              }
              buttonStyle={styles.primaryButton}
              containerStyle={styles.buttonContainer}
            />

            {/* Register Link */}
            <TouchableOpacity
              onPress={() => navigation.navigate('Register')}
              style={{ marginTop: spacing(2) }}
            >
              <Text style={styles.link}>Don't have an account? Create one</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
        <FullScreenSpinner visible={loading} message="Logging in..." />
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
    backgroundColor: '#EEF3FF',
  },

  container: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing(2),
  },

  card: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    padding: spacing(3),
    borderRadius: 20,
    alignItems: 'center',
    ...shadows.large,
  },

  logo: {
    width: 90,
    height: 90,
    borderRadius: 20,
    marginBottom: spacing(2),
  },

  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 4,
    fontFamily: fonts.heading,
  },

  subtitle: {
    color: '#64748B',
    marginBottom: spacing(2.5),
    textAlign: 'center',
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
    color: '#1E293B',
    fontSize: 16,
    paddingLeft: 6,
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

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Text,
  AppState,
  AppStateStatus,
  Platform,
  BackHandler,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Button } from '@rneui/themed';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../utils/design';
import { useAuth } from '../hooks/useAuth';

const BIOMETRIC_KEY = 'BIOMETRIC_ENABLED';
const AUTH_GRACE_MS = 60 * 1000; // 1 minute grace period (adjust as needed)

export const BiometricAuth = () => {
  const { user } = useAuth();
  const appState = useRef(AppState.currentState);

  // State
  const [isLocked, setIsLocked] = useState(false);
  const [biometricType, setBiometricType] = useState<LocalAuthentication.AuthenticationType[]>([]);
  const [isBiometricEnabled, setIsBiometricEnabled] = useState(false);

  // Refs for logic control
  const lastAuthAt = useRef<number | null>(null);
  const isAuthInProgress = useRef(false);
  const isEnabledRef = useRef(false); // Ref mirror for synchronous access in AppState callback

  // 1. Initial Setup: Check hardware and User Preference
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      // Check supported hardware
      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      if (mounted) setBiometricType(types);

      // Check if user has enabled this feature in your Settings
      // NOTE: We assume 'true' string in SecureStore means enabled
      const enabledSetting = await SecureStore.getItemAsync(BIOMETRIC_KEY);
      const isEnabled = enabledSetting === 'true';

      if (mounted) {
        setIsBiometricEnabled(isEnabled);
        isEnabledRef.current = isEnabled;

        // If enabled and user is logged in, perform initial lock check
        if (isEnabled && user) {
          checkInitialLock();
        }
      }
    };

    init();

    return () => {
      mounted = false;
    };
  }, [user]);

  // 2. AppState Listener: Handle Background/Foreground transitions
  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [user]);

  // 3. Android Back Button Handler (Prevent bypassing lock)
  useEffect(() => {
    const backAction = () => {
      if (isLocked) {
        // If locked, prevent back button from doing anything (or minimize app)
        BackHandler.exitApp();
        return true;
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [isLocked]);

  const checkInitialLock = () => {
    // Don't lock if we are within the grace period (e.g. just reloaded bundle)
    const now = Date.now();
    if (lastAuthAt.current && now - lastAuthAt.current < AUTH_GRACE_MS) {
      return;
    }
    setIsLocked(true);
    authenticate();
  };

  const handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (!isEnabledRef.current || !user) return;

    // GOING TO BACKGROUND
    if (appState.current === 'active' && nextAppState.match(/inactive|background/)) {
      // Immediately lock the UI (obscure content) so app switcher sees the lock screen
      setIsLocked(true);
    }

    // COMING TO FOREGROUND
    if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
      // If logic dictates we should still be locked, trigger the prompt
      const now = Date.now();
      const inGracePeriod = lastAuthAt.current && now - lastAuthAt.current < AUTH_GRACE_MS;

      if (!inGracePeriod) {
        authenticate();
      } else {
        // Auto-unlock if within grace period
        setIsLocked(false);
      }
    }

    appState.current = nextAppState;
  };

  const authenticate = async () => {
    if (isAuthInProgress.current) return;

    // Safety check: ensure we can actually authenticate
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();

    if (!hasHardware || !isEnrolled) {
      // Fallback: If hardware fails/unavailable, just unlock or ask for PIN
      // For now, we unlock to prevent permanent lockout, or you can route to PIN screen
      setIsLocked(false);
      return;
    }

    isAuthInProgress.current = true;

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock DhanDiary',
        fallbackLabel: 'Use App Passcode', // Triggers OS device passcode/pattern
        cancelLabel: 'Cancel',
        disableDeviceFallback: false, // Allow PIN if face fails
      });

      if (result.success) {
        lastAuthAt.current = Date.now();
        setIsLocked(false);
      } else {
        // Auth failed or cancelled. Stay locked.
        // User will see the "Unlock" button on the UI to try again.
      }
    } catch (error) {
      console.error('Biometric Auth Error:', error);
    } finally {
      isAuthInProgress.current = false;
    }
  };

  // If feature disabled or unlocked, render nothing
  if (!isLocked || !isBiometricEnabled) return null;

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconBox}>
          <MaterialCommunityIcons
            name={
              biometricType.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
                ? 'face-recognition'
                : 'fingerprint'
            }
            size={64}
            color={colors.primary}
          />
        </View>

        <Text style={styles.title}>DhanDiary Locked</Text>
        <Text style={styles.subtitle}>Your finance data is secured.</Text>

        <Button
          title="Unlock Vault"
          onPress={authenticate}
          buttonStyle={styles.button}
          titleStyle={styles.buttonText}
          containerStyle={styles.buttonContainer}
          icon={{
            name: 'lock-open-outline',
            type: 'material-community',
            size: 20,
            color: 'white',
          }}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background || '#F8FAFC',
    zIndex: 99999,
    elevation: 99, // Required for Android to sit on top of headers
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    padding: 30,
    width: '100%',
  },
  iconBox: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 16,
    color: colors.muted || '#64748B',
    textAlign: 'center',
    marginBottom: 40,
  },
  buttonContainer: {
    width: 200,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    elevation: 4,
  },
  buttonText: {
    fontWeight: '600',
    fontSize: 16,
    marginLeft: 8,
  },
});

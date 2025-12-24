import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, Text, AppState, Image, AppStateStatus, Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Button } from '@rneui/themed';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../utils/design';
import { useAuth } from '../hooks/useAuth';

const BIOMETRIC_KEY = 'BIOMETRIC_ENABLED';

export const BiometricAuth = () => {
  const { user } = useAuth();
  const appState = useRef(AppState.currentState);
  const [isLocked, setIsLocked] = useState(false);
  const [biometricType, setBiometricType] = useState<LocalAuthentication.AuthenticationType[]>([]);

  // Check if feature is enabled and supported on mount
  useEffect(() => {
    checkBiometrics();

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        // App coming to foreground
        checkLockStatus();
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // Initial check on mount (in case app was already cold launched)
  useEffect(() => {
    if (user) {
      checkLockStatus();
    }
  }, [user]);

  const checkBiometrics = async () => {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    setBiometricType(types);
  };

  const checkLockStatus = async () => {
    if (!user) return; // Don't lock if not logged in

    try {
      const enabled = await SecureStore.getItemAsync(BIOMETRIC_KEY);
      if (enabled === 'true') {
        setIsLocked(true);
        authenticate();
      }
    } catch (e) {
      console.error('Failed to check biometric status', e);
    }
  };

  const authenticate = async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock DhanDiary',
        fallbackLabel: 'Use Passcode',
        disableDeviceFallback: false,
        cancelLabel: 'Cancel',
      });

      if (result.success) {
        setIsLocked(false);
      } else {
        // Determine if we should retry or just sit there
        // Usually we just leave the lock screen up and let them tap "Retry"
      }
    } catch (e) {
      console.error('Biometric error', e);
    }
  };

  if (!isLocked) return null;

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
        <Text style={styles.subtitle}>Authentication required to access your vault.</Text>

        <Button
          title="Unlock"
          onPress={authenticate}
          buttonStyle={styles.button}
          containerStyle={{ width: 200, marginTop: 40 }}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background || '#F8FAFC',
    zIndex: 99999, // High z-index to cover everything
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    padding: 20,
  },
  iconBox: {
    width: 100,
    height: 100,
    borderRadius: 30,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.muted,
    textAlign: 'center',
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
  },
});

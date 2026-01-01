import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, StyleSheet, Text, BackHandler } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { Button } from '@rneui/themed';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../utils/design';

export const BiometricAuth = (props: {
  enabled: boolean;
  locked: boolean;
  promptMessage?: string;
  onUnlocked: () => void;
}) => {
  const { enabled, locked, promptMessage, onUnlocked } = props;

  // UI state
  const [biometricType, setBiometricType] = useState<LocalAuthentication.AuthenticationType[]>([]);
  const isAuthInProgress = useRef(false);

  // 1) Load supported biometric types (UI only)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        if (mounted) setBiometricType(types);
      } catch (e) {
        if (mounted) setBiometricType([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // 3. Android Back Button Handler (Prevent bypassing lock)
  useEffect(() => {
    const backAction = () => {
      if (locked && enabled) {
        // If locked, prevent back button from doing anything (or minimize app)
        BackHandler.exitApp();
        return true;
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [locked, enabled]);

  const authenticate = useCallback(async () => {
    if (isAuthInProgress.current) return;

    // Safety check: ensure we can actually authenticate
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();

    if (!hasHardware || !isEnrolled) {
      // Fallback: If hardware fails/unavailable, just unlock or ask for PIN
      // For now, we unlock to prevent permanent lockout, or you can route to PIN screen
      onUnlocked();
      return;
    }

    isAuthInProgress.current = true;

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: promptMessage || 'Unlock DhanDiary',
        fallbackLabel: 'Use App Passcode', // Triggers OS device passcode/pattern
        cancelLabel: 'Cancel',
        disableDeviceFallback: false, // Allow PIN if face fails
      });

      if (result.success) {
        onUnlocked();
      } else {
        // Auth failed or cancelled. Stay locked.
        // User will see the "Unlock" button on the UI to try again.
      }
    } catch (error) {
      console.error('Biometric Auth Error:', error);
    } finally {
      isAuthInProgress.current = false;
    }
  }, [onUnlocked, promptMessage]);

  // 2) When the app is locked, prompt once (session gate, not per-screen)
  useEffect(() => {
    if (!enabled || !locked) return;
    // Fire-and-forget; UI remains responsive underneath but blocked by overlay
    authenticate();
  }, [enabled, locked, authenticate]);

  // If feature disabled or unlocked, render nothing
  if (!locked || !enabled) return null;

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

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, StyleSheet, Text, BackHandler } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { Button } from '@rneui/themed';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, shadows } from '../utils/design';

export const BiometricAuth = (props: {
  enabled: boolean;
  locked: boolean;
  promptMessage?: string;
  onUnlocked: () => void;
}) => {
  const { enabled, locked, promptMessage, onUnlocked } = props;

  // UI state
  const [biometricType, setBiometricType] = useState<LocalAuthentication.AuthenticationType[]>([]);
  const [statusText, setStatusText] = useState<string>('');
  const isAuthInProgress = useRef(false);

  // Refs to avoid effect loops when parent recreates callbacks.
  const enabledRef = useRef(enabled);
  const lockedRef = useRef(locked);
  const onUnlockedRef = useRef(onUnlocked);
  const promptMessageRef = useRef(promptMessage);

  useEffect(() => {
    enabledRef.current = enabled;
    lockedRef.current = locked;
    promptMessageRef.current = promptMessage;
    onUnlockedRef.current = onUnlocked;
  }, [enabled, locked, promptMessage, onUnlocked]);

  // Prevent infinite re-prompts: auto prompt once per lock event, and apply a cooldown
  // after user cancellation or temporary lockouts.
  const didAutoPromptRef = useRef(false);
  const cooldownUntilRef = useRef(0);

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
        // If locked, prevent bypassing the lock screen.
        // Do NOT call exitApp() here — it looks like a crash/force-close.
        return true;
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [locked, enabled]);

  const authenticate = useCallback(async (opts?: { auto?: boolean }) => {
    if (isAuthInProgress.current) return;
    if (!enabledRef.current || !lockedRef.current) return;

    const now = Date.now();
    if (cooldownUntilRef.current && now < cooldownUntilRef.current) {
      return;
    }

    // Safety check: ensure we can actually authenticate
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();

    if (!hasHardware || !isEnrolled) {
      // Avoid locking the user out permanently.
      setStatusText('Biometrics not set up on this device.');
      onUnlockedRef.current();
      return;
    }

    isAuthInProgress.current = true;
    setStatusText('');

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: promptMessageRef.current || 'Unlock DhanDiary',
        fallbackLabel: 'Use App Passcode', // Triggers OS device passcode/pattern
        cancelLabel: 'Cancel',
        disableDeviceFallback: false, // Allow PIN if face fails
      });

      if (result.success) {
        setStatusText('');
        onUnlockedRef.current();
      } else {
        const err = String((result as any)?.error || '').toLowerCase();

        // If the user cancelled, do NOT immediately re-prompt (professional apps never loop here).
        if (err.includes('user_cancel') || err.includes('system_cancel') || err.includes('app_cancel')) {
          cooldownUntilRef.current = Date.now() + 15000;
          setStatusText('Unlock cancelled. Tap “Unlock Vault” to try again.');
          return;
        }

        // Too many attempts / OS lockout.
        if (err.includes('lockout') || err.includes('too_many_attempts')) {
          cooldownUntilRef.current = Date.now() + 30000;
          setStatusText('Too many attempts. Please wait a moment and try again.');
          return;
        }

        // Generic failure: brief cooldown to avoid rapid loops.
        if (opts?.auto) {
          cooldownUntilRef.current = Date.now() + 5000;
        }
        setStatusText('Couldn’t verify. Tap “Unlock Vault” to try again.');
      }
    } catch (error) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn('[BiometricAuth] authenticate failed', error);
      }
      // Avoid looping due to unexpected errors.
      if (opts?.auto) cooldownUntilRef.current = Date.now() + 15000;
      setStatusText('Biometric unlock is unavailable right now. Tap “Unlock Vault” to retry.');
    } finally {
      isAuthInProgress.current = false;
    }
  }, []);

  // 2) When the app is locked, prompt once (session gate, not per-screen)
  useEffect(() => {
    // Reset flags when we unlock or disable.
    if (!enabled || !locked) {
      didAutoPromptRef.current = false;
      setStatusText('');
      return;
    }

    // Auto-prompt only once per lock event.
    if (didAutoPromptRef.current) return;
    didAutoPromptRef.current = true;
    // Fire-and-forget; overlay stays visible.
    void authenticate({ auto: true });
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

        {!!statusText && <Text style={styles.statusText}>{statusText}</Text>}

        <Button
          title="Unlock Vault"
          onPress={() => authenticate({ auto: false })}
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
    backgroundColor: colors.background,
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
    backgroundColor: colors.softCard,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    ...shadows.medium,
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
    color: colors.muted,
    textAlign: 'center',
    marginBottom: 40,
  },
  statusText: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    marginTop: -26,
    marginBottom: 18,
    paddingHorizontal: 12,
  },
  buttonContainer: {
    width: 200,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    ...shadows.small,
  },
  buttonText: {
    fontWeight: '600',
    fontSize: 16,
    marginLeft: 8,
  },
});

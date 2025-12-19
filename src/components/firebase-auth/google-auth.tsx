import React from 'react';
import {
  Platform,
  View,
  TouchableOpacity,
  Text,
  Image,
  StyleSheet,
  NativeModules,
} from 'react-native';
import Constants from 'expo-constants';

type Props = {
  onPress?: () => void;
  disabled?: boolean;
};

const GOOGLE_G_MARK = 'https://developers.google.com/identity/images/g-logo.png';

const GoogleAuth: React.FC<Props> = ({ onPress, disabled }) => {
  // Only attempt to load the native button on real native builds (not Expo Go)
  const isNative = Platform.OS === 'android' || Platform.OS === 'ios';
  const isExpo = (Constants && (Constants as any).appOwnership) === 'expo';

  if (isNative && !isExpo) {
    try {
      // Check native module first to avoid requiring the package in environments without native bindings
      const { NativeModules } = require('react-native');
      if (!NativeModules || !NativeModules.RNGoogleSignin) {
        throw new Error('native module not present');
      }

      // Dynamically require to avoid top-level native module resolution in non-native envs
      const mod: any = require('@react-native-google-signin/google-signin');
      const NativeButton = mod && (mod.GoogleSigninButton || mod.default || mod);
      if (NativeButton) {
        return (
          <View>
            <NativeButton
              size={NativeButton.Size?.Wide ?? 2}
              color={NativeButton.Color?.Dark ?? 0}
              onPress={onPress}
              disabled={!!disabled}
            />
          </View>
        );
      }
    } catch (e) {
      // If require fails, fall back to custom button
    }
  }

  // Web or fallback: render a custom outlined button with the official Google 'G' logo
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!!disabled}
      style={[styles.fallbackButton, disabled ? styles.disabled : null]}
    >
      <Image source={{ uri: GOOGLE_G_MARK }} style={styles.logo} />
      <Text style={styles.text}>Sign in with Google</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  fallbackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
  },
  logo: { width: 18, height: 18, marginRight: 10, resizeMode: 'contain' },
  text: { fontSize: 14, color: '#111827', fontWeight: '600' },
  disabled: { opacity: 0.6 },
});

export default GoogleAuth;

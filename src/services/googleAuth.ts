import Constants from 'expo-constants';

const getWebClientId = (): string | null => {
  try {
    const extra = (Constants?.expoConfig?.extra || {}) as any;
    return (
      process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
      extra?.oauth?.googleClientId ||
      null
    );
  } catch (e) {
    return null;
  }
};

export const configureGoogleSignIn = () => {
  try {
    // Check native module first to avoid loading the package which initializes native bindings
    try {
      const { NativeModules } = require('react-native');
      if (!NativeModules || !NativeModules.RNGoogleSignin) {
        return;
      }
    } catch (e) {
      return;
    }

    const mod: any = require('@react-native-google-signin/google-signin');
    const { GoogleSignin } = mod;
    const webClientId = getWebClientId();
    const config: any = { offlineAccess: true };
    if (webClientId) config.webClientId = webClientId;

    if (GoogleSignin && typeof GoogleSignin.configure === 'function') {
      GoogleSignin.configure(config);
    }
  } catch (e) {
    // If native module isn't available (Expo Go), surface a warning but don't crash
    // Caller should handle sign-in not being available.
    // console.debug('Google Signin not available', e);
  }
};

export const signInWithGoogle = async () => {
  try {
    // Ensure native module is present before requiring library
    try {
      const { NativeModules } = require('react-native');
      if (!NativeModules || !NativeModules.RNGoogleSignin) {
        throw new Error('Google Signin native module not available in this runtime');
      }
    } catch (e) {
      throw new Error('Google Signin native module not available in this runtime');
    }

    const mod: any = require('@react-native-google-signin/google-signin');
    const { GoogleSignin, statusCodes } = mod;

    if (!GoogleSignin || typeof GoogleSignin.signIn !== 'function') {
      throw new Error('Google Signin native module not available');
    }

    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const userInfo = await GoogleSignin.signIn();

    // return the raw response so callers can inspect provider tokens if needed
    return { success: true, data: userInfo };
  } catch (err: any) {
    // Normalize known statusCodes into a thrown error with code so callers can switch on it
    try {
      const mod: any = require('@react-native-google-signin/google-signin');
      const { statusCodes } = mod;
      if (err && err.code) throw err;
      // Map some common cases
      if (err && typeof err === 'string') {
        throw err;
      }
    } catch (e) {
      // ignore
    }
    throw err;
  }
};

export default {
  configureGoogleSignIn,
  signInWithGoogle,
};

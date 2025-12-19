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
    if (webClientId) {
      if (typeof webClientId !== 'string') {
        try {
          console.warn('googleAuth: webClientId is not a string', webClientId);
          Alert.alert(
            'Google Sign-In Misconfigured',
            'webClientId is invalid—please set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID to the Web client id string.'
          );
        } catch (e) {
          // ignore Alert failures in non-UI contexts
        }
      } else {
        console.debug('googleAuth: using webClientId', webClientId);
        config.webClientId = webClientId;
      }
    }

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
    const signInResult = await GoogleSignin.signIn();

    // return the raw response so callers can inspect provider tokens if needed
    // Extract idToken (newer versions place it under data.idToken)
    let idToken: string | undefined | null = null;
    if (signInResult && typeof signInResult === 'object') {
      idToken = signInResult?.data?.idToken ?? signInResult?.idToken ?? null;
    }
    if (!idToken) {
      const msg = 'No ID token returned from Google Sign-In';
      throw new Error(msg);
    }

    // If Firebase auth native module is available, sign in with credential
    try {
      const firebaseAuth: any = require('@react-native-firebase/auth');
      // Try classic API: auth().signInWithCredential
      if (typeof firebaseAuth === 'function' || firebaseAuth.default) {
        const authInstance = (typeof firebaseAuth === 'function' ? firebaseAuth() : firebaseAuth.default());
        const GoogleAuthProvider = firebaseAuth.GoogleAuthProvider || firebaseAuth.default?.GoogleAuthProvider || authInstance.GoogleAuthProvider || (firebaseAuth.auth && firebaseAuth.auth.GoogleAuthProvider);
        let credential: any = null;
        if (GoogleAuthProvider && typeof GoogleAuthProvider.credential === 'function') {
          credential = GoogleAuthProvider.credential(idToken);
        }
        if (credential && authInstance && typeof authInstance.signInWithCredential === 'function') {
          return await authInstance.signInWithCredential(credential);
        }
      }
      // Try modular API
      if (firebaseAuth && firebaseAuth.getAuth && firebaseAuth.GoogleAuthProvider && firebaseAuth.signInWithCredential) {
        const { getAuth, GoogleAuthProvider, signInWithCredential } = firebaseAuth;
        const credential = GoogleAuthProvider.credential(idToken);
        return await signInWithCredential(getAuth(), credential);
      }
    } catch (e) {
      // If firebase auth not available, fall back to returning raw google result
    }

    return { success: true, data: signInResult };
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

import { GoogleAuthProvider } from 'firebase/auth';
import Constants from 'expo-constants';
import { getFirebaseAuth } from '../firebase';
import { signInWithFirebaseCredential } from './firebaseAuth';

export const configureGoogleSignIn = () => {
  const extra = (Constants?.expoConfig?.extra || {}) as any;
  const webClientId =
    extra?.oauth?.googleClientId ||
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
    '315200510366-8ek2cvlnsidt7e6bgi16tn0kinvtasgb.apps.googleusercontent.com';

  try {
    // Require dynamically so the app won't crash in Expo Go where the native module isn't available
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { GoogleSignin } = require('@react-native-google-signin/google-signin');
    GoogleSignin.configure({
      webClientId,
      offlineAccess: false,
    });
  } catch (e) {
    // Native module not available (Expo Go or missing native install). Fall back to web flow.
    // This prevents a red-screen crash; callers should handle absence accordingly.
    // eslint-disable-next-line no-console
    console.warn('Google Sign-In native module not available; skipping native configuration.');
  }
};

export const signInWithGoogle = async () => {
  let GoogleSignin: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    GoogleSignin = require('@react-native-google-signin/google-signin').GoogleSignin;
  } catch (e) {
    throw new Error(
      'Native Google Sign-In module not available. Use Expo custom dev client or EAS build, or switch to web OAuth flow.'
    );
  }

  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const userInfo = await GoogleSignin.signIn();
  const idToken = (userInfo as any).idToken;
  if (!idToken) throw new Error('Google Sign-In did not return an idToken');
  const credential = GoogleAuthProvider.credential(idToken);
  // Use centralized handler to ensure account-exists-with-different-credential is processed
  return signInWithFirebaseCredential(credential);
};

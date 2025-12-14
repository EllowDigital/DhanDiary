import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { GoogleAuthProvider } from 'firebase/auth';
import Constants from 'expo-constants';
import { getFirebaseAuth } from '../firebase';
import { signInWithFirebaseCredential } from './firebaseAuth';

export const configureGoogleSignIn = () => {
  const extra = (Constants?.expoConfig?.extra || {}) as any;
  const webClientId =
    extra?.oauth?.googleClientId || process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
    '315200510366-8ek2cvlnsidt7e6bgi16tn0kinvtasgb.apps.googleusercontent.com';

  GoogleSignin.configure({
    webClientId,
    offlineAccess: false,
  });
};

export const signInWithGoogle = async () => {
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const userInfo = await GoogleSignin.signIn();
  const idToken = (userInfo as any).idToken;
  if (!idToken) throw new Error('Google Sign-In did not return an idToken');
  const credential = GoogleAuthProvider.credential(idToken);
  // Use centralized handler to ensure account-exists-with-different-credential is processed
  return signInWithFirebaseCredential(credential);
};

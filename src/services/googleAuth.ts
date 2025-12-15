import { Platform } from 'react-native';
import { GoogleAuthProvider } from 'firebase/auth';
import Constants from 'expo-constants';
import { signInWithFirebaseCredential } from './firebaseAuth';

const DEFAULT_WEB_CLIENT_ID =
  '315200510366-8ek2cvlnsidt7e6bgi16tn0kinvtasgb.apps.googleusercontent.com';

const getWebClientId = () => {
  const extra = (Constants?.expoConfig?.extra || {}) as any;
  return (
    extra?.oauth?.googleClientId || process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || DEFAULT_WEB_CLIENT_ID
  );
};

export const configureGoogleSignIn = () => {
  const webClientId = getWebClientId();

  // Only attempt native configuration when running in a standalone/custom client on mobile
  const appOwnership = (Constants as any).appOwnership;
  const shouldUseNative = Platform.OS !== 'web' && appOwnership !== 'expo';

  if (shouldUseNative) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      GoogleSignin.configure({
        webClientId,
        offlineAccess: false,
      });
      return;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('Google Sign-In native module not available even in native client', e);
    }
  }

  // When running in Expo Go or web, don't attempt native configuration — use web OAuth instead.
};

export const signInWithGoogle = async () => {
  const appOwnership = (Constants as any).appOwnership;
  const useNative = Platform.OS !== 'web' && appOwnership !== 'expo';

  if (useNative) {
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
    return signInWithFirebaseCredential(credential);
  }

  // Expo Go or web — use expo-auth-session web OAuth flow
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AuthSession = require('expo-auth-session');
    const { makeRedirectUri, loadAsync } = AuthSession;
    // ResponseType enum is in AuthRequest.types; require its build to access the enum value
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ResponseType } = require('expo-auth-session/build/AuthRequest.types');

    const webClientId = getWebClientId();
    const redirectUri = makeRedirectUri({ useProxy: true });

    // Build and preload the auth request
    const request = await loadAsync(
      {
        clientId: webClientId,
        redirectUri,
        scopes: ['openid', 'email', 'profile'],
        responseType: ResponseType.IdToken,
      },
      'https://accounts.google.com'
    );

    // Prompt the user
    const result = await request.promptAsync('https://accounts.google.com');
    if (!result || result.type !== 'success' || !result.params) {
      throw new Error('Google Sign-In cancelled or failed');
    }
    const idToken = result.params.id_token || result.params.idToken;
    if (!idToken) throw new Error('Google Sign-In did not return an id_token');
    const credential = GoogleAuthProvider.credential(idToken);
    return signInWithFirebaseCredential(credential);
  } catch (e: any) {
    throw e instanceof Error ? e : new Error(String(e));
  }
};

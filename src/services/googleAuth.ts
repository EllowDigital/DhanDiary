import { Platform } from 'react-native';
import { GoogleAuthProvider } from 'firebase/auth';
import Constants from 'expo-constants';
import { signInWithFirebaseCredential } from './firebaseAuth';

const getWebClientId = () => {
  return process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
};

const safeRequire = (name: string) => {
  try {
    const req: any = typeof globalThis !== 'undefined' && typeof (globalThis as any).require === 'function'
      ? (globalThis as any).require
      : typeof require === 'function'
        ? require
        : null;
    if (!req) return null;
    return req(name);
  } catch (e) {
    return null;
  }
};

export const configureGoogleSignIn = () => {
  const webClientId = getWebClientId();

  // Only attempt native configuration when running in a standalone/custom client on mobile
  const appOwnership = (Constants as any).appOwnership;
  const shouldUseNative = Platform.OS !== 'web' && appOwnership !== 'expo';

  if (shouldUseNative) {
    try {
      const mod: any = safeRequire('@react-native-google-signin/google-signin');
      const GoogleSignin = mod?.GoogleSignin || (mod && mod.default && mod.default.GoogleSignin);
      if (GoogleSignin && typeof GoogleSignin.configure === 'function') {
        GoogleSignin.configure({
          webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
          offlineAccess: false,
        });
        return;
      }
    } catch (e) {
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
    const mod: any = safeRequire('@react-native-google-signin/google-signin');
    GoogleSignin = mod?.GoogleSignin || (mod && mod.default && mod.default.GoogleSignin);
    if (!GoogleSignin) {
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
  const AuthSession: any = safeRequire('expo-auth-session');
  const { makeRedirectUri, loadAsync } = AuthSession || {};
  // ResponseType enum is in AuthRequest.types; require its build to access the enum value
  const ResponseTypeMod: any = safeRequire('expo-auth-session/build/AuthRequest.types');
  const { ResponseType } = ResponseTypeMod || {};

    const webClientId = getWebClientId();
    const redirectUri = makeRedirectUri({ useProxy: true });

    // Build and preload the auth request
    const request = await loadAsync(
      {
        clientId: webClientId,
        redirectUri,
        scopes: ['openid', 'email', 'profile'],
        responseType: ResponseType.IdToken,
        // Google does not accept PKCE parameters for the implicit id_token response.
        // Disable PKCE so no code_challenge or code_challenge_method are sent.
        usePKCE: false,
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

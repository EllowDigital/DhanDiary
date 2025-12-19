import Constants from 'expo-constants';
import { Alert } from 'react-native';

const getWebClientId = (): string | null => {
  try {
    const extra = (Constants?.expoConfig?.extra || {}) as any;
    return process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || extra?.oauth?.googleClientId || null;
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
    // Try silent sign-in first to avoid showing account chooser if a user previously signed in
    let signInResult: any = null;
    try {
      signInResult = await GoogleSignin.signInSilently();
      console.debug('googleAuth: silent signIn result', signInResult);
    } catch (silentErr: any) {
      console.debug(
        'googleAuth: silent sign-in threw, falling back to interactive sign-in',
        silentErr?.message || silentErr
      );
    }

    // Some runtimes (or versions) return an object like { type: 'noSavedCredentialFound', data: null }
    // from signInSilently instead of throwing. Handle that shape by falling back to interactive sign-in.
    const shouldDoInteractive =
      !signInResult ||
      (typeof signInResult === 'object' &&
        (signInResult.type === 'noSavedCredentialFound' ||
          signInResult.type === 'no_saved_credential' ||
          (signInResult.data == null && !signInResult.idToken)));

    if (shouldDoInteractive) {
      try {
        console.debug('googleAuth: performing interactive signIn');
        signInResult = await GoogleSignin.signIn();
      } catch (interactiveErr: any) {
        console.debug(
          'googleAuth: interactive sign-in failed',
          interactiveErr?.message || interactiveErr
        );
        // preserve the interactive error if present, otherwise fallthrough to idToken check
        if (interactiveErr) throw interactiveErr;
      }
    }

    console.debug('googleAuth: signInResult', signInResult);

    // return the raw response so callers can inspect provider tokens if needed
    // Extract idToken and accessToken (newer versions place tokens under data)
    let idToken: string | undefined | null = null;
    let accessToken: string | undefined | null = null;
    if (signInResult && typeof signInResult === 'object') {
      idToken = signInResult?.data?.idToken ?? signInResult?.idToken ?? null;
      accessToken = signInResult?.data?.accessToken ?? signInResult?.accessToken ?? null;
    }
    if (!idToken && !accessToken) {
      const msg = 'No ID token or access token returned from Google Sign-In';
      console.error('googleAuth: no idToken/accessToken', { signInResult });
      throw new Error(
        msg + (signInResult ? ` (raw response: ${JSON.stringify(signInResult).slice(0, 500)})` : '')
      );
    }

    // If Firebase auth native module is available, sign in with credential
    try {
      const firebaseAuth: any = require('@react-native-firebase/auth');
      // Try classic API: auth().signInWithCredential
      if (typeof firebaseAuth === 'function' || firebaseAuth.default) {
        const authInstance =
          typeof firebaseAuth === 'function' ? firebaseAuth() : firebaseAuth.default();
        const GoogleAuthProvider =
          firebaseAuth.GoogleAuthProvider ||
          firebaseAuth.default?.GoogleAuthProvider ||
          authInstance.GoogleAuthProvider ||
          (firebaseAuth.auth && firebaseAuth.auth.GoogleAuthProvider);
        let credential: any = null;
        if (GoogleAuthProvider && typeof GoogleAuthProvider.credential === 'function') {
          credential = GoogleAuthProvider.credential(idToken);
        }
        if (credential && authInstance && typeof authInstance.signInWithCredential === 'function') {
          console.debug('googleAuth: signing in to firebase (classic api) with credential');
          const signPromise = authInstance.signInWithCredential(credential);
          // guard against hangs: timeout after 20s
          const result = await Promise.race([
            signPromise,
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Firebase signInWithCredential timeout')), 20000)
            ),
          ]);
          console.debug('googleAuth: firebase classic sign-in result', result);
          // Return both the firebase sign-in result and the credential so callers can
          // perform post-sign-in user management (linking, firestore writes) safely.
          return { firebaseResult: result, credential, raw: signInResult };
        }
      }
      // Try modular API
      if (
        firebaseAuth &&
        firebaseAuth.getAuth &&
        firebaseAuth.GoogleAuthProvider &&
        firebaseAuth.signInWithCredential
      ) {
        try {
          console.debug('googleAuth: signing in to firebase (modular api) with credential');
          const { getAuth, GoogleAuthProvider, signInWithCredential } = firebaseAuth;
          const credential = GoogleAuthProvider.credential(idToken, accessToken);
          const signPromise = signInWithCredential(getAuth(), credential);
          const result = await Promise.race([
            signPromise,
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Firebase signInWithCredential timeout')), 20000)
            ),
          ]);
          console.debug('googleAuth: firebase modular sign-in result', result);
          return { firebaseResult: result, credential: { providerId: 'google.com', token: idToken }, raw: signInResult };
        } catch (e) {
          console.debug('googleAuth: modular firebase sign-in failed, falling back', e);
        }
      }

      // If @react-native-firebase/auth wasn't available or sign-in above failed,
      // try Firebase JS SDK (web/modular) if present. This helps in Expo web or
      // environments where the react-native-firebase native modules are not linked.
      try {
        // eslint-disable-next-line global-require
        const firebaseJsAuth = require('firebase/auth');
        if (firebaseJsAuth && firebaseJsAuth.getAuth && firebaseJsAuth.signInWithCredential && firebaseJsAuth.GoogleAuthProvider) {
          console.debug('googleAuth: signing in to firebase via firebase JS SDK');
          const { getAuth, GoogleAuthProvider, signInWithCredential } = firebaseJsAuth;
          const credential = GoogleAuthProvider.credential(idToken, accessToken);
          const signPromise = signInWithCredential(getAuth(), credential);
          const result = await Promise.race([
            signPromise,
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Firebase JS signInWithCredential timeout')), 20000)
            ),
          ]);
          console.debug('googleAuth: firebase js sign-in result', result);
          return { firebaseResult: result, credential: { providerId: 'google.com', token: idToken }, raw: signInResult };
        }
      } catch (e) {
        // ignore and fall through to returning raw google result
      }
    } catch (e) {
      // If firebase auth not available, fall back to returning raw google result
    }

    return { success: true, data: signInResult };
  } catch (err: any) {
    console.error('googleAuth: signIn error', {
      message: err?.message,
      code: err?.code,
      stack: err?.stack,
      raw: err,
    });
    // Rewrap known shapes to include code/message for UI
    const code = err?.code || err?.statusCode || null;
    const message = err?.message || String(err);
    const wrapped = new Error(`Google Sign-in failed${code ? ` (code=${code})` : ''}: ${message}`);
    // preserve original properties
    (wrapped as any).original = err;
    throw wrapped;
  }
};

export default {
  configureGoogleSignIn,
  signInWithGoogle,
};

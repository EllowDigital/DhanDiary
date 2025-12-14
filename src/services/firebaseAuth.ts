import { Alert, Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import {
  AuthCredential,
  EmailAuthProvider,
  GithubAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  linkWithCredential,
  reauthenticateWithCredential,
  signInWithCredential,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  updateEmail,
  updatePassword,
  updateProfile,
} from 'firebase/auth';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useEffect, useRef } from 'react';
import { getFirebaseAuth, getFirestoreDb } from '../firebase';

WebBrowser.maybeCompleteAuthSession();

const getExtra = () => (Constants?.expoConfig?.extra || {}) as any;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const upsertProfile = async (
  uid: string,
  data: { name?: string; email?: string; provider?: string }
) => {
  const db = getFirestoreDb();
  const ref = doc(db, 'user', uid);
  const existing = await getDoc(ref);
  const existingData = existing.exists() ? existing.data() || {} : {};
  const resolvedProvider = data.provider || existingData.provider || 'password';
  const resolvedCreatedAt = existingData.createdAt || serverTimestamp();

  await setDoc(
    ref,
    {
      name: data.name ?? existingData.name ?? '',
      email: data.email ?? existingData.email ?? '',
      provider: resolvedProvider,
      createdAt: resolvedCreatedAt,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
};

const summarizeProviderIds = (providerData: Array<{ providerId?: string | null }>) => {
  const ids = providerData
    .map((p) => p.providerId)
    .filter((id): id is string => Boolean(id))
    .map((id) => id!.toLowerCase());
  if (!ids.length) return 'password';
  return Array.from(new Set(ids)).sort().join('|');
};

export const registerWithEmail = async (name: string, email: string, password: string) => {
  const auth = getFirebaseAuth();
  const creds = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(creds.user, { displayName: name });
  await upsertProfile(creds.user.uid, { name, email, provider: 'password' });
  return creds.user;
};

export const loginWithEmail = (email: string, password: string) => {
  const auth = getFirebaseAuth();
  return signInWithEmailAndPassword(auth, email, password);
};

export const sendPasswordReset = async (email: string) => {
  const auth = getFirebaseAuth();
  const extra = getExtra();
  const expoConfig: any = Constants?.expoConfig || {};
  const actionCodeSettings = {
    url:
      extra?.passwordResetRedirectUrl ||
      process.env.EXPO_PUBLIC_PASSWORD_RESET_URL ||
      'https://dhandiary.app/reset',
    handleCodeInApp: false,
    dynamicLinkDomain: extra?.passwordResetDynamicLinkDomain || undefined,
    android: {
      packageName:
        expoConfig?.android?.package || extra?.androidPackageName || 'com.ellowdigital.dhandiary',
      installApp: true,
      minimumVersion: String(expoConfig?.android?.versionCode || '1'),
    },
    iOS: {
      bundleId: expoConfig?.ios?.bundleIdentifier || extra?.iosBundleId || 'com.ellowdigital.dhandiary',
    },
  };

  try {
    await sendPasswordResetEmail(auth, email.trim(), actionCodeSettings);
  } catch (error: any) {
    if (error?.code === 'auth/user-not-found') {
      await sleep(350);
      return;
    }
    throw error;
  }
};

export const logoutUser = () => {
  const auth = getFirebaseAuth();
  return signOut(auth);
};

export const signInWithFirebaseCredential = async (credential: AuthCredential) => {
  const auth = getFirebaseAuth();
  const result = await signInWithCredential(auth, credential);
  const provider = summarizeProviderIds(result.user.providerData || []);
  await upsertProfile(result.user.uid, {
    name: result.user.displayName || '',
    email: result.user.email || '',
    provider,
  });
  return result.user;
};

export const linkCurrentUserWithCredential = async (credential: AuthCredential) => {
  const auth = getFirebaseAuth();
  const user = auth.currentUser;
  if (!user) throw new Error('You need to be signed in to link an account.');
  const result = await linkWithCredential(user, credential);
  await result.user.reload();
  const provider = summarizeProviderIds(result.user.providerData || []);
  await upsertProfile(result.user.uid, {
    name: result.user.displayName || '',
    email: result.user.email || '',
    provider,
  });
  return result.user;
};

export const updateProfileDetails = async (payload: { name?: string; email?: string }) => {
  const auth = getFirebaseAuth();
  const current = auth.currentUser;
  if (!current) throw new Error('No authenticated user');
  const updates: { name?: string; email?: string } = {};

  if (payload.name && payload.name !== current.displayName) {
    await updateProfile(current, { displayName: payload.name });
    updates.name = payload.name;
  }
  if (payload.email && payload.email !== current.email) {
    await updateEmail(current, payload.email);
    updates.email = payload.email;
  }

  if (Object.keys(updates).length) {
    await upsertProfile(current.uid, {
      name: updates.name ?? current.displayName ?? '',
      email: updates.email ?? current.email ?? '',
    });
  }
};

export const changePassword = async (currentPassword: string, newPassword: string) => {
  const auth = getFirebaseAuth();
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error('No authenticated email user');
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
};

export const deleteAccount = async (currentPassword?: string) => {
  const auth = getFirebaseAuth();
  const user = auth.currentUser;
  if (!user) return;
  if (currentPassword && user.email) {
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
  }
  const db = getFirestoreDb();
  await deleteDoc(doc(db, 'user', user.uid));
  await deleteUser(user);
};

/* ---------------------------------------------
 * Google AuthSession Hook
 * ------------------------------------------- */
export const useGoogleAuth = () => {
  const extra = getExtra();
  const clientId =
    extra?.oauth?.googleClientId ||
    extra?.firebase?.webClientId ||
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const googleConfig = clientId
    ? {
        clientId,
        iosClientId: clientId,
        androidClientId: clientId,
        webClientId: clientId,
      }
    : null;
  const isExpoGo = Constants?.appOwnership === 'expo';
  const googleAvailable = !!googleConfig && !isExpoGo;

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest(
    (googleConfig || {}) as Google.GoogleAuthRequestConfig
  );

  useEffect(() => {
    if (!googleAvailable) return;
    if (response?.type === 'success' && response.params.id_token) {
      const credential = GoogleAuthProvider.credential(response.params.id_token);
      signInWithFirebaseCredential(credential).catch((err) => {
        console.warn('Google sign-in failed', err);
      });
    }
    if (response?.type === 'error') {
      console.warn('Google auth session error', response.error);
    }
  }, [response, googleAvailable]);

  return {
    googleAvailable,
    request,
    signIn: () =>
      googleAvailable
        ? promptAsync({ useProxy: false, showInRecents: true })
        : Promise.reject(new Error('Google sign-in is disabled in Expo Go or not configured.')),
  };
};

const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

type GithubDeviceCodePayload = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval: number;
  error?: string;
  error_description?: string;
};

type GithubTokenPayload = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const requestGithubDeviceCode = async (clientId: string): Promise<GithubDeviceCodePayload> => {
  const response = await fetch(GITHUB_DEVICE_CODE_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      scope: 'read:user user:email',
    }).toString(),
  });
  const payload: GithubDeviceCodePayload = await response.json();
  if (!response.ok || payload.error) {
    throw new Error(payload.error_description || 'Failed to start GitHub login.');
  }
  return payload;
};

const promptGithubVerification = (
  userCode: string,
  verificationUri: string,
  verificationUriComplete?: string
) =>
  new Promise<void>((resolve, reject) => {
    Alert.alert(
      'GitHub Verification',
      `Tap Continue to open GitHub and enter code ${userCode}.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => reject(new Error('GitHub login cancelled by user.')),
        },
        {
          text: 'Continue',
          onPress: () => {
            const target = verificationUriComplete || verificationUri;
            Linking.openURL(target).catch((err) =>
              console.warn('Failed to open GitHub verification page', err)
            );
            resolve();
          },
        },
      ],
      { cancelable: false }
    );
  });

const pollGithubAccessToken = async (
  clientId: string,
  deviceCode: string,
  expiresIn: number,
  intervalSeconds: number,
  shouldAbort: () => boolean
) => {
  const startedAt = Date.now();
  let delaySeconds = Math.max(intervalSeconds, 5);

  while (Date.now() - startedAt < expiresIn * 1000) {
    if (shouldAbort()) {
      throw new Error('GitHub login cancelled.');
    }

    await sleep(delaySeconds * 1000);

    if (shouldAbort()) {
      throw new Error('GitHub login cancelled.');
    }

    const response = await fetch(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        device_code: deviceCode,
        grant_type: GITHUB_DEVICE_GRANT,
      }).toString(),
    });

    const payload: GithubTokenPayload = await response.json();
    if (payload.access_token) {
      return payload.access_token;
    }

    if (!payload.error) {
      continue;
    }

    switch (payload.error) {
      case 'authorization_pending':
        continue;
      case 'slow_down':
        delaySeconds += 5;
        continue;
      case 'expired_token':
        throw new Error('GitHub code expired. Please try again.');
      case 'access_denied':
        throw new Error('GitHub sign-in was denied.');
      default:
        throw new Error(payload.error_description || 'GitHub device flow failed.');
    }
  }

  throw new Error('GitHub login timed out. Please try again.');
};

/* ---------------------------------------------
 * GitHub Device Flow Hook
 * ------------------------------------------- */
export const useGithubAuth = () => {
  const extra = getExtra();
  const clientId = extra?.oauth?.githubClientId;
  const isExpoGo = Constants?.appOwnership === 'expo';
  const hasGithubConfig = !!clientId && !isExpoGo;
  const abortRef = useRef(false);

  useEffect(() => {
    abortRef.current = false;
    return () => {
      abortRef.current = true;
    };
  }, []);

  const signIn = async () => {
    if (!hasGithubConfig || !clientId) {
      throw new Error('GitHub sign-in is not configured for this build.');
    }

    abortRef.current = false;

    const devicePayload = await requestGithubDeviceCode(clientId);
    await promptGithubVerification(
      devicePayload.user_code,
      devicePayload.verification_uri,
      devicePayload.verification_uri_complete
    );

    const accessToken = await pollGithubAccessToken(
      clientId,
      devicePayload.device_code,
      devicePayload.expires_in,
      devicePayload.interval,
      () => abortRef.current
    );

    const credential = GithubAuthProvider.credential(accessToken);
    await signInWithFirebaseCredential(credential);
  };

  return {
    githubAvailable: hasGithubConfig,
    signIn,
  };
};

import { Alert, Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
// Removed expo-auth-session imports
import {
  AuthCredential,
  EmailAuthProvider,
  GithubAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  fetchSignInMethodsForEmail,
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

// Removed maybeCompleteAuthSession for AuthSession

const getExtra = () => (Constants?.expoConfig?.extra || {}) as any;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// In-memory store for pending social credentials that need linking after primary sign-in
const pendingLinkCredentials = new Map<string, AuthCredential>();

export const storePendingCredential = (email: string, credential: AuthCredential) => {
  if (!email || !credential) return;
  pendingLinkCredentials.set(email.toLowerCase(), credential);
};

export const clearPendingCredential = (email: string) => {
  if (!email) return;
  pendingLinkCredentials.delete(email.toLowerCase());
};

export const consumePendingCredentialForCurrentUser = async () => {
  const auth = getFirebaseAuth();
  const user = auth.currentUser;
  if (!user || !user.email) return;
  const key = user.email.toLowerCase();
  const cred = pendingLinkCredentials.get(key);
  if (!cred) return;
  try {
    await linkCurrentUserWithCredential(cred);
    pendingLinkCredentials.delete(key);
  } catch (err) {
    // If linking fails, leave the pending credential in place for retry
    console.warn('Failed to link pending credential for', key, err);
    throw err;
  }
};

const upsertProfile = async (
  uid: string,
  data: { name?: string; email?: string; provider?: string }
) => {
  const db = getFirestoreDb();
  const ref = doc(db, 'users', uid);
  const existing = await getDoc(ref);
  const existingData = existing.exists() ? existing.data() || {} : {};
  const resolvedProvider = data.provider || existingData.provider || 'password';
  const providersArray = Array.isArray(existingData.providers)
    ? existingData.providers
    : existingData.providers
      ? [existingData.providers]
      : [];
  if (data.provider) {
    const p = String(data.provider).toLowerCase();
    if (!providersArray.includes(p)) providersArray.push(p);
  }
  const resolvedCreatedAt = existingData.createdAt || serverTimestamp();

  await setDoc(
    ref,
    {
      displayName: data.name ?? existingData.displayName ?? '',
      email: data.email ?? existingData.email ?? '',
      photoURL: data.photoURL ?? existingData.photoURL ?? null,
      providers: providersArray,
      createdAt: resolvedCreatedAt,
      updatedAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
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
  // After a fresh registration, consume any pending credential for this email
  try {
    await consumePendingCredentialForCurrentUser();
  } catch (err) {
    // Non-fatal: log and continue
    console.warn('Failed to consume pending credential after registration', err);
  }
  return creds.user;
};

export const loginWithEmail = (email: string, password: string) => {
  const auth = getFirebaseAuth();
  return signInWithEmailAndPassword(auth, email, password).then(async (creds) => {
    // After successful email login, attempt to link any pending social credential for this user
    try {
      await consumePendingCredentialForCurrentUser();
    } catch (err) {
      console.warn('Failed to consume pending credential after email login', err);
    }
    return creds;
  });
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
      bundleId:
        expoConfig?.ios?.bundleIdentifier || extra?.iosBundleId || 'com.ellowdigital.dhandiary',
    },
  };

  try {
    await sendPasswordResetEmail(auth, email.trim(), actionCodeSettings);
  } catch (error: any) {
    // If user doesn't exist, swallow error to avoid leaking existence
    if (error?.code === 'auth/user-not-found') {
      await sleep(350);
      return;
    }

    // If the continue/redirect domain isn't allowlisted, retry without a custom URL
    if (
      error?.code === 'auth/unauthorized-continue-uri' ||
      (error?.message && String(error.message).includes('unauthorized-continue-uri'))
    ) {
      console.warn('Password reset continue URL not allowlisted:', actionCodeSettings.url);
      try {
        // Try the default flow (no custom continue URL) so the user can still receive a reset email
        await sendPasswordResetEmail(auth, email.trim());
        Alert.alert(
          'Reset Sent',
          'Password reset email sent using the default flow. To use a custom continue URL, add its domain to Firebase Console → Authentication → Authorized domains.'
        );
        return;
      } catch (e2: any) {
        // Bubble up the secondary error if it fails
        throw e2;
      }
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
  try {
    const result = await signInWithCredential(auth, credential);
    const provider = summarizeProviderIds(result.user.providerData || []);
    await upsertProfile(result.user.uid, {
      name: result.user.displayName || '',
      email: result.user.email || '',
      provider,
    });
    // After social sign-in, consume any pending credential (unlikely but safe)
    try {
      await consumePendingCredentialForCurrentUser();
    } catch (err) {
      console.warn('Failed to consume pending credential after social sign-in', err);
    }
    return result.user;
  } catch (error: any) {
    // Handle account exists with different credential
    if (
      error?.code === 'auth/account-exists-with-different-credential' ||
      error?.message?.includes('account-exists-with-different-credential')
    ) {
      const email = error?.customData?.email || (credential as any)?.email || null;
      if (email) {
        const methods = await fetchSignInMethodsForEmail(getFirebaseAuth(), email);
        // store pending credential so it can be linked after the user signs in with existing provider
        try {
          storePendingCredential(email, credential);
        } catch (err) {
          console.warn('Failed to store pending credential', err);
        }
        const friendly: any = new Error('auth/account-exists-with-different-credential');
        friendly.code = 'auth/account-exists-with-different-credential';
        friendly.email = email;
        friendly.methods = methods || [];
        throw friendly;
      }
    }
    throw error;
  }
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
  await deleteDoc(doc(db, 'users', user.uid));
  await deleteUser(user);
};

// Google AuthSession code removed. Use only Firebase-native Google login elsewhere.

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
  verificationUriComplete: string | undefined,
  intent: 'signIn' | 'link'
) =>
  new Promise<void>((resolve, reject) => {
    Alert.alert(
      'GitHub Verification',
      `Tap Continue to open GitHub and ${intent === 'link' ? 'approve the link' : 'sign in'} with code ${userCode}.`,
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
  const githubAvailable = !!clientId;
  const isExpoGo = Constants?.appOwnership === 'expo';
  const abortRef = useRef(false);
  const intentRef = useRef<'signIn' | 'link' | null>(null);

  useEffect(() => {
    abortRef.current = false;
    return () => {
      abortRef.current = true;
      intentRef.current = null;
    };
  }, []);

  const ensureSupportedEnvironment = () => {
    if (isExpoGo) {
      throw new Error('GitHub sign-in requires an EAS dev client or production build.');
    }
  };

  const runFlow = async (intent: 'signIn' | 'link') => {
    if (!githubAvailable || !clientId) {
      throw new Error('GitHub sign-in is not configured for this build.');
    }
    ensureSupportedEnvironment();

    abortRef.current = false;
    intentRef.current = intent;

    try {
      const devicePayload = await requestGithubDeviceCode(clientId);
      await promptGithubVerification(
        devicePayload.user_code,
        devicePayload.verification_uri,
        devicePayload.verification_uri_complete,
        intent
      );

      const accessToken = await pollGithubAccessToken(
        clientId,
        devicePayload.device_code,
        devicePayload.expires_in,
        devicePayload.interval,
        () => abortRef.current
      );

      const credential = GithubAuthProvider.credential(accessToken);
      if (intent === 'link') {
        await linkCurrentUserWithCredential(credential);
      } else {
        await signInWithFirebaseCredential(credential);
      }
    } finally {
      intentRef.current = null;
    }
  };

  return {
    githubAvailable,
    signIn: () => runFlow('signIn'),
    linkAccount: () => runFlow('link'),
  };
};

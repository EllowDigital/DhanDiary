import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as AuthSession from 'expo-auth-session';
import {
  AuthCredential,
  EmailAuthProvider,
  GithubAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  reauthenticateWithCredential,
  signInWithCredential,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  updateEmail,
  updatePassword,
  updateProfile,
} from 'firebase/auth';
import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useEffect } from 'react';
import { getFirebaseAuth, getFirestoreDb } from '../firebase';

WebBrowser.maybeCompleteAuthSession();

const getExtra = () => (Constants?.expoConfig?.extra || {}) as any;

const upsertProfile = async (uid: string, data: { name?: string; email?: string; providerId?: string }) => {
  const db = getFirestoreDb();
  const ref = doc(db, 'users', uid);
  await setDoc(
    ref,
    {
      ...data,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
};

export const registerWithEmail = async (name: string, email: string, password: string) => {
  const auth = getFirebaseAuth();
  const creds = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(creds.user, { displayName: name });
  await upsertProfile(creds.user.uid, { name, email, providerId: 'password' });
  return creds.user;
};

export const loginWithEmail = (email: string, password: string) => {
  const auth = getFirebaseAuth();
  return signInWithEmailAndPassword(auth, email, password);
};

export const sendPasswordReset = (email: string) => {
  const auth = getFirebaseAuth();
  return sendPasswordResetEmail(auth, email);
};

export const logoutUser = () => {
  const auth = getFirebaseAuth();
  return signOut(auth);
};

export const signInWithFirebaseCredential = async (credential: AuthCredential) => {
  const auth = getFirebaseAuth();
  const result = await signInWithCredential(auth, credential);
  const providerId = result.user.providerData[0]?.providerId;
  await upsertProfile(result.user.uid, {
    name: result.user.displayName || '',
    email: result.user.email || '',
    providerId,
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

/* ---------------------------------------------
 * Google AuthSession Hook
 * ------------------------------------------- */
export const useGoogleAuth = () => {
  const extra = getExtra();
  const clientId = extra?.oauth?.googleClientId || extra?.firebase?.webClientId;
  const googleConfig = clientId
    ? {
        clientId,
        iosClientId: clientId,
        androidClientId: clientId,
      }
    : null;
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest(googleConfig);

  useEffect(() => {
    if (response?.type === 'success') {
      const credential = GoogleAuthProvider.credential(response.params.id_token);
      signInWithFirebaseCredential(credential).catch((err) => {
        console.warn('Google sign-in failed', err);
      });
    }
  }, [response]);

  return {
    googleAvailable: !!clientId,
    request,
    signIn: () => promptAsync({ useProxy: Platform.OS !== 'web' }),
  };
};

/* ---------------------------------------------
 * GitHub AuthSession Hook
 * ------------------------------------------- */
const githubDiscovery = {
  authorizationEndpoint: 'https://github.com/login/oauth/authorize',
  tokenEndpoint: 'https://github.com/login/oauth/access_token',
};

export const useGithubAuth = () => {
  const extra = getExtra();
  const clientId = extra?.oauth?.githubClientId;
  const clientSecret = extra?.oauth?.githubClientSecret;
  const redirectUri = AuthSession.makeRedirectUri({ useProxy: Platform.OS !== 'web' });

  const githubConfig =
    clientId && clientSecret
      ? {
          clientId,
          clientSecret,
          scopes: ['user:email'],
          redirectUri,
        }
      : null;

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    githubConfig,
    githubConfig ? githubDiscovery : undefined
  );

  useEffect(() => {
    if (!clientId || !clientSecret) return;
    const exchangeCode = async () => {
      if (!response || response.type !== 'success') return;
      if (!response.params.code) return;
      const tokenResponse = await AuthSession.exchangeCodeAsync(
        {
          clientId,
          clientSecret,
          code: response.params.code,
          redirectUri,
        },
        githubDiscovery
      );
      const credential = GithubAuthProvider.credential(tokenResponse.accessToken);
      await signInWithFirebaseCredential(credential);
    };
    if (response?.type === 'success') {
      exchangeCode().catch((err) => console.warn('GitHub sign-in failed', err));
    }
  }, [response, clientId, clientSecret, redirectUri]);

  return {
    githubAvailable: !!clientId && !!clientSecret,
    request,
    signIn: () => promptAsync({ useProxy: Platform.OS !== 'web' }),
  };
};

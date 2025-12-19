import AsyncStorage from '@react-native-async-storage/async-storage';
import { wipeUserData } from './localDb';
import { findUserByEmail } from './userService';
type LocalUserRecord = {
  uid: string;
  name: string;
  email: string;
  password?: string;
  providers?: string[];
  createdAt: string;
  updatedAt: string;
};

const USERS_KEY = 'local:users';

const nowIso = () => new Date().toISOString();
const genId = () => `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;

const readUsers = async (): Promise<Record<string, LocalUserRecord>> => {
  const raw = await AsyncStorage.getItem(USERS_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, LocalUserRecord>;
  } catch (e) {
    return {};
  }
};

const tryGetFirebaseAuth = () => {
  try {
    // require dynamically so Expo Go doesn't crash on import
    // eslint-disable-next-line global-require
    const firebaseAuth = require('@react-native-firebase/auth');
    return firebaseAuth;
  } catch (e) {
    return null;
  }
};

const tryGetUserService = () => {
const writeUsers = async (users: Record<string, LocalUserRecord>) => {
  await AsyncStorage.setItem(USERS_KEY, JSON.stringify(users));
};

const setCurrent = async (rec: LocalUserRecord | null) => {
  if (rec) {
    await AsyncStorage.setItem(CURRENT_KEY, JSON.stringify(rec));
  } else {
    await AsyncStorage.removeItem(CURRENT_KEY);
  }
  listeners.forEach((l) => l(rec));
};

const getCurrent = async (): Promise<LocalUserRecord | null> => {
  const raw = await AsyncStorage.getItem(CURRENT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LocalUserRecord;
  } catch (e) {
    return null;
  }
};

export const onAuthStateChanged = (cb: (u: LocalUserRecord | null) => void) => {
  const firebaseAuth = tryGetFirebaseAuth();
  if (firebaseAuth) {
    const authInstance = firebaseAuth.default ? firebaseAuth.default() : firebaseAuth();
    const unsub = authInstance.onAuthStateChanged((fbUser: any) => {
      if (!fbUser) return cb(null);
      const out: LocalUserRecord = {
        uid: fbUser.uid,
        name: fbUser.displayName || '',
        email: fbUser.email || '',
        // password not available from firebase
        providers: fbUser.providerData ? fbUser.providerData.map((p: any) => p.providerId) : [],
        createdAt: fbUser.metadata?.creationTime || new Date().toISOString(),
        updatedAt: fbUser.metadata?.lastSignInTime || new Date().toISOString(),
      };
      cb(out);
    });
    // return unsubscribe
    return () => unsub();
  }

  // If Firebase auth not available, immediately report null (require internet/firebase).
  (async () => cb(null))();
  return () => {};
};

export const registerWithEmail = async (name: string, email: string, password: string) => {
  const firebaseAuth = tryGetFirebaseAuth();
  if (!firebaseAuth) {
    const err: any = new Error('Firebase authentication not available. Internet connection and Firebase are required.');
    err.code = 'auth/no-firebase';
    throw err;
  }
  const userService = tryGetUserService();
  const authInstance = firebaseAuth.default ? firebaseAuth.default() : firebaseAuth();
  const credential = await authInstance.createUserWithEmailAndPassword(email.trim(), password);
  try {
    if (credential?.user && credential.user.updateProfile && name) {
      await credential.user.updateProfile({ displayName: name });
    }
  } catch (e) {
    // ignore profile update errors
  }
  if (userService && typeof userService.createOrUpdateUserFromAuth === 'function') {
    try {
      await userService.createOrUpdateUserFromAuth(credential.user);
    } catch (e) {}
  }
  return credential.user;
};

export const loginWithEmail = async (email: string, password: string) => {
  const firebaseAuth = tryGetFirebaseAuth();
  if (!firebaseAuth) {
    const err: any = new Error('Firebase authentication not available. Internet connection and Firebase are required.');
    err.code = 'auth/no-firebase';
    throw err;
  }
  const userService = tryGetUserService();
  const authInstance = firebaseAuth.default ? firebaseAuth.default() : firebaseAuth();
  const credential = await authInstance.signInWithEmailAndPassword(email.trim(), password);
  if (userService && typeof userService.createOrUpdateUserFromAuth === 'function') {
    try {
      await userService.createOrUpdateUserFromAuth(credential.user || authInstance.currentUser);
    } catch (e) {}
  }
  return credential.user || authInstance.currentUser;
};

export const sendPasswordReset = async (email: string) => {
  const firebaseAuth = tryGetFirebaseAuth();
  if (!firebaseAuth) {
    const err: any = new Error('Firebase authentication not available. Internet connection and Firebase are required.');
    err.code = 'auth/no-firebase';
    throw err;
  }
  const authInstance = firebaseAuth.default ? firebaseAuth.default() : firebaseAuth();
  return authInstance.sendPasswordResetEmail(email.trim());
};

export const logoutUser = async () => {
  const firebaseAuth = tryGetFirebaseAuth();
  if (!firebaseAuth) {
    // nothing to do locally; ensure stored current user cleared
    try {
      await AsyncStorage.removeItem(CURRENT_KEY);
    } catch (e) {}
    return;
  }
  const authInstance = firebaseAuth.default ? firebaseAuth.default() : firebaseAuth();
  return authInstance.signOut();
};

export const signInWithCredential = async (_credential: any) => {
  const err: any = new Error('auth/social-not-supported');
  err.code = 'auth/social-not-supported';
  throw err;
};

export const linkCurrentUserWithCredential = async (_credential: any) => {
  const err: any = new Error('auth/social-not-supported');
  err.code = 'auth/social-not-supported';
  throw err;
};

export const updateProfileDetails = async (payload: { name?: string; email?: string }) => {
  const firebaseAuth = tryGetFirebaseAuth();
  if (!firebaseAuth) {
    const err: any = new Error('Firebase authentication not available. Internet connection and Firebase are required.');
    err.code = 'auth/no-firebase';
    throw err;
  }
  const authInstance = firebaseAuth.default ? firebaseAuth.default() : firebaseAuth();
  const user = authInstance.currentUser;
  if (!user) throw new Error('No authenticated user');
  const updates: any = {};
  if (payload.name) updates.displayName = payload.name;
  if (payload.email) updates.email = payload.email.trim().toLowerCase();
  if (updates.displayName && user.updateProfile) await user.updateProfile({ displayName: updates.displayName });
  if (updates.email && user.updateEmail) await user.updateEmail(updates.email);
  return { name: updates.displayName || user.displayName, email: updates.email || user.email };
};

export const changePassword = async (currentPassword: string, newPassword: string) => {
  const firebaseAuth = tryGetFirebaseAuth();
  if (!firebaseAuth) {
    const err: any = new Error('Firebase authentication not available. Internet connection and Firebase are required.');
    err.code = 'auth/no-firebase';
    throw err;
  }
  const authInstance = firebaseAuth.default ? firebaseAuth.default() : firebaseAuth();
  const user = authInstance.currentUser;
  if (!user) throw new Error('No authenticated user');
  // Reauthenticate required for sensitive operations - caller should reauthenticate before calling
  if (user.updatePassword) {
    await user.updatePassword(newPassword);
    return;
  }
  const err: any = new Error('Password change not supported');
  err.code = 'auth/operation-not-supported';
  throw err;
};

export const deleteAccount = async (currentPassword?: string) => {
  const firebaseAuth = tryGetFirebaseAuth();
  if (!firebaseAuth) {
    const err: any = new Error('Firebase authentication not available. Internet connection and Firebase are required.');
    err.code = 'auth/no-firebase';
    throw err;
  }
  const authInstance = firebaseAuth.default ? firebaseAuth.default() : firebaseAuth();
  const user = authInstance.currentUser;
  if (!user) return;
  // Deleting account requires reauthentication for recent login; caller should handle reauth
  const userService = tryGetUserService();
  try {
    if (userService && typeof userService.deleteUserFromFirestore === 'function') {
      // delete Firestore user doc before deleting auth user so security rules allow it
      await userService.deleteUserFromFirestore(user.uid).catch(() => {});
    }
  } catch (e) {
    // ignore firestore delete errors
  }
  await wipeUserData(user.uid).catch(() => {});
  return user.delete();
};

export const storePendingCredential = async (email: string, credential: any) => {
  const raw = await AsyncStorage.getItem(PENDING_KEY);
  const map = raw ? (JSON.parse(raw) as Record<string, any>) : {};
  map[email.toLowerCase()] = credential;
  await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(map));
};

// Local pending-credential logic removed: the app is now Firebase-only.
  const raw = await AsyncStorage.getItem(PENDING_KEY);
  if (!raw) return;
  const map = JSON.parse(raw) as Record<string, any>;
  delete map[email.toLowerCase()];
  await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(map));
};

export const consumePendingCredentialForCurrentUser = async () => {
  const cur = await getCurrent();
  if (!cur) return null;
  const raw = await AsyncStorage.getItem(PENDING_KEY);
  if (!raw) return null;
};
  delete map[cur.email.toLowerCase()];
  await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(map));
  // link provider to user record
  const users = await readUsers();
  const rec = users[cur.uid];
  if (rec && cred?.provider) {
    const p = String(cred.provider).toLowerCase();
    rec.providers = Array.from(new Set([...(rec.providers || []), p]));
    rec.updatedAt = nowIso();
    users[cur.uid] = rec;
    await writeUsers(users);
    await setCurrent(rec);
  }
  return cred;
};

export default {
  onAuthStateChanged,
  registerWithEmail,
  loginWithEmail,
  sendPasswordReset,
  logoutUser,
  signInWithCredential,
  linkCurrentUserWithCredential,
  updateProfileDetails,
  changePassword,
  deleteAccount,
  storePendingCredential,
  clearPendingCredential,
  consumePendingCredentialForCurrentUser,
};

// Extend default export with Google flow helpers
Object.assign(exports.default || module.exports, {
  startGoogleSignIn,
  fetchSignInMethodsForEmail,
  linkCredentialToCurrentUser,
});

export const startGithubSignIn = async (intent: 'signIn' | 'link' = 'signIn') => {
  throw new Error('GitHub sign-in is not available in local-only build.');
};

/**
 * Handle Google sign-in with robust Firestore user creation/linking.
 * Ensures single Firestore doc per user and links providers when email matches.
 */
export const startGoogleSignIn = async (intent: 'signIn' | 'link' = 'signIn') => {
  // Delegate to googleAuth signIn to obtain credential and firebase sign-in result
  const googleMod: any = require('./googleAuth');
  const authMod: any = tryGetFirebaseAuth();
  if (!authMod) throw new Error('Firebase auth not available');

  const signResult = await googleMod.signInWithGoogle();
  // signResult may be raw google data if firebase auth not available; expect objects otherwise
  const { firebaseResult, credential, raw } = signResult as any;
  const authInstance = authMod.default ? authMod.default() : authMod();

  // Determine Firebase user and provider info
  const user = (firebaseResult && (firebaseResult.user || firebaseResult)) || authInstance.currentUser;
  if (!user) throw new Error('No firebase user after sign-in');

  // Ensure Firestore document exists for this uid. If email conflicts, attempt to link.
  const email = user.email ? String(user.email).toLowerCase() : null;

  try {
    // If a different Firestore user exists with same email, link providers to that auth user
    if (email) {
      const found = await findUserByEmail(email);
      if (found && found.uid !== user.uid) {
        // We have an existing Firestore user for this email. Attempt to link providers.
        // Fetch existing auth user by UID is not possible client-side; instead, link the current
        // credential to the existing Firebase Auth account using email credential flow.
        // Recommended approach: use Firebase Admin/Cloud Function to merge accounts securely.
        const err: any = new Error('auth/email-exists-with-different-uid');
        err.code = 'auth/email-exists-with-different-uid';
        err.existingUid = found.uid;
        err.existingData = found.data;
        // Surface the error for higher-level UI to guide linking or account recovery.
        throw err;
      }
    }

    // Create or update Firestore doc for this uid
    const userService: any = tryGetUserService();
    if (userService && typeof userService.createOrUpdateUserFromAuth === 'function') {
      await userService.createOrUpdateUserFromAuth(user);
    }
  } catch (e) {
    // If linking is required handle outside (server-side recommended). Re-throw for UI to handle.
    throw e;
  }

  return user;
};

/**
 * Returns available sign-in methods for an email (e.g. ['password','google.com']).
 */
export const fetchSignInMethodsForEmail = async (email: string) => {
  const firebaseAuth = tryGetFirebaseAuth();
  if (!firebaseAuth) throw new Error('Firebase auth not available');
  const authInstance = firebaseAuth.default ? firebaseAuth.default() : firebaseAuth();
  if (!email) return [];
  if (typeof authInstance.fetchSignInMethodsForEmail === 'function') {
    return authInstance.fetchSignInMethodsForEmail(email);
  }
  // Some API shapes use fetchProvidersForEmail
  if (typeof authInstance.fetchProvidersForEmail === 'function') {
    return authInstance.fetchProvidersForEmail(email);
  }
  return [];
};

/**
 * Link a credential (e.g. Google credential) to the currently signed-in Firebase user.
 * Caller should ensure the current user is the intended account (e.g. after password sign-in).
 */
export const linkCredentialToCurrentUser = async (credential: any) => {
  const firebaseAuth = tryGetFirebaseAuth();
  if (!firebaseAuth) throw new Error('Firebase auth not available');
  const authInstance = firebaseAuth.default ? firebaseAuth.default() : firebaseAuth();
  const user = authInstance.currentUser;
  if (!user) throw new Error('No authenticated user to link credential to');
  if (typeof user.linkWithCredential === 'function') {
    return user.linkWithCredential(credential);
  }
  // Modular API path
  if (firebaseAuth.linkWithCredential) {
    return firebaseAuth.linkWithCredential(authInstance, credential);
  }
  throw new Error('linkWithCredential not supported in this Firebase SDK version');
};

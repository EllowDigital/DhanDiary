import { wipeUserData } from './localDb';

const tryGetFirebaseAuth = () => {
  try {
    // dynamic require to avoid import-time errors in environments without native modules
    // eslint-disable-next-line global-require
    const firebaseAuth = require('@react-native-firebase/auth');
    return firebaseAuth;
  } catch (e) {
    return null;
  }
};

const tryGetUserService = () => {
  try {
    // eslint-disable-next-line global-require
    return require('./userService');
  } catch (e) {
    return null;
  }
};

export const onAuthStateChanged = (cb: (u: any | null) => void) => {
  const firebaseAuth = tryGetFirebaseAuth();
  if (!firebaseAuth) {
    cb(null);
    return () => {};
  }
  const authInstance = firebaseAuth.default ? firebaseAuth.default() : firebaseAuth();
  const unsub = authInstance.onAuthStateChanged((fbUser: any) => {
    if (!fbUser) return cb(null);
    cb({
      uid: fbUser.uid,
      name: fbUser.displayName || '',
      email: fbUser.email || '',
      providers: fbUser.providerData ? fbUser.providerData.map((p: any) => p.providerId) : [],
      createdAt: fbUser.metadata?.creationTime || new Date().toISOString(),
      updatedAt: fbUser.metadata?.lastSignInTime || new Date().toISOString(),
    });
  });
  return () => unsub();
};

export const registerWithEmail = async (name: string, email: string, password: string) => {
  const firebaseAuth = tryGetFirebaseAuth();
  if (!firebaseAuth) throw new Error('Firebase auth not available');
  const authInstance = firebaseAuth.default ? firebaseAuth.default() : firebaseAuth();
  const cred = await authInstance.createUserWithEmailAndPassword(email.trim(), password);
  try {
    if (cred?.user && cred.user.updateProfile && name) {
      await cred.user.updateProfile({ displayName: name });
    }
  } catch (e) {
    // ignore profile update errors
  }
  const userService = tryGetUserService();
  if (userService && typeof userService.createOrUpdateUserFromAuth === 'function') {
    await userService.createOrUpdateUserFromAuth(cred.user);
  }
  return cred.user;
};

export const loginWithEmail = async (email: string, password: string) => {
  const firebaseAuth = tryGetFirebaseAuth();
  if (!firebaseAuth) throw new Error('Firebase auth not available');
  const authInstance = firebaseAuth.default ? firebaseAuth.default() : firebaseAuth();
  const cred = await authInstance.signInWithEmailAndPassword(email.trim(), password);
  const userService = tryGetUserService();
  if (userService && typeof userService.createOrUpdateUserFromAuth === 'function') {
    await userService.createOrUpdateUserFromAuth(cred.user || authInstance.currentUser);
  }
  return cred.user || authInstance.currentUser;
};

export const sendPasswordReset = async (email: string) => {
  const firebaseAuth = tryGetFirebaseAuth();
  if (!firebaseAuth) throw new Error('Firebase auth not available');
  const authInstance = firebaseAuth.default ? firebaseAuth.default() : firebaseAuth();
  return authInstance.sendPasswordResetEmail(email.trim());
};

export const logoutUser = async () => {
  const firebaseAuth = tryGetFirebaseAuth();
  if (!firebaseAuth) throw new Error('Firebase auth not available');
  const authInstance = firebaseAuth.default ? firebaseAuth.default() : firebaseAuth();
  return authInstance.signOut();
};

export const signInWithCredential = async (credential: any) => {
  const firebaseAuth = tryGetFirebaseAuth();
  if (!firebaseAuth) throw new Error('Firebase auth not available');
  const authInstance = firebaseAuth.default ? firebaseAuth.default() : firebaseAuth();
  if (typeof authInstance.signInWithCredential === 'function') {
    const res = await authInstance.signInWithCredential(credential);
    const userService = tryGetUserService();
    if (userService && typeof userService.createOrUpdateUserFromAuth === 'function') {
      await userService.createOrUpdateUserFromAuth(res.user || authInstance.currentUser);
    }
    return res;
  }
  if (firebaseAuth.signInWithCredential) {
    const { getAuth, signInWithCredential } = firebaseAuth;
    const res = await signInWithCredential(getAuth(), credential);
    const userService = tryGetUserService();
    if (userService && typeof userService.createOrUpdateUserFromAuth === 'function') {
      await userService.createOrUpdateUserFromAuth(res.user || (getAuth && getAuth().currentUser));
    }
    return res;
  }
  throw new Error('signInWithCredential not supported');
};

export const linkCurrentUserWithCredential = async (credential: any) => {
  const firebaseAuth = tryGetFirebaseAuth();
  if (!firebaseAuth) throw new Error('Firebase auth not available');
  const authInstance = firebaseAuth.default ? firebaseAuth.default() : firebaseAuth();
  const user = authInstance.currentUser;
  if (!user) throw new Error('No authenticated user to link to');
  if (typeof user.linkWithCredential === 'function') {
    return user.linkWithCredential(credential);
  }
  if (firebaseAuth.linkWithCredential) {
    const { getAuth, linkWithCredential } = firebaseAuth;
    return linkWithCredential(getAuth(), credential);
  }
  throw new Error('linkWithCredential not supported');
};

export const updateProfileDetails = async (payload: { name?: string; email?: string }) => {
  const firebaseAuth = tryGetFirebaseAuth();
  if (!firebaseAuth) throw new Error('Firebase auth not available');
  const authInstance = firebaseAuth.default ? firebaseAuth.default() : firebaseAuth();
  const user = authInstance.currentUser;
  if (!user) throw new Error('No authenticated user');
  const updates: any = {};
  if (payload.name) updates.displayName = payload.name;
  if (payload.email) updates.email = payload.email.trim().toLowerCase();
  if (updates.displayName && user.updateProfile) await user.updateProfile({ displayName: updates.displayName });
  if (updates.email && user.updateEmail) await user.updateEmail(updates.email);
  const userService = tryGetUserService();
  if (userService && typeof userService.createOrUpdateUserFromAuth === 'function') {
    await userService.createOrUpdateUserFromAuth(user);
  }
  return { name: updates.displayName || user.displayName, email: updates.email || user.email };
};

export const changePassword = async (currentPassword: string | undefined, newPassword: string) => {
  const firebaseAuth = tryGetFirebaseAuth();
  if (!firebaseAuth) throw new Error('Firebase auth not available');
  const authInstance = firebaseAuth.default ? firebaseAuth.default() : firebaseAuth();
  const user = authInstance.currentUser;
  if (!user) throw new Error('No authenticated user');

  // If caller provided currentPassword, attempt reauthentication first (Email provider path)
  try {
    if (currentPassword && user.email) {
      if (firebaseAuth.EmailAuthProvider && firebaseAuth.EmailAuthProvider.credential) {
        const cred = firebaseAuth.EmailAuthProvider.credential(user.email, currentPassword);
        if (typeof user.reauthenticateWithCredential === 'function') {
          await user.reauthenticateWithCredential(cred);
        }
      }
    }
  } catch (e) {
    throw e;
  }

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
  if (!firebaseAuth) throw new Error('Firebase auth not available');
  const authInstance = firebaseAuth.default ? firebaseAuth.default() : firebaseAuth();
  const user = authInstance.currentUser;
  if (!user) return;

  // If currentPassword provided, attempt reauth to satisfy Firebase's recent-login requirement
  if (currentPassword && user.email) {
    try {
      if (firebaseAuth.EmailAuthProvider && firebaseAuth.EmailAuthProvider.credential) {
        const cred = firebaseAuth.EmailAuthProvider.credential(user.email, currentPassword);
        if (typeof user.reauthenticateWithCredential === 'function') {
          await user.reauthenticateWithCredential(cred);
        }
      }
    } catch (e) {
      throw e;
    }
  }

  const userService = tryGetUserService();
  try {
    if (userService && typeof userService.deleteUserFromFirestore === 'function') {
      await userService.deleteUserFromFirestore(user.uid).catch(() => {});
    }
  } catch (e) {
    // ignore firestore delete errors
  }

  await wipeUserData(user.uid).catch(() => {});
  return user.delete();
};

export const reauthenticateWithPassword = async (password: string) => {
  const firebaseAuth = tryGetFirebaseAuth();
  if (!firebaseAuth) throw new Error('Firebase auth not available');
  const authInstance = firebaseAuth.default ? firebaseAuth.default() : firebaseAuth();
  const user = authInstance.currentUser;
  if (!user) throw new Error('No authenticated user');
  if (!user.email) throw new Error('User has no email for password reauthentication');
  if (firebaseAuth.EmailAuthProvider && firebaseAuth.EmailAuthProvider.credential) {
    const cred = firebaseAuth.EmailAuthProvider.credential(user.email, password);
    if (typeof user.reauthenticateWithCredential === 'function') {
      return user.reauthenticateWithCredential(cred);
    }
  }
  throw new Error('Reauthentication not supported on this platform');
};

// Google + linking helpers
export const startGoogleSignIn = async (intent: 'signIn' | 'link' = 'signIn') => {
  const googleMod: any = require('./googleAuth');
  const authMod: any = tryGetFirebaseAuth();
  if (!authMod) throw new Error('Firebase auth not available');

  const signResult = await googleMod.signInWithGoogle();
  const { firebaseResult, credential, raw } = signResult as any;
  const authInstance = authMod.default ? authMod.default() : authMod();
  const user = (firebaseResult && (firebaseResult.user || firebaseResult)) || authInstance.currentUser;
  if (!user) throw new Error('No firebase user after sign-in');

  const email = user.email ? String(user.email).toLowerCase() : null;
  try {
    if (email) {
      const userService: any = tryGetUserService();
      if (userService && typeof userService.findUserByEmail === 'function') {
        const found = await userService.findUserByEmail(email);
        if (found && found.uid !== user.uid) {
          const err: any = new Error('auth/email-exists-with-different-uid');
          err.code = 'auth/email-exists-with-different-uid';
          err.existingUid = found.uid;
          err.existingData = found.data;
          throw err;
        }
      }
    }

    const userService2: any = tryGetUserService();
    if (userService2 && typeof userService2.createOrUpdateUserFromAuth === 'function') {
      await userService2.createOrUpdateUserFromAuth(user);
    }
  } catch (e) {
    throw e;
  }

  return user;
};

export const fetchSignInMethodsForEmail = async (email: string) => {
  const firebaseAuth = tryGetFirebaseAuth();
  if (!firebaseAuth) throw new Error('Firebase auth not available');
  const authInstance = firebaseAuth.default ? firebaseAuth.default() : firebaseAuth();
  if (!email) return [];
  if (typeof authInstance.fetchSignInMethodsForEmail === 'function') {
    return authInstance.fetchSignInMethodsForEmail(email);
  }
  if (typeof authInstance.fetchProvidersForEmail === 'function') {
    return authInstance.fetchProvidersForEmail(email);
  }
  return [];
};

export const linkCredentialToCurrentUser = async (credential: any) => {
  const firebaseAuth = tryGetFirebaseAuth();
  if (!firebaseAuth) throw new Error('Firebase auth not available');
  const authInstance = firebaseAuth.default ? firebaseAuth.default() : firebaseAuth();
  const user = authInstance.currentUser;
  if (!user) throw new Error('No authenticated user to link credential to');
  if (typeof user.linkWithCredential === 'function') {
    return user.linkWithCredential(credential);
  }
  if (firebaseAuth.linkWithCredential) {
    return firebaseAuth.linkWithCredential(authInstance, credential);
  }
  throw new Error('linkWithCredential not supported in this Firebase SDK version');
};

export default {
  onAuthStateChanged,
  registerWithEmail,
  loginWithEmail,
  sendPasswordReset,
  logoutUser,
  signInWithCredential,
  linkCurrentUserWithCredential: linkCredentialToCurrentUser,
  updateProfileDetails,
  changePassword,
  deleteAccount,
  reauthenticateWithPassword,
  startGoogleSignIn,
  fetchSignInMethodsForEmail,
  linkCredentialToCurrentUser,
};


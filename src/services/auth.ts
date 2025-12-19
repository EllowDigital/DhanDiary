import { wipeUserData } from './localDb';

const tryGetFirebaseAuth = () => {
  try {
    // dynamic require to avoid import-time errors in environments without native modules
    const firebaseAuth = require('@react-native-firebase/auth');
    return firebaseAuth;
  } catch (e) {
    return null;
  }
};

const tryGetUserService = () => {
  try {
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
  if (userService && typeof userService.syncUserToFirestore === 'function') {
    await userService.syncUserToFirestore(cred.user);
  } else if (userService && typeof userService.createOrUpdateUserFromAuth === 'function') {
    // fallback
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
  if (userService && typeof userService.syncUserToFirestore === 'function') {
    await userService.syncUserToFirestore(cred.user || authInstance.currentUser);
  } else if (userService && typeof userService.createOrUpdateUserFromAuth === 'function') {
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
  if (currentPassword && user.email) {
    if (firebaseAuth.EmailAuthProvider && firebaseAuth.EmailAuthProvider.credential) {
      const cred = firebaseAuth.EmailAuthProvider.credential(user.email, currentPassword);
      if (typeof user.reauthenticateWithCredential === 'function') {
        await user.reauthenticateWithCredential(cred);
      }
    }
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
    if (firebaseAuth.EmailAuthProvider && firebaseAuth.EmailAuthProvider.credential) {
      const cred = firebaseAuth.EmailAuthProvider.credential(user.email, currentPassword);
      if (typeof user.reauthenticateWithCredential === 'function') {
        await user.reauthenticateWithCredential(cred);
      }
    }
  } else {
    // No password provided — attempt provider-based reauthentication for OAuth users (Google/GitHub)
    const providerId = user?.providerData?.[0]?.providerId;
    if (providerId === 'google.com' || providerId === 'github.com') {
      try {
        const oauthMod: any = require('./googleAuth');
        const signRes = await oauthMod.signInWithGoogle();
        const cred = signRes?.credential || signRes?.firebaseResult?.credential || null;
        if (cred && typeof user.reauthenticateWithCredential === 'function') {
          await user.reauthenticateWithCredential(cred);
        }
      } catch (e) {
        // ignore — we'll throw if delete fails due to recent-login requirement
      }
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

/**
 * Reauthenticate current user via Google (or other OAuth) using `googleAuth` helper.
 * Useful for provider-based accounts where password is not available.
 */
export const reauthenticateWithGoogle = async () => {
  const firebaseAuth = tryGetFirebaseAuth();
  if (!firebaseAuth) throw new Error('Firebase auth not available');
  const authInstance = firebaseAuth.default ? firebaseAuth.default() : firebaseAuth();
  const user = authInstance.currentUser;
  if (!user) throw new Error('No authenticated user');
  const oauthMod: any = require('./googleAuth');
  const signRes = await oauthMod.signInWithGoogle();
  const cred = signRes?.credential || signRes?.firebaseResult?.credential || null;
  if (!cred) throw new Error('No credential returned from Google reauth');
  if (typeof user.reauthenticateWithCredential === 'function') {
    return user.reauthenticateWithCredential(cred);
  }
  // Try higher-level helper
  if (firebaseAuth.reauthenticateWithCredential) {
    const { reauthenticateWithCredential } = firebaseAuth;
    return reauthenticateWithCredential(authInstance, cred);
  }
  throw new Error('Reauthentication not supported');
};

export const getAuthErrorMessage = (code: string | null | undefined) => {
  switch (code) {
    case 'auth/user-not-found':
      return 'No account found with this email.';
    case 'auth/wrong-password':
      return 'Incorrect password.';
    case 'auth/email-already-in-use':
      return 'This email is already registered.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.';
    case 'auth/invalid-email':
      return 'Invalid email address.';
    case 'auth/account-exists-with-different-credential':
      return 'Account exists with another sign-in method.';
    case 'auth/requires-recent-login':
      return 'Please re-authenticate to complete this action.';
    default:
      return 'Something went wrong. Please try again.';
  }
};

// Google + linking helpers
export const startGoogleSignIn = async (intent: 'signIn' | 'link' = 'signIn') => {
  const googleMod: any = require('./googleAuth');
  const authMod: any = tryGetFirebaseAuth();
  if (!authMod) throw new Error('Firebase auth not available');

  // Get raw sign-in result from Google helper. It may already have performed
  // Firebase sign-in (returning firebaseResult), or only contain raw tokens.
  const signResult = await googleMod.signInWithGoogle();
  const { firebaseResult, credential: returnedCredential, raw } = signResult as any;
  const authInstance = authMod.default ? authMod.default() : authMod();

  // If firebaseResult was returned, use that user. Otherwise try signing in here.
  let user: any = (firebaseResult && (firebaseResult.user || firebaseResult)) || authInstance.currentUser;

  if (!user) {
    const idToken = raw?.data?.idToken ?? raw?.idToken ?? null;
    const accessToken = raw?.data?.accessToken ?? raw?.accessToken ?? null;
    try {
      // Try classic RN Firebase API first
      const firebaseAuth: any = authMod;
      if (typeof firebaseAuth === 'function' || firebaseAuth.default) {
        const authInst = typeof firebaseAuth === 'function' ? firebaseAuth() : firebaseAuth.default();
        const GoogleAuthProvider =
          firebaseAuth.GoogleAuthProvider || firebaseAuth.default?.GoogleAuthProvider || authInst.GoogleAuthProvider;
        let cred: any = null;
        if (GoogleAuthProvider && typeof GoogleAuthProvider.credential === 'function') {
          cred = GoogleAuthProvider.credential(idToken, accessToken);
        }
        if (cred && typeof authInst.signInWithCredential === 'function') {
          const res = await authInst.signInWithCredential(cred);
          user = res.user || authInst.currentUser;
        }
      }

      // Modular API fallback
      if (!user && firebaseAuth && firebaseAuth.getAuth && firebaseAuth.signInWithCredential && firebaseAuth.GoogleAuthProvider) {
        const { getAuth, GoogleAuthProvider, signInWithCredential } = firebaseAuth;
        const cred = GoogleAuthProvider.credential(idToken, accessToken);
        const res = await signInWithCredential(getAuth(), cred);
        user = res.user || (getAuth && getAuth().currentUser);
      }
    } catch (err: any) {
      // Surface account-exists-with-different-credential with helpful payload
      if (err && err.code === 'auth/account-exists-with-different-credential') {
        const email = err?.customData?.email || raw?.user?.email || raw?.email || null;
        const pendingCredential = (() => {
          try {
            const firebaseAuth: any = authMod;
            const GoogleAuthProvider =
              firebaseAuth.GoogleAuthProvider || firebaseAuth.default?.GoogleAuthProvider;
            if (GoogleAuthProvider && typeof GoogleAuthProvider.credential === 'function') {
              return GoogleAuthProvider.credential(idToken, accessToken);
            }
            return { providerId: 'google.com', token: idToken, accessToken };
          } catch (e) {
            return { providerId: 'google.com', token: idToken, accessToken };
          }
        })();
        const out: any = new Error('auth/account-exists-with-different-credential');
        out.code = 'auth/account-exists-with-different-credential';
        out.email = email;
        out.pendingCredential = pendingCredential;
        throw out;
      }
      throw err;
    }
  }

  if (!user) throw new Error('No firebase user after Google sign-in');

  const email = user.email ? String(user.email).toLowerCase() : null;
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
  if (userService2 && typeof userService2.syncUserToFirestore === 'function') {
    await userService2.syncUserToFirestore(user);
  } else if (userService2 && typeof userService2.createOrUpdateUserFromAuth === 'function') {
    await userService2.createOrUpdateUserFromAuth(user);
  }

  return user;
};

// Minimal stub for GitHub sign-in helper to satisfy callers. Replace with full implementation
// if `githubAuth` helper is added later.
export const startGithubSignIn = async (intent: 'signIn' | 'link' = 'signIn') => {
  // Try to load a githubAuth helper if present
  try {
    // eslint-disable-next-line global-require
    const gh = require('./githubAuth');
    if (gh && typeof gh.signInWithGithub === 'function') {
      return await gh.signInWithGithub();
    }
  } catch (e) {
    // ignore
  }
  throw new Error('GitHub sign-in not configured in this build');
};

/**
 * Sign in existing email/password user and link a pending OAuth credential to them.
 * Returns the linked user.
 */
export const linkPendingCredentialWithPassword = async (email: string, password: string, pendingCredential: any) => {
  if (!email || !password) throw new Error('Email and password required');
  const firebaseAuth = tryGetFirebaseAuth();
  if (!firebaseAuth) throw new Error('Firebase auth not available');

  // Classic API
  if (typeof firebaseAuth === 'function' || firebaseAuth.default) {
    const authInstance = typeof firebaseAuth === 'function' ? firebaseAuth() : firebaseAuth.default();
    if (typeof authInstance.signInWithEmailAndPassword === 'function') {
      const res = await authInstance.signInWithEmailAndPassword(email, password);
      const user = res.user || authInstance.currentUser;
      if (!user) throw new Error('Failed to sign in existing user');
      if (typeof user.linkWithCredential === 'function') {
        await user.linkWithCredential(pendingCredential);
      } else {
        await linkCredentialToCurrentUser(pendingCredential);
      }
      const userService: any = tryGetUserService();
      if (userService && typeof userService.syncUserToFirestore === 'function') {
        await userService.syncUserToFirestore(user);
      }
      return user;
    }
  }

  // Modular API
  if (firebaseAuth && firebaseAuth.getAuth && firebaseAuth.signInWithEmailAndPassword) {
    const { getAuth, signInWithEmailAndPassword } = firebaseAuth;
    const res = await signInWithEmailAndPassword(getAuth(), email, password);
    const user = res.user || (getAuth && getAuth().currentUser);
    if (!user) throw new Error('Failed to sign in existing user (modular)');
    if (typeof linkCredentialToCurrentUser === 'function') await linkCredentialToCurrentUser(pendingCredential);
    const userService: any = tryGetUserService();
    if (userService && typeof userService.syncUserToFirestore === 'function') {
      await userService.syncUserToFirestore(user);
    }
    return user;
  }

  throw new Error('Email/password sign-in not supported on this platform');
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
  linkPendingCredentialWithPassword,
  reauthenticateWithGoogle,
  getAuthErrorMessage,
  fetchSignInMethodsForEmail,
  linkCredentialToCurrentUser,
};


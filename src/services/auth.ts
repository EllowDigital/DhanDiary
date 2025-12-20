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
    // Debug: log the raw Firebase user object to help diagnose missing email/provider data
    try {
      console.debug('onAuthStateChanged: raw fbUser', fbUser && typeof fbUser === 'object' ? {
        uid: fbUser.uid,
        email: fbUser.email,
        providerData: fbUser.providerData,
        metadata: fbUser.metadata,
      } : fbUser);
    } catch (e) {}
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
  console.debug('auth.registerWithEmail called', { email });
  const firebaseAuth = tryGetFirebaseAuth();
  if (!firebaseAuth) throw new Error('Firebase auth not available');
  const authInstance = firebaseAuth.default ? firebaseAuth.default() : firebaseAuth();
  let cred: any;
  const withTimeout = async <T>(p: Promise<T>, ms = 15000): Promise<T> => {
    let timer: any;
    try {
      return await Promise.race([
        p,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Operation timed out')), ms);
        }),
      ] as any);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
  try {
    cred = await withTimeout(authInstance.createUserWithEmailAndPassword(email.trim(), password), 20000);
  } catch (e) {
    console.error('auth.registerWithEmail: createUser error', e);
    throw e;
  }
  try {
    if (cred?.user && cred.user.updateProfile && name) {
      await cred.user.updateProfile({ displayName: name });
    }
  } catch (e) {
    // ignore profile update errors
  }
  // Ensure auth state and ID token have propagated before attempting Firestore writes.
  // Firestore rules require request.auth.uid == uid; if the ID token isn't available
  // yet the write will be rejected with permission-denied. We try to proactively
  // refresh the token (getIdToken(true)) and wait briefly for the auth instance
  // to report the current user.
  try {
    const waitForAuth = async (timeoutMs = 5000) => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const current = authInstance.currentUser;
        if (current && current.uid === (cred.user && cred.user.uid)) return current;
        // small delay
        await new Promise((r) => setTimeout(r, 200));
      }
      return authInstance.currentUser;
    };
    const current = await waitForAuth(6000);
    try {
      if (current && typeof current.getIdToken === 'function') {
        await current.getIdToken(true);
      }
    } catch (tokenErr) {
      console.debug('auth.registerWithEmail: getIdToken refresh failed', tokenErr);
    }
  } catch (e) {
    console.debug('auth.registerWithEmail: auth propagation wait failed', e);
  }

  const userService = tryGetUserService();
  if (userService && typeof userService.syncUserToFirestore === 'function') {
    try {
      // Don't allow the user creation flow to hang if backend sync is slow/unavailable
      await withTimeout(userService.syncUserToFirestore(cred.user), 8000);
    } catch (syncErr) {
      console.debug('registerWithEmail: syncUserToFirestore failed or timed out', (syncErr as any)?.message || syncErr);
      // do not throw — registration succeeded locally; surface warning but continue
    }
  } else {
    console.debug('registerWithEmail: syncUserToFirestore not available');
  }
  return cred.user;
};

export const loginWithEmail = async (email: string, password: string) => {
  console.debug('auth.loginWithEmail called', { email });
  const firebaseAuth = tryGetFirebaseAuth();
  if (!firebaseAuth) throw new Error('Firebase auth not available');
  const authInstance = firebaseAuth.default ? firebaseAuth.default() : firebaseAuth();
  let cred: any;
  // Log available sign-in methods for this email to help diagnose credential issues
  try {
    if (authInstance && typeof authInstance.fetchSignInMethodsForEmail === 'function') {
      try {
        const methods = await authInstance.fetchSignInMethodsForEmail(email.trim());
        console.debug('auth.loginWithEmail: sign-in methods for email', { email, methods });
      } catch (mErr) {
        console.debug('auth.loginWithEmail: fetchSignInMethodsForEmail failed', (mErr as any)?.message || mErr);
      }
    }
  } catch (e) {}
  try {
    cred = await authInstance.signInWithEmailAndPassword(email.trim(), password);
  } catch (e) {
    console.error('auth.loginWithEmail: signIn error', e);
    // If we receive auth/invalid-credential, attempt to determine whether this
    // account actually has a password provider; if not, surface a clearer error.
    const code = (e as any)?.code || (e as any)?.message || null;
    if (code === 'auth/invalid-credential' || (typeof code === 'string' && code.includes('invalid-credential'))) {
      try {
        if (authInstance && typeof authInstance.fetchSignInMethodsForEmail === 'function') {
          const methods = await authInstance.fetchSignInMethodsForEmail(email.trim());
          // If there's no 'password' provider, inform the caller the account uses OAuth
          if (!Array.isArray(methods) || !methods.includes('password')) {
            const out: any = new Error('This account uses a social provider (Google/GitHub). Please sign in with that provider or set a password.');
            out.code = 'auth/no-password-provider';
            out.methods = methods;
            throw out;
          }
        }
      } catch (mErr) {
        console.debug('auth.loginWithEmail: provider check failed', (mErr as any)?.message || mErr);
      }
    }
    throw e;
  }
  const userService = tryGetUserService();
  if (userService && typeof userService.syncUserToFirestore === 'function') {
    await userService.syncUserToFirestore(cred.user || authInstance.currentUser);
  } else {
    console.debug('loginWithEmail: syncUserToFirestore not available');
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
    if (userService && typeof userService.syncUserToFirestore === 'function') {
      await userService.syncUserToFirestore(res.user || authInstance.currentUser);
    } else {
      console.debug('signInWithCredential: syncUserToFirestore not available');
    }
    return res;
  }
  if (firebaseAuth.signInWithCredential) {
    const { getAuth, signInWithCredential } = firebaseAuth;
    const res = await signInWithCredential(getAuth(), credential);
    const userService = tryGetUserService();
    if (userService && typeof userService.syncUserToFirestore === 'function') {
      await userService.syncUserToFirestore(res.user || (getAuth && getAuth().currentUser));
    } else {
      console.debug('signInWithCredential(modular): syncUserToFirestore not available');
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
    if (userService && typeof userService.syncUserToFirestore === 'function') {
      await userService.syncUserToFirestore(user);
    } else {
      console.debug('startGoogleSignIn: syncUserToFirestore not available');
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

/**
 * Set a password for the current user. Useful for OAuth-only accounts (e.g. Google)
 * that do not yet have a password provider. Attempts to update the password directly
 * and will try provider reauthentication (Google) if Firebase requires a recent login.
 */
export const setPasswordForCurrentUser = async (newPassword: string) => {
  const firebaseAuth = tryGetFirebaseAuth();
  if (!firebaseAuth) throw new Error('Firebase auth not available');
  const authInstance = firebaseAuth.default ? firebaseAuth.default() : firebaseAuth();
  const user = authInstance.currentUser;
  if (!user) throw new Error('No authenticated user');
  if (!user.email) throw new Error('User has no email');

  // Try instance method first and handle recent-login requirement explicitly
  if (typeof user.updatePassword === 'function') {
    try {
      await user.updatePassword(newPassword);
      return;
    } catch (err) {
      if ((err as any) && ((err as any).code === 'auth/requires-recent-login' || (err as any).code === 'auth/requires-recent-login')) {
        await reauthenticateWithGoogle();
        const refreshed = authInstance.currentUser;
        if (refreshed && typeof refreshed.updatePassword === 'function') {
          await refreshed.updatePassword(newPassword);
          return;
        }
      }
      throw err;
    }
  }

  // Modular API fallback
  if (firebaseAuth.updatePassword) {
    const { getAuth, updatePassword } = firebaseAuth;
    const currentUser = getAuth && getAuth().currentUser;
    if (currentUser) {
      try {
        await updatePassword(currentUser, newPassword);
        return;
      } catch (err) {
        if ((err as any) && ((err as any).code === 'auth/requires-recent-login' || (err as any).code === 'auth/requires-recent-login')) {
          await reauthenticateWithGoogle();
          const refreshed = authInstance.currentUser;
          if (refreshed && typeof refreshed.updatePassword === 'function') {
            await refreshed.updatePassword(newPassword);
            return;
          }
        }
        throw err;
      }
    }
  }

  throw new Error('Password update not supported on this platform');
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
      const deleted = await userService.deleteUserFromFirestore(user.uid).catch(() => false);
      if (!deleted && userService && typeof userService.requestAccountDeletion === 'function') {
        // Enqueue server-side deletion request when client-side deletion isn't permitted
        try {
          await userService.requestAccountDeletion(user.uid).catch(() => {});
        } catch (e) {}
      }
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
        return 'No account found with this email';
    case 'auth/wrong-password':
        return 'Incorrect password';
    case 'auth/email-already-in-use':
      return 'This email is already registered.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.';
    case 'auth/invalid-email':
      return 'Invalid email address.';
    case 'auth/account-exists-with-different-credential':
      return 'Please sign in with your password to link accounts';
    case 'auth/requires-recent-login':
      return 'Please re-authenticate to complete this action.';
    default:
      return 'Something went wrong. Please try again.';
  }
};

// Google + linking helpers
export const startGoogleSignIn = async (intent: 'signIn' | 'link' = 'signIn') => {
  console.debug('auth.startGoogleSignIn called', { intent });
  const googleMod: any = require('./googleAuth');
  const authMod: any = tryGetFirebaseAuth();
  if (!authMod) throw new Error('Firebase auth not available');

  // Get raw sign-in result from Google helper. It may already have performed
  // Request raw tokens first (do not auto sign into Firebase). We'll pre-check
  // sign-in methods for the returned email and only complete the Firebase
  // sign-in if safe to do so.
  const signResult = await googleMod.signInWithGoogle({ firebaseSignIn: false });
  const { firebaseResult, credential: returnedCredential, credential: credentialForCaller, raw } = signResult as any;
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
        // Before performing Firebase sign-in, attempt to pre-check existing providers
        // for this email. If the email already has a password provider, we should
        // send the user to the Login+linking UI instead of triggering Firebase's
        // account-exists-with-different-credential error.
        const emailFromGoogle = raw?.user?.email ?? raw?.email ?? null;
        if (emailFromGoogle) {
          try {
            const authModForCheck: any = tryGetFirebaseAuth();
            if (authModForCheck) {
              const authInstForCheck = authModForCheck.default ? authModForCheck.default() : authModForCheck();
              if (typeof authInstForCheck.fetchSignInMethodsForEmail === 'function') {
                const methods = await authInstForCheck.fetchSignInMethodsForEmail(emailFromGoogle);
                console.debug('startGoogleSignIn: sign-in methods for email', { email: emailFromGoogle, methods });
                if (Array.isArray(methods) && methods.includes('password')) {
                  // Redirect to Login screen to allow user to sign in with password
                  // and then link the pending credential.
                  const pendingCredential = cred || credentialForCaller || { providerId: 'google.com', token: idToken, accessToken };
                  const out: any = new Error('auth/account-exists-with-different-credential');
                  out.code = 'auth/account-exists-with-different-credential';
                  out.email = emailFromGoogle;
                  out.pendingCredential = pendingCredential;
                  throw out;
                }
              }
            }
          } catch (checkErr) {
            console.debug('startGoogleSignIn: provider pre-check failed', (checkErr as any)?.message || checkErr);
            // fall through and attempt sign-in below
          }
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
    } catch (err) {
      // Surface account-exists-with-different-credential with helpful payload
      if ((err as any) && (err as any).code === 'auth/account-exists-with-different-credential') {
        const email = ((err as any)?.customData as any)?.email || raw?.user?.email || raw?.email || null;
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
  } else {
    console.debug('startGoogleSignIn: syncUserToFirestore not available');
  }

  return user;
};

// Minimal stub for GitHub sign-in helper to satisfy callers. Replace with full implementation
// if `githubAuth` helper is added later.
export const startGithubSignIn = async (intent: 'signIn' | 'link' = 'signIn') => {
  // Try to load a githubAuth helper if present
  try {
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
  setPasswordForCurrentUser,
  getAuthErrorMessage,
  fetchSignInMethodsForEmail,
  linkCredentialToCurrentUser,
};


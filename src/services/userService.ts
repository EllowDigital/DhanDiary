// Avoid static imports of native firebase modules so Metro bundler
// doesn't fail in Expo Go or environments where native modules aren't installed.

type UserDoc = {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  provider?: string;
  providerData?: any[];
  emailVerified?: boolean;
  createdAt?: any;
  lastLoginAt?: any;
  roles?: Record<string, boolean>;
  settings?: Record<string, any>;
  metadata?: Record<string, any>;
};

const tryGetFirestore = () => {
  try {
    // dynamic require to avoid import-time native resolution
    return require('@react-native-firebase/firestore');
  } catch (e) {
    return null;
  }
};

const tryGetAuth = () => {
  try {
    return require('@react-native-firebase/auth');
  } catch (e) {
    return null;
  }
};

export async function createOrUpdateUserFromAuth(user: any) {
  // Deprecated alias: delegate to centralized syncUserToFirestore to ensure
  // a single write path for users/{uid}. Kept for backward compatibility.
  return syncUserToFirestore(user);
}

/**
 * Find a user document by email. Returns { uid, data } or null.
 */
export async function findUserByEmail(email: string) {
  const fsMod = tryGetFirestore();
  if (!fsMod) return null;
  const firestore = fsMod.default ? fsMod.default() : fsMod();
  if (!email) return null;
  const q = await firestore.collection('users').where('email', '==', String(email).toLowerCase()).limit(1).get();
  if (q.empty) return null;
  const doc = q.docs[0];
  return { uid: doc.id, data: doc.data() };
}

export async function ensureUserDocumentForCurrentUser() {
  const authMod = tryGetAuth();
  if (!authMod) {
    console.debug(
      'userService: @react-native-firebase/auth not available, ensureUserDocumentForCurrentUser noop'
    );
    return null;
  }
  const authInstance = authMod.default ? authMod.default() : authMod();
  const u = authInstance.currentUser;
  if (!u) return null;
  return createOrUpdateUserFromAuth(u);
}

export async function deleteUserFromFirestore(uid: string) {
  const fsMod = tryGetFirestore();
  if (!fsMod) {
    console.debug('userService: @react-native-firebase/firestore not available, skip deleteUserFromFirestore');
    return null;
  }
  const firestore = fsMod.default ? fsMod.default() : fsMod();
  try {
    const userRef = firestore.collection('users').doc(uid);
    // Try to delete entries subcollection in batches (best-effort). On strict
    // security rules this may fail; the admin SDK/cloud function approach is
    // recommended for complete deletion.
    try {
      const entriesCol = userRef.collection('entries');
      const snap = await entriesCol.get();
      const batchSize = 500;
      let batch = firestore.batch();
      let counter = 0;
      for (const doc of snap.docs) {
        batch.delete(doc.ref);
        counter++;
        if (counter >= batchSize) {
          await batch.commit();
          batch = firestore.batch();
          counter = 0;
        }
      }
      if (counter > 0) await batch.commit();
    } catch (e) {
      console.debug('userService.deleteUserFromFirestore: failed to delete entries subcollection (may require admin privileges)', e);
    }

    try {
      await userRef.delete();
      return true;
    } catch (e) {
      console.debug('userService.deleteUserFromFirestore: failed to delete user doc (may require admin privileges)', e);
      // Return false to indicate client-side deletion not possible
      return false;
    }
  } catch (e) {
    console.debug('userService: failed to delete user document', e);
    throw e;
  }
}

/**
 * Client-side request to mark this account for server-side deletion.
 * Creates a small document under `account_deletions/{uid}` that an
 * admin Cloud Function or scheduled job can process with elevated privileges.
 */
export async function requestAccountDeletion(uid: string) {
  const fsMod = tryGetFirestore();
  if (!fsMod) {
    console.debug('userService: firestore not available, cannot request account deletion');
    return null;
  }
  const firestore = fsMod.default ? fsMod.default() : fsMod();
  const ref = firestore.collection('account_deletions').doc(uid);
  await ref.set({ requestedBy: uid, requestedAt: firestore.FieldValue ? firestore.FieldValue.serverTimestamp() : new Date() });
  return true;
}

export default { createOrUpdateUserFromAuth, ensureUserDocumentForCurrentUser, deleteUserFromFirestore, syncUserToFirestore };

/**
 * Alias/sync function for callers: central place to ensure Firestore user exists/updated.
 * Keeps existing createOrUpdateUserFromAuth behavior but exposes a clearer name
 * matching app architecture: "syncUserToFirestore".
 */
export async function syncUserToFirestore(user: any) {
  if (!user || !user.uid) return null;
  const fsMod = tryGetFirestore();
  if (!fsMod) {
    console.debug('syncUserToFirestore: firestore not available');
    return null;
  }

  // Try to refresh token to avoid permission-denied during immediate post-signup writes
  try {
    const authMod = tryGetAuth();
    if (authMod) {
      const authInstance = authMod.default ? authMod.default() : authMod();
      const current = authInstance.currentUser || user;
      // If the current auth user does not yet match the provided uid there
      // may be a propagation delay (especially after OAuth linking). Wait
      // briefly for the auth state to reflect the new uid and refresh the
      // ID token to ensure Firestore rules see the authenticated caller.
      const targetUid = user.uid;
      const start = Date.now();
      const timeoutMs = 6000;
      while (Date.now() - start < timeoutMs) {
        const nowCurrent = authInstance.currentUser;
        if (nowCurrent && nowCurrent.uid === targetUid) {
          try {
            if (typeof nowCurrent.getIdToken === 'function') await nowCurrent.getIdToken(true);
          } catch (e) {
            console.debug('syncUserToFirestore: getIdToken failed', e?.message || e);
          }
          break;
        }
        // If no matching current user yet, attempt a non-blocking token refresh
        // on the provided user object as a best-effort, then wait a bit.
        try {
          if (user && typeof user.getIdToken === 'function') {
            // don't await to avoid long blocking, but allow a small pause below
            user.getIdToken(true).catch(() => {});
          }
        } catch (e) {}
        // small delay
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 250));
      }
    }
  } catch (e) {
    console.debug('syncUserToFirestore: auth token refresh check failed', e?.message || e);
  }

  const firestore = fsMod.default ? fsMod.default() : fsMod();
  const FieldValue =
    firestore.FieldValue ||
    fsMod.FieldValue ||
    (fsMod.FieldValue && fsMod.FieldValue.serverTimestamp ? fsMod.FieldValue : null);

  const uid = user.uid;
  const userRef = firestore.collection('users').doc(uid);

  // Build providers list from providerData; ensure uniqueness
  const providers: string[] = Array.isArray(user.providerData)
    ? Array.from(new Set(user.providerData.map((p: any) => p.providerId).filter(Boolean)))
    : [];

  const data: any = {
    uid,
    email: user.email ?? null,
    providers,
    updatedAt: FieldValue ? FieldValue.serverTimestamp() : new Date(),
  };

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await userRef.set(
        {
          ...data,
          createdAt: FieldValue ? FieldValue.serverTimestamp() : new Date(),
        },
        { merge: true }
      );
      return userRef;
    } catch (err: any) {
      console.debug('syncUserToFirestore: set attempt failed', { attempt, err: err?.message || err });
      if (attempt === maxAttempts) throw err;
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
  return null;
}

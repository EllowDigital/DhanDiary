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
  if (!user || !user.uid) throw new Error('Invalid user object');
  const fsMod = tryGetFirestore();
  if (!fsMod) {
    console.debug(
      'userService: @react-native-firebase/firestore not available, skipping user doc creation'
    );
    return null;
  }

  // If auth module is available, ensure the calling runtime has an authenticated
  // Firebase user matching the uid we're about to write. This prevents surprising
  // permission-denied errors from Firestore rules that require request.auth.uid == uid.
  try {
    const authMod = tryGetAuth();
    if (authMod) {
      const authInstance = authMod.default ? authMod.default() : authMod();
      const current = authInstance.currentUser;
      console.debug('userService: current auth user', current ? current.uid : null);
      if (!current || current.uid !== user.uid) {
        const err: any = new Error('No authenticated Firebase user matching uid; aborting Firestore write');
        err.code = 'firestore/unauthenticated';
        throw err;
      }
    }
  } catch (e) {
    // If auth check itself errored, continue — the upcoming Firestore operation
    // will surface the permission error which we will log.
    console.debug('userService: auth check failed (continuing)', e?.message || e);
  }

  const firestore = fsMod.default ? fsMod.default() : fsMod();
  const FieldValue =
    firestore.FieldValue ||
    fsMod.FieldValue ||
    (fsMod.FieldValue && fsMod.FieldValue.serverTimestamp ? fsMod.FieldValue : null);

  const uid = user.uid;
  const docRef = firestore.collection('users').doc(uid);
  const payload: UserDoc = {
    uid,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    photoURL: user.photoURL ?? null,
    provider: user.providerId ?? user?.providerData?.[0]?.providerId ?? 'password',
    providerData: user.providerData ?? [],
    emailVerified: !!user.emailVerified,
    lastLoginAt: FieldValue ? FieldValue.serverTimestamp() : new Date(),
    roles: { user: true },
    settings: {},
  };

  // Sanitize email for equality checks
  const email = (user.email && String(user.email).toLowerCase()) || null;

  // Ensure single document per user UID and avoid creating duplicates by email.
  // If a different document with the same email already exists, we DO NOT create a new
  // document for this uid. Instead we surface a conflict so the caller can handle linking.
  if (email) {
    const q = await firestore.collection('users').where('email', '==', email).limit(1).get();
    if (!q.empty) {
      const existing = q.docs[0];
      if (existing.id !== uid) {
        // Conflict: another user document exists with the same email but different UID.
        const err: any = new Error('userService:email-conflict');
        err.code = 'userService/email-conflict';
        err.existingUid = existing.id;
        err.existingData = existing.data();
        throw err;
      }
    }
  }

  // Safe create/update using transaction to avoid races.
  await firestore.runTransaction(async (tx: any) => {
    const snap = await tx.get(docRef);
    const nowVal = FieldValue ? FieldValue.serverTimestamp() : new Date();
    if (!snap.exists) {
      tx.set(
        docRef,
        { ...payload, createdAt: nowVal, lastLoginAt: nowVal },
        { merge: true }
      );
    } else {
      // Merge updates and update lastLoginAt. Preserve and merge providerData arrays.
      const existing = snap.data() || {};
      const existingProviders: any[] = Array.isArray(existing.providerData) ? existing.providerData : [];
      const incomingProviders: any[] = Array.isArray(payload.providerData) ? payload.providerData : [];
      // Merge by providerId+uid key
      const map = new Map<string, any>();
      const keyFor = (p: any) => `${p.providerId || ''}::${p.uid || ''}`;
      for (const p of existingProviders) map.set(keyFor(p), p);
      for (const p of incomingProviders) map.set(keyFor(p), p);
      const mergedProviders = Array.from(map.values());
      tx.set(
        docRef,
        { ...payload, providerData: mergedProviders, lastLoginAt: nowVal },
        { merge: true }
      );
    }
  });

  return docRef;

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
    const docRef = firestore.collection('users').doc(uid);
    await docRef.delete();
    return true;
  } catch (e) {
    console.debug('userService: failed to delete user document', e);
    throw e;
  }
}

export default { createOrUpdateUserFromAuth, ensureUserDocumentForCurrentUser, deleteUserFromFirestore };

/**
 * Alias/sync function for callers: central place to ensure Firestore user exists/updated.
 * Keeps existing createOrUpdateUserFromAuth behavior but exposes a clearer name
 * matching app architecture: "syncUserToFirestore".
 */
export async function syncUserToFirestore(user: any) {
  return createOrUpdateUserFromAuth(user);
}

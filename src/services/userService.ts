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
    // eslint-disable-next-line global-require
    return require('@react-native-firebase/firestore');
  } catch (e) {
    return null;
  }
};

const tryGetAuth = () => {
  try {
    // eslint-disable-next-line global-require
    return require('@react-native-firebase/auth');
  } catch (e) {
    return null;
  }
};

export async function createOrUpdateUserFromAuth(user: any) {
  if (!user || !user.uid) throw new Error('Invalid user object');
  const fsMod = tryGetFirestore();
  if (!fsMod) {
    console.debug('userService: @react-native-firebase/firestore not available, skipping user doc creation');
    return null;
  }

  const firestore = fsMod.default ? fsMod.default() : fsMod();
  const FieldValue = firestore.FieldValue || (fsMod.FieldValue || (fsMod.FieldValue && fsMod.FieldValue.serverTimestamp ? fsMod.FieldValue : null));

  const uid = user.uid;
  const docRef = firestore.collection('users').doc(uid);
  const payload: UserDoc = {
    uid,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    photoURL: user.photoURL ?? null,
    provider: user.providerId ?? (user?.providerData?.[0]?.providerId) ?? 'password',
    providerData: user.providerData ?? [],
    emailVerified: !!user.emailVerified,
    lastLoginAt: FieldValue ? FieldValue.serverTimestamp() : new Date(),
    roles: { user: true },
    settings: {},
  };

  await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    if (!snap.exists) {
      tx.set(docRef, { ...payload, createdAt: FieldValue ? FieldValue.serverTimestamp() : new Date() }, { merge: true });
    } else {
      tx.set(docRef, payload, { merge: true });
    }
  });

  return docRef;
}

export async function ensureUserDocumentForCurrentUser() {
  const authMod = tryGetAuth();
  if (!authMod) {
    console.debug('userService: @react-native-firebase/auth not available, ensureUserDocumentForCurrentUser noop');
    return null;
  }
  const authInstance = authMod.default ? authMod.default() : authMod();
  const u = authInstance.currentUser;
  if (!u) return null;
  return createOrUpdateUserFromAuth(u);
}

export default { createOrUpdateUserFromAuth, ensureUserDocumentForCurrentUser };

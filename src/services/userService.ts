import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';

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

export async function createOrUpdateUserFromAuth(user: any) {
  if (!user || !user.uid) throw new Error('Invalid user object');
  const uid = user.uid;
  const docRef = firestore().collection('users').doc(uid);
  const payload: UserDoc = {
    uid,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    photoURL: user.photoURL ?? null,
    provider: user.providerId ?? (user?.providerData?.[0]?.providerId) ?? 'password',
    providerData: user.providerData ?? [],
    emailVerified: !!user.emailVerified,
    lastLoginAt: firestore.FieldValue.serverTimestamp(),
    roles: { user: true },
    settings: {},
  };

  await firestore().runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    if (!snap.exists) {
      tx.set(docRef, { ...payload, createdAt: firestore.FieldValue.serverTimestamp() }, { merge: true });
    } else {
      tx.set(docRef, payload, { merge: true });
    }
  });

  return docRef;
}

export async function ensureUserDocumentForCurrentUser() {
  const u = auth().currentUser;
  if (!u) return null;
  return createOrUpdateUserFromAuth(u);
}

export default { createOrUpdateUserFromAuth, ensureUserDocumentForCurrentUser };

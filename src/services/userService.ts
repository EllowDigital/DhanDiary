// userService.ts
// ------------------------------------------------------------
// Avoid static imports of native Firebase modules so Metro
// doesn't fail in Expo Go or environments where native modules
// aren't installed.
// ------------------------------------------------------------

/* ------------------------------------------------------------------ */
/* Types */
/* ------------------------------------------------------------------ */

export type UserDoc = {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  providers?: string[];
  emailVerified?: boolean;
  createdAt?: any;
  updatedAt?: any;
  lastLoginAt?: any;
  roles?: Record<string, boolean>;
  settings?: Record<string, any>;
  metadata?: Record<string, any>;
};

/* ------------------------------------------------------------------ */
/* Dynamic module access helpers */
/* ------------------------------------------------------------------ */

const tryGetFirestore = () => {
  try {
    return require('@react-native-firebase/firestore');
  } catch {
    return null;
  }
};

const tryGetAuth = () => {
  try {
    return require('@react-native-firebase/auth');
  } catch {
    return null;
  }
};

/* ------------------------------------------------------------------ */
/* Public API */
/* ------------------------------------------------------------------ */

/**
 * Backward-compatible alias.
 * Prefer calling syncUserToFirestore directly.
 */
export async function createOrUpdateUserFromAuth(user: any) {
  return syncUserToFirestore(user);
}

/**
 * Find a user document by email.
 * Returns { uid, data } or null.
 */
export async function findUserByEmail(email: string) {
  if (!email) return null;

  const fsMod = tryGetFirestore();
  if (!fsMod) return null;

  const firestore = fsMod.default ? fsMod.default() : fsMod();
  const snap = await firestore
    .collection('users')
    .where('email', '==', String(email).toLowerCase())
    .limit(1)
    .get();

  if (snap.empty) return null;

  const doc = snap.docs[0];
  return { uid: doc.id, data: doc.data() };
}

/**
 * Ensures the currently authenticated user
 * has a Firestore document.
 */
export async function ensureUserDocumentForCurrentUser() {
  const authMod = tryGetAuth();
  if (!authMod) return null;

  const auth = authMod.default ? authMod.default() : authMod();
  const user = auth.currentUser;
  if (!user) return null;

  return syncUserToFirestore(user);
}

/**
 * Best-effort client-side delete of user data.
 * Full deletion should be handled server-side (Admin SDK).
 */
export async function deleteUserFromFirestore(uid: string) {
  const fsMod = tryGetFirestore();
  if (!fsMod) return null;

  const firestore = fsMod.default ? fsMod.default() : fsMod();
  const userRef = firestore.collection('users').doc(uid);

  // Attempt to delete subcollections (best effort)
  try {
    const entriesSnap = await userRef.collection('entries').get();
    const batchSize = 500;
    let batch = firestore.batch();
    let count = 0;

    for (const d of entriesSnap.docs) {
      batch.delete(d.ref);
      count++;
      if (count >= batchSize) {
        await batch.commit();
        batch = firestore.batch();
        count = 0;
      }
    }

    if (count > 0) await batch.commit();
  } catch (e) {
    console.debug(
      'deleteUserFromFirestore: failed deleting subcollection',
      e
    );
  }

  try {
    await userRef.delete();
    return true;
  } catch (e) {
    console.debug(
      'deleteUserFromFirestore: failed deleting user doc',
      e
    );
    return false;
  }
}

/**
 * Client-side request for account deletion.
 * Server (Cloud Function / cron) should process this.
 */
export async function requestAccountDeletion(uid: string) {
  const fsMod = tryGetFirestore();
  if (!fsMod) return null;

  const firestore = fsMod.default ? fsMod.default() : fsMod();
  const FieldValue = firestore.FieldValue;

  await firestore
    .collection('account_deletions')
    .doc(uid)
    .set({
      requestedBy: uid,
      requestedAt: FieldValue
        ? FieldValue.serverTimestamp()
        : new Date(),
    });

  return true;
}

/* ------------------------------------------------------------------ */
/* Core function: single write path for users/{uid} */
/* ------------------------------------------------------------------ */

/**
 * Centralized, safe Firestore sync for authenticated users.
 * Handles OAuth linking delays, token refresh, retries, and
 * idempotent writes.
 */
export async function syncUserToFirestore(user: any) {
  if (!user || !user.uid) return null;

  const uid = user.uid;

  const fsMod = tryGetFirestore();
  if (!fsMod) {
    console.debug('syncUserToFirestore: firestore not available');
    return null;
  }

  /* -------------------------------------------------------------- */
  /* Ensure auth token is fresh (important right after linking) */
  /* -------------------------------------------------------------- */

  try {
    const authMod = tryGetAuth();
    if (authMod) {
      const auth = authMod.default ? authMod.default() : authMod();
      const start = Date.now();
      const timeoutMs = 6000;

      while (Date.now() - start < timeoutMs) {
        const current = auth.currentUser;
        if (current && current.uid === uid) {
          if (typeof current.getIdToken === 'function') {
            await current.getIdToken(true);
          }
          break;
        }

        // Best-effort refresh on provided user
        if (typeof user.getIdToken === 'function') {
          user.getIdToken(true).catch(() => {});
        }

        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 250));
      }
    }
  } catch (e) {
    console.debug('syncUserToFirestore: token refresh failed', e);
  }

  /* -------------------------------------------------------------- */
  /* Firestore write */
  /* -------------------------------------------------------------- */

  const firestore = fsMod.default ? fsMod.default() : fsMod();
  const FieldValue = firestore.FieldValue || null;

  const userRef = firestore.collection('users').doc(uid);

  const providers: string[] = Array.isArray(user.providerData)
    ? Array.from(
        new Set(
          user.providerData
            .map((p: any) => p?.providerId)
            .filter(Boolean)
        )
      )
    : [];

  const baseData: UserDoc = {
    uid,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    photoURL: user.photoURL ?? null,
    emailVerified: !!user.emailVerified,
    providers,
    updatedAt: FieldValue
      ? FieldValue.serverTimestamp()
      : new Date(),
  };

  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await userRef.set(
        {
          ...baseData,
          createdAt: FieldValue
            ? FieldValue.serverTimestamp()
            : new Date(),
        },
        { merge: true }
      );
      return userRef;
    } catch (err) {
      console.debug('syncUserToFirestore: write failed', {
        attempt,
        err: err?.message || err,
      });
      if (attempt === maxAttempts) throw err;
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* Default export (optional convenience) */
/* ------------------------------------------------------------------ */

export default {
  createOrUpdateUserFromAuth,
  ensureUserDocumentForCurrentUser,
  deleteUserFromFirestore,
  requestAccountDeletion,
  syncUserToFirestore,
};

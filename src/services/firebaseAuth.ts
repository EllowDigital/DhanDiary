import AsyncStorage from '@react-native-async-storage/async-storage';
import { wipeUserData } from './localDb';

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
const CURRENT_KEY = 'local:currentUser';

let listeners: Array<(u: any | null) => void> = [];

function generateId() {

  await setCurrent(rec);
};

export const changePassword = async (currentPassword: string, newPassword: string) => {
  const curRaw = await AsyncStorage.getItem(CURRENT_KEY);
  if (!curRaw) throw new Error('No authenticated user');
  const cur: LocalUserRecord = JSON.parse(curRaw);
  import AsyncStorage from '@react-native-async-storage/async-storage';
  import { wipeUserData } from './localDb';

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
  const CURRENT_KEY = 'local:currentUser';
  const PENDING_KEY = 'local:pendingCredentials';

  let listeners: Array<(u: LocalUserRecord | null) => void> = [];

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
    listeners.push(cb);
    // call immediately with current value
    (async () => cb(await getCurrent()))();
    return () => {
      listeners = listeners.filter((x) => x !== cb);
    };
  };

  export const registerWithEmail = async (name: string, email: string, password: string) => {
    const users = await readUsers();
    const exists = Object.values(users).find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (exists) {
      const err: any = new Error('auth/email-already-in-use');
      err.code = 'auth/email-already-in-use';
      throw err;
    }
    const uid = genId();
    const rec: LocalUserRecord = {
      uid,
      name: name || '',
      email: email.trim().toLowerCase(),
      password,
      providers: ['password'],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    users[uid] = rec;
    await writeUsers(users);
    await setCurrent(rec);
    // consume any pending credential for this email (best-effort)
    try {
      await consumePendingCredentialForCurrentUser();
    } catch (e) {
      // ignore
    }
    return rec;
  };

  export const loginWithEmail = async (email: string, password: string) => {
    const users = await readUsers();
    const found = Object.values(users).find((u) => u.email === email.trim().toLowerCase());
    if (!found) {
      const err: any = new Error('auth/user-not-found');
      err.code = 'auth/user-not-found';
      throw err;
    }
    if (found.password !== password) {
      const err: any = new Error('auth/wrong-password');
      err.code = 'auth/wrong-password';
      throw err;
    }
    await setCurrent(found);
    // attempt to consume pending credential
    try {
      await consumePendingCredentialForCurrentUser();
    } catch (e) {
      // ignore
    }
    return found;
  };

  export const sendPasswordReset = async (email: string) => {
    const users = await readUsers();
    const found = Object.values(users).find((u) => u.email === email.trim().toLowerCase());
    if (!found) {
      const err: any = new Error('auth/user-not-found');
      err.code = 'auth/user-not-found';
      throw err;
    }
    // No real email is sent in local mode; simulate success.
    return;
  };

  export const logoutUser = async () => {
    await setCurrent(null);
  };

  export const signInWithFirebaseCredential = async (_credential: any) => {
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
    const cur = await getCurrent();
    if (!cur) throw new Error('No authenticated user');
    const users = await readUsers();
    const rec = users[cur.uid];
    if (!rec) throw new Error('User record not found');
    if (payload.name) rec.name = payload.name;
    if (payload.email) rec.email = payload.email.trim().toLowerCase();
    rec.updatedAt = nowIso();
    users[cur.uid] = rec;
    await writeUsers(users);
    await setCurrent(rec);
    return rec;
  };

  export const changePassword = async (currentPassword: string, newPassword: string) => {
    const cur = await getCurrent();
    if (!cur) throw new Error('No authenticated user');
    const users = await readUsers();
    const rec = users[cur.uid];
    if (!rec) throw new Error('User record not found');
    if (rec.password !== currentPassword) {
      const err: any = new Error('auth/wrong-password');
      err.code = 'auth/wrong-password';
      throw err;
    }
    rec.password = newPassword;
    rec.updatedAt = nowIso();
    users[cur.uid] = rec;
    await writeUsers(users);
    await setCurrent(rec);
  };

  export const deleteAccount = async (currentPassword?: string) => {
    const cur = await getCurrent();
    if (!cur) return;
    const users = await readUsers();
    const rec = users[cur.uid];
    if (!rec) return;
    if (currentPassword && rec.password !== currentPassword) {
      const err: any = new Error('auth/wrong-password');
      err.code = 'auth/wrong-password';
      throw err;
    }
    delete users[cur.uid];
    await writeUsers(users);
    try {
      await wipeUserData(cur.uid);
    } catch (e) {
      // ignore
    }
    await setCurrent(null);
  };

  export const storePendingCredential = async (email: string, credential: any) => {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, any>) : {};
    map[email.toLowerCase()] = credential;
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(map));
  };

  export const clearPendingCredential = async (email: string) => {
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
    const map = JSON.parse(raw) as Record<string, any>;
    const cred = map[cur.email.toLowerCase()];
    if (!cred) return null;
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
    signInWithFirebaseCredential,
    linkCurrentUserWithCredential,
    updateProfileDetails,
    changePassword,
    deleteAccount,
    storePendingCredential,
    clearPendingCredential,
    consumePendingCredentialForCurrentUser,
  };
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
  // Delete user subcollections (cash_entries) in batches to avoid OOM and security errors
  try {
    const colRef = collection(db, 'users', user.uid, 'cash_entries');
    let last: any = undefined;
    const PAGE = 500;
    while (true) {
      const q = last
        ? query(colRef, orderBy('createdAt', 'desc'), startAfter(last), limit(PAGE))
        : query(colRef, orderBy('createdAt', 'desc'), limit(PAGE));
      const snap = await getDocs(q);
      if (!snap || !snap.docs || snap.docs.length === 0) break;
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      if (snap.docs.length < PAGE) break;
      last = snap.docs[snap.docs.length - 1];
    }
  } catch (err) {
    console.warn('Failed to delete cash_entries subcollection for user', user.uid, err);
  }

  // Delete top-level user doc
  try {
    await deleteDoc(doc(db, 'users', user.uid));
  } catch (err) {
    console.warn('Failed to delete user profile doc', user.uid, err);
  }

  // Finally delete the Auth user
  await deleteUser(user);
};

// Google AuthSession code removed. Use only Firebase-native Google login elsewhere.

const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

type GithubDeviceCodePayload = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval: number;
  error?: string;
  error_description?: string;
};

type GithubTokenPayload = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

const requestGithubDeviceCode = async (clientId: string): Promise<GithubDeviceCodePayload> => {
  const response = await fetch(GITHUB_DEVICE_CODE_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      scope: 'read:user user:email',
    }).toString(),
  });
  const payload: GithubDeviceCodePayload = await response.json();
  if (!response.ok || payload.error) {
    throw new Error(payload.error_description || 'Failed to start GitHub login.');
  }
  return payload;
};

const promptGithubVerification = (
  userCode: string,
  verificationUri: string,
  verificationUriComplete: string | undefined,
  intent: 'signIn' | 'link'
) =>
  new Promise<void>((resolve, reject) => {
    Alert.alert(
      'GitHub Verification',
      `Tap Continue to open GitHub and ${intent === 'link' ? 'approve the link' : 'sign in'} with code ${userCode}.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => reject(new Error('GitHub login cancelled by user.')),
        },
        {
          text: 'Continue',
          onPress: () => {
            const target = verificationUriComplete || verificationUri;
            Linking.openURL(target).catch((err) =>
              console.warn('Failed to open GitHub verification page', err)
            );
            resolve();
          },
        },
      ],
      { cancelable: false }
    );
  });

const pollGithubAccessToken = async (
  clientId: string,
  deviceCode: string,
  expiresIn: number,
  intervalSeconds: number,
  shouldAbort: () => boolean
) => {
  const startedAt = Date.now();
  let delaySeconds = Math.max(intervalSeconds, 5);

  while (Date.now() - startedAt < expiresIn * 1000) {
    if (shouldAbort()) {
      throw new Error('GitHub login cancelled.');
    }

    await sleep(delaySeconds * 1000);

    if (shouldAbort()) {
      throw new Error('GitHub login cancelled.');
    }

    const response = await fetch(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        device_code: deviceCode,
        grant_type: GITHUB_DEVICE_GRANT,
      }).toString(),
    });

    const payload: GithubTokenPayload = await response.json();
    if (payload.access_token) {
      return payload.access_token;
    }

    if (!payload.error) {
      continue;
    }

    switch (payload.error) {
      case 'authorization_pending':
        continue;
      case 'slow_down':
        delaySeconds += 5;
        continue;
      case 'expired_token':
        throw new Error('GitHub code expired. Please try again.');
      case 'access_denied':
        throw new Error('GitHub sign-in was denied.');
      default:
        throw new Error(payload.error_description || 'GitHub device flow failed.');
    }
  }

  throw new Error('GitHub login timed out. Please try again.');
};

/* ---------------------------------------------
 * GitHub Device Flow Hook
 * ------------------------------------------- */
export const useGithubAuth = () => {
  const extra = getExtra();
  const clientId = extra?.oauth?.githubClientId;
  const githubAvailable = !!clientId;
  const isExpoGo = Constants?.appOwnership === 'expo';
  const abortRef = useRef(false);
  const intentRef = useRef<'signIn' | 'link' | null>(null);

  useEffect(() => {
    abortRef.current = false;
    return () => {
      abortRef.current = true;
      intentRef.current = null;
    };
  }, []);

  const ensureSupportedEnvironment = () => {
    if (isExpoGo) {
      throw new Error('GitHub sign-in requires an EAS dev client or production build.');
    }
  };

  const runFlow = async (intent: 'signIn' | 'link') => {
    if (!githubAvailable || !clientId) {
      throw new Error('GitHub sign-in is not configured for this build.');
    }
    ensureSupportedEnvironment();

    abortRef.current = false;
    intentRef.current = intent;

    try {
      const devicePayload = await requestGithubDeviceCode(clientId);
      await promptGithubVerification(
        devicePayload.user_code,
        devicePayload.verification_uri,
        devicePayload.verification_uri_complete,
        intent
      );

      const accessToken = await pollGithubAccessToken(
        clientId,
        devicePayload.device_code,
        devicePayload.expires_in,
        devicePayload.interval,
        () => abortRef.current
      );

      const credential = GithubAuthProvider.credential(accessToken);
      if (intent === 'link') {
        await linkCurrentUserWithCredential(credential);
      } else {
        await signInWithFirebaseCredential(credential);
      }
    } finally {
      intentRef.current = null;
    }
  };

  return {
    githubAvailable,
    signIn: () => runFlow('signIn'),
    linkAccount: () => runFlow('link'),
  };
};

// Non-hook programmatic GitHub sign-in helper (same device flow as the hook, usable from event handlers)
export async function startGithubSignIn(intent: 'signIn' | 'link' = 'signIn') {
  const extra = getExtra();
  const clientId = extra?.oauth?.githubClientId;
  const githubAvailable = !!clientId;
  const isExpoGo = Constants?.appOwnership === 'expo';

  if (!githubAvailable || !clientId) {
    throw new Error('GitHub sign-in is not configured for this build.');
  }
  if (isExpoGo) {
    throw new Error('GitHub sign-in requires an EAS dev client or production build.');
  }

  const devicePayload = await requestGithubDeviceCode(clientId);
  await promptGithubVerification(
    devicePayload.user_code,
    devicePayload.verification_uri,
    devicePayload.verification_uri_complete,
    intent
  );

  const accessToken = await pollGithubAccessToken(
    clientId,
    devicePayload.device_code,
    devicePayload.expires_in,
    devicePayload.interval,
    () => false
  );

  const credential = GithubAuthProvider.credential(accessToken);
  if (intent === 'link') {
    await linkCurrentUserWithCredential(credential);
  } else {
    await signInWithFirebaseCredential(credential);
  }
}

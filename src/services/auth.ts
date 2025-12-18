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
  signInWithCredential,
  linkCurrentUserWithCredential,
  updateProfileDetails,
  changePassword,
  deleteAccount,
  storePendingCredential,
  clearPendingCredential,
  consumePendingCredentialForCurrentUser,
};

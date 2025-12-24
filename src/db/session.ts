import AsyncStorage from '../utils/AsyncStorageWrapper';
import { notifySessionChanged } from '../utils/sessionEvents';

export type Session = {
  id: string; // internal UUID used by app for Neon queries
  name: string;
  email: string;
  clerk_id?: string | null; // original Clerk id when available
} | null;

const KEY = 'FALLBACK_SESSION';

const uuidValidate = (s: any) =>
  typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);

const uuidv4 = () => {
  const hex = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
  return `${hex()}${hex()}-${hex()}-${hex()}-${hex()}-${hex()}${hex()}${hex()}`;
};

export const getSession = async (): Promise<Session> => {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch (e) {
    return null;
  }
};

/**
 * Persist a session. If `id` is not a valid UUID (e.g., Clerk id or temporary
 * token), we generate an internal UUID and store the original value under
 * `clerk_id` so Neon queries always receive a valid UUID.
 */
export const saveSession = async (id: string, name: string, email: string) => {
  try {
    let payload: any = { name: name || '', email: email || '' };
    if (uuidValidate(id)) {
      payload.id = id;
    } else {
      payload.id = uuidv4();
      payload.clerk_id = id;
    }
    await AsyncStorage.setItem(KEY, JSON.stringify(payload));
    try {
      notifySessionChanged();
    } catch (e) {}
  } catch (e) {
    console.error('[Session] Failed to save session', e);
  }
};

export const clearSession = async () => {
  try {
    await AsyncStorage.removeItem(KEY);
    try {
      notifySessionChanged();
    } catch (e) {}
  } catch (e) {
    console.warn('[Session] Failed to clear session', e);
  }
};

export default { getSession, saveSession, clearSession };

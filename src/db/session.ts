import AsyncStorage from '../utils/AsyncStorageWrapper';
import { notifySessionChanged } from '../utils/sessionEvents';

export type Session = { id: string; name: string; email: string } | null;

const KEY = 'FALLBACK_SESSION';

export const getSession = async (): Promise<Session> => {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
};

export const saveSession = async (id: string, name: string, email: string) => {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify({ id, name, email }));
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

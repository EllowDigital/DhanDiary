import * as SecureStore from 'expo-secure-store';
import AsyncStorage from './AsyncStorageWrapper';

const TOKEN_KEYS_INDEX = 'TOKEN_CACHE_KEYS_V1';

const addKeyToIndex = async (key: string) => {
  try {
    const raw = await AsyncStorage.getItem(TOKEN_KEYS_INDEX);
    const prev = raw ? (JSON.parse(raw) as string[]) : [];
    if (prev.includes(key)) return;
    prev.push(key);
    await AsyncStorage.setItem(TOKEN_KEYS_INDEX, JSON.stringify(prev));
  } catch (e) {
    // best-effort
  }
};

export const clearTokenCache = async () => {
  try {
    const raw = await AsyncStorage.getItem(TOKEN_KEYS_INDEX);
    const keys = raw ? (JSON.parse(raw) as string[]) : [];
    for (const k of keys) {
      try {
        await SecureStore.deleteItemAsync(k);
      } catch (e) {
        // ignore
      }
    }
  } catch (e) {
    // ignore
  }

  try {
    await AsyncStorage.removeItem(TOKEN_KEYS_INDEX);
  } catch (e) {
    // ignore
  }
};

const tokenCache = {
  async getToken(key: string) {
    try {
      return SecureStore.getItemAsync(key);
    } catch (err) {
      return null;
    }
  },
  async saveToken(key: string, value: string) {
    try {
      await addKeyToIndex(key);
      return SecureStore.setItemAsync(key, value);
    } catch (err) {
      return;
    }
  },
};

export default tokenCache;

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from './AsyncStorageWrapper';

const PREFIX = 'BIOMETRIC_ENABLED:';
const BIOMETRIC_KEYS_INDEX = 'BIOMETRIC_KEYS_V1';

// Serialize updates to the biometric keys index to avoid concurrent read-modify-write races.
let biometricKeysIndexQueue: Promise<void> = Promise.resolve();

const addBiometricKeyToIndex = async (key: string) => {
  biometricKeysIndexQueue = biometricKeysIndexQueue
    .then(async () => {
      try {
        const raw = await AsyncStorage.getItem(BIOMETRIC_KEYS_INDEX);
        const prev = raw ? (JSON.parse(raw) as string[]) : [];
        if (prev.includes(key)) return;
        prev.push(key);
        await AsyncStorage.setItem(BIOMETRIC_KEYS_INDEX, JSON.stringify(prev));
      } catch (e) {
        // best-effort
      }
    })
    .catch(() => {
      // keep chain intact
    });

  return biometricKeysIndexQueue;
};

export const clearBiometricSettings = async () => {
  try {
    const raw = await AsyncStorage.getItem(BIOMETRIC_KEYS_INDEX);
    const keys = raw ? (JSON.parse(raw) as string[]) : [];
    for (const k of keys) {
      try {
        await SecureStore.deleteItemAsync(k);
      } catch (e) {}
      try {
        await AsyncStorage.removeItem(k);
      } catch (e) {}
    }
  } catch (e) {
    // ignore
  }
  try {
    await AsyncStorage.removeItem(BIOMETRIC_KEYS_INDEX);
  } catch (e) {}
};

export const biometricEnabledKey = (userId: string) => `${PREFIX}${userId}`;

export const getBiometricEnabled = async (userId: string): Promise<boolean> => {
  const key = biometricEnabledKey(userId);

  // Prefer SecureStore when available.
  try {
    const v = await SecureStore.getItemAsync(key);
    if (v != null) return v === 'true';
  } catch (e) {
    // fall back
  }

  try {
    const v = await AsyncStorage.getItem(key);
    return v === 'true';
  } catch (e) {
    return false;
  }
};

export const setBiometricEnabled = async (userId: string, enabled: boolean): Promise<void> => {
  const key = biometricEnabledKey(userId);

  // Write to SecureStore first.
  let secureOk = false;
  try {
    await addBiometricKeyToIndex(key);
    if (enabled) await SecureStore.setItemAsync(key, 'true');
    else await SecureStore.deleteItemAsync(key);
    secureOk = true;
  } catch (e) {
    secureOk = false;
  }

  // Also write to AsyncStorage fallback so the setting can still persist
  // in environments where SecureStore is unavailable.
  try {
    if (enabled) await AsyncStorage.setItem(key, 'true');
    else await AsyncStorage.removeItem(key);
  } catch (e) {
    // ignore
  }

  // If SecureStore succeeded, prefer it as the single source of truth.
  // (We keep the fallback value anyway; reads prefer SecureStore.)
  if (secureOk) return;
};

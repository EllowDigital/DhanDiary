import * as SecureStore from 'expo-secure-store';
import AsyncStorage from './AsyncStorageWrapper';

const PREFIX = 'BIOMETRIC_ENABLED:';

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

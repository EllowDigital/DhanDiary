import * as Updates from 'expo-updates';
import AsyncStorage from '../utils/AsyncStorageWrapper';

const STORAGE_KEY = 'last_ota_update_check_at';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    const res = await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timeout = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
    return res as T | null;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

export const checkForOtaUpdateAvailable = async (timeoutMs = 2000): Promise<boolean> => {
  try {
    if (!Updates.isEnabled) return false;
    if (typeof Updates.checkForUpdateAsync !== 'function') return false;

    const result = await withTimeout(Updates.checkForUpdateAsync(), timeoutMs);
    return Boolean(result && (result as any).isAvailable);
  } catch (e) {
    return false;
  }
};

// Background update strategy:
// - Never blocks app launch
// - Fetches OTA updates quietly
// - Applies on next app restart (no reloadAsync here)
export const runBackgroundUpdateCheck = async (): Promise<void> => {
  try {
    // Expo Go / dev clients may have updates disabled.
    if (!Updates.isEnabled) return;

    // Avoid doing this too often; it can slow down cold starts on weak networks.
    try {
      const last = await AsyncStorage.getItem(STORAGE_KEY);
      const lastMs = last ? Number(last) : 0;
      if (Number.isFinite(lastMs) && lastMs > 0) {
        const age = Date.now() - lastMs;
        if (age >= 0 && age < SIX_HOURS_MS) return;
      }
    } catch (e) {
      // ignore
    }

    try {
      await AsyncStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch (e) {
      // ignore
    }

    const result = await Updates.checkForUpdateAsync();
    if (!result.isAvailable) return;

    await Updates.fetchUpdateAsync();
  } catch (e) {
    // Fail silently: no UI, no throws.
  }
};

export const runBackgroundUpdateCheckWithResult = async (): Promise<{
  fetched: boolean;
}> => {
  try {
    if (!Updates.isEnabled) return { fetched: false };

    // Same throttle behavior as the background check.
    try {
      const last = await AsyncStorage.getItem(STORAGE_KEY);
      const lastMs = last ? Number(last) : 0;
      if (Number.isFinite(lastMs) && lastMs > 0) {
        const age = Date.now() - lastMs;
        if (age >= 0 && age < SIX_HOURS_MS) return { fetched: false };
      }
    } catch (e) {
      // ignore
    }

    try {
      await AsyncStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch (e) {
      // ignore
    }

    const result = await Updates.checkForUpdateAsync();
    if (!result.isAvailable) return { fetched: false };

    await Updates.fetchUpdateAsync();
    return { fetched: true };
  } catch (e) {
    return { fetched: false };
  }
};

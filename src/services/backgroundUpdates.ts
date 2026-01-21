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

const isUpdatesEnabled = (): boolean =>
  !!Updates.isEnabled && typeof Updates.checkForUpdateAsync === 'function';

let checkInFlight: Promise<boolean> | null = null;
let fetchInFlight: Promise<boolean> | null = null;
let reloadInFlight: Promise<boolean> | null = null;

export const checkForOtaUpdateAvailable = async (timeoutMs = 2000): Promise<boolean> => {
  if (!isUpdatesEnabled()) return false;
  if (checkInFlight) return checkInFlight;

  checkInFlight = (async () => {
    try {
      const result = await withTimeout(Updates.checkForUpdateAsync(), timeoutMs);
      return Boolean(result && (result as any).isAvailable);
    } catch (e) {
      return false;
    } finally {
      checkInFlight = null;
    }
  })();

  return checkInFlight;
};

export const fetchOtaUpdate = async (): Promise<boolean> => {
  if (!isUpdatesEnabled()) return false;
  if (fetchInFlight) return fetchInFlight;

  fetchInFlight = (async () => {
    try {
      await Updates.fetchUpdateAsync();
      return true;
    } catch (e) {
      return false;
    } finally {
      fetchInFlight = null;
    }
  })();

  return fetchInFlight;
};

export const reloadOtaUpdate = async (): Promise<boolean> => {
  if (!isUpdatesEnabled()) return false;
  if (reloadInFlight) return reloadInFlight;

  reloadInFlight = (async () => {
    try {
      await Updates.reloadAsync();
      return true;
    } catch (e) {
      return false;
    } finally {
      reloadInFlight = null;
    }
  })();

  return reloadInFlight;
};

export const applyOtaUpdateAndReload = async (options?: {
  checkBeforeFetch?: boolean;
  timeoutMs?: number;
}): Promise<boolean> => {
  if (!isUpdatesEnabled()) return false;

  const checkBeforeFetch = options?.checkBeforeFetch ?? true;
  const timeoutMs = options?.timeoutMs ?? 2500;

  if (checkBeforeFetch) {
    const available = await checkForOtaUpdateAvailable(timeoutMs);
    if (!available) return false;
  }

  const fetched = await fetchOtaUpdate();
  if (!fetched) return false;

  return reloadOtaUpdate();
};

// Background update strategy:
// - Never blocks app launch
// - Fetches OTA updates quietly
// - Applies on next app restart (no reloadAsync here)
export const runBackgroundUpdateCheck = async (): Promise<void> => {
  try {
    // Expo Go / dev clients may have updates disabled.
    if (!isUpdatesEnabled()) return;

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

    const available = await checkForOtaUpdateAvailable(2500);
    if (!available) return;

    await fetchOtaUpdate();
  } catch (e) {
    // Fail silently: no UI, no throws.
  }
};

export const runBackgroundUpdateCheckWithResult = async (): Promise<{
  fetched: boolean;
}> => {
  try {
    if (!isUpdatesEnabled()) return { fetched: false };

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

    const available = await checkForOtaUpdateAvailable(2500);
    if (!available) return { fetched: false };

    const fetched = await fetchOtaUpdate();
    return { fetched };
  } catch (e) {
    return { fetched: false };
  }
};

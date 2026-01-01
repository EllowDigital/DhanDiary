import * as Updates from 'expo-updates';
import AsyncStorage from '../utils/AsyncStorageWrapper';

const STORAGE_KEY = 'last_ota_update_check_at';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

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

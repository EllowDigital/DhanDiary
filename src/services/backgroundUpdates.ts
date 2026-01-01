import * as Updates from 'expo-updates';

// Background update strategy:
// - Never blocks app launch
// - Fetches OTA updates quietly
// - Applies on next app restart (no reloadAsync here)
export const runBackgroundUpdateCheck = async (): Promise<void> => {
  try {
    // Expo Go / dev clients may have updates disabled.
    if (!Updates.isEnabled) return;

    const result = await Updates.checkForUpdateAsync();
    if (!result.isAvailable) return;

    await Updates.fetchUpdateAsync();
  } catch (e) {
    // Fail silently: no UI, no throws.
  }
};

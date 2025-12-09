import AsyncStorage from '../utils/AsyncStorageWrapper';

const OWNER_KEY = 'offline_db_owner_v1';

export const getOfflineDbOwner = async (): Promise<string | null> => {
  try {
    return (await AsyncStorage.getItem(OWNER_KEY)) || null;
  } catch (e) {
    return null;
  }
};

export const setOfflineDbOwner = async (userId: string) => {
  try {
    await AsyncStorage.setItem(OWNER_KEY, userId);
  } catch (e) {
    // ignore — owner hint is best-effort
  }
};

export const clearOfflineDbOwner = async () => {
  try {
    await AsyncStorage.removeItem(OWNER_KEY);
  } catch (e) {
    // ignore — owner hint is best-effort
  }
};

export default {
  getOfflineDbOwner,
  setOfflineDbOwner,
  clearOfflineDbOwner,
};

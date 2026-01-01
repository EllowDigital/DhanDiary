import AsyncStorage from '../utils/AsyncStorageWrapper';
import { ANNOUNCEMENT_ID } from './announcementConfig';

const STORAGE_KEY = 'last_seen_announcement_id';

export const getLastSeenAnnouncementId = async (): Promise<string | null> => {
  try {
    const v = await AsyncStorage.getItem(STORAGE_KEY);
    return v ? String(v) : null;
  } catch (e) {
    return null;
  }
};

export const shouldShowCurrentAnnouncement = async (): Promise<boolean> => {
  const lastSeen = await getLastSeenAnnouncementId();
  return lastSeen !== ANNOUNCEMENT_ID;
};

export const markCurrentAnnouncementSeen = async (): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, ANNOUNCEMENT_ID);
  } catch (e) {
    // best-effort; if this fails, announcement may reappear next launch (acceptable)
  }
};

export const __TESTING__ = {
  STORAGE_KEY,
};

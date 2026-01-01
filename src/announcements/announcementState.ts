import AsyncStorage from '../utils/AsyncStorageWrapper';
import type { AnnouncementConfig } from './announcementConfig';
import { ANNOUNCEMENT_ID, getActiveAnnouncement } from './announcementConfig';

const STORAGE_KEY = 'last_seen_announcement_id';

let sessionDismissedAnnouncementIds = new Set<string>();

export const getCurrentAnnouncement = (now: Date = new Date()): AnnouncementConfig | null => {
  return getActiveAnnouncement(now);
};

export const getLastSeenAnnouncementId = async (): Promise<string | null> => {
  try {
    const v = await AsyncStorage.getItem(STORAGE_KEY);
    return v ? String(v) : null;
  } catch (e) {
    return null;
  }
};

export const shouldShowCurrentAnnouncement = async (now: Date = new Date()): Promise<boolean> => {
  const current = getCurrentAnnouncement(now);
  if (!current) return false;

  if (current.type === 'critical') {
    return !sessionDismissedAnnouncementIds.has(current.id);
  }

  const lastSeen = await getLastSeenAnnouncementId();
  return lastSeen !== current.id;
};

export const markCurrentAnnouncementSeen = async (now: Date = new Date()): Promise<void> => {
  const current = getCurrentAnnouncement(now);
  if (!current) return;

  // Critical announcements are only dismissible for the current session.
  if (current.type === 'critical') {
    sessionDismissedAnnouncementIds.add(current.id);
    return;
  }

  try {
    await AsyncStorage.setItem(STORAGE_KEY, current.id);
  } catch (e) {
    // best-effort; if this fails, announcement may reappear next launch (acceptable)
  }
};

export const __TESTING__ = {
  STORAGE_KEY,
  resetSessionDismissals() {
    sessionDismissedAnnouncementIds = new Set<string>();
  },
  setSessionDismissed(ids: string[]) {
    sessionDismissedAnnouncementIds = new Set(ids);
  },
  // Backward-compat shim for older test expectations.
  ANNOUNCEMENT_ID,
};

import AsyncStorage from '../utils/AsyncStorageWrapper';
import type { AnnouncementConfig } from './announcementConfig';
import {
  ANNOUNCEMENT_ID,
  getActiveAnnouncement,
  OTA_UPDATE_ANNOUNCEMENT,
  isAnnouncementActiveForLocalDate,
} from './announcementConfig';
import { checkForOtaUpdateAvailable } from '../services/backgroundUpdates';

const STORAGE_KEY = 'last_seen_announcement_id';

let sessionDismissedAnnouncementIds = new Set<string>();

let cachedResolvedAnnouncement: { localYmd: string; value: AnnouncementConfig | null } | undefined =
  undefined;

const toLocalYmd = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getCurrentAnnouncementAsync = async (
  now: Date = new Date()
): Promise<AnnouncementConfig | null> => {
  const localYmd = toLocalYmd(now);
  if (cachedResolvedAnnouncement && cachedResolvedAnnouncement.localYmd === localYmd) {
    return cachedResolvedAnnouncement.value;
  }

  // Prefer OTA update prompt when available (and config is active for this date).
  try {
    if (isAnnouncementActiveForLocalDate(OTA_UPDATE_ANNOUNCEMENT, now)) {
      const available = await checkForOtaUpdateAvailable(2000);
      if (available) {
        cachedResolvedAnnouncement = { localYmd, value: OTA_UPDATE_ANNOUNCEMENT };
        return cachedResolvedAnnouncement.value;
      }
    }
  } catch (e) {
    // ignore
  }

  cachedResolvedAnnouncement = { localYmd, value: getActiveAnnouncement(now) };
  return cachedResolvedAnnouncement.value;
};

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
  const current = await getCurrentAnnouncementAsync(now);
  if (!current) return false;

  if (current.type === 'critical') {
    return !sessionDismissedAnnouncementIds.has(current.id);
  }

  const lastSeen = await getLastSeenAnnouncementId();
  return lastSeen !== current.id;
};

export const markCurrentAnnouncementSeen = async (now: Date = new Date()): Promise<void> => {
  const current = await getCurrentAnnouncementAsync(now);
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
    cachedResolvedAnnouncement = undefined;
  },
  setSessionDismissed(ids: string[]) {
    sessionDismissedAnnouncementIds = new Set(ids);
  },
  resetResolvedAnnouncementCache() {
    cachedResolvedAnnouncement = undefined;
  },
  // Backward-compat shim for older test expectations.
  ANNOUNCEMENT_ID,
};

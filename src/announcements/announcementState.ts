import AsyncStorage from '../utils/AsyncStorageWrapper';
import type { AnnouncementConfig } from './announcementConfig';
import {
  ANNOUNCEMENT_ID,
  getActiveAnnouncement,
  OTA_UPDATE_ANNOUNCEMENT,
  isAnnouncementActiveForLocalDate,
} from './announcementConfig';
import { checkForOtaUpdateAvailable } from '../services/backgroundUpdates';
import { getSession } from '../db/session';

// Legacy (global) key kept for backward compatibility.
const STORAGE_KEY = 'last_seen_announcement_id';
const STORAGE_KEY_PREFIX = `${STORAGE_KEY}:`;

let cachedScopedStorageKey:
  | {
      key: string;
      expiresAt: number;
    }
  | undefined;

const getScopedStorageKey = async (): Promise<string> => {
  const now = Date.now();
  if (cachedScopedStorageKey && cachedScopedStorageKey.expiresAt > now) {
    return cachedScopedStorageKey.key;
  }

  try {
    const session = await getSession();
    const userId = session?.id ? String(session.id) : 'anon';
    const key = `${STORAGE_KEY_PREFIX}${userId}`;
    cachedScopedStorageKey = { key, expiresAt: now + 5 * 60 * 1000 };
    return key;
  } catch (e) {
    const key = `${STORAGE_KEY_PREFIX}anon`;
    cachedScopedStorageKey = { key, expiresAt: now + 60 * 1000 };
    return key;
  }
};

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
    const scopedKey = await getScopedStorageKey();
    const scoped = await AsyncStorage.getItem(scopedKey);
    if (scoped) return String(scoped);

    // Fallback to legacy key for older installs.
    const legacy = await AsyncStorage.getItem(STORAGE_KEY);
    return legacy ? String(legacy) : null;
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
    const scopedKey = await getScopedStorageKey();
    await AsyncStorage.setItem(scopedKey, current.id);

    // Keep legacy key in sync so older app versions/tests still behave.
    if (scopedKey !== STORAGE_KEY) {
      await AsyncStorage.setItem(STORAGE_KEY, current.id);
    }
  } catch (e) {
    // best-effort; if this fails, announcement may reappear next launch (acceptable)
  }
};

export const __TESTING__ = {
  STORAGE_KEY,
  resetSessionDismissals() {
    sessionDismissedAnnouncementIds = new Set<string>();
    cachedResolvedAnnouncement = undefined;
    cachedScopedStorageKey = undefined;
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

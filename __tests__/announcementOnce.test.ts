import AsyncStorage from '../src/utils/AsyncStorageWrapper';
import { ANNOUNCEMENT_ID } from '../src/announcements/announcementConfig';
import {
  __TESTING__,
  getLastSeenAnnouncementId,
  markCurrentAnnouncementSeen,
  shouldShowCurrentAnnouncement,
} from '../src/announcements/announcementState';

describe('announcement show-once logic', () => {
  beforeEach(async () => {
    // Reset storage for deterministic tests
    if (typeof AsyncStorage.clear === 'function') {
      await AsyncStorage.clear();
    } else {
      await AsyncStorage.removeItem(__TESTING__.STORAGE_KEY);
    }
  });

  it('shows on fresh install (no last seen)', async () => {
    const shouldShow = await shouldShowCurrentAnnouncement();
    expect(shouldShow).toBe(true);
  });

  it('does not show again after seen', async () => {
    await markCurrentAnnouncementSeen();
    const lastSeen = await getLastSeenAnnouncementId();
    expect(lastSeen).toBe(ANNOUNCEMENT_ID);

    const shouldShow = await shouldShowCurrentAnnouncement();
    expect(shouldShow).toBe(false);
  });

  it('shows again when announcement id changes', async () => {
    // Simulate a previous announcement
    await AsyncStorage.setItem(__TESTING__.STORAGE_KEY, 'old_announcement');
    const shouldShow = await shouldShowCurrentAnnouncement();
    expect(shouldShow).toBe(true);
  });
});

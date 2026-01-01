import AsyncStorage from '../src/utils/AsyncStorageWrapper';
import {
  __TESTING__ as CONFIG_TESTING,
  type AnnouncementConfig,
} from '../src/announcements/announcementConfig';
import {
  __TESTING__,
  getLastSeenAnnouncementId,
  markCurrentAnnouncementSeen,
  shouldShowCurrentAnnouncement,
} from '../src/announcements/announcementState';

describe('announcement show-once logic', () => {
  const NOW = new Date(2026, 0, 1, 12, 0, 0);
  const TEST_ANNOUNCEMENT: AnnouncementConfig = {
    id: 'test_announcement',
    type: 'festival',
    title: 'Test',
    message: 'Test message',
    isActive: true,
  };

  beforeEach(async () => {
    // Reset storage for deterministic tests
    if (typeof AsyncStorage.clear === 'function') {
      await AsyncStorage.clear();
    } else {
      await AsyncStorage.removeItem(__TESTING__.STORAGE_KEY);
    }

    __TESTING__.resetSessionDismissals();
    CONFIG_TESTING.setAnnouncements([TEST_ANNOUNCEMENT]);
  });

  afterEach(() => {
    CONFIG_TESTING.resetAnnouncements();
  });

  it('shows on fresh install (no last seen)', async () => {
    const shouldShow = await shouldShowCurrentAnnouncement(NOW);
    expect(shouldShow).toBe(true);
  });

  it('does not show again after seen', async () => {
    await markCurrentAnnouncementSeen(NOW);
    const lastSeen = await getLastSeenAnnouncementId();
    expect(lastSeen).toBe(TEST_ANNOUNCEMENT.id);

    const shouldShow = await shouldShowCurrentAnnouncement(NOW);
    expect(shouldShow).toBe(false);
  });

  it('shows again when announcement id changes', async () => {
    // Simulate a previous announcement
    await AsyncStorage.setItem(__TESTING__.STORAGE_KEY, 'old_announcement');
    const shouldShow = await shouldShowCurrentAnnouncement(NOW);
    expect(shouldShow).toBe(true);
  });
});

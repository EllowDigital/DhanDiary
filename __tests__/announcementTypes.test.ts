import AsyncStorage from '../src/utils/AsyncStorageWrapper';
import {
  __TESTING__ as CONFIG_TESTING,
  getActiveAnnouncement,
  type AnnouncementConfig,
} from '../src/announcements/announcementConfig';
import {
  __TESTING__ as STATE_TESTING,
  getLastSeenAnnouncementId,
  markCurrentAnnouncementSeen,
  shouldShowCurrentAnnouncement,
} from '../src/announcements/announcementState';

describe('announcement types/date rules', () => {
  const NOW_IN_RANGE = new Date(2026, 0, 1, 12, 0, 0);
  const NOW_OUT_OF_RANGE = new Date(2026, 1, 1, 12, 0, 0);

  beforeEach(async () => {
    if (typeof AsyncStorage.clear === 'function') {
      await AsyncStorage.clear();
    } else {
      // Fallback: tests in this suite only rely on this specific key.
      await AsyncStorage.removeItem(STATE_TESTING.STORAGE_KEY);
    }

    STATE_TESTING.resetSessionDismissals();
  });

  afterEach(() => {
    CONFIG_TESTING.resetAnnouncements();
  });

  it('festival shows within inclusive date window, then respects show-once', async () => {
    const festival: AnnouncementConfig = {
      id: 'festival_1',
      type: 'festival',
      title: 'Festival',
      message: 'Celebrate',
      startDate: '2025-12-30',
      endDate: '2026-01-07',
      isActive: true,
    };

    CONFIG_TESTING.setAnnouncements([festival]);

    expect(await shouldShowCurrentAnnouncement(NOW_IN_RANGE)).toBe(true);
    await markCurrentAnnouncementSeen(NOW_IN_RANGE);
    expect(await shouldShowCurrentAnnouncement(NOW_IN_RANGE)).toBe(false);
  });

  it('festival does not show outside date window', async () => {
    const festival: AnnouncementConfig = {
      id: 'festival_2',
      type: 'festival',
      title: 'Festival',
      message: 'Celebrate',
      startDate: '2025-12-30',
      endDate: '2026-01-07',
      isActive: true,
    };

    CONFIG_TESTING.setAnnouncements([festival]);

    expect(await shouldShowCurrentAnnouncement(NOW_OUT_OF_RANGE)).toBe(false);
  });

  it('one_day shows only on the matching local date', async () => {
    const oneDay: AnnouncementConfig = {
      id: 'oneday_1',
      type: 'one_day',
      title: 'One Day',
      message: 'Only today',
      startDate: '2026-01-01',
      isActive: true,
    };

    CONFIG_TESTING.setAnnouncements([oneDay]);

    expect(await shouldShowCurrentAnnouncement(NOW_IN_RANGE)).toBe(true);
    expect(await shouldShowCurrentAnnouncement(NOW_OUT_OF_RANGE)).toBe(false);
  });

  it('critical ignores last-seen and is session-dismissible only', async () => {
    const critical: AnnouncementConfig = {
      id: 'critical_1',
      type: 'critical',
      title: 'Critical',
      message: 'Read this',
      isActive: true,
    };

    CONFIG_TESTING.setAnnouncements([critical]);

    // Even if storage says it was seen, critical should still show.
    await AsyncStorage.setItem(STATE_TESTING.STORAGE_KEY, critical.id);
    expect(await getLastSeenAnnouncementId()).toBe(critical.id);
    expect(await shouldShowCurrentAnnouncement(NOW_IN_RANGE)).toBe(true);

    // Dismiss for current session.
    await markCurrentAnnouncementSeen(NOW_IN_RANGE);
    expect(await shouldShowCurrentAnnouncement(NOW_IN_RANGE)).toBe(false);

    // Storage should not be altered by dismissing critical.
    expect(await getLastSeenAnnouncementId()).toBe(critical.id);

    // Simulate app restart (session state cleared): should show again.
    STATE_TESTING.resetSessionDismissals();
    expect(await shouldShowCurrentAnnouncement(NOW_IN_RANGE)).toBe(true);
  });

  it('critical stops showing when disabled via config', async () => {
    const critical: AnnouncementConfig = {
      id: 'critical_2',
      type: 'critical',
      title: 'Critical',
      message: 'Read this',
      isActive: false,
    };

    CONFIG_TESTING.setAnnouncements([critical]);
    expect(await shouldShowCurrentAnnouncement(NOW_IN_RANGE)).toBe(false);
  });

  it('keeps list order when active announcements tie on priority', () => {
    const a1: AnnouncementConfig = {
      id: 'a1',
      type: 'festival',
      title: 'A1',
      message: 'First',
      startDate: '2025-12-30',
      endDate: '2026-01-07',
      priority: 10,
      isActive: true,
    };

    const a2: AnnouncementConfig = {
      id: 'a2',
      type: 'festival',
      title: 'A2',
      message: 'Second',
      startDate: '2025-12-30',
      endDate: '2026-01-07',
      priority: 10,
      isActive: true,
    };

    CONFIG_TESTING.setAnnouncements([a1, a2]);
    expect(getActiveAnnouncement(NOW_IN_RANGE)?.id).toBe('a1');

    CONFIG_TESTING.setAnnouncements([a2, a1]);
    expect(getActiveAnnouncement(NOW_IN_RANGE)?.id).toBe('a2');
  });
});

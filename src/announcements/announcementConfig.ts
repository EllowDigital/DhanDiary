import { colors } from '../utils/design';

// IMPORTANT: Change this ID for every new announcement delivered via Expo Updates.
export const ANNOUNCEMENT_ID = 'new_year_2026';

export type AnnouncementType = 'festival' | 'one_day' | 'critical';

export type AnnouncementContent = {
  title: string;
  message: string;
  emoji?: string;
  // Optional auto-hide. Set to null/undefined to disable.
  autoHideMs?: number | null;
  accentColor?: string;
};

export type AnnouncementConfig = AnnouncementContent & {
  id: string;
  type: AnnouncementType;
  /**
   * Optional local-date window.
   * Format: YYYY-MM-DD
   * - festival: typically provide start+end (inclusive)
   * - one_day: typically provide start (or start=end)
   * - critical: optional
   */
  startDate?: string;
  endDate?: string;
  /** Default true. Use false to disable via Expo Update. */
  isActive?: boolean;
};

export const CURRENT_ANNOUNCEMENT: AnnouncementContent = {
  title: 'Happy New Year 2026',
  message: 'Wishing you a fresh start and a financially strong year ahead.',
  emoji: '🎉',
  autoHideMs: 4000,
  accentColor: colors.primary,
};

const DEFAULT_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    id: ANNOUNCEMENT_ID,
    type: 'festival',
    title: CURRENT_ANNOUNCEMENT.title,
    message: CURRENT_ANNOUNCEMENT.message,
    emoji: CURRENT_ANNOUNCEMENT.emoji,
    autoHideMs: CURRENT_ANNOUNCEMENT.autoHideMs,
    accentColor: CURRENT_ANNOUNCEMENT.accentColor,
    // Example: New Year window. Adjust per Expo Update.
    startDate: '2025-12-30',
    endDate: '2026-01-14',
    isActive: true,
  },
];

let announcements: AnnouncementConfig[] = DEFAULT_ANNOUNCEMENTS;

export const getAnnouncements = (): AnnouncementConfig[] => announcements;

const isValidYmd = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s);

const toLocalYmd = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const isActiveForLocalDate = (a: AnnouncementConfig, now: Date): boolean => {
  if (a.isActive === false) return false;

  const today = toLocalYmd(now);

  // If no dates are provided, treat as active (backward-compatible behavior).
  if (!a.startDate && !a.endDate) return true;

  if (a.startDate && !isValidYmd(a.startDate)) return false;
  if (a.endDate && !isValidYmd(a.endDate)) return false;

  if (a.type === 'one_day') {
    // For one_day, require a startDate; endDate is optional.
    if (!a.startDate) return false;
    return today === a.startDate;
  }

  // For festival/critical: if both bounds exist, use inclusive range.
  if (a.startDate && a.endDate) {
    return a.startDate <= today && today <= a.endDate;
  }

  // If only one bound exists, treat it as a single-day match.
  if (a.startDate) return today === a.startDate;
  if (a.endDate) return today === a.endDate;
  return false;
};

export const getActiveAnnouncement = (now: Date = new Date()): AnnouncementConfig | null => {
  const list = getAnnouncements();

  // Priority: first active critical, otherwise first active non-critical.
  const active = list.filter((a) => isActiveForLocalDate(a, now));
  const critical = active.find((a) => a.type === 'critical');
  return critical ?? active[0] ?? null;
};

export const __TESTING__ = {
  setAnnouncements(next: AnnouncementConfig[]) {
    announcements = next;
  },
  resetAnnouncements() {
    announcements = DEFAULT_ANNOUNCEMENTS;
  },
  toLocalYmd,
  isActiveForLocalDate,
};

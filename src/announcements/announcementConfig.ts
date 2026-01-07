import { colors } from '../utils/design';

// IMPORTANT: Change this ID for every new announcement delivered via Expo Updates.
export const ANNOUNCEMENT_ID = 'jan_festivals_2026';

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
   * Optional priority when multiple announcements are active.
   * Higher wins. If equal/undefined, list order wins (backward-compatible).
   */
  priority?: number;
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
  autoHideMs: 5000,
  accentColor: colors.primary,
};

// OTA update announcement (shown only when an update is actually available).
// Configure via Expo Updates by changing its id, dates, type, and content.
export const OTA_UPDATE_ANNOUNCEMENT: AnnouncementConfig = {
  id: 'ota_update_prompt_2026_01',
  // Use 'critical' if you want it to show every launch until disabled.
  type: 'festival',
  title: 'Update Available',
  message: 'A new version is ready. Tap Update to install now.',
  emoji: '⬆️',
  autoHideMs: null,
  accentColor: colors.primary,
  // Optional window; keep empty to allow any day.
  // startDate: '2026-01-01',
  // endDate: '2026-01-31',
  isActive: true,
};

const DEFAULT_ANNOUNCEMENTS: AnnouncementConfig[] = [
  // Priority rule: when multiple announcements are active, we show the first one
  // in this list (unless a 'critical' announcement is active).
  // Put specific one-day events first so they override broader festival ranges.

  // --- PRIORITY 1: Specific One-Day Events ---

  // Republic Day (Jan 26)
  {
    id: 'republic_day_2026',
    type: 'one_day',
    title: 'Happy Republic Day',
    message: 'Celebrating the spirit of India and our Constitution. Jai Hind!',
    emoji: '🇮🇳',
    autoHideMs: 5000,
    accentColor: colors.primary,
    startDate: '2026-01-26',
    endDate: '2026-01-26',
    isActive: true,
  },

  // Lohri (Jan 13)
  {
    id: 'lohri_2026',
    type: 'one_day',
    title: 'Happy Lohri',
    message: 'May the bonfire of Lohri burn all sadness and bring warmth and joy.',
    emoji: '🔥',
    autoHideMs: 5000,
    accentColor: colors.primary,
    startDate: '2026-01-13',
    endDate: '2026-01-13',
    isActive: true,
  },

  // National Youth Day (Jan 12)
  {
    id: 'youth_day_2026',
    type: 'one_day',
    title: 'National Youth Day',
    message: 'Arise, awake, and stop not till the goal is reached. - Swami Vivekananda',
    emoji: '📚',
    autoHideMs: 5000,
    accentColor: colors.primary,
    startDate: '2026-01-12',
    endDate: '2026-01-12',
    isActive: true,
  },

  // --- PRIORITY 2: Festival Windows / Multi-Day Events ---

  // Makar Sankranti / Pongal / Harvest Festivals Window (Jan 14 - Jan 17)
  {
    id: 'harvest_festivals_2026',
    type: 'festival',
    title: 'Happy Makar Sankranti & Pongal',
    message: 'Celebrating the harvest season with joy, kites, and sweet beginnings.',
    emoji: '🪁',
    autoHideMs: 5000,
    accentColor: colors.primary,
    startDate: '2026-01-14',
    endDate: '2026-01-17',
    isActive: true,
  },

  // New Year (Dec 31 - Jan 12)
  {
    id: ANNOUNCEMENT_ID,
    type: 'festival',
    title: CURRENT_ANNOUNCEMENT.title,
    message: CURRENT_ANNOUNCEMENT.message,
    emoji: CURRENT_ANNOUNCEMENT.emoji,
    autoHideMs: CURRENT_ANNOUNCEMENT.autoHideMs,
    accentColor: CURRENT_ANNOUNCEMENT.accentColor,
    startDate: '2025-12-31',
    endDate: '2026-01-11',
    isActive: true,
  },
];

let announcements: AnnouncementConfig[] = DEFAULT_ANNOUNCEMENTS;

export const getAnnouncements = (): AnnouncementConfig[] => announcements.slice();

const isValidYmd = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s);

const ymdToInt = (s: string): number | null => {
  if (!isValidYmd(s)) return null;
  // YYYY-MM-DD -> YYYYMMDD (safe numeric compare)
  const n = Number(s.replace(/-/g, ''));
  return Number.isFinite(n) ? n : null;
};

const toLocalYmd = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const isAnnouncementActiveForLocalDate = (a: AnnouncementConfig, now: Date): boolean => {
  if (a.isActive === false) return false;

  const today = toLocalYmd(now);
  const todayInt = ymdToInt(today);
  if (!todayInt) return false;

  // If no dates are provided, treat as active (backward-compatible behavior).
  if (!a.startDate && !a.endDate) return true;

  const startInt = a.startDate ? ymdToInt(a.startDate) : null;
  const endInt = a.endDate ? ymdToInt(a.endDate) : null;
  if (a.startDate && !startInt) return false;
  if (a.endDate && !endInt) return false;

  if (a.type === 'one_day') {
    // For one_day, require a startDate; endDate is optional.
    if (!a.startDate) return false;
    return startInt === todayInt;
  }

  // For festival/critical: if both bounds exist, use inclusive range.
  if (startInt && endInt) {
    if (startInt > endInt) return false;
    return startInt <= todayInt && todayInt <= endInt;
  }

  // If only one bound exists, treat it as a single-day match.
  if (startInt) return todayInt === startInt;
  if (endInt) return todayInt === endInt;
  return false;
};

export const getActiveAnnouncement = (now: Date = new Date()): AnnouncementConfig | null => {
  const list = getAnnouncements();

  // Single-pass selection for performance.
  // Priority: active critical wins; otherwise active non-critical.
  // Within each bucket, higher `priority` wins; ties keep list order.
  let bestCritical: AnnouncementConfig | null = null;
  let bestNonCritical: AnnouncementConfig | null = null;

  for (const a of list) {
    if (!isAnnouncementActiveForLocalDate(a, now)) continue;

    if (a.type === 'critical') {
      if (!bestCritical) {
        bestCritical = a;
      } else {
        const p = a.priority ?? 0;
        const bestP = bestCritical.priority ?? 0;
        if (p > bestP) bestCritical = a;
      }
      continue;
    }

    if (!bestNonCritical) {
      bestNonCritical = a;
      continue;
    }

    const p = a.priority ?? 0;
    const bestP = bestNonCritical.priority ?? 0;
    if (p > bestP) bestNonCritical = a;
  }

  return bestCritical ?? bestNonCritical;
};

const normalizeAnnouncements = (list: AnnouncementConfig[]): AnnouncementConfig[] => {
  const out: AnnouncementConfig[] = [];
  const seen = new Set<string>();

  for (const a of list || []) {
    const id = typeof a?.id === 'string' ? a.id.trim() : '';
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);

    // Guard against invalid date strings / inverted ranges.
    if (a.startDate && !isValidYmd(a.startDate)) continue;
    if (a.endDate && !isValidYmd(a.endDate)) continue;
    if (a.startDate && a.endDate) {
      const s = ymdToInt(a.startDate);
      const e = ymdToInt(a.endDate);
      if (s && e && s > e) continue;
    }

    out.push(a);
  }

  // In dev, warn if the config likely has mistakes.
  if (__DEV__) {
    const inputCount = Array.isArray(list) ? list.length : 0;
    if (out.length !== inputCount) {
      console.warn(
        `[announcements] normalized list from ${inputCount} -> ${out.length} (duplicates/invalid entries removed)`
      );
    }
  }

  return out;
};

export const __TESTING__ = {
  setAnnouncements(next: AnnouncementConfig[]) {
    announcements = normalizeAnnouncements(next);
  },
  resetAnnouncements() {
    announcements = DEFAULT_ANNOUNCEMENTS;
  },
  toLocalYmd,
  isActiveForLocalDate: isAnnouncementActiveForLocalDate,
};

// Normalize defaults once at module load (cheap) to avoid surprises in production.
announcements = normalizeAnnouncements(DEFAULT_ANNOUNCEMENTS);

import { colors } from '../utils/design';

// IMPORTANT: Change this ID for every new announcement delivered via Expo Updates.
export const ANNOUNCEMENT_ID = 'new_year_2026';

export type AnnouncementContent = {
  title: string;
  message: string;
  emoji?: string;
  // Optional auto-hide. Set to null/undefined to disable.
  autoHideMs?: number | null;
  accentColor?: string;
};

export const CURRENT_ANNOUNCEMENT: AnnouncementContent = {
  title: 'Happy New Year 2026',
  message: 'Wishing you a fresh start and a financially strong year ahead.',
  emoji: '🎉',
  autoHideMs: 4000,
  accentColor: colors.primary,
};

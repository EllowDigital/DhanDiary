export const spacing = (multiplier = 1) => 8 * multiplier;

export const colors = {
  // Light, modern neutral base
  background: '#F8FAFC',
  card: '#FFFFFF',
  softCard: '#EEF2FF',
  surfaceMuted: '#F1F5F9',

  // Brand
  primary: '#2563EB',
  primarySoft: '#E0E7FF',
  secondary: '#4F46E5',

  // Accents
  accentGreen: '#10B981',
  accentGreenSoft: '#D1FAE5',
  accentGreenBorder: '#A7F3D0',
  accentRed: '#EF4444',
  accentRedSoft: '#FEE2E2',
  accentRedBorder: '#FECACA',
  accentOrange: '#F59E0B',
  accentBlue: '#06B6D4',

  // Text
  text: '#0B1220',
  muted: '#64748B',
  mutedSoft: '#94A3B8',
  subtleText: '#475569',
  strongMuted: '#334155',

  // Lines / overlays
  border: '#E2E8F0',
  divider: '#EAF0F7',
  overlay: 'rgba(15, 23, 42, 0.06)',
  backdrop: 'rgba(15, 23, 42, 0.35)',
  white: '#FFFFFF',
  shadow: 'rgba(15, 23, 42, 0.08)',
};

export const shadows = {
  small: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
  },
  large: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 8,
  },
};

export const fonts = {
  heading: 'Inter',
  body: 'Inter',
};

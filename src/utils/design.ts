export const spacing = (multiplier = 1) => 8 * multiplier;

export const colors = {
  background: '#F5F7FB',
  card: '#FFFFFF',
  softCard: '#EEF2FF',
  surfaceMuted: '#F8FAFF',
  primary: '#2563EB',
  primarySoft: '#E0E7FF',
  secondary: '#0EA5E9',
  accentGreen: '#22C55E',
  accentRed: '#EF4444',
  accentOrange: '#F97316',
  text: '#0F172A',
  muted: '#64748B',
  border: '#E2E8F0',
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

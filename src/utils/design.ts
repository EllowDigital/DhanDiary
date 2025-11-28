export const spacing = (multiplier = 1) => 8 * multiplier;

export const colors = {
  background: '#f6f9fc',
  card: '#ffffff',
  softCard: '#f1f6fb',
  primary: '#2f8cff',
  primarySoft: '#dff0ff',
  accentGreen: '#2ecc71',
  accentRed: '#ff7b7b',
  text: '#222',
  muted: '#6b7280',
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
};

export const fonts = {
  heading: 'Inter',
  body: 'Inter',
};

import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import { colors } from '../utils/design';

export type PillTone = 'positive' | 'warning' | 'neutral';

const themes: Record<PillTone, { bg: string; text: string }> = {
  positive: { bg: colors.accentGreenSoft, text: colors.accentGreen },
  warning: { bg: colors.accentRedSoft, text: colors.accentRed },
  neutral: { bg: colors.surfaceMuted, text: colors.muted },
};

interface Props {
  icon: string;
  label: string;
  tone?: PillTone;
  style?: StyleProp<ViewStyle>;
}

const StatusPill: React.FC<Props> = ({ icon, label, tone = 'neutral', style }) => {
  const palette = themes[tone];
  return (
    <View style={[styles.pill, { backgroundColor: palette.bg }, style]}>
      <MaterialIcon name={icon as any} size={16} color={palette.text} />
      <Text style={[styles.text, { color: palette.text }]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  text: {
    fontSize: 13,
    fontWeight: '600',
  },
});

export default StatusPill;

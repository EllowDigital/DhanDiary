import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import { colors } from '../utils/design';

// Fallback colors if your design utils are missing specific keys
const THEME = {
  bg: colors.background || '#F8FAFC',
  card: '#FFFFFF',
  text: colors.text || '#0F172A',
  muted: colors.muted || '#64748B',
  border: colors.border || '#E2E8F0',
  primary: colors.primary || '#2563EB',
  danger: '#EF4444',
  surface: '#F1F5F9',
};

export type AuthGateVariant = 'offline' | 'service';

type Props = {
  variant: AuthGateVariant;
  title?: string;
  description?: string;
  primaryLabel?: string;
  onPrimary?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  loading?: boolean;
};

const defaults: Record<
  AuthGateVariant,
  { title: string; description: string; icon: keyof typeof MaterialIcon.glyphMap }
> = {
  offline: {
    title: 'No Internet Connection',
    description: 'It looks like you are offline. Please check your connection and try again.',
    icon: 'wifi-off',
  },
  service: {
    title: 'Server Unavailable',
    description:
      'We are having trouble connecting to our services right now. Please try again later.',
    icon: 'cloud-off',
  },
};

export const AuthGateScreen: React.FC<Props> = ({
  variant,
  title,
  description,
  primaryLabel = 'Try Again',
  onPrimary,
  secondaryLabel,
  onSecondary,
  loading = false,
}) => {
  const { width } = useWindowDimensions();
  const d = defaults[variant];

  // Responsive Logic
  const isTablet = width >= 768;
  const cardMaxWidth = isTablet ? 480 : '100%';
  const iconColor = variant === 'offline' ? THEME.danger : THEME.text;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={THEME.bg} />

      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.centerContent}>
          {/* Main Card Container */}
          <View style={[styles.card, { width: cardMaxWidth }]}>
            {/* Icon Section */}
            <View
              style={[
                styles.iconContainer,
                { backgroundColor: variant === 'offline' ? '#FEF2F2' : THEME.surface },
              ]}
            >
              <MaterialIcon name={d.icon} size={40} color={iconColor} />
            </View>

            {/* Text Content */}
            <View style={styles.textContainer}>
              <Text style={styles.title}>{title || d.title}</Text>
              <Text style={styles.desc}>{description || d.description}</Text>
            </View>

            {/* Action Buttons */}
            <View style={styles.actionsContainer}>
              {secondaryLabel && onSecondary && (
                <TouchableOpacity
                  style={[styles.btn, styles.secondaryBtn]}
                  activeOpacity={0.7}
                  onPress={onSecondary}
                  disabled={loading}
                >
                  <Text style={styles.secondaryText}>{secondaryLabel}</Text>
                </TouchableOpacity>
              )}

              {onPrimary && (
                <TouchableOpacity
                  style={[styles.btn, styles.primaryBtn, !secondaryLabel && styles.fullWidthBtn]}
                  activeOpacity={0.8}
                  onPress={onPrimary}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.primaryText}>{primaryLabel}</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.bg,
  },
  safeArea: {
    flex: 1,
    padding: 24,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: THEME.card,
    borderRadius: 32,
    paddingVertical: 40,
    paddingHorizontal: 32,
    alignItems: 'center',
    // Modern Soft Shadow
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  iconContainer: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.03)',
  },
  textContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: THEME.text,
    marginBottom: 12,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  desc: {
    fontSize: 16,
    lineHeight: 24,
    color: THEME.muted,
    textAlign: 'center',
    maxWidth: '90%',
  },
  actionsContainer: {
    flexDirection: 'row',
    width: '100%',
    gap: 16, // Works in React Native 0.71+
  },
  btn: {
    flex: 1,
    height: 56, // Larger touch target
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidthBtn: {
    flex: 1,
  },
  primaryBtn: {
    backgroundColor: THEME.primary,
    shadowColor: THEME.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  secondaryBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: THEME.border,
  },
  primaryText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  secondaryText: {
    color: THEME.text,
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import { colors } from '../utils/design';

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

const defaults: Record<AuthGateVariant, { title: string; description: string; icon: any }> = {
  offline: {
    title: 'You are offline',
    description: 'Connect to the internet to continue.',
    icon: 'wifi-off',
  },
  service: {
    title: 'Sorry — we are facing an issue',
    description: 'Please try again after some time.',
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
  const d = defaults[variant];

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom'] as any}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <MaterialIcon
              name={d.icon}
              size={34}
              color={variant === 'offline' ? '#B91C1C' : '#0F172A'}
            />
          </View>

          <Text style={styles.title}>{title || d.title}</Text>
          <Text style={styles.desc}>{description || d.description}</Text>

          <View style={styles.actions}>
            {secondaryLabel && onSecondary && (
              <TouchableOpacity
                style={[styles.btn, styles.secondaryBtn]}
                activeOpacity={0.85}
                onPress={onSecondary}
                disabled={loading}
              >
                <Text style={styles.secondaryText}>{secondaryLabel}</Text>
              </TouchableOpacity>
            )}

            {onPrimary && (
              <TouchableOpacity
                style={[styles.btn, styles.primaryBtn]}
                activeOpacity={0.85}
                onPress={onPrimary}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryText}>{primaryLabel}</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background || '#F8FAFC' },
  safe: { flex: 1, justifyContent: 'center', padding: 20 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.border || '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 6,
  },
  iconCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text || '#0F172A',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  desc: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted || '#64748B',
    marginBottom: 18,
  },
  actions: { flexDirection: 'row', gap: 12 },
  btn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  primaryBtn: {
    backgroundColor: colors.primary || '#2563EB',
  },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  secondaryBtn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.border || '#E2E8F0',
  },
  secondaryText: { color: colors.text || '#0F172A', fontSize: 16, fontWeight: '800' },
});

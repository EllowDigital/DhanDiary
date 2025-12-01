import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  TouchableOpacity,
  ScrollView,
  Animated,
  Easing,
  useWindowDimensions,
  Text,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@rneui/themed';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';

import { logout } from '../services/auth';
import { useAuth } from '../hooks/useAuth';
import { syncBothWays, getLastSyncTime, getLastSyncCount } from '../services/syncManager';
import { clearAllData } from '../db/localDb';

import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '../context/ToastContext';

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const sections = ['hero', 'quick', 'sync', 'danger'] as const;

const SettingsScreen = () => {
  const navigation = useNavigation<any>();
  const query = useQueryClient();
  const { showToast } = useToast();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const basePadding = useMemo(() => clamp(width * 0.055, 18, 28), [width]);
  const cardRadius = useMemo(() => clamp(width * 0.045, 18, 26), [width]);
  const fontScale = useMemo(() => clamp(width / 390, 0.92, 1.08), [width]);
  const styles = useMemo(() => createStyles(basePadding, cardRadius, fontScale), [basePadding, cardRadius, fontScale]);

  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [lastSyncedCount, setLastSyncedCount] = useState<number | null>(null);

  const animRefs = useRef(sections.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    (async () => {
      setLastSynced(await getLastSyncTime());
      setLastSyncedCount(await getLastSyncCount());
    })();
  }, []);

  useEffect(() => {
    const animations = animRefs.map((val) =>
      Animated.timing(val, {
        toValue: 1,
        duration: 450,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      })
    );
    Animated.stagger(130, animations).start();
  }, [animRefs]);

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await logout();
          query.clear();
          showToast('Logged out');
          navigation.getParent()?.replace('Auth');
        },
      },
    ]);
  };

  const formattedLastSync = useMemo(() => {
    if (!lastSynced) return 'Never';
    const date = new Date(lastSynced);
    return `${date.toLocaleDateString()} · ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }, [lastSynced]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const stats = await syncBothWays();
      const now = new Date().toISOString();
      setLastSynced(now);
      setLastSyncedCount(stats?.total ?? 0);

      showToast(`Sync complete (${stats?.total ?? 0} items)`);
      Alert.alert('Sync Complete', `Synced ${stats?.total ?? 0} items successfully.`);
    } catch (e: any) {
      showToast('Sync failed');
      Alert.alert('Sync Failed', e?.message || String(e));
    }
    setSyncing(false);
  };

  const handleClearData = () => {
    Alert.alert('Clear Local Data', 'This will clear local data and return you to login.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await clearAllData();
          showToast('Local data cleared');
          navigation.getParent()?.replace('Auth');
        },
      },
    ]);
  };

  const animatedStyle = (index: number) => ({
    opacity: animRefs[index],
    transform: [
      {
        translateY: animRefs[index].interpolate({
          inputRange: [0, 1],
          outputRange: [24, 0],
        }),
      },
    ],
  });

  const ActionRow = ({
    icon,
    iconColor,
    label,
    description,
    destructive,
    onPress,
  }: {
    icon: string;
    iconColor: string;
    label: string;
    description?: string;
    destructive?: boolean;
    onPress: () => void;
  }) => (
    <TouchableOpacity activeOpacity={0.85} style={styles.actionRow} onPress={onPress}>
      <View style={[styles.actionIcon, { backgroundColor: `${iconColor}1A` }]}>
        <MaterialIcon name={icon as any} size={22} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.actionLabel, destructive && { color: '#DC2626' }]}>{label}</Text>
        {description ? <Text style={styles.actionDescription}>{description}</Text> : null}
      </View>
      <MaterialIcon name="chevron-right" size={22} color="#94A3B8" />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.contentContainer}>
        <Animated.View style={[styles.heroCard, animatedStyle(0)]}>
          <View style={styles.heroHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.greeting}>Hi, {user?.name || 'there'} 👋</Text>
              <Text style={styles.greetingSub}>Stay in control of your account and sync health.</Text>
            </View>
            <View style={styles.statusPill}>
              <MaterialIcon name="verified-user" size={16} color="#22C55E" />
              <Text style={styles.statusText}>{user?.email || 'Guest user'}</Text>
            </View>
          </View>
          <View style={styles.metricsRow}>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Last Sync</Text>
              <Text style={styles.metricValue}>{formattedLastSync}</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Synced Items</Text>
              <Text style={styles.metricValue}>{lastSyncedCount ?? '—'}</Text>
            </View>
          </View>
        </Animated.View>

        <Animated.View style={[styles.card, animatedStyle(1)]}>
          <Text style={styles.cardTitle}>Quick Actions</Text>
          <ActionRow
            icon="person"
            iconColor="#2563EB"
            label="Account Management"
            description="Update your personal info and preferences"
            onPress={() => navigation.navigate('Account')}
          />
          <ActionRow
            icon="logout"
            iconColor="#DC2626"
            label="Logout"
            description="Sign out safely from this device"
            destructive
            onPress={handleLogout}
          />
        </Animated.View>

        <Animated.View style={[styles.card, animatedStyle(2)]}>
          <Text style={styles.cardTitle}>Backup & Sync</Text>
          <View style={styles.infoRow}>
            <View style={styles.infoBadge}>
              <MaterialIcon name="cloud-done" size={18} color="#2563EB" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>Last Synced</Text>
              <Text style={styles.infoValue}>{formattedLastSync}</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <View style={styles.infoBadge}>
              <MaterialIcon name="storage" size={18} color="#0EA5E9" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>Synced Items</Text>
              <Text style={styles.infoValue}>{lastSyncedCount ?? '—'}</Text>
            </View>
          </View>

          <Button
            title={syncing ? 'Syncing…' : 'Sync Now'}
            onPress={handleSync}
            loading={syncing}
            containerStyle={styles.btnContainer}
            buttonStyle={styles.primaryBtn}
            titleStyle={styles.primaryBtnTitle}
            icon={<MaterialIcon name="sync" size={18} color="#fff" style={{ marginRight: 8 }} />}
          />
        </Animated.View>

        <Animated.View style={[styles.card, styles.dangerCard, animatedStyle(3)]}>
          <Text style={[styles.cardTitle, { color: '#B45309' }]}>Danger Zone</Text>
          <ActionRow
            icon="delete-forever"
            iconColor="#EA580C"
            label="Clear Local Data"
            description="Removes cached entries and logs you out"
            destructive
            onPress={handleClearData}
          />
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default SettingsScreen;

// -----------------------------------------------------

const createStyles = (padding: number, radius: number, fontScale: number) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: '#EEF2FF',
    },
    contentContainer: {
      padding: padding,
      paddingBottom: padding * 1.5,
    },
    heroCard: {
      backgroundColor: '#0F172A',
      borderRadius: radius,
      padding: padding,
      marginBottom: padding,
      shadowColor: '#0F172A',
      shadowOpacity: 0.25,
      shadowRadius: 20,
      elevation: 8,
    },
    heroHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 16,
    },
    greeting: {
      fontSize: Math.round(18 * fontScale),
      fontWeight: '700',
      color: '#F8FAFC',
    },
    greetingSub: {
      color: '#CBD5F5',
      marginTop: 6,
      fontSize: Math.round(14 * fontScale),
    },
    statusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#1E293B',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      marginLeft: 12,
    },
    statusText: {
      marginLeft: 6,
      color: '#E2E8F0',
      fontSize: Math.round(12 * fontScale),
    },
    metricsRow: {
      flexDirection: 'row',
      gap: 12,
    },
    metricCard: {
      flex: 1,
      backgroundColor: '#1D2439',
      borderRadius: radius - 6,
      padding: 14,
    },
    metricLabel: {
      color: '#CBD5F5',
      fontSize: Math.round(12 * fontScale),
    },
    metricValue: {
      marginTop: 4,
      color: '#F8FAFC',
      fontSize: Math.round(14 * fontScale),
      fontWeight: '600',
    },
    card: {
      backgroundColor: '#FFFFFF',
      borderRadius: radius,
      padding: padding,
      marginBottom: padding,
      shadowColor: '#0F172A',
      shadowOpacity: 0.05,
      shadowRadius: 12,
      elevation: 4,
    },
    cardTitle: {
      fontSize: Math.round(16 * fontScale),
      fontWeight: '700',
      marginBottom: 16,
      color: '#0F172A',
    },
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: '#E2E8F0',
    },
    actionIcon: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },
    actionLabel: {
      fontSize: Math.round(15 * fontScale),
      fontWeight: '600',
      color: '#0F172A',
    },
    actionDescription: {
      marginTop: 2,
      fontSize: Math.round(12 * fontScale),
      color: '#64748B',
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
      paddingVertical: 4,
    },
    infoBadge: {
      width: 38,
      height: 38,
      borderRadius: 10,
      backgroundColor: '#EFF6FF',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },
    infoLabel: {
      fontSize: Math.round(13 * fontScale),
      color: '#475569',
    },
    infoValue: {
      fontSize: Math.round(14 * fontScale),
      color: '#0F172A',
      fontWeight: '600',
      marginTop: 2,
    },
    btnContainer: {
      marginTop: 18,
    },
    primaryBtn: {
      backgroundColor: '#2563EB',
      borderRadius: 14,
      paddingVertical: 13,
    },
    primaryBtnTitle: {
      fontWeight: '700',
      fontSize: Math.round(15 * fontScale),
    },
    dangerCard: {
      backgroundColor: '#FFF7ED',
      borderWidth: 1,
      borderColor: '#FED7AA',
    },
  });

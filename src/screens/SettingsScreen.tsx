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
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import type { ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@rneui/themed';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';

// --- LOGIC IMPORTS ---
import { logout } from '../services/auth';
import { useAuth } from '../hooks/useAuth';
import { syncBothWays, getLastSyncTime, getLastSyncCount } from '../services/syncManager';
import { wipeLocalDatabase } from '../db/localDb';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '../context/ToastContext';
import { colors, spacing } from '../utils/design';
import ScreenHeader from '../components/ScreenHeader';
import appConfig from '../../app.json';
const pkg = require('../../package.json');

// Helper: Format Date
const formatSyncDate = (isoString: string | null) => {
  if (!isoString) return 'Never synced';
  const date = new Date(isoString);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return isToday ? `Today at ${timeStr}` : `${date.toLocaleDateString()} at ${timeStr}`;
};

const SettingsScreen = () => {
  const navigation = useNavigation<any>();
  const query = useQueryClient();
  const { showToast } = useToast();
  const { user } = useAuth();

  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const maxContentWidth = 700;
  const horizontalPadding = isTablet ? spacing(4) : spacing(2.5);

  const containerStyle = useMemo<ViewStyle>(
    () => ({
      width: '100%' as const,
      maxWidth: maxContentWidth,
      alignSelf: 'center',
      paddingHorizontal: horizontalPadding,
    }),
    [horizontalPadding]
  );

  // --- ANIMATION SETUP ---
  // Entrance Stagger
  const animValues = useRef([...Array(6)].map(() => new Animated.Value(0))).current;

  // Sync Spin Animation
  const spinValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animations = animValues.map((anim) =>
      Animated.timing(anim, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      })
    );
    Animated.stagger(60, animations).start();
  }, []);

  const getAnimStyle = (index: number) => {
    const anim = animValues[index] || new Animated.Value(1); // Fallback to prevent crash
    return {
      opacity: anim,
      transform: [
        {
          translateY: anim.interpolate({
            inputRange: [0, 1],
            outputRange: [20, 0],
          }),
        },
      ],
    };
  };

  // --- STATE ---
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [lastSyncedCount, setLastSyncedCount] = useState<number | null>(0);

  useEffect(() => {
    (async () => {
      setLastSynced(await getLastSyncTime());
      setLastSyncedCount(await getLastSyncCount());
    })();
  }, []);

  // Sync Animation Logic
  useEffect(() => {
    if (syncing) {
      Animated.loop(
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
    } else {
      spinValue.stopAnimation();
      spinValue.setValue(0);
    }
  }, [syncing]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // --- HANDLERS ---
  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          query.clear();
          showToast('Signed out');
          navigation.getParent()?.replace('Auth');
        },
      },
    ]);
  };

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const stats = await syncBothWays();
      const now = new Date().toISOString();
      setLastSynced(now);
      setLastSyncedCount(stats?.total ?? 0);
      showToast(`Synced ${stats?.total ?? 0} items`);
    } catch (e: any) {
      showToast('Sync failed');
      Alert.alert('Sync Error', e?.message || String(e));
    } finally {
      setSyncing(false);
    }
  };

  const handleClearData = () => {
    Alert.alert(
      'Reset App?',
      '⚠️ This will DELETE all local data, cache, and sign you out. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Delete Everything',
          style: 'destructive',
          onPress: async () => {
            await wipeLocalDatabase();
            query.clear();
            showToast('App reset complete');
            navigation.getParent()?.replace('Auth');
          },
        },
      ]
    );
  };

  const userInitial = user?.name?.trim().charAt(0).toUpperCase() || 'U';

  return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <SafeAreaView style={styles.safeArea}>
        <View style={containerStyle}>
          <ScreenHeader
            title="Settings"
            subtitle="Preferences & Security"
            showScrollHint={false}
            useSafeAreaPadding={false}
          />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100 }}
        >
          <View style={containerStyle}>
            {/* 1. PROFILE CARD */}
            <Animated.View style={getAnimStyle(0)}>
              <View style={styles.profileCard}>
                <View style={styles.profileRow}>
                  <View style={styles.avatarContainer}>
                    <Text style={styles.avatarText}>{userInitial}</Text>
                  </View>
                  <View style={styles.profileInfo}>
                    <Text style={styles.profileName}>{user?.name || 'User'}</Text>
                    <Text style={styles.profileEmail}>{user?.email || 'No email linked'}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={() => navigation.navigate('Account')}
                  >
                    <MaterialIcon name="edit" size={20} color={colors.primary} />
                  </TouchableOpacity>
                </View>
              </View>
            </Animated.View>

            {/* 2. SYNC CARD */}
            <Animated.View style={getAnimStyle(1)}>
              <Text style={styles.sectionLabel}>Data & Cloud</Text>
              <View style={styles.card}>
                <View style={styles.syncHeader}>
                  <View style={[styles.iconBox, { backgroundColor: colors.primarySoft }]}>
                    <Animated.View style={{ transform: [{ rotate: spin }] }}>
                      <MaterialIcon name="sync" size={24} color={colors.primary} />
                    </Animated.View>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>Cloud Sync</Text>
                    <Text style={styles.cardSub}>
                      {syncing ? 'Synchronizing records...' : 'Keep your records backed up'}
                    </Text>
                  </View>
                </View>

                <View style={styles.statGrid}>
                  <View style={styles.statItem}>
                    <Text style={styles.statLabel}>LAST SYNC</Text>
                    <Text style={styles.statValue}>{formatSyncDate(lastSynced)}</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statLabel}>ITEMS</Text>
                    <Text style={styles.statValue}>{lastSyncedCount} Records</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.syncButton, syncing && styles.syncButtonDisabled]}
                  onPress={handleSync}
                  disabled={syncing}
                  activeOpacity={0.8}
                >
                  {syncing ? (
                    <ActivityIndicator color="#fff" size="small" style={{ marginRight: 8 }} />
                  ) : (
                    <MaterialIcon
                      name="cloud-upload"
                      size={18}
                      color="#fff"
                      style={{ marginRight: 8 }}
                    />
                  )}
                  <Text style={styles.syncButtonText}>{syncing ? 'Syncing...' : 'Sync Now'}</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>

            {/* 3. GENERAL SETTINGS (Notification Removed) */}
            <Animated.View style={getAnimStyle(2)}>
              <Text style={styles.sectionLabel}>General</Text>
              <View style={styles.card}>
                <SettingsRow
                  icon="person-outline"
                  label="Account Details"
                  onPress={() => navigation.navigate('Account')}
                />
                <SettingsRow
                  icon="lock-outline"
                  label="Privacy Policy"
                  onPress={() => navigation.navigate('PrivacyPolicy')}
                  lastItem
                />
              </View>
            </Animated.View>

            {/* 4. DANGER ZONE */}
            <Animated.View style={getAnimStyle(3)}>
              <View style={styles.dangerHeaderRow}>
                <MaterialIcon name="error-outline" size={18} color={colors.accentRed} />
                <Text style={styles.dangerLabel}>Danger Zone</Text>
              </View>

              <View style={styles.dangerCard}>
                <View style={styles.dangerContent}>
                  <Text style={styles.dangerTitle}>Reset Application</Text>
                  <Text style={styles.dangerDesc}>
                    Clears all local databases, cached images, and session data. Use this if the app
                    is behaving unexpectedly.
                  </Text>
                  <TouchableOpacity
                    style={styles.dangerBtn}
                    onPress={handleClearData}
                    activeOpacity={0.7}
                  >
                    <MaterialIcon name="delete-forever" size={20} color={colors.white} />
                    <Text style={styles.dangerBtnText}>Clear Data & Reset</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Animated.View>

            {/* 5. LOGOUT */}
            <Animated.View style={[getAnimStyle(4), { marginTop: 24 }]}>
              <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
                <MaterialIcon name="logout" size={20} color={colors.accentRed} />
                <Text style={styles.logoutText}>Sign Out</Text>
              </TouchableOpacity>

              <Text style={styles.versionText}>
                v{pkg.version} ({appConfig.expo.version || '1.0.0'})
              </Text>
            </Animated.View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

/* --- REUSABLE ROW COMPONENT --- */
const SettingsRow = ({ icon, label, onPress, lastItem }: any) => (
  <TouchableOpacity
    style={[styles.row, lastItem && { borderBottomWidth: 0 }]}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <View style={styles.rowIcon}>
      <MaterialIcon name={icon} size={20} color={colors.text} />
    </View>
    <Text style={styles.rowLabel}>{label}</Text>
    <MaterialIcon name="chevron-right" size={22} color={colors.border} />
  </TouchableOpacity>
);

export default SettingsScreen;

/* --- STYLES --- */
const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  safeArea: {
    flex: 1,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
    marginBottom: 10,
    marginTop: 24,
    marginLeft: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  /* CARDS GLOBAL */
  card: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    // Soft Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },

  /* PROFILE */
  profileCard: {
    backgroundColor: colors.card,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 8,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    width: 56,
    height: 56,
    borderRadius: 20,
    backgroundColor: colors.primarySoft || '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.primary,
  },
  profileInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  profileEmail: {
    fontSize: 13,
    color: colors.muted,
  },
  editButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted || '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* SYNC */
  syncHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  cardSub: {
    fontSize: 13,
    color: colors.muted,
  },
  statGrid: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statItem: {
    flex: 1,
  },
  statLabel: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: '700',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  syncButton: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  syncButtonDisabled: {
    opacity: 0.7,
  },
  syncButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },

  /* SETTINGS ROWS */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceMuted || '#F0F0F0',
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.surfaceMuted || '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    fontWeight: '500',
  },

  /* DANGER ZONE */
  dangerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 24,
    marginBottom: 10,
    marginLeft: 4,
  },
  dangerLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accentRed,
    textTransform: 'uppercase',
  },
  dangerCard: {
    backgroundColor: '#FEF2F2', // Light red bg
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#FECACA', // Light red border
    padding: 16,
  },
  dangerContent: {
    flex: 1,
  },
  dangerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.accentRed,
    marginBottom: 6,
  },
  dangerDesc: {
    fontSize: 13,
    color: '#7F1D1D', // Darker red for text
    opacity: 0.8,
    marginBottom: 16,
    lineHeight: 20,
  },
  dangerBtn: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  dangerBtnText: {
    color: colors.accentRed,
    fontWeight: '700',
    fontSize: 14,
  },

  /* FOOTER */
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  logoutText: {
    color: colors.accentRed,
    fontWeight: '600',
    fontSize: 15,
  },
  versionText: {
    textAlign: 'center',
    color: colors.muted,
    fontSize: 12,
    marginTop: 20,
    opacity: 0.5,
  },
});

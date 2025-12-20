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
  Linking,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@rneui/themed';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';

// Logic
import { logout } from '../services/auth';
import { syncBothWays } from '../services/syncManager';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '../context/ToastContext';
import { colors, spacing } from '../utils/design';
import ScreenHeader from '../components/ScreenHeader';
import appConfig from '../../app.json';

// Safe Package Import
let pkg: { version?: string } = {};
try {
  pkg = require('../../package.json');
} catch (e) {
  pkg = { version: '1.0.0' };
}

const SettingsScreen = () => {
  const navigation = useNavigation<any>();
  const query = useQueryClient();
  const { showToast } = useToast();
  const { user } = useAuth();

  // Layout
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const contentWidth = Math.min(width - (isTablet ? spacing(8) : spacing(4)), 700);

  // Animations
  const animValues = useRef([...Array(6)].map(() => new Animated.Value(0))).current;

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState('Just now');

  useEffect(() => {
    const animations = animValues.map((anim) =>
      Animated.timing(anim, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      })
    );
    Animated.stagger(80, animations).start();
  }, []);

  const getAnimStyle = (index: number) => ({
    opacity: animValues[index],
    transform: [
      {
        translateY: animValues[index].interpolate({
          inputRange: [0, 1],
          outputRange: [30, 0],
        }),
      },
    ],
  });

  // Handlers
  const handleManualSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await syncBothWays();
      setLastSyncTime('Just now');
      showToast('Sync completed successfully');
    } catch (e) {
      showToast('Sync failed. Please try again.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          query.clear();
          showToast('Signed out successfully');
          navigation.reset({ index: 0, routes: [{ name: 'Auth' }] });
        },
      },
    ]);
  };

  const handleResetApp = () => {
    Alert.alert(
      'Reset Application?',
      'This will clear all local data, sign you out, and restart the app. Your cloud data will remain safe.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset Everything',
          style: 'destructive',
          onPress: async () => {
            await logout();
            query.clear();
            showToast('App has been reset');
            navigation.reset({ index: 0, routes: [{ name: 'Auth' }] });
          },
        },
      ]
    );
  };

  const handleContactSupport = () => {
    Linking.openURL('mailto:support@dhandiary.com?subject=App Support');
  };

  const userInitial = user?.name?.charAt(0).toUpperCase() || 'U';

  return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={{ width: contentWidth, alignSelf: 'center' }}>
          <ScreenHeader
            title="Settings"
            subtitle="Preferences & Security"
            showScrollHint={false}
            useSafeAreaPadding={false}
          />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100, paddingTop: 10 }}
        >
          <View style={{ width: contentWidth, alignSelf: 'center' }}>
            {/* 1. PROFILE CARD */}
            <Animated.View style={getAnimStyle(0)}>
              <View style={styles.profileCard}>
                <View style={styles.profileRow}>
                  <View style={styles.avatarContainer}>
                    <Text style={styles.avatarText}>{userInitial}</Text>
                  </View>
                  <View style={styles.profileInfo}>
                    <Text style={styles.profileName} numberOfLines={1}>
                      {user?.name || 'User'}
                    </Text>
                    <Text style={styles.profileEmail} numberOfLines={1}>
                      {user?.email || 'No email linked'}
                    </Text>
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

            {/* 2. DATA & SYNC */}
            <Animated.View style={getAnimStyle(1)}>
              <Text style={styles.sectionLabel}>Cloud Sync</Text>
              <View style={styles.card}>
                <View style={styles.syncHeader}>
                  <View style={[styles.iconBox, { backgroundColor: '#e0f2fe' }]}>
                    <MaterialIcon name="cloud-done" size={24} color="#0284c7" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>Data is Synchronized</Text>
                    <Text style={styles.cardSub}>
                      Your entries are safely backed up to the cloud.
                    </Text>
                  </View>
                </View>

                <View style={styles.statGrid}>
                  <View style={styles.statItem}>
                    <Text style={styles.statLabel}>Status</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View
                        style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#22c55e' }}
                      />
                      <Text style={styles.statValue}>Online</Text>
                    </View>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statLabel}>Last Sync</Text>
                    <Text style={styles.statValue}>{lastSyncTime}</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.syncBtn}
                  onPress={handleManualSync}
                  disabled={isSyncing}
                >
                  {isSyncing ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <MaterialIcon name="sync" size={16} color="#fff" />
                      <Text style={styles.syncBtnText}>Sync Now</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </Animated.View>

            {/* 3. GENERAL */}
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
                />
                <SettingsRow
                  icon="description"
                  label="Terms of Use"
                  onPress={() => navigation.navigate('Terms')}
                />
                <SettingsRow
                  icon="support-agent"
                  label="Contact Support"
                  onPress={handleContactSupport}
                  lastItem
                />
              </View>
            </Animated.View>

            {/* 4. DANGER ZONE */}
            <Animated.View style={getAnimStyle(3)}>
              <View style={styles.dangerHeaderRow}>
                <MaterialIcon name="warning-amber" size={18} color={colors.accentRed} />
                <Text style={styles.dangerLabel}>Danger Zone</Text>
              </View>

              <View style={styles.dangerCard}>
                <Text style={styles.dangerTitle}>Reset Application</Text>
                <Text style={styles.dangerDesc}>
                  Signs you out, clears all local cache, and resets app state. Data on the cloud
                  remains safe.
                </Text>
                <TouchableOpacity
                  style={styles.dangerBtn}
                  onPress={handleResetApp}
                  activeOpacity={0.7}
                >
                  <MaterialIcon name="refresh" size={18} color={colors.accentRed} />
                  <Text style={styles.dangerBtnText}>Reset App</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>

            {/* 5. FOOTER */}
            <Animated.View style={[getAnimStyle(4), { marginTop: 30 }]}>
              <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
                <MaterialIcon name="logout" size={20} color={colors.accentRed} />
                <Text style={styles.logoutText}>Sign Out</Text>
              </TouchableOpacity>

              <Text style={styles.versionText}>
                v{pkg.version} • Build {appConfig.expo.version || '100'}
              </Text>
            </Animated.View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

/* --- REUSABLE ROW --- */
const SettingsRow = ({
  icon,
  label,
  onPress,
  lastItem,
}: {
  icon: any;
  label: string;
  onPress: () => void;
  lastItem?: boolean;
}) => (
  <TouchableOpacity
    style={[styles.row, lastItem && { borderBottomWidth: 0 }]}
    onPress={onPress}
    activeOpacity={0.6}
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
  mainContainer: { flex: 1, backgroundColor: colors.background },
  safeArea: { flex: 1 },

  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    marginBottom: 8,
    marginTop: 24,
    marginLeft: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  /* CARDS */
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.03)',
  },

  /* PROFILE */
  profileCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    marginTop: 8,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
  },
  profileRow: { flexDirection: 'row', alignItems: 'center' },
  avatarContainer: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    borderWidth: 1,
    borderColor: '#dbeafe',
  },
  avatarText: { fontSize: 20, fontWeight: '700', color: colors.primary },
  profileInfo: { flex: 1, justifyContent: 'center' },
  profileName: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 2 },
  profileEmail: { fontSize: 13, color: colors.muted },
  editButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },

  /* SYNC */
  syncHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  cardSub: { fontSize: 12, color: colors.muted, marginTop: 2, lineHeight: 16 },

  statGrid: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  statItem: { flex: 1, gap: 4 },
  statLabel: { fontSize: 10, color: colors.muted, fontWeight: '700', textTransform: 'uppercase' },
  statValue: { fontSize: 13, fontWeight: '600', color: colors.text },

  /* ROWS */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowLabel: { flex: 1, fontSize: 15, color: colors.text, fontWeight: '500' },

  /* DANGER */
  dangerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 24,
    marginBottom: 8,
    marginLeft: 4,
  },
  dangerLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accentRed,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dangerCard: {
    backgroundColor: '#fef2f2',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#fee2e2',
    padding: 16,
  },
  dangerTitle: { fontSize: 15, fontWeight: '700', color: '#991b1b', marginBottom: 6 },
  dangerDesc: { fontSize: 13, color: '#b91c1c', opacity: 0.8, marginBottom: 16, lineHeight: 18 },
  dangerBtn: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: '#fecaca',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  dangerBtnText: { color: colors.accentRed, fontWeight: '700', fontSize: 13 },

  /* FOOTER */
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  logoutText: { color: colors.accentRed, fontWeight: '600', fontSize: 15 },
  versionText: {
    textAlign: 'center',
    color: colors.muted,
    fontSize: 11,
    marginTop: 16,
    opacity: 0.6,
  },

  /* SYNC BUTTON */
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0284c7', // Sky blue
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 12,
    gap: 8,
  },
  syncBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
});

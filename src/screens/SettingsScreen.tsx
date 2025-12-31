import React, { useEffect, useRef, useState } from 'react';
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
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@rneui/themed';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';

// Optional Haptics: prefer runtime require so builds without expo-haptics still work.
let Haptics: any = {
  impactAsync: async () => {},
  notificationAsync: async () => {},
  ImpactFeedbackStyle: { Medium: 'medium' },
  NotificationFeedbackType: { Warning: 'warning' },
};
try {
  const _h = require('expo-haptics');
  if (_h) Haptics = _h;
} catch (e) {
  // expo-haptics not installed — keep no-op fallback
}

// Logic
import { logout } from '../services/auth';
import { syncBothWays, getLastSuccessfulSyncAt } from '../services/syncManager';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '../context/ToastContext';
import { colors, spacing } from '../utils/design';
import ScreenHeader from '../components/ScreenHeader';
import { subscribeBanner, isBannerVisible } from '../utils/bannerState';
import appConfig from '../../app.json';

// Safe Package Import for Version
let pkg: { version?: string } = {};
try {
  pkg = require('../../package.json');
} catch (e) {
  pkg = { version: '1.0.0' };
}

// --- SUB-COMPONENT: SETTINGS ROW ---
const SettingsRow = ({
  icon,
  label,
  onPress,
  lastItem,
  danger,
}: {
  icon: keyof typeof MaterialIcon.glyphMap;
  label: string;
  onPress: () => void;
  lastItem?: boolean;
  danger?: boolean;
}) => (
  <TouchableOpacity
    style={[styles.row, lastItem && { borderBottomWidth: 0 }]}
    onPress={onPress}
    activeOpacity={0.6}
  >
    <View style={[styles.rowIcon, danger && styles.rowIconDanger]}>
      <MaterialIcon name={icon} size={20} color={danger ? colors.accentRed : colors.text} />
    </View>
    <Text style={[styles.rowLabel, danger && { color: colors.accentRed }]}>{label}</Text>
    <MaterialIcon name="chevron-right" size={22} color={colors.border || '#E2E8F0'} />
  </TouchableOpacity>
);

const SettingsScreen = () => {
  const navigation = useNavigation<any>();
  const query = useQueryClient();
  const { showToast } = useToast();
  const { user } = useAuth(); // Clerk or Custom Auth hook

  // Clerk Auth (Safe Import for optional usage)
  let clerkSignOut: any = null;
  try {
    const clerk = require('@clerk/clerk-expo');
    const auth = clerk.useAuth();
    clerkSignOut = auth.signOut;
  } catch (e) {
    // Clerk not installed or configured, ignore
  }

  // Layout
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const contentWidth = Math.min(width - (isTablet ? spacing(8) : spacing(4)), 600);

  const [bannerVisible, setBannerVisible] = useState<boolean>(false);
  useEffect(() => {
    setBannerVisible(isBannerVisible());
    const unsub = subscribeBanner((v: boolean) => setBannerVisible(v));
    return () => unsub();
  }, []);

  // Animations
  const animValues = useRef([...Array(6)].map(() => new Animated.Value(0))).current;

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState('—');
  const [isOnline, setIsOnline] = useState<boolean>(true);

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
  }, [animValues]);

  // Monitor network connectivity and last successful sync time
  useEffect(() => {
    let mounted = true;
    // initial network state
    NetInfo.fetch().then((s) => {
      if (!mounted) return;
      setIsOnline(!!s.isConnected);
    });

    const unsub = NetInfo.addEventListener((s) => setIsOnline(!!s.isConnected));

    // Load last successful sync from memory if available
    try {
      const last = getLastSuccessfulSyncAt();
      if (last) {
        const d = new Date(last);
        setLastSyncTime(`${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`);
      }
    } catch (e) {}

    return () => {
      mounted = false;
      try {
        unsub();
      } catch (e) {}
    };
  }, []);

  const getAnimStyle = (index: number) => ({
    opacity: animValues[index],
    transform: [
      {
        translateY: animValues[index].interpolate({
          inputRange: [0, 1],
          outputRange: [20, 0],
        }),
      },
    ],
  });

  // Handlers
  const handleManualSync = async () => {
    if (isSyncing) return;
    if (!isOnline) {
      showToast('No network connection. Connect to the internet and try again.', 'error');
      return;
    }

    // Haptic feedback
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    setIsSyncing(true);
    try {
      const res: any = await syncBothWays();
      if (res && res.ok) {
        const now = new Date();
        setLastSyncTime(`${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`);
        showToast('Sync completed successfully');
      } else {
        // Could be offline or an internal failure
        const state = await NetInfo.fetch();
        if (!state.isConnected) {
          showToast('No network connection. Connect to the internet and try again.', 'error');
        } else {
          showToast('Sync did not complete. Please try again.', 'error');
        }
      }
    } catch (e) {
      showToast('Sync failed. Please try again.', 'error');
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
          try {
            // Sign out from Clerk first (if available)
            if (clerkSignOut && typeof clerkSignOut === 'function') {
              try {
                await clerkSignOut();
              } catch (e) {
                console.warn('[Settings] Clerk signOut failed', e);
              }
            }

            const ok = await logout();
            try {
              query.clear();
            } catch (e) {
              // ignore
            }

            if (ok) showToast('Signed out successfully');

            // Force navigation reset
            navigation.reset({ index: 0, routes: [{ name: 'Auth' }] });
          } catch (e) {
            console.warn('[Settings] logout failed', e);
            showToast('Sign out failed. Please try again.', 'error');
          }
        },
      },
    ]);
  };

  const handleResetApp = () => {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
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

  return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background || '#F8FAFC'} />
      <SafeAreaView
        style={styles.safeArea}
        edges={bannerVisible ? (['left', 'right'] as any) : (['top', 'left', 'right'] as any)}
      >
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
            {/* 1. DATA & SYNC CARD */}
            <Animated.View style={getAnimStyle(1)}>
              <Text style={styles.sectionLabel}>CLOUD & DATA</Text>
              <View style={styles.card}>
                <View style={styles.syncHeader}>
                  <View style={[styles.iconBox, { backgroundColor: '#E0F2FE' }]}>
                    <MaterialIcon name="cloud-queue" size={24} color="#0284C7" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>Sync Status</Text>
                    <Text style={styles.cardSub}>
                      {isOnline
                        ? 'Data is backed up automatically.'
                        : 'Offline — changes are saved locally.'}
                    </Text>
                  </View>
                </View>

                <View style={styles.statGrid}>
                  <View style={styles.statItem}>
                    <Text style={styles.statLabel}>STATUS</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: isOnline
                            ? isSyncing
                              ? '#F59E0B'
                              : '#22C55E'
                            : colors.accentRed || '#EF4444',
                        }}
                      />
                      <Text style={styles.statValue}>
                        {isOnline ? (isSyncing ? 'Syncing…' : 'Online') : 'Offline'}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.statItem, styles.statBorderLeft]}>
                    <Text style={styles.statLabel}>LAST SYNC</Text>
                    <Text style={styles.statValue}>{lastSyncTime}</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.syncBtn, (!isOnline || isSyncing) && { opacity: 0.6 }]}
                  onPress={handleManualSync}
                  disabled={isSyncing || !isOnline}
                  activeOpacity={0.8}
                >
                  {isSyncing ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <MaterialIcon name="sync" size={18} color="#fff" style={{ marginRight: 8 }} />
                      <Text style={styles.syncBtnText}>Sync Now</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </Animated.View>

            {/* 2. GENERAL SETTINGS */}
            <Animated.View style={getAnimStyle(2)}>
              <Text style={styles.sectionLabel}>GENERAL</Text>
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

            {/* 3. DANGER ZONE */}
            <Animated.View style={getAnimStyle(3)}>
              <View style={styles.dangerHeaderRow}>
                <MaterialIcon
                  name="error-outline"
                  size={18}
                  color={colors.accentRed || '#EF4444'}
                />
                <Text style={styles.dangerLabel}>DANGER ZONE</Text>
              </View>

              <View style={styles.dangerCard}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={styles.dangerTitle}>Reset Application</Text>
                    <Text style={styles.dangerDesc}>Clears local cache & restarts.</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.dangerBtn}
                    onPress={handleResetApp}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.dangerBtnText}>Reset</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Animated.View>

            {/* 4. FOOTER */}
            <Animated.View style={[getAnimStyle(4), { marginTop: 24, marginBottom: 40 }]}>
              <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
                <MaterialIcon name="logout" size={20} color={colors.accentRed} />
                <Text style={styles.logoutText}>Sign Out</Text>
              </TouchableOpacity>

              <Text style={styles.versionText}>
                Version {pkg.version} ({appConfig.expo.version || '100'})
              </Text>
            </Animated.View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

/* --- STYLES --- */
const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: colors.background || '#F8FAFC' },
  safeArea: { flex: 1 },

  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted || '#64748B',
    marginBottom: 8,
    marginTop: 24,
    marginLeft: 4,
    letterSpacing: 1,
  },

  /* CARDS */
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    // Soft Shadow
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },

  /* SYNC */
  syncHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text || '#1E293B' },
  cardSub: { fontSize: 13, color: colors.muted || '#64748B', marginTop: 2 },

  statGrid: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 4 },
  statBorderLeft: { borderLeftWidth: 1, borderLeftColor: '#E2E8F0' },
  statLabel: {
    fontSize: 10,
    color: colors.muted || '#64748B',
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  statValue: { fontSize: 14, fontWeight: '600', color: colors.text || '#1E293B' },

  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0284C7', // Strong Blue
    paddingVertical: 12,
    borderRadius: 10,
  },
  syncBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },

  /* ROW ITEMS */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowIconDanger: {
    backgroundColor: '#FEF2F2',
  },
  rowLabel: { flex: 1, fontSize: 15, color: colors.text || '#1E293B', fontWeight: '500' },

  /* DANGER ZONE */
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
    color: colors.accentRed || '#EF4444',
    letterSpacing: 1,
  },
  dangerCard: {
    backgroundColor: '#FEF2F2',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
    padding: 16,
  },
  dangerTitle: { fontSize: 15, fontWeight: '700', color: '#991B1B', marginBottom: 2 },
  dangerDesc: { fontSize: 13, color: '#B91C1C', opacity: 0.8 },
  dangerBtn: {
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    elevation: 1,
  },
  dangerBtnText: { color: colors.accentRed || '#EF4444', fontWeight: '700', fontSize: 13 },

  /* FOOTER */
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  logoutText: { color: colors.accentRed || '#EF4444', fontWeight: '600', fontSize: 15 },
  versionText: {
    textAlign: 'center',
    color: colors.muted || '#94A3B8',
    fontSize: 12,
    marginTop: 16,
    fontWeight: '500',
  },
});

export default SettingsScreen;

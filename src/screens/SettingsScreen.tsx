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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Text } from '@rneui/themed';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';

// --- LOGIC IMPORTS ---
import { logout } from '../services/auth';
import { useAuth } from '../hooks/useAuth';
import { syncBothWays, getLastSyncTime, getLastSyncCount } from '../services/syncManager';
import { clearAllData } from '../db/localDb';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '../context/ToastContext';
import { colors, spacing } from '../utils/design';
import ScreenHeader from '../components/ScreenHeader';

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
  
  const containerStyle = {
    width: '100%',
    maxWidth: maxContentWidth,
    alignSelf: 'center' as const,
    paddingHorizontal: isTablet ? spacing(4) : spacing(2.5),
  };

  // --- SAFE ANIMATION SETUP ---
  // Create an array of 6 Animated Values (enough for all sections + extras)
  // This prevents the "undefined" error if we access an index that doesn't exist
  const animValues = useRef([...Array(6)].map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const animations = animValues.map((anim) =>
      Animated.timing(anim, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      })
    );
    Animated.stagger(80, animations).start();
  }, []);

  // CRASH FIX: Added a safety check here
  const getAnimStyle = (index: number) => {
    const anim = animValues[index];
    
    // If the animation value doesn't exist, return empty style instead of crashing
    if (!anim) return {};

    return {
      opacity: anim,
      transform: [
        {
          translateY: anim.interpolate({
            inputRange: [0, 1],
            outputRange: [15, 0],
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
            await clearAllData();
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
          />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 120 }}
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
                    <Text style={styles.profileEmail}>{user?.email || 'No email'}</Text>
                  </View>
                  <TouchableOpacity 
                    style={styles.editButton} 
                    onPress={() => navigation.navigate('Account')}
                  >
                    <MaterialIcon name="chevron-right" size={24} color={colors.muted} />
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
                    <MaterialIcon name="cloud-sync" size={22} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>Cloud Sync</Text>
                    <Text style={styles.cardSub}>Keep your records backed up</Text>
                  </View>
                </View>

                <View style={styles.divider} />

                <View style={styles.statRow}>
                  <View style={styles.statItem}>
                    <Text style={styles.statLabel}>Last Sync</Text>
                    <Text style={styles.statValue}>{formatSyncDate(lastSynced)}</Text>
                  </View>
                  <View style={styles.dividerVertical} />
                  <View style={styles.statItem}>
                    <Text style={styles.statLabel}>Entries</Text>
                    <Text style={styles.statValue}>{lastSyncedCount}</Text>
                  </View>
                </View>

                <Button
                  title={syncing ? 'Syncing...' : 'Sync Now'}
                  onPress={handleSync}
                  loading={syncing}
                  icon={<MaterialIcon name="sync" size={18} color="white" style={{ marginRight: 8 }} />}
                  buttonStyle={styles.syncBtn}
                  titleStyle={styles.syncBtnTitle}
                  containerStyle={{ marginTop: 12 }}
                />
              </View>
            </Animated.View>

            {/* 3. GENERAL SETTINGS */}
            <Animated.View style={getAnimStyle(2)}>
              <Text style={styles.sectionLabel}>General</Text>
              <View style={styles.card}>
                <SettingsRow 
                  icon="person-outline" 
                  label="Account Details" 
                  onPress={() => navigation.navigate('Account')}
                />
                <SettingsRow 
                  icon="notifications-none" 
                  label="Notifications" 
                  onPress={() => showToast('Coming soon')} 
                />
                 <SettingsRow 
                  icon="lock-outline" 
                  label="Privacy Policy" 
                  onPress={() => {}} 
                  lastItem
                />
              </View>
            </Animated.View>

            {/* 4. DANGER ZONE */}
            <Animated.View style={getAnimStyle(3)}>
              <View style={styles.dangerHeaderRow}>
                <MaterialIcon name="warning" size={16} color={colors.accentRed} />
                <Text style={[styles.sectionLabel, { color: colors.accentRed, marginTop: 0, marginBottom: 0 }]}>
                  Danger Zone
                </Text>
              </View>
              
              <View style={styles.dangerCard}>
                <View style={styles.dangerStrip} />
                <View style={styles.dangerContent}>
                  <Text style={styles.dangerTitle}>Reset Application</Text>
                  <Text style={styles.dangerDesc}>
                    Clears all local databases, cached images, and session data.
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

            {/* 5. LOGOUT BUTTON */}
            <Animated.View style={[getAnimStyle(4), { marginTop: 24 }]}>
              <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
                <MaterialIcon name="logout" size={20} color={colors.accentRed} />
                <Text style={styles.logoutText}>Sign Out</Text>
              </TouchableOpacity>
              <Text style={styles.versionText}>v1.0.2 (Build 45)</Text>
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
    letterSpacing: 0.8,
  },
  
  /* CARDS GLOBAL */
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 8,
    elevation: 2,
  },

  /* PROFILE */
  profileCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 8,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.primary,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  profileEmail: {
    fontSize: 13,
    color: colors.muted,
  },
  editButton: {
    padding: 8,
  },

  /* SYNC */
  syncHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
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
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: 16,
  },
  dividerVertical: {
    width: 1,
    height: '100%',
    backgroundColor: colors.border,
  },
  statRow: {
    flexDirection: 'row',
    gap: 16,
  },
  statItem: {
    flex: 1,
  },
  statLabel: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  syncBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
  },
  syncBtnTitle: {
    fontWeight: '700',
    fontSize: 14,
  },

  /* SETTINGS ROWS */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceMuted,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
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
  dangerCard: {
    backgroundColor: '#FEF2F2', // Light red bg
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FCA5A5', // Light red border
    overflow: 'hidden',
    flexDirection: 'row',
  },
  dangerStrip: {
    width: 6,
    backgroundColor: colors.accentRed,
  },
  dangerContent: {
    flex: 1,
    padding: 16,
  },
  dangerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.accentRed,
    marginBottom: 4,
  },
  dangerDesc: {
    fontSize: 13,
    color: colors.text,
    opacity: 0.7,
    marginBottom: 16,
    lineHeight: 18,
  },
  dangerBtn: {
    backgroundColor: colors.accentRed,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
    shadowColor: colors.accentRed,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  dangerBtnText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 14,
  },

  /* FOOTER & LOGOUT */
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
    opacity: 0.6,
  },
});
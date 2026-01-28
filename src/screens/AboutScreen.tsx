import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import Constants from 'expo-constants';
import {
  View,
  StyleSheet,
  Image,
  TouchableOpacity,
  Linking,
  ScrollView,
  Share,
  Alert,
  Animated,
  Easing,
  StatusBar,
  useWindowDimensions,
  Clipboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Text } from '@rneui/themed';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
import NetInfo from '@react-native-community/netinfo';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';

// --- CUSTOM HOOKS & UTILS ---
// Ensure these paths do not create circular dependencies
import { useInternetStatus } from '../hooks/useInternetStatus';
import { useNeonStatus, describeNeonHealth } from '../hooks/useNeonStatus';
import { colors } from '../utils/design';
import { useToast } from '../context/ToastContext';
import ScreenHeader from '../components/ScreenHeader';
import { applyOtaUpdateAndReload } from '../services/backgroundUpdates';

// --- CONSTANTS ---
const ELLOW_URL = 'https://www.ellowdigital.space';
const APP_WEBSITE_URL = 'https://dhandiary.netlify.app';
const BRAND_NAME = 'EllowDigital';

// Safe Version Access using Expo Constants instead of require('package.json')
const APP_VERSION =
  Constants.expoConfig?.version ||
  (Constants as any)?.manifest2?.version ||
  (Constants as any)?.manifest?.version ||
  '1.0.0';
const BUILD_TYPE = Constants.expoConfig?.extra?.BUILD_TYPE || (__DEV__ ? 'Development' : 'Release');

// Mock Share Link (Replace with your actual dynamic link logic if needed)
const getLatestShareLink = async () => APP_WEBSITE_URL;

// --- THEME ---
// --- THEME ---
// Mapping strictly to design system to avoid fragmentation
const theme = {
  background: colors.background,
  surface: colors.card,
  primary: colors.primary,
  primarySoft: colors.primarySoft,
  text: colors.text,
  textSecondary: colors.muted,
  accentGreen: colors.accentGreen,
  accentRed: colors.accentRed,
  heroBg: '#0F172A', // Custom dark shade for Hero Only
  border: colors.border,
};

// --- COMPONENT: SYSTEM STATUS PILL ---
const SystemStatus: React.FC = () => {
  const isOnline = useInternetStatus();
  const health = useNeonStatus(5000);
  const desc = describeNeonHealth(health);

  // Decide visual state
  let dotColor: string;
  let label: string;
  let tone: 'positive' | 'warning' | 'neutral';

  if (!isOnline) {
    label = 'You are offline';
    dotColor = '#EF4444';
    tone = 'warning';
  } else {
    if (desc.tone === 'positive') {
      label = 'System Operational';
      dotColor = '#10B981';
      tone = 'positive';
      if (desc.label && desc.label !== 'Cloud good') label = `Operational · ${desc.label}`;
    } else if (desc.tone === 'warning') {
      label = desc.label || 'Reconnecting…';
      dotColor = '#F59E0B';
      tone = 'warning';
    } else {
      label = desc.label || 'Checking link…';
      dotColor = '#94A3B8';
      tone = 'neutral';
    }
  }

  return (
    <View
      style={[
        styles.activePill,
        tone === 'positive'
          ? styles.pillPositive
          : tone === 'warning'
            ? styles.pillWarning
            : styles.pillNeutral,
      ]}
    >
      <View style={[styles.activeDot, { backgroundColor: dotColor }]} />
      <Text
        numberOfLines={1}
        style={[
          styles.activeText,
          tone === 'positive'
            ? { color: '#065F46' }
            : tone === 'warning'
              ? { color: '#92400E' }
              : { color: '#475569' },
          { flexShrink: 1 },
        ]}
      >
        {label}
      </Text>
    </View>
  );
};

// --- COMPONENT: GRID ITEM ---
const GridItem = ({
  label,
  value,
  isBadge,
  borderRight,
  borderBottom,
  onPress,
  actionIcon,
}: {
  label: string;
  value: string;
  isBadge?: boolean;
  borderRight?: boolean;
  borderBottom?: boolean;
  onPress?: () => void;
  actionIcon?: any;
}) => (
  <TouchableOpacity
    style={[
      styles.gridItem,
      borderRight && { borderRightWidth: 1, borderRightColor: theme.border },
      borderBottom && { borderBottomWidth: 1, borderBottomColor: theme.border },
    ]}
    onPress={onPress}
    activeOpacity={onPress ? 0.6 : 1}
    disabled={!onPress}
  >
    <Text style={styles.gridLabel}>{label}</Text>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {isBadge ? (
        <View
          style={[
            styles.badge,
            {
              backgroundColor:
                value === 'Production' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(37, 99, 235, 0.15)',
            },
          ]}
        >
          <Text
            style={[
              styles.badgeText,
              { color: value === 'Production' ? theme.accentGreen : theme.primary },
            ]}
          >
            {value}
          </Text>
        </View>
      ) : (
        <Text style={styles.gridValue}>{value}</Text>
      )}
      {actionIcon && <MaterialIcon name={actionIcon} size={14} color={theme.primary} />}
    </View>
  </TouchableOpacity>
);

// --- MAIN SCREEN ---
const AboutScreen: React.FC = () => {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isCompact = width < 360;
  const isVeryCompact = width < 330;
  const isExpoGo = Constants.appOwnership === 'expo';
  const isOnline = useInternetStatus();
  const { showToast, showActionToast } = useToast();
  const [scrollOffset, setScrollOffset] = useState(0);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  // Update State
  const [checking, setChecking] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [failureCount, setFailureCount] = useState(0);

  useEffect(() => {
    AsyncStorage.getItem('UPDATE_FAIL_COUNT').then((val) => {
      if (val) setFailureCount(Number(val));
    });
  }, []);

  const isOfflineNow = useCallback(async (): Promise<boolean> => {
    if (!isOnline) return true;
    try {
      const state = await NetInfo.fetch();
      return state.isConnected === false || state.isInternetReachable === false;
    } catch {
      return !isOnline;
    }
  }, [isOnline]);

  const applyUpdate = useCallback(async () => {
    if (isExpoGo) return;
    if (!isOnline) {
      showToast('You are offline.', 'info');
      return;
    }

    setChecking(true);
    try {
      const applied = await applyOtaUpdateAndReload({ checkBeforeFetch: false, timeoutMs: 3000 });
      if (!applied) {
        throw new Error('Update failed.');
      }
    } catch (err: any) {
      if (await isOfflineNow()) {
        showToast('You are offline.', 'info');
      } else {
        showToast(err?.message || 'Update failed.', 'error');
        const newCount = failureCount + 1;
        setFailureCount(newCount);
        AsyncStorage.setItem('UPDATE_FAIL_COUNT', String(newCount));
      }
    } finally {
      setChecking(false);
    }
  }, [failureCount, isExpoGo, isOfflineNow, isOnline, showToast]);

  const checkForUpdates = useCallback(async () => {
    if (isExpoGo) {
      showToast('Updates are managed by Expo Go.', 'info');
      return;
    }
    if (!isOnline) {
      showToast('You are offline.', 'info');
      return;
    }

    setChecking(true);
    try {
      const result = await Updates.checkForUpdateAsync();
      if (result.isAvailable) {
        setUpdateAvailable(true);
        showActionToast('Update available.', 'Install', applyUpdate);
      } else {
        setUpdateAvailable(false);
        showToast("You're up to date.", 'success');
      }
    } catch (err: any) {
      showToast('Check failed. Try again later.', 'error');
    } finally {
      setChecking(false);
    }
  }, [applyUpdate, isExpoGo, isOnline, showActionToast, showToast]);

  const clearRetryState = async () => {
    await AsyncStorage.removeItem('UPDATE_FAIL_COUNT');
    setFailureCount(0);
    showToast('Retry count cleared.', 'success');
  };

  const updateId = Updates.updateId || 'Embedded';
  const shortId = updateId === 'Embedded' ? updateId : updateId.substring(0, 8);

  const copyUpdateId = () => {
    Clipboard.setString(updateId);
    Alert.alert('Copied', 'Build ID copied to clipboard');
  };

  const handleShare = async () => {
    try {
      const link = await getLatestShareLink();
      Share.share({
        title: 'DhanDiary',
        message: `Check out DhanDiary! ${link}`,
      });
    } catch (e) { }
  };

  const infoGrid = useMemo(
    () => [
      { label: 'Version', value: `v${APP_VERSION}` },
      { label: 'Channel', value: BUILD_TYPE },
      { label: 'Environment', value: __DEV__ ? 'Development' : 'Production', isBadge: true },
      { label: 'Build ID', value: shortId, onPress: copyUpdateId, actionIcon: 'content-copy' },
    ],
    [shortId]
  );

  return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      <View
        style={[
          styles.headerContainer,
          { paddingTop: insets.top, paddingHorizontal: isCompact ? 16 : 20 },
        ]}
      >
        <ScreenHeader
          title="About"
          subtitle="System status & info"
          showScrollHint
          scrollOffset={scrollOffset}
          useSafeAreaPadding={false}
        />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom: insets.bottom + 40,
            paddingHorizontal: isCompact ? 16 : 20,
          },
        ]}
        onScroll={(e) => setScrollOffset(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
      >
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          {/* 1. HERO CARD */}
          <View style={[styles.heroCard, isCompact && styles.heroCardCompact]}>
            <View style={[styles.heroContent, isVeryCompact && styles.heroContentStack]}>
              <View style={styles.heroIconContainer}>
                <Image
                  source={require('../../assets/splash-icon.png')}
                  style={styles.heroIcon}
                  resizeMode="contain"
                />
              </View>
              <View style={[styles.heroText, isVeryCompact && styles.heroTextStack]}>
                <Text style={styles.heroTitle}>DhanDiary</Text>
                <Text style={styles.heroSubtitle}>Smart Finance Tracker</Text>
                <SystemStatus />
              </View>
            </View>

            <View style={styles.heroDivider} />

            <View style={[styles.heroFooter, isCompact && styles.heroFooterStack]}>
              <Text style={styles.heroFooterText}>
                Designed by <Text style={styles.heroBrand}>{BRAND_NAME}</Text>
              </Text>
              <View style={[styles.visitBtnRow, isCompact && styles.visitBtnRowWrap]}>
                <TouchableOpacity
                  style={[styles.visitBtn, isCompact && styles.visitBtnWrapItem]}
                  onPress={() => Linking.openURL(ELLOW_URL)}
                >
                  <Text style={styles.visitText}>EllowDigital</Text>
                  <MaterialIcon name="arrow-forward" size={14} color="#fff" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.visitBtn, isCompact && styles.visitBtnWrapItem]}
                  onPress={() => Linking.openURL(APP_WEBSITE_URL)}
                >
                  <Text style={styles.visitText}>App Website</Text>
                  <MaterialIcon name="arrow-forward" size={14} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* 2. SYSTEM INFO */}
          <Text style={styles.sectionHeader}>System Information</Text>
          <View style={styles.denseGrid}>
            {isVeryCompact ? (
              <>
                <GridItem {...infoGrid[0]} borderBottom />
                <GridItem {...infoGrid[1]} borderBottom />
                <GridItem {...infoGrid[2]} borderBottom />
                <GridItem {...infoGrid[3]} />
              </>
            ) : (
              <>
                <View style={styles.gridRow}>
                  <GridItem {...infoGrid[0]} borderRight />
                  <GridItem {...infoGrid[1]} />
                </View>
                <View style={styles.gridDivider} />
                <View style={styles.gridRow}>
                  <GridItem {...infoGrid[2]} borderRight />
                  <GridItem {...infoGrid[3]} />
                </View>
              </>
            )}
          </View>

          {/* 3. UPDATE CENTER */}
          <Text style={styles.sectionHeader}>Update Center</Text>
          <View style={styles.actionCard}>
            <View style={[styles.actionRow, isVeryCompact && styles.actionRowStack]}>
              <View
                style={[
                  styles.iconBoxLarge,
                  {
                    backgroundColor: updateAvailable
                      ? 'rgba(16, 185, 129, 0.1)'
                      : theme.primarySoft,
                  },
                ]}
              >
                <MaterialIcon
                  name={updateAvailable ? 'cloud-download' : 'system-update'}
                  size={24}
                  color={updateAvailable ? theme.accentGreen : theme.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>App Version</Text>
                <Text style={styles.cardDesc}>
                  {!isOnline
                    ? 'You are offline.'
                    : updateAvailable
                      ? 'New features available.'
                      : 'You are up to date.'}
                </Text>
              </View>
            </View>

            <Button
              title={
                checking ? 'Checking...' : updateAvailable ? 'Update Now' : 'Check for Updates'
              }
              loading={checking}
              onPress={updateAvailable ? applyUpdate : checkForUpdates}
              buttonStyle={[
                styles.mainBtn,
                updateAvailable && { backgroundColor: theme.accentGreen },
              ]}
              titleStyle={{ fontWeight: '600', fontSize: 14 }}
              icon={
                !checking && !updateAvailable ? (
                  <MaterialIcon name="refresh" size={16} color="white" style={{ marginRight: 8 }} />
                ) : undefined
              }
            />

            {failureCount > 0 && (
              <TouchableOpacity style={styles.errorRow} onPress={clearRetryState}>
                <MaterialIcon name="error-outline" size={16} color={theme.accentRed} />
                <Text style={styles.errorText}>
                  Update failed {failureCount} times. Tap to reset.
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* 4. FOOTER BUTTONS */}
          <View style={[styles.buttonRow, isCompact && styles.buttonRowStack]}>
            <TouchableOpacity
              style={[styles.halfBtn, isCompact && styles.halfBtnFull]}
              onPress={handleShare}
            >
              <MaterialIcon name="share" size={20} color={theme.primary} />
              <Text style={styles.halfBtnText}>Share App</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.halfBtn, isCompact && styles.halfBtnFull]}
              onPress={() => Linking.openURL('mailto:ellowdigitalindia@gmail.com')}
            >
              <MaterialIcon name="mail-outline" size={20} color={theme.primary} />
              <Text style={styles.halfBtnText}>Contact Us</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.copyright}>
            © {new Date().getFullYear()} {BRAND_NAME}. All rights reserved.
          </Text>
        </Animated.View>
      </ScrollView>
    </View>
  );
};

// --- STYLES ---
const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: theme.background },
  headerContainer: { paddingHorizontal: 20, backgroundColor: theme.background },
  scrollContent: { paddingHorizontal: 20, paddingTop: 10, flexGrow: 1 },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.textSecondary,
    marginBottom: 10,
    marginTop: 24,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginLeft: 4,
  },

  // Hero Card
  heroCard: {
    backgroundColor: theme.heroBg,
    borderRadius: 24,
    padding: 24,
    marginBottom: 12,
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  heroCardCompact: {
    padding: 18,
    borderRadius: 20,
  },
  heroContent: { flexDirection: 'row', alignItems: 'center' },
  heroContentStack: { flexDirection: 'column', alignItems: 'flex-start' },
  heroIconContainer: { padding: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20 },
  heroIcon: { width: 56, height: 56 },
  heroText: { marginLeft: 16, flex: 1, justifyContent: 'center' },
  heroTextStack: { marginLeft: 0, marginTop: 12, width: '100%' },
  heroTitle: { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  heroSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  heroDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 20 },
  heroFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroFooterStack: { flexDirection: 'column', alignItems: 'flex-start' },
  heroFooterText: { color: 'rgba(255,255,255,0.5)', fontSize: 12, flexShrink: 1 },
  heroBrand: { color: '#fff', fontWeight: '700' },

  // Status Pill
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  pillPositive: { backgroundColor: 'rgba(16,185,129,0.08)' },
  pillWarning: { backgroundColor: 'rgba(245,158,11,0.08)' },
  pillNeutral: { backgroundColor: 'rgba(148,163,184,0.06)' },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.accentGreen,
    marginRight: 6,
  },
  activeText: { color: theme.accentGreen, fontSize: 11, fontWeight: '700' },

  // Visit Btn
  visitBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  visitBtnRowWrap: {
    flexWrap: 'wrap',
    marginTop: 10,
  },
  visitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 100,
    gap: 4,
    maxWidth: '100%',
  },
  visitBtnWrapItem: {
    marginRight: 8,
    marginTop: 8,
  },
  visitText: { color: '#fff', fontSize: 12, fontWeight: '600', flexShrink: 1 },

  // Grid
  denseGrid: {
    backgroundColor: theme.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  gridRow: { flexDirection: 'row' },
  gridDivider: { height: 1, backgroundColor: theme.border, width: '100%' },
  gridItem: { flex: 1, padding: 16, alignItems: 'flex-start' },
  gridLabel: {
    fontSize: 11,
    color: theme.textSecondary,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  gridValue: { fontSize: 14, color: theme.text, fontWeight: '700' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontSize: 12, fontWeight: '700' },

  // Action Card
  actionCard: {
    backgroundColor: theme.surface,
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: theme.border,
  },
  actionRow: { flexDirection: 'row', gap: 16, marginBottom: 16 },
  actionRowStack: { flexDirection: 'column', gap: 12 },
  iconBoxLarge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: 4 },
  cardDesc: { fontSize: 13, color: theme.textSecondary, lineHeight: 18 },
  mainBtn: { backgroundColor: theme.primary, borderRadius: 14, paddingVertical: 12 },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    gap: 6,
  },
  errorText: { fontSize: 12, color: theme.accentRed, fontWeight: '500' },

  // Footer Buttons
  buttonRow: { flexDirection: 'row', gap: 12, marginTop: 24, marginBottom: 30 },
  buttonRowStack: { flexDirection: 'column' },
  halfBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.surface,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    gap: 8,
  },
  halfBtnFull: {
    flex: 0,
    width: '100%',
  },
  halfBtnText: { fontSize: 14, fontWeight: '600', color: theme.text },
  copyright: {
    textAlign: 'center',
    fontSize: 12,
    color: theme.textSecondary,
    opacity: 0.5,
    paddingBottom: 20,
  },
});

export default AboutScreen;

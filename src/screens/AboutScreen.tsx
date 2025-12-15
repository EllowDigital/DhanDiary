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
  Modal,
  Animated,
  Easing,
  StatusBar,
  useWindowDimensions,
  Clipboard,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Text } from '@rneui/themed';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';

// --- PLACEHOLDERS (Replace with your actual imports) ---
import ScreenHeader from '../components/ScreenHeader';
import getLatestShareLink from '../utils/shareLink';
let pkg: any = {};
try {
  const req: any = typeof globalThis !== 'undefined' && typeof (globalThis as any).require === 'function' ? (globalThis as any).require : typeof require === 'function' ? require : null;
  if (req) pkg = req('../../package.json');
} catch (e) {
  pkg = {};
}

// --- THEME CONFIGURATION ---
const theme = {
  background: '#F8F9FA',
  surface: '#FFFFFF',
  primary: '#2563EB',
  primarySoft: '#EFF6FF',
  text: '#1E293B',
  textSecondary: '#64748B',
  accentGreen: '#10B981',
  accentRed: '#EF4444',
  heroBg: '#0F172A',
  border: '#E2E8F0', // Slightly darker border for the grid
};

// --- CONSTANTS ---
const ELLOW_URL = 'https://ellowdigital.netlify.app';
const BRAND_NAME = 'EllowDigital';
const BUILD_TYPE =
  Constants.expoConfig?.extra?.BUILD_TYPE || (pkg.version.includes('beta') ? 'Beta' : 'Release');

const AboutScreen: React.FC = () => {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isExpoGo = Constants.appOwnership === 'expo';

  // --- ANIMATIONS ---
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
    ]).start();
  }, []);

  // --- STATE ---
  const [checking, setChecking] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [failureCount, setFailureCount] = useState(0);

  useEffect(() => {
    AsyncStorage.getItem('UPDATE_FAIL_COUNT').then((val) => {
      if (val) setFailureCount(Number(val));
    });
  }, []);

  // --- UPDATE LOGIC (Original) ---
  const checkForUpdates = useCallback(async () => {
    if (isExpoGo) return Alert.alert('Expo Go', 'OTA updates are not supported in Expo Go.');

    setChecking(true);
    try {
      const result = await Updates.checkForUpdateAsync();
      if (result.isAvailable) {
        setUpdateAvailable(true);
        setShowUpdateModal(true);
      } else {
        setUpdateAvailable(false);
        Alert.alert('Up to Date', 'You are running the latest version.');
      }
    } catch (err: any) {
      Alert.alert('Check Failed', err.message);
    } finally {
      setChecking(false);
    }
  }, [isExpoGo]);

  const applyUpdate = useCallback(async () => {
    if (isExpoGo) return;
    setChecking(true);
    try {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    } catch (err: any) {
      Alert.alert('Update Failed', err.message);
      const newCount = failureCount + 1;
      setFailureCount(newCount);
      AsyncStorage.setItem('UPDATE_FAIL_COUNT', String(newCount));
    } finally {
      setChecking(false);
      setShowUpdateModal(false);
    }
  }, [failureCount, isExpoGo]);

  const clearRetryState = async () => {
    await AsyncStorage.removeItem('UPDATE_FAIL_COUNT');
    setFailureCount(0);
  };

  // --- INFO DATA ---
  const updateId = Updates.updateId || 'Embedded';
  const shortId = updateId === 'Embedded' ? updateId : updateId.substring(0, 6);

  const copyUpdateId = () => {
    Clipboard.setString(updateId);
    Alert.alert('Copied', 'Update ID copied to clipboard');
  };

  const handleShare = async () => {
    const link = await getLatestShareLink().catch(() => ELLOW_URL);
    Share.share({
      title: 'DhanDiary',
      message: `Manage your finances smartly with DhanDiary! Download: ${link}`,
    });
  };

  const infoGrid = useMemo(
    () => [
      { label: 'Version', value: pkg.version, icon: 'tag' },
      { label: 'Channel', value: BUILD_TYPE, icon: 'layers' },
      {
        label: 'Env',
        value: process.env.NODE_ENV === 'production' ? 'Prod' : 'Dev',
        icon: 'code',
      },
      {
        label: 'Build ID',
        value: shortId,
        icon: 'fingerprint',
        onPress: copyUpdateId,
      },
    ],
    [shortId]
  );

  return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent={true} />

      {/* HEADER */}
      <View
        style={{ paddingTop: insets.top, paddingHorizontal: 20, backgroundColor: theme.background }}
      >
        <ScreenHeader
          title="About"
          subtitle="System status & info"
          showScrollHint={false}
          useSafeAreaPadding={false}
        />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
      >
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          {/* 1. HERO CARD (Original Design) */}
          <View style={styles.heroCard}>
            <View style={styles.heroContent}>
              <Image
                source={require('../../assets/splash-icon.png')}
                style={styles.heroIcon}
                resizeMode="contain"
              />
              <View style={styles.heroText}>
                <Text style={styles.heroTitle}>DhanDiary</Text>
                <Text style={styles.heroSubtitle}>Smart Personal Finance</Text>

                <View style={styles.activePill}>
                  <View style={styles.activeDot} />
                  <Text style={styles.activeText}>System Operational</Text>
                </View>
              </View>
            </View>

            <View style={styles.heroDivider} />

            <View style={styles.heroFooter}>
              <Text style={styles.heroFooterText}>
                Crafted by <Text style={styles.heroBrand}>{BRAND_NAME}</Text>
              </Text>
              <TouchableOpacity style={styles.visitBtn} onPress={() => Linking.openURL(ELLOW_URL)}>
                <Text style={styles.visitText}>Visit Website</Text>
                <MaterialIcon name="arrow-forward" size={14} color="rgba(255,255,255,0.9)" />
              </TouchableOpacity>
            </View>
          </View>

          {/* 2. SYSTEM INFO (NEW COMPACT / MINIMAL DESIGN) */}
          <Text style={styles.sectionHeader}>System Information</Text>
          <View style={styles.denseGrid}>
            <View style={styles.gridRow}>
              <GridItem item={infoGrid[0]} borderRight />
              <GridItem item={infoGrid[1]} />
            </View>
            <View style={styles.gridDivider} />
            <View style={styles.gridRow}>
              <GridItem item={infoGrid[2]} borderRight />
              <GridItem item={infoGrid[3]} />
            </View>
          </View>

          {/* 3. UPDATES & ACTIONS (Original Design) */}
          <Text style={styles.sectionHeader}>Updates & Support</Text>

          <View style={styles.actionCard}>
            <View style={styles.actionRow}>
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
                  {updateAvailable
                    ? 'New version available for install.'
                    : 'You are on the latest version.'}
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

          {/* Support Buttons Row (Original Design) */}
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.halfBtn} onPress={handleShare}>
              <MaterialIcon name="share" size={20} color={theme.primary} />
              <Text style={styles.halfBtnText}>Share App</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.halfBtn}
              onPress={() => Linking.openURL('mailto:support@ellow.digitial')}
            >
              <MaterialIcon name="mail-outline" size={20} color={theme.primary} />
              <Text style={styles.halfBtnText}>Contact Us</Text>
            </TouchableOpacity>
          </View>

          {/* FOOTER */}
          <Text style={styles.copyright}>
            © {new Date().getFullYear()} {BRAND_NAME}
          </Text>
        </Animated.View>
      </ScrollView>

      {/* UPDATE MODAL */}
      <Modal
        visible={showUpdateModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowUpdateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={[styles.modalIcon, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
              <MaterialIcon name="arrow-downward" size={32} color={theme.accentGreen} />
            </View>
            <Text style={styles.modalTitle}>Update Ready</Text>
            <Text style={styles.modalText}>
              A new version of DhanDiary is ready to install. This will only take a moment.
            </Text>

            <Button
              title="Install Update"
              onPress={applyUpdate}
              buttonStyle={{
                backgroundColor: theme.accentGreen,
                borderRadius: 12,
                paddingVertical: 12,
              }}
              containerStyle={{ width: '100%', marginBottom: 10 }}
            />
            <Button
              title="Not Now"
              type="clear"
              onPress={() => setShowUpdateModal(false)}
              titleStyle={{ color: theme.textSecondary }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
};

// --- SUB-COMPONENT FOR THE NEW SYSTEM INFO GRID ---
const GridItem = ({ item, borderRight }: { item: any; borderRight?: boolean }) => (
  <TouchableOpacity
    style={[
      styles.gridItem,
      borderRight && { borderRightWidth: 1, borderRightColor: theme.border },
    ]}
    onPress={item.onPress}
    activeOpacity={item.onPress ? 0.6 : 1}
    disabled={!item.onPress}
  >
    <Text style={styles.gridLabel}>{item.label}</Text>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Text style={styles.gridValue}>{item.value}</Text>
      {item.icon && <MaterialIcon name={item.icon} size={12} color={theme.textSecondary} />}
    </View>
  </TouchableOpacity>
);

export default AboutScreen;

/* --- STYLES --- */
const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: theme.background,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
    flexGrow: 1,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.textSecondary,
    marginBottom: 12,
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  /* HERO CARD (Original) */
  heroCard: {
    backgroundColor: theme.heroBg,
    borderRadius: 24,
    padding: 24,
    marginBottom: 24,
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  heroContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  heroText: {
    marginLeft: 16,
    flex: 1,
    justifyContent: 'center',
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.accentGreen,
    marginRight: 6,
  },
  activeText: {
    color: theme.accentGreen,
    fontSize: 11,
    fontWeight: '700',
  },
  heroDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 16,
  },
  heroFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  heroFooterText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
  },
  heroBrand: {
    color: '#fff',
    fontWeight: '700',
  },
  visitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 100,
  },
  visitText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginRight: 4,
  },

  /* NEW COMPACT GRID STYLES */
  denseGrid: {
    backgroundColor: theme.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  gridRow: {
    flexDirection: 'row',
  },
  gridDivider: {
    height: 1,
    backgroundColor: theme.border,
    width: '100%',
  },
  gridItem: {
    flex: 1,
    padding: 16,
    alignItems: 'flex-start',
  },
  gridLabel: {
    fontSize: 11,
    color: theme.textSecondary,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  gridValue: {
    fontSize: 14,
    color: theme.text,
    fontWeight: '700',
  },

  /* ACTIONS & UPDATES (Original) */
  actionCard: {
    backgroundColor: theme.surface,
    borderRadius: 20,
    padding: 20,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: theme.border,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  iconBoxLarge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.text,
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 13,
    color: theme.textSecondary,
    lineHeight: 18,
  },
  mainBtn: {
    backgroundColor: theme.primary,
    borderRadius: 14,
    paddingVertical: 12,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    gap: 6,
  },
  errorText: {
    fontSize: 12,
    color: theme.accentRed,
    fontWeight: '500',
  },

  /* SUPPORT BUTTONS (Original) */
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 30,
  },
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
  halfBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.text,
  },
  copyright: {
    textAlign: 'center',
    fontSize: 12,
    color: theme.textSecondary,
    opacity: 0.5,
    paddingBottom: 20,
  },

  /* MODAL */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: theme.surface,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    elevation: 24,
  },
  modalIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.text,
    marginBottom: 8,
  },
  modalText: {
    textAlign: 'center',
    color: theme.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 24,
  },
});

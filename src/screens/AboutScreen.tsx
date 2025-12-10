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
  Platform,
  StatusBar,
  useWindowDimensions,
  Clipboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Text } from '@rneui/themed';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';

// Utils & Components
import { colors, spacing } from '../utils/design';
import getLatestShareLink from '../utils/shareLink';
import ScreenHeader from '../components/ScreenHeader';

const pkg = require('../../package.json');

// --- CONSTANTS ---
const ELLOW_URL = 'https://ellowdigital.netlify.app';
const BRAND_NAME = 'EllowDigital';
const BUILD_TYPE =
  Constants.expoConfig?.extra?.BUILD_TYPE || (pkg.version.includes('beta') ? 'Beta' : 'Release');

const AboutScreen: React.FC = () => {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const isExpoGo = Constants.appOwnership === 'expo';

  // --- ANIMATIONS ---
  // Standard Animated API (Crash-proof)
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

  // Load failure count
  useEffect(() => {
    AsyncStorage.getItem('UPDATE_FAIL_COUNT').then((val) => {
      if (val) setFailureCount(Number(val));
    });
  }, []);

  // --- UPDATE LOGIC ---
  const checkForUpdates = useCallback(async () => {
    if (isExpoGo) return Alert.alert('Expo Go', 'OTA updates are not supported in Expo Go.');

    setChecking(true);
    try {
      const result = await Updates.checkForUpdateAsync();
      if (result.isAvailable) {
        setUpdateAvailable(true);
        setShowUpdateModal(true); // Auto show modal if found
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
      // Increment failure count
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

  // --- SHARING ---
  const handleShare = async () => {
    const link = await getLatestShareLink().catch(() => ELLOW_URL);
    Share.share({
      title: 'DhanDiary',
      message: `Manage your finances smartly with DhanDiary! Download: ${link}`,
    });
  };

  // --- INFO TILES DATA ---
  const updateId = Updates.updateId || 'Embedded';
  const shortId = updateId === 'Embedded' ? updateId : updateId.substring(0, 8) + '...';

  const copyUpdateId = () => {
    Clipboard.setString(updateId);
    Alert.alert('Copied', 'Update ID copied to clipboard');
  };

  const infoGrid = useMemo(
    () => [
      { label: 'Version', value: pkg.version, icon: 'tag' },
      { label: 'Build Channel', value: BUILD_TYPE, icon: 'layers' },
      { label: 'Env', value: process.env.NODE_ENV === 'production' ? 'Prod' : 'Dev', icon: 'code' },
      { label: 'Update ID', value: shortId, icon: 'fingerprint', onPress: copyUpdateId },
    ],
    [shortId]
  );

  return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <SafeAreaView style={styles.safeArea}>
        <View style={[styles.centerContainer, { maxWidth: isTablet ? 600 : '100%' }]}>
          <ScreenHeader
            title="About"
            subtitle="Version info & updates"
            showScrollHint={false}
            useSafeAreaPadding={false}
          />

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
              {/* 1. HERO BRAND CARD */}
              <View style={styles.heroCard}>
                <View style={styles.heroContent}>
                  <Image
                    source={require('../../assets/icon.png')}
                    style={styles.appIcon}
                    resizeMode="contain"
                  />
                  <View style={styles.heroText}>
                    <Text style={styles.appName}>DhanDiary</Text>
                    <Text style={styles.appDesc}>Smart Personal Finance</Text>
                  </View>
                </View>
                <View style={styles.heroFooter}>
                  <Text style={styles.heroFooterText}>
                    Crafted by <Text style={styles.brandName}>{BRAND_NAME}</Text>
                  </Text>
                  <TouchableOpacity onPress={() => Linking.openURL(ELLOW_URL)}>
                    <MaterialIcon name="open-in-new" size={16} color="rgba(255,255,255,0.8)" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* 2. TECH SPECS GRID (BENTO STYLE) */}
              <View style={styles.gridContainer}>
                {infoGrid.map((item, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.gridItem}
                    activeOpacity={item.onPress ? 0.7 : 1}
                    onPress={item.onPress}
                  >
                    <View style={styles.gridLabelRow}>
                      <MaterialIcon name={item.icon as any} size={14} color={colors.muted} />
                      <Text style={styles.gridLabel}>{item.label}</Text>
                    </View>
                    <Text style={styles.gridValue}>{item.value}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* 3. UPDATES SECTION */}
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <MaterialIcon name="system-update" size={20} color={colors.primary} />
                  <Text style={styles.sectionTitle}>App Updates</Text>
                </View>

                <Text style={styles.sectionDesc}>
                  We push over-the-air updates to fix bugs and add features instantly.
                </Text>

                <View style={styles.actionRow}>
                  <Button
                    title={
                      checking
                        ? 'Checking...'
                        : updateAvailable
                          ? 'Update Available'
                          : 'Check for Updates'
                    }
                    loading={checking}
                    onPress={checkForUpdates}
                    icon={
                      <MaterialIcon
                        name="refresh"
                        size={18}
                        color="white"
                        style={{ marginRight: 8 }}
                      />
                    }
                    buttonStyle={styles.primaryBtn}
                    containerStyle={{ flex: 1 }}
                  />
                </View>

                {/* FAILURE RECOVERY UI */}
                {failureCount > 0 && (
                  <View style={styles.errorBox}>
                    <MaterialIcon name="warning" size={18} color={colors.accentOrange} />
                    <Text style={styles.errorText}>Update failed {failureCount} times.</Text>
                    <TouchableOpacity onPress={clearRetryState}>
                      <Text style={styles.errorAction}>Reset</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* 4. SUPPORT & SHARE */}
              <View style={styles.rowActions}>
                <TouchableOpacity style={styles.actionCard} onPress={handleShare}>
                  <View style={[styles.iconCircle, { backgroundColor: colors.accentGreen }]}>
                    <MaterialIcon name="share" size={20} color="white" />
                  </View>
                  <View>
                    <Text style={styles.actionTitle}>Share App</Text>
                    <Text style={styles.actionSub}>Invite friends</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionCard}
                  onPress={() => Linking.openURL('mailto:support@ellow.digitial')}
                >
                  <View style={[styles.iconCircle, { backgroundColor: colors.secondary }]}>
                    <MaterialIcon name="mail" size={20} color="white" />
                  </View>
                  <View>
                    <Text style={styles.actionTitle}>Support</Text>
                    <Text style={styles.actionSub}>Get help</Text>
                  </View>
                </TouchableOpacity>
              </View>

              <Text style={styles.legalText}>
                © {new Date().getFullYear()} {BRAND_NAME}. All rights reserved.
              </Text>
            </Animated.View>
          </ScrollView>
        </View>

        {/* UPDATE MODAL */}
        <Modal
          visible={showUpdateModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowUpdateModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <View style={styles.modalIcon}>
                <MaterialIcon name="download" size={32} color={colors.primary} />
              </View>
              <Text style={styles.modalTitle}>New Update Available</Text>
              <Text style={styles.modalDesc}>
                A new version of DhanDiary is ready. It will take a few seconds to install.
              </Text>
              <Button
                title="Update Now"
                onPress={applyUpdate}
                buttonStyle={styles.modalBtnPrimary}
              />
              <Button
                title="Later"
                type="clear"
                titleStyle={{ color: colors.muted }}
                onPress={() => setShowUpdateModal(false)}
              />
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </View>
  );
};

export default AboutScreen;

/* --- STYLES --- */
const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  safeArea: {
    flex: 1,
  },
  centerContainer: {
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 20,
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
    paddingTop: 10,
  },

  /* HERO CARD */
  heroCard: {
    backgroundColor: colors.primary,
    borderRadius: 24,
    padding: 24,
    marginBottom: 20,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 6,
  },
  heroContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  appIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  heroText: {
    marginLeft: 16,
  },
  appName: {
    fontSize: 24,
    fontWeight: '800',
    color: 'white',
    letterSpacing: -0.5,
  },
  appDesc: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    marginTop: 4,
  },
  heroFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.1)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  heroFooterText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
  },
  brandName: {
    fontWeight: '700',
    color: '#FFF',
  },

  /* BENTO GRID */
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  gridItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  gridLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  gridLabel: {
    fontSize: 12,
    color: colors.muted,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  gridValue: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },

  /* SECTIONS */
  sectionCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  sectionDesc: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
    marginBottom: 16,
  },
  actionRow: {
    flexDirection: 'row',
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
  },

  /* ERROR BOX */
  errorBox: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    padding: 12,
    borderRadius: 12,
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: colors.accentRed,
  },
  errorAction: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accentRed,
  },

  /* ROW ACTIONS */
  rowActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 30,
  },
  actionCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  actionSub: {
    fontSize: 12,
    color: colors.muted,
  },

  /* FOOTER */
  legalText: {
    textAlign: 'center',
    color: colors.muted,
    fontSize: 12,
    marginBottom: 20,
    opacity: 0.6,
  },

  /* MODAL */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContainer: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
  },
  modalIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  modalDesc: {
    textAlign: 'center',
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 24,
  },
  modalBtnPrimary: {
    width: '100%',
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    minWidth: 200,
  },
});

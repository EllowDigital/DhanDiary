import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Constants from 'expo-constants';
import {
  View,
  StyleSheet,
  Image,
  TouchableOpacity,
  Linking,
  ScrollView,
  useWindowDimensions,
  Share,
} from 'react-native';
import { Text, Button } from '@rneui/themed';
import { Alert, Modal, View as RNView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import UpdateBanner from '../components/UpdateBanner';
import * as Updates from 'expo-updates';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { colors } from '../utils/design';

const ELLOW_URL = 'https://ellowdigital.netlify.app';
import getLatestShareLink from '../utils/shareLink';

const pkg = require('../../package.json');

// Build / runtime metadata (set via EAS config or CI env)
const extra: any = (Constants as any)?.expoConfig?.extra || {};
const BUILD_TYPE =
  process.env.BUILD_TYPE ||
  extra.BUILD_TYPE ||
  (pkg.version.includes('-beta') ? 'Beta' : 'Release');

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const useResponsiveMetrics = () => {
  const { width } = useWindowDimensions();
  const normalizedWidth = width || 390;
  const scale = clamp(normalizedWidth / 390, 0.85, 1.2);
  const outerPadding = clamp(normalizedWidth * 0.06, 16, 36);
  const cardPadding = clamp(normalizedWidth * 0.045, 14, 28);
  const fontSize = useCallback((size: number) => Math.round(size * scale), [scale]);
  const gap = clamp(normalizedWidth * 0.04, 16, 28);
  return { fontSize, outerPadding, cardPadding, gap } as const;
};

const AboutScreen: React.FC = () => {
  const { fontSize, outerPadding, cardPadding, gap } = useResponsiveMetrics();
  const styles = useMemo(
    () => createStyles(fontSize, outerPadding, cardPadding, gap),
    [fontSize, outerPadding, cardPadding, gap]
  );
  const fade = useSharedValue(0);

  /* Fade In Animation */
  useEffect(() => {
    fade.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) });
  }, []);

  // Load persisted update failure count
  useEffect(() => {
    (async () => {
      try {
        const v = await AsyncStorage.getItem('UPDATE_FAIL_COUNT');
        setFailureCount(Number(v || '0'));
      } catch (e) {
        // ignore
      }
    })();
  }, []);

  const animatedFadeStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateY: (1 - fade.value) * 16 }],
  }));

  /* Fetch latest share link (normalized) */
  const fetchShareLink = async () => {
    try {
      const link = await getLatestShareLink();
      return link || 'https://ellowdigital.netlify.app';
    } catch (err) {
      console.log('Failed to fetch latest link:', err);
      return 'https://ellowdigital.netlify.app'; // fallback link
    }
  };

  /* UPDATES: expo-updates integration */
  const [checking, setChecking] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [failureCount, setFailureCount] = useState(0);

  const checkForUpdates = async () => {
    try {
      setChecking(true);
      const res = await Updates.checkForUpdateAsync();
      if (res.isAvailable) {
        setUpdateAvailable(true);
        setUpdateInfo(res);
        // show brief in-app banner for a few seconds
        setShowBanner(true);
        // also inform user via alert
        Alert.alert('Update available', 'A JS update is available and can be downloaded.');
      } else {
        setUpdateAvailable(false);
        setUpdateInfo(null);
        Alert.alert('No updates', 'Your app is up to date.');
      }
    } catch (err) {
      console.log('Update check failed', err);
      Alert.alert('Update check failed', String(err));
    } finally {
      setChecking(false);
    }
  };

  const fetchAndApplyUpdate = async () => {
    try {
      setChecking(true);
      // mark pending update for safety; App will clear this on successful boot
      await AsyncStorage.setItem('PENDING_UPDATE', JSON.stringify({ ts: Date.now() }));
      const fetchResult = await Updates.fetchUpdateAsync();
      if (fetchResult.isNew) {
        // Reload to apply the downloaded update
        await Updates.reloadAsync();
      } else {
        Alert.alert('No new update', 'No new update was downloaded.');
      }
    } catch (err) {
      console.log('Failed to fetch/apply update', err);
      Alert.alert('Update failed', String(err));
      // increment failure counter and persist for persistent retry UI
      try {
        const cur = Number((await AsyncStorage.getItem('UPDATE_FAIL_COUNT')) || '0');
        const next = cur + 1;
        await AsyncStorage.setItem('UPDATE_FAIL_COUNT', String(next));
        setFailureCount(next);
      } catch (e) {
        // ignore
      }
      // clear pending flag so user can retry cleanly
      try {
        await AsyncStorage.removeItem('PENDING_UPDATE');
      } catch (_) {}
    } finally {
      setChecking(false);
      setUpdateAvailable(false);
      setUpdateInfo(null);
      setShowBanner(false);
      setShowUpdateModal(false);
    }
  };

  /* SHARE APP BUTTON */
  const handleShare = async () => {
    const latestLink = await fetchShareLink();

    try {
      await Share.share({
        title: 'DhanDiary – Smart Personal Finance Tracker',
        message: `📲 Check out DhanDiary! Smart personal finance & expense manager.\n\nDownload now 👉 ${latestLink}`,
      });
    } catch (err) {
      console.log('Share error:', err);
    }
  };

  const InfoRow = ({ label, value }: { label: string; value: string }) => (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );

  return (
    <Animated.View style={[styles.container, animatedFadeStyle]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* HEADER: horizontal layout - icon left, text right */}
        <View style={styles.headerContainer}>
          <Image source={require('../../assets/icon.png')} style={styles.appIcon} />
          <View style={styles.headerText}>
            <Text style={styles.appName}>DhanDiary</Text>
            <Text style={styles.appSubtitle}>Smart Personal Finance Tracker</Text>
          </View>
        </View>

        {/* MAIN CARD */}
        <View style={styles.card}>
          <InfoRow label="App Version" value={pkg.version} />
          <InfoRow label="Build Type" value={String(BUILD_TYPE)} />
          <InfoRow
            label="Environment"
            value={process.env.NODE_ENV === 'production' ? 'Production' : 'Development'}
          />
          {/* Commit and build timestamp removed from About screen for privacy/stability */}

          <Text style={styles.description}>
            DhanDiary helps you manage expenses, income, and personal finances with a powerful
            offline-first system that syncs automatically when you're online.
          </Text>
        </View>

        {/* ACTIONS */}
        <Button
          title={checking ? 'Checking…' : 'Check for Updates'}
          onPress={checkForUpdates}
          icon={
            <MaterialIcon
              name="system-update"
              color={colors.white}
              size={fontSize(18)}
              style={{ marginRight: 8 }}
            />
          }
          buttonStyle={styles.actionButton}
          titleStyle={styles.actionButtonTitle}
        />
        {updateAvailable ? (
          <Button
            title={checking ? 'Applying…' : 'Download & Apply Update'}
            onPress={() => setShowUpdateModal(true)}
            icon={
              <MaterialIcon
                name="file-download"
                color={colors.white}
                size={fontSize(18)}
                style={{ marginRight: 8 }}
              />
            }
            buttonStyle={[styles.actionButton, { backgroundColor: colors.accentGreen }]}
            titleStyle={styles.actionButtonTitle}
          />
        ) : null}

        {/* inline banner that appears briefly when update found */}
        <UpdateBanner
          visible={showBanner}
          message={`New update available — v${pkg.version}`}
          duration={4500}
          onPress={() => setShowUpdateModal(true)}
          onClose={() => setShowBanner(false)}
        />

        {/* Update details modal */}
        <Modal
          visible={showUpdateModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowUpdateModal(false)}
        >
          <RNView
            style={{
              flex: 1,
              backgroundColor: colors.backdrop,
              justifyContent: 'center',
              padding: 20,
            }}
          >
            <RNView style={{ backgroundColor: colors.card, borderRadius: 12, padding: 18 }}>
              <Text
                style={{
                  fontSize: fontSize(18),
                  fontWeight: '700',
                  marginBottom: 8,
                  color: colors.text,
                }}
              >
                New Update
              </Text>
              <Text style={{ marginBottom: 10, color: colors.subtleText }}>
                Version: {pkg.version}
              </Text>
              <Text style={{ marginBottom: 14, color: colors.subtleText }}>
                {updateInfo && updateInfo?.manifest && updateInfo.manifest?.releaseNotes
                  ? updateInfo.manifest.releaseNotes
                  : 'No release notes available.'}
              </Text>
              <Button
                title={checking ? 'Applying…' : 'Download & Install'}
                onPress={fetchAndApplyUpdate}
                buttonStyle={{
                  backgroundColor: colors.accentGreen,
                  borderRadius: 10,
                  marginBottom: 8,
                }}
              />
              <Button
                title="Cancel"
                onPress={() => setShowUpdateModal(false)}
                buttonStyle={{ backgroundColor: colors.border, borderRadius: 10 }}
                titleStyle={{ color: colors.strongMuted }}
              />
            </RNView>
          </RNView>
        </Modal>
        <Button
          title="Share with Friends"
          onPress={handleShare}
          icon={
            <MaterialIcon
              name="share"
              color={colors.white}
              size={fontSize(18)}
              style={{ marginRight: 8 }}
            />
          }
          buttonStyle={styles.actionButton}
          titleStyle={styles.actionButtonTitle}
        />
        <Button
          title="Contact Developer"
          onPress={() =>
            Linking.openURL(`mailto:sarwanyadav26@outlook.com?subject=DhanDiary%20Feedback`)
          }
          icon={
            <MaterialIcon
              name="email"
              color={colors.strongMuted}
              size={fontSize(18)}
              style={{ marginRight: 8 }}
            />
          }
          buttonStyle={[styles.actionButton, styles.secondaryActionButton]}
          titleStyle={[styles.actionButtonTitle, styles.secondaryActionButtonTitle]}
        />

        {/* Persistent retry UI shown when updates have failed repeatedly */}
        {failureCount >= 2 && (
          <View style={styles.persistentRetry}>
            <Text style={{ color: colors.text, fontWeight: '600', marginBottom: 6 }}>
              Update failed previously — you can retry or clear the retry state.
            </Text>
            <Button
              title={checking ? 'Retrying…' : 'Retry Update'}
              onPress={fetchAndApplyUpdate}
              buttonStyle={{ backgroundColor: colors.primary, borderRadius: 10, marginBottom: 8 }}
            />
            <Button
              title="Clear Retry State"
              onPress={async () => {
                try {
                  await AsyncStorage.removeItem('UPDATE_FAIL_COUNT');
                  setFailureCount(0);
                } catch (e) {}
              }}
              buttonStyle={{ backgroundColor: colors.border, borderRadius: 10 }}
              titleStyle={{ color: colors.strongMuted }}
            />
          </View>
        )}

        {/* FOOTER */}
        <TouchableOpacity style={styles.footer} onPress={() => Linking.openURL(ELLOW_URL)}>
          <Text style={styles.footerText}>
            Crafted with ❤️ by <Text style={styles.footerLink}>EllowDigital</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </Animated.View>
  );
};

// Re-import MaterialIcon if it's not already imported
export default AboutScreen;

/* MODERN, CLEAN STYLES */
const createStyles = (
  font: (size: number) => number,
  outerPadding: number,
  cardPadding: number,
  gap: number
) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      paddingHorizontal: outerPadding,
      paddingTop: outerPadding + 6,
      paddingBottom: outerPadding,
    },
    headerContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: gap * 1.1,
    },
    appIcon: {
      width: clamp(cardPadding * 4.8, 72, 96),
      height: clamp(cardPadding * 4.8, 72, 96),
      borderRadius: 16,
      marginRight: gap * 0.9,
      backgroundColor: colors.card,
      elevation: 4,
      shadowColor: colors.shadow,
      shadowOpacity: 1,
      shadowRadius: 10,
    },
    headerText: {
      flex: 1,
      justifyContent: 'center',
    },
    appName: {
      fontSize: font(22),
      fontWeight: '800',
      color: colors.text,
    },
    appSubtitle: {
      fontSize: font(14),
      color: colors.subtleText,
      marginTop: 6,
      fontWeight: '600',
    },

    card: {
      backgroundColor: colors.card,
      padding: cardPadding,
      borderRadius: 16,
      marginBottom: gap,
      borderWidth: 1,
      borderColor: colors.border,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    label: {
      fontSize: font(15),
      color: colors.muted,
    },
    value: {
      fontSize: font(15),
      fontWeight: '600',
      color: colors.text,
    },
    description: {
      paddingTop: 16,
      fontSize: font(15),
      color: colors.subtleText,
      lineHeight: 23,
    },

    actionButton: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: clamp(cardPadding * 0.7, 12, 18),
      marginBottom: 12,
    },
    actionButtonTitle: {
      fontSize: font(16),
      fontWeight: '600',
    },
    secondaryActionButton: {
      backgroundColor: colors.border,
    },
    secondaryActionButtonTitle: {
      color: colors.strongMuted,
    },

    persistentRetry: {
      backgroundColor: colors.card,
      padding: cardPadding,
      borderRadius: 12,
      marginTop: gap,
      borderWidth: 1,
      borderColor: colors.border,
    },

    footer: {
      marginTop: gap * 1.2,
      alignItems: 'center',
    },
    footerText: {
      fontSize: font(14),
      color: colors.muted,
      textAlign: 'center',
    },
    footerLink: {
      fontWeight: 'bold',
      color: colors.primary,
    },
  });

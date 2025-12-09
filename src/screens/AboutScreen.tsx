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
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Button } from '@rneui/themed';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
import { colors } from '../utils/design';
import getLatestShareLink from '../utils/shareLink';
import ScreenHeader from '../components/ScreenHeader';

const pkg = require('../../package.json');

const ELLOW_URL = 'https://ellowdigital.netlify.app';
const extra: any = (Constants as any)?.expoConfig?.extra || {};
const BRAND_NAME = 'EllowDigital';
const BUILD_TYPE =
  process.env.BUILD_TYPE ||
  extra.BUILD_TYPE ||
  (pkg.version.includes('-beta') ? 'Beta' : 'Release');
const CREDIT_LINE = extra?.creditLine || extra?.CREDIT_LINE;
const FALLBACK_CREDIT = `Crafted with ❤️ by ${BRAND_NAME}`;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const useResponsiveMetrics = () => {
  const { width } = useWindowDimensions();
  const normalizedWidth = width || 390;
  const scale = clamp(normalizedWidth / 390, 0.85, 1.2);
  const outerPadding = clamp(normalizedWidth * 0.06, 16, 36);
  const cardPadding = clamp(normalizedWidth * 0.045, 14, 28);
  const gap = clamp(normalizedWidth * 0.04, 16, 28);
  const fontSize = useCallback((size: number) => Math.round(size * scale), [scale]);
  const isCompact = normalizedWidth < 380;
  return { fontSize, outerPadding, cardPadding, gap, isCompact } as const;
};

const AboutScreen: React.FC = () => {
  const { fontSize, outerPadding, cardPadding, gap, isCompact } = useResponsiveMetrics();
  const styles = useMemo(
    () => createStyles(fontSize, outerPadding, cardPadding, gap, isCompact),
    [fontSize, outerPadding, cardPadding, gap, isCompact]
  );
  const fade = useSharedValue(0);
  const currentUpdateId = Updates.updateId || 'Embedded build';
  const isExpoGo = Constants?.appOwnership === 'expo';

  const [checking, setChecking] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [failureCount, setFailureCount] = useState(0);

  useEffect(() => {
    fade.value = withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) });
  }, [fade]);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem('UPDATE_FAIL_COUNT');
        setFailureCount(Number(stored || '0'));
      } catch (err) {
        console.log('Failed to read retry count', err);
      }
    })();
  }, []);

  const animatedFadeStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateY: (1 - fade.value) * 12 }],
  }));

  const shortUpdateId = useMemo(() => {
    if (!currentUpdateId) return 'Unavailable';
    if (currentUpdateId === 'Embedded build') return currentUpdateId;
    return currentUpdateId.length > 10 ? `${currentUpdateId.slice(0, 8)}…` : currentUpdateId;
  }, [currentUpdateId]);

  const infoTiles = useMemo(
    () => [
      { label: 'Version', value: pkg.version },
      { label: 'Build Type', value: String(BUILD_TYPE) },
      {
        label: 'Environment',
        value: process.env.NODE_ENV === 'production' ? 'Production' : 'Development',
      },
      { label: 'Update ID', value: shortUpdateId, raw: currentUpdateId },
    ],
    [shortUpdateId, currentUpdateId]
  );

  const fetchShareLink = useCallback(async () => {
    try {
      return await getLatestShareLink();
    } catch (err) {
      console.log('Failed to fetch share link', err);
      return ELLOW_URL;
    }
  }, []);

  const handleShare = useCallback(async () => {
    const latestLink = await fetchShareLink();
    try {
      await Share.share({
        title: 'DhanDiary – Smart Personal Finance Tracker',
        message: `📲 Check out DhanDiary! Smart personal finance & expense manager.\n\nDownload now 👉 ${latestLink}`,
      });
    } catch (err) {
      console.log('Share error:', err);
    }
  }, [fetchShareLink]);

  const openSupportEmail = useCallback(() => {
    const mailto = 'mailto:sarwanyadav26@outlook.com?subject=DhanDiary%20Feedback';
    Linking.openURL(mailto);
  }, []);

  const checkForUpdates = useCallback(async () => {
    if (isExpoGo) {
      Alert.alert('Not supported in Expo Go', 'Use a development or production build to test OTA.');
      return;
    }
    try {
      setChecking(true);
      const result = await Updates.checkForUpdateAsync();
      if (result.isAvailable) {
        setUpdateAvailable(true);
      } else {
        setUpdateAvailable(false);
        Alert.alert('You are up to date');
      }
    } catch (err) {
      console.log('Update check failed', err);
      Alert.alert('Update check failed', String(err));
    } finally {
      setChecking(false);
    }
  }, [isExpoGo]);

  const fetchAndApplyUpdate = useCallback(async () => {
    if (isExpoGo) {
      Alert.alert(
        'Not supported in Expo Go',
        'Install a dev or production build to apply updates.'
      );
      return;
    }
    try {
      setChecking(true);
      await AsyncStorage.setItem('PENDING_UPDATE', JSON.stringify({ ts: Date.now() }));
      const fetchResult = await Updates.fetchUpdateAsync();
      if (fetchResult.isNew) {
        await Updates.reloadAsync();
      } else {
        Alert.alert('No new update', 'No update was downloaded.');
      }
    } catch (err) {
      console.log('Failed to fetch/apply update', err);
      Alert.alert('Update failed', String(err));
      try {
        const current = Number((await AsyncStorage.getItem('UPDATE_FAIL_COUNT')) || '0');
        const next = current + 1;
        await AsyncStorage.setItem('UPDATE_FAIL_COUNT', String(next));
        setFailureCount(next);
      } catch (storeErr) {
        console.log('Failed to persist retry count', storeErr);
      }
      try {
        await AsyncStorage.removeItem('PENDING_UPDATE');
      } catch (_) {}
    } finally {
      setChecking(false);
      setUpdateAvailable(false);
      setShowUpdateModal(false);
    }
  }, [isExpoGo]);

  const clearRetryState = useCallback(async () => {
    try {
      await AsyncStorage.removeItem('UPDATE_FAIL_COUNT');
      setFailureCount(0);
    } catch (err) {
      console.log('Failed to clear retry state', err);
    }
  }, []);

  const [showUpdateIdModal, setShowUpdateIdModal] = useState(false);
  const handleShowFullId = useCallback(() => {
    setShowUpdateIdModal(true);
  }, []);
  const closeShowFullId = useCallback(() => setShowUpdateIdModal(false), []);

  const creditLineSegments = useMemo(() => {
    const displayText = CREDIT_LINE?.trim().length ? CREDIT_LINE : FALLBACK_CREDIT;
    const highlightIndex = displayText.indexOf(BRAND_NAME);
    if (highlightIndex === -1) {
      return { prefix: displayText, suffix: '', highlight: false };
    }
    return {
      prefix: displayText.slice(0, highlightIndex),
      suffix: displayText.slice(highlightIndex + BRAND_NAME.length),
      highlight: true,
    };
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader
        title="About & Updates"
        subtitle="Build info, release notes, and support"
        showScrollHint={false}
      />
      <Animated.View style={[styles.container, animatedFadeStyle]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.contentWrapper}>
            <View style={styles.headerInset} />
            <Animated.View entering={FadeInDown.delay(80).springify()} style={styles.heroCard}>
              <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
                <Defs>
                  <SvgLinearGradient id="aboutHeroGradient" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0%" stopColor={colors.primary} stopOpacity={0.95} />
                    <Stop offset="100%" stopColor={colors.secondary} stopOpacity={0.85} />
                  </SvgLinearGradient>
                </Defs>
                <Rect width="100%" height="100%" fill="url(#aboutHeroGradient)" />
              </Svg>
              <View pointerEvents="none" style={styles.heroGlowOne} />
              <View pointerEvents="none" style={styles.heroGlowTwo} />
              <View style={styles.heroRow}>
                <Image source={require('../../assets/icon.png')} style={styles.heroIcon} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.appName}>DhanDiary</Text>
                  <Text style={styles.appSubtitle}>Smart Personal Finance Tracker</Text>
                </View>
              </View>
              <Text style={styles.heroCopy}>
                Track incomes, expenses, and sync securely with our offline-first engine and instant
                OTA updates.
              </Text>
              <TouchableOpacity
                onPress={() => Linking.openURL(ELLOW_URL)}
                activeOpacity={0.8}
                style={styles.creditLineButton}
              >
                <Text style={styles.creditLineText}>
                  {creditLineSegments.prefix}
                  {creditLineSegments.highlight && (
                    <Text style={styles.creditLineHighlight}>{BRAND_NAME}</Text>
                  )}
                  {creditLineSegments.highlight && creditLineSegments.suffix}
                </Text>
              </TouchableOpacity>
            </Animated.View>

          <Animated.View entering={FadeInDown.delay(140).springify()} style={styles.updateCard}>
            <View style={styles.cardHeaderRow}>
              <View>
                <Text style={styles.cardTitle}>Stay Updated</Text>
                <Text style={styles.cardSubtitle}>
                  Check for new features and apply the latest optimizations instantly.
                </Text>
              </View>
              <View style={styles.cardIconWrap}>
                <MaterialIcon name="system-update" size={22} color={colors.primary} />
              </View>
            </View>
            <View style={styles.updateActions}>
              <TouchableOpacity
                style={styles.primaryCta}
                onPress={checkForUpdates}
                activeOpacity={0.9}
              >
                <MaterialIcon name="refresh" size={18} color={colors.white} />
                <Text style={styles.primaryCtaText}>
                  {checking ? 'Checking…' : 'Check for Updates'}
                </Text>
              </TouchableOpacity>
              {updateAvailable && (
                <TouchableOpacity
                  style={[styles.primaryCta, styles.secondaryCta]}
                  onPress={() => setShowUpdateModal(true)}
                  activeOpacity={0.9}
                >
                  <MaterialIcon name="download" size={18} color={colors.primary} />
                  <Text style={[styles.primaryCtaText, { color: colors.primary }]}>
                    Apply Update
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.infoCard}>
            <Text style={styles.infoHeading}>Build details</Text>
            <View style={styles.infoGrid}>
              {infoTiles.map((tile) => {
                const isUpdateTile = tile.label === 'Update ID';
                if (isUpdateTile) {
                  return (
                    <TouchableOpacity
                      key={tile.label}
                      style={[styles.infoTile, styles.infoTilePressable]}
                      activeOpacity={0.85}
                      onPress={handleShowFullId}
                    >
                      <Text style={styles.infoLabel}>{tile.label}</Text>
                      <Text style={styles.infoValue}>{tile.value}</Text>
                      <Text style={styles.infoHint}>Tap to view full ID</Text>
                    </TouchableOpacity>
                  );
                }
                return (
                  <View key={tile.label} style={styles.infoTile}>
                    <Text style={styles.infoLabel}>{tile.label}</Text>
                    <Text style={styles.infoValue}>{tile.value}</Text>
                  </View>
                );
              })}
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(260).springify()} style={styles.quickActions}>
            <TouchableOpacity style={styles.quickAction} onPress={handleShare} activeOpacity={0.9}>
              <View style={[styles.quickIcon, { backgroundColor: colors.primary }]}>
                <MaterialIcon name="share" size={18} color={colors.white} />
              </View>
              <View>
                <Text style={styles.quickTitle}>Share DhanDiary</Text>
                <Text style={styles.quickSubtitle}>Invite friends in one tap</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickAction}
              onPress={openSupportEmail}
              activeOpacity={0.9}
            >
              <View style={[styles.quickIcon, { backgroundColor: colors.accentGreen }]}>
                <MaterialIcon name="mail" size={18} color={colors.white} />
              </View>
              <View>
                <Text style={styles.quickTitle}>Contact Support</Text>
                <Text style={styles.quickSubtitle}>We respond within 24 hours</Text>
              </View>
            </TouchableOpacity>
          </Animated.View>

            {failureCount >= 2 && (
              <Animated.View entering={FadeInDown.delay(320).springify()} style={styles.retryCard}>
                <MaterialIcon name="warning" size={20} color={colors.accentOrange} />
                <View style={{ flex: 1, marginHorizontal: 12 }}>
                  <Text style={styles.retryTitle}>Something blocked your last update.</Text>
                  <Text style={styles.retrySubtitle}>Retry now or clear the retry state.</Text>
                </View>
                <TouchableOpacity style={styles.retryChip} onPress={fetchAndApplyUpdate}>
                  <Text style={styles.retryChipText}>{checking ? 'Retrying…' : 'Retry'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.retryChip, styles.retryChipMuted]}
                  onPress={clearRetryState}
                >
                  <Text style={[styles.retryChipText, { color: colors.muted }]}>Clear</Text>
                </TouchableOpacity>
              </Animated.View>
            )}
          </View>
        </ScrollView>
      </Animated.View>

      <Modal
        visible={showUpdateModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowUpdateModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New Update</Text>
            <Text style={styles.modalSubtitle}>Install the latest build to stay in sync.</Text>
            <Button
              title={checking ? 'Applying…' : 'Download & Install'}
              onPress={fetchAndApplyUpdate}
              buttonStyle={styles.modalPrimaryButton}
              titleStyle={{ fontWeight: '700' }}
            />
            <Button
              title="Cancel"
              onPress={() => setShowUpdateModal(false)}
              buttonStyle={styles.modalSecondaryButton}
              titleStyle={{ color: colors.strongMuted, fontWeight: '600' }}
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={showUpdateIdModal}
        transparent
        animationType="fade"
        onRequestClose={closeShowFullId}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Update Identifier</Text>
            <Text style={styles.modalSubtitle}>{currentUpdateId || 'Unavailable'}</Text>
            <Button
              title="Close"
              onPress={closeShowFullId}
              buttonStyle={styles.modalSecondaryButton}
              titleStyle={{ color: colors.strongMuted, fontWeight: '600' }}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default AboutScreen;

const createStyles = (
  font: (size: number) => number,
  outerPadding: number,
  cardPadding: number,
  gap: number,
  isCompact: boolean
) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      paddingHorizontal: outerPadding,
      paddingTop: outerPadding,
      paddingBottom: outerPadding,
      width: '100%',
      alignItems: 'center',
    },
    contentWrapper: {
      width: '100%',
      maxWidth: 720,
      alignSelf: 'center',
    },
    headerInset: {
      height: Math.max(12, outerPadding * 0.35),
    },
    heroCard: {
      backgroundColor: colors.primary,
      borderRadius: 32,
      padding: cardPadding,
      marginBottom: gap,
      shadowColor: colors.text,
      shadowOpacity: 0.12,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 14 },
      elevation: 6,
      maxWidth: isCompact ? undefined : 560,
      alignSelf: isCompact ? 'stretch' : 'center',
      width: '100%',
      overflow: 'hidden',
    },
    heroGlowOne: {
      position: 'absolute',
      width: 200,
      height: 200,
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.15)',
      top: -60,
      right: -30,
      transform: [{ rotate: '-15deg' }],
    },
    heroGlowTwo: {
      position: 'absolute',
      width: 160,
      height: 160,
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.1)',
      bottom: -40,
      left: -20,
      transform: [{ rotate: '25deg' }],
    },
    heroRow: {
      flexDirection: isCompact ? 'column' : 'row',
      alignItems: isCompact ? 'flex-start' : 'center',
      marginBottom: 16,
      gap: isCompact ? 12 : 0,
    },
    heroIcon: {
      width: clamp(cardPadding * 4.2, 64, 88),
      height: clamp(cardPadding * 4.2, 64, 88),
      borderRadius: 20,
      marginRight: isCompact ? 0 : 18,
      marginBottom: isCompact ? 6 : 0,
      resizeMode: 'cover',
    },
    appName: {
      fontSize: font(24),
      fontWeight: '800',
      color: colors.white,
    },
    appSubtitle: {
      fontSize: font(14),
      color: 'rgba(255,255,255,0.85)',
      marginTop: 4,
      fontWeight: '600',
    },
    heroCopy: {
      color: 'rgba(255,255,255,0.92)',
      lineHeight: 22,
      fontSize: font(15),
    },
    creditLineButton: {
      marginTop: 18,
      alignSelf: 'stretch',
      width: '100%',
      paddingHorizontal: 18,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.35)',
      backgroundColor: 'rgba(255,255,255,0.15)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    creditLineText: {
      color: colors.white,
      fontSize: font(13),
      fontWeight: '600',
      textAlign: 'center',
      lineHeight: 20,
    },
    creditLineHighlight: {
      color: '#FFF4CC',
      fontWeight: '800',
    },
    updateCard: {
      backgroundColor: colors.card,
      borderRadius: 24,
      padding: cardPadding,
      marginBottom: gap,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 18,
    },
    cardIconWrap: {
      width: isCompact ? 36 : 40,
      height: isCompact ? 36 : 40,
      borderRadius: 12,
      backgroundColor: colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardTitle: {
      fontSize: font(20),
      fontWeight: '700',
      color: colors.text,
    },
    cardSubtitle: {
      color: colors.muted,
      fontSize: font(13),
      marginTop: 4,
    },
    updateActions: {
      flexDirection: isCompact ? 'column' : 'row',
      flexWrap: isCompact ? 'nowrap' : 'wrap',
      gap: 12,
    },
    primaryCta: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.primary,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 14,
      flexGrow: isCompact ? 0 : 1,
      minWidth: isCompact ? '100%' : 0,
      justifyContent: 'center',
    },
    primaryCtaText: {
      color: colors.white,
      fontWeight: '700',
      marginLeft: 8,
    },
    secondaryCta: {
      backgroundColor: `${colors.primary}1A`,
      borderWidth: 1,
      borderColor: `${colors.primary}55`,
      justifyContent: 'center',
      minWidth: isCompact ? '100%' : undefined,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 12,
      flexGrow: isCompact ? 0 : 1,
    },
    infoCard: {
      backgroundColor: colors.card,
      borderRadius: 24,
      padding: cardPadding,
      marginBottom: gap,
      borderWidth: 1,
      borderColor: colors.border,
    },
    infoHeading: {
      fontSize: font(16),
      fontWeight: '700',
      color: colors.text,
      marginBottom: 14,
    },
    infoGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: isCompact ? 'flex-start' : 'space-between',
      rowGap: 14,
      columnGap: isCompact ? 12 : 0,
    },
    infoTile: {
      width: isCompact ? '100%' : '48%',
      padding: 14,
      borderRadius: 16,
      backgroundColor: colors.softCard,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 12,
    },
    infoTilePressable: {
      borderColor: colors.primary,
      backgroundColor: colors.primarySoft,
    },
    infoLabel: {
      color: colors.muted,
      fontSize: font(12),
      marginBottom: 6,
    },
    infoValue: {
      color: colors.text,
      fontWeight: '700',
      fontSize: font(15),
    },
    infoHint: {
      marginTop: 6,
      color: colors.primary,
      fontSize: font(11),
      fontWeight: '600',
    },
    quickActions: {
      flexDirection: isCompact ? 'column' : 'row',
      flexWrap: 'wrap',
      gap: 12,
      marginBottom: gap,
    },
    quickAction: {
      flexGrow: 1,
      minWidth: isCompact ? '100%' : '48%',
      width: isCompact ? '100%' : undefined,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: 20,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    quickIcon: {
      width: 42,
      height: 42,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    quickTitle: {
      color: colors.text,
      fontWeight: '700',
      fontSize: font(14),
    },
    quickSubtitle: {
      color: colors.subtleText,
      fontSize: font(12),
    },
    retryCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: 18,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: gap,
    },
    retryTitle: {
      color: colors.text,
      fontWeight: '700',
      marginBottom: 2,
    },
    retrySubtitle: {
      color: colors.subtleText,
      fontSize: font(12),
    },
    retryChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 16,
      backgroundColor: `${colors.primary}15`,
      marginLeft: 6,
    },
    retryChipText: {
      fontWeight: '700',
      color: colors.primary,
    },
    retryChipMuted: {
      backgroundColor: colors.surfaceMuted,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: colors.backdrop,
      justifyContent: 'center',
      padding: 20,
    },
    modalCard: {
      backgroundColor: colors.card,
      borderRadius: 18,
      padding: 20,
    },
    modalTitle: {
      fontSize: font(18),
      fontWeight: '700',
      color: colors.text,
      marginBottom: 6,
    },
    modalSubtitle: {
      fontSize: font(14),
      color: colors.subtleText,
      marginBottom: 16,
    },
    modalPrimaryButton: {
      backgroundColor: colors.accentGreen,
      borderRadius: 12,
      marginBottom: 10,
    },
    modalSecondaryButton: {
      backgroundColor: colors.border,
      borderRadius: 12,
    },
  });

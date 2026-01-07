import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Pressable,
  StatusBar,
  useWindowDimensions,
  Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';
import * as Updates from 'expo-updates';

import { colors } from '../utils/design';
import {
  OTA_UPDATE_ANNOUNCEMENT,
  type AnnouncementConfig,
} from '../announcements/announcementConfig';
import {
  markCurrentAnnouncementSeen,
  shouldShowCurrentAnnouncement,
  getCurrentAnnouncementAsync,
} from '../announcements/announcementState';

const ENTRY_DURATION = 600;
const EXIT_DURATION = 400;

const AnnouncementScreen = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [readyToShow, setReadyToShow] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
  const [isApplyingUpdate, setIsApplyingUpdate] = useState(false);
  const [announcement, setAnnouncement] = useState<AnnouncementConfig | null>(null);

  // Animation Values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  // --- HELPERS ---
  const autoHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const goToMain = () => {
    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
  };

  const dismiss = () => {
    if (isDismissing) return;
    setIsDismissing(true);

    if (autoHideTimer.current) {
      clearTimeout(autoHideTimer.current);
      autoHideTimer.current = null;
    }

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: EXIT_DURATION,
        useNativeDriver: true,
        easing: Easing.in(Easing.cubic),
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.9,
        duration: EXIT_DURATION,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 20,
        duration: EXIT_DURATION,
        useNativeDriver: true,
      }),
    ]).start(async () => {
      await markCurrentAnnouncementSeen();
      goToMain();
    });
  };

  const applyOtaUpdate = async () => {
    if (isApplyingUpdate) return;
    setIsApplyingUpdate(true);

    try {
      await markCurrentAnnouncementSeen();
      if (Updates.isEnabled) {
        await Updates.fetchUpdateAsync();
        await Updates.reloadAsync();
        return;
      }
    } catch (e) {
      // Fallback
    } finally {
      setIsApplyingUpdate(false);
    }
    goToMain();
  };

  // --- LIFECYCLE ---
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const current = await getCurrentAnnouncementAsync();
      if (!mounted) return;

      if (!current) {
        goToMain();
        return;
      }

      const shouldShow = await shouldShowCurrentAnnouncement();
      if (!mounted) return;

      if (!shouldShow) {
        goToMain();
        return;
      }

      setAnnouncement(current);
      setReadyToShow(true);

      // Entrance Animation
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: ENTRY_DURATION,
          useNativeDriver: true,
          easing: Easing.out(Easing.cubic),
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 7,
          tension: 40,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          friction: 8,
          tension: 50,
          useNativeDriver: true,
        }),
      ]).start();

      // Auto Hide Logic
      if (current.autoHideMs && current.type !== 'critical') {
        autoHideTimer.current = setTimeout(() => {
          dismiss();
        }, ENTRY_DURATION + current.autoHideMs);
      }
    };

    init();

    return () => {
      mounted = false;
      if (autoHideTimer.current) clearTimeout(autoHideTimer.current);
    };
  }, []);

  if (!readyToShow || !announcement) return null;

  // Dynamic Styles
  const accentColor = announcement.accentColor || colors.primary || '#2563EB';
  const isUpdate = announcement.id === OTA_UPDATE_ANNOUNCEMENT.id;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="rgba(0,0,0,0.3)" translucent />

      {/* Backdrop */}
      <View style={styles.backdrop} />

      <Animated.View
        style={[
          styles.card,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }, { translateY: slideAnim }],
            marginTop: insets.top,
            marginBottom: insets.bottom,
            width: Math.min(width * 0.9, 400), // Responsive width constraint
          },
        ]}
      >
        {/* Decorative Top Line */}
        <View style={[styles.accentLine, { backgroundColor: accentColor }]} />

        {/* Content */}
        <View style={styles.contentContainer}>
          <View style={styles.headerRow}>
            <View style={[styles.iconContainer, { backgroundColor: `${accentColor}15` }]}>
              <MaterialIcon name="campaign" size={28} color={accentColor} />
            </View>
            <View style={styles.titleContainer}>
              <Text style={styles.badgeText}>ANNOUNCEMENT</Text>
              <Text style={styles.titleText}>
                {announcement.title}
                {announcement.emoji ? ` ${announcement.emoji}` : ''}
              </Text>
            </View>
          </View>

          <Text style={styles.messageText}>{announcement.message}</Text>

          {/* Action Button */}
          <Pressable
            onPress={isUpdate ? applyOtaUpdate : dismiss}
            style={({ pressed }) => [
              styles.button,
              {
                backgroundColor: accentColor,
                opacity: pressed ? 0.9 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              },
            ]}
            disabled={isApplyingUpdate}
          >
            <Text style={styles.buttonText}>
              {isUpdate ? (isApplyingUpdate ? 'Updating...' : 'Update Now') : 'Got it!'}
            </Text>
            {!isApplyingUpdate && <MaterialIcon name="arrow-forward" size={18} color="#FFF" />}
          </Pressable>

          {announcement.autoHideMs && !isUpdate && (
            <Text style={styles.autoCloseText}>
              Closing automatically in {Math.ceil(announcement.autoHideMs / 1000)}s...
            </Text>
          )}
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)', // Dimmed background
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    overflow: 'hidden',
    // Premium Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 16,
  },
  accentLine: {
    height: 6,
    width: '100%',
  },
  contentContainer: {
    padding: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  titleContainer: {
    flex: 1,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#9CA3AF', // Gray-400
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  titleText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827', // Gray-900
    lineHeight: 28,
  },
  messageText: {
    fontSize: 16,
    color: '#4B5563', // Gray-600
    lineHeight: 24,
    marginBottom: 32,
  },
  button: {
    flexDirection: 'row',
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginRight: 8,
  },
  autoCloseText: {
    textAlign: 'center',
    marginTop: 16,
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '500',
  },
});

export default AnnouncementScreen;

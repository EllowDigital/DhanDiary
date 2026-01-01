import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Pressable,
  StatusBar,
  Platform,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';

import { colors, shadows } from '../utils/design';
import { CURRENT_ANNOUNCEMENT } from '../announcements/announcementConfig';
import {
  markCurrentAnnouncementSeen,
  shouldShowCurrentAnnouncement,
} from '../announcements/announcementState';

const ENTRY_DURATION = 500;
const EXIT_DURATION = 300;
const { width } = Dimensions.get('window');

const AnnouncementScreen = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [readyToShow, setReadyToShow] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);

  // Animation Values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  const autoHideMs = useMemo(() => {
    const v = CURRENT_ANNOUNCEMENT.autoHideMs;
    return typeof v === 'number' && v > 0 ? v : null;
  }, []);

  const autoHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const goToMain = () => {
    // Reset navigation stack to prevent going back to this screen
    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
  };

  const dismiss = () => {
    if (isDismissing) return;
    setIsDismissing(true);

    if (autoHideTimer.current) {
      clearTimeout(autoHideTimer.current);
      autoHideTimer.current = null;
    }

    // Exit Animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: EXIT_DURATION,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.95,
        duration: EXIT_DURATION,
        useNativeDriver: true,
      }),
    ]).start(async () => {
      await markCurrentAnnouncementSeen();
      goToMain();
    });
  };

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const shouldShow = await shouldShowCurrentAnnouncement();
      if (!mounted) return;

      if (!shouldShow) {
        goToMain();
        return;
      }

      setReadyToShow(true);

      // Entrance Animation
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: ENTRY_DURATION,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
      ]).start();

      if (autoHideMs) {
        autoHideTimer.current = setTimeout(() => {
          dismiss();
        }, ENTRY_DURATION + autoHideMs);
      }
    };

    init();

    return () => {
      mounted = false;
      if (autoHideTimer.current) {
        clearTimeout(autoHideTimer.current);
      }
    };
  }, []);

  if (!readyToShow) return null;

  // Dynamic Styles
  const accentColor = CURRENT_ANNOUNCEMENT.accentColor || colors.primary || '#2563EB';
  const cardBackgroundColor = colors.card || '#FFFFFF';

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
            marginTop: insets.top, // Prevent overlapping status bar
            marginBottom: insets.bottom,
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
                {CURRENT_ANNOUNCEMENT.title} {CURRENT_ANNOUNCEMENT.emoji}
              </Text>
            </View>
          </View>

          <Text style={styles.messageText}>
            {CURRENT_ANNOUNCEMENT.message}
          </Text>

          {/* Action Button */}
          <Pressable
            onPress={dismiss}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: accentColor, opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
            ]}
          >
            <Text style={styles.buttonText}>Got it!</Text>
            <MaterialIcon name="arrow-forward" size={18} color="#FFF" />
          </Pressable>

          {autoHideMs && (
            <Text style={styles.autoCloseText}>
              Closing automatically in {Math.ceil(autoHideMs / 1000)}s...
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
    backgroundColor: 'rgba(0, 0, 0, 0.4)', // Dimmed background
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    width: Math.min(width * 0.9, 400), // Responsive width
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
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
    marginBottom: 16,
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
    fontWeight: '700',
    color: '#9CA3AF', // Gray-400
    letterSpacing: 1,
    marginBottom: 4,
  },
  titleText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1F2937', // Gray-800
    lineHeight: 26,
  },
  messageText: {
    fontSize: 16,
    color: '#4B5563', // Gray-600
    lineHeight: 24,
    marginBottom: 24,
  },
  button: {
    flexDirection: 'row',
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
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
  },
});

export default AnnouncementScreen;
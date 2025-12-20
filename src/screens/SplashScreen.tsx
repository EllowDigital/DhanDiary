import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  useWindowDimensions,
  Image,
  StatusBar,
  Text,
  Animated,
  Easing,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { getSession } from '../db/session';
import { colors } from '../utils/design';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hasCompletedOnboarding } from '../utils/onboarding';

type SplashNavProp = NativeStackNavigationProp<RootStackParamList, 'Splash'>;

const MIN_SPLASH_TIME_MS = 2500; // Increased slightly for better perception of animation

const SplashScreen = () => {
  const navigation = useNavigation<SplashNavProp>();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [isReady, setIsReady] = useState(false);

  // --- ANIMATION VALUES ---
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const textSlideAnim = useRef(new Animated.Value(20)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Background "Breathing" Animation
  const orbPulse = useRef(new Animated.Value(1)).current;
  const orbTranslate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 1. Background Ambient Animation (Loops forever)
    const orbAnimation = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(orbPulse, { toValue: 1.2, duration: 4000, useNativeDriver: true }),
          Animated.timing(orbPulse, { toValue: 1, duration: 4000, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(orbTranslate, {
            toValue: 15,
            duration: 5000,
            easing: Easing.sin,
            useNativeDriver: true,
          }),
          Animated.timing(orbTranslate, {
            toValue: 0,
            duration: 5000,
            easing: Easing.sin,
            useNativeDriver: true,
          }),
        ]),
      ])
    );
    orbAnimation.start();

    // 2. Entrance Sequence
    Animated.parallel([
      // Logo Entrance
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
        easing: Easing.out(Easing.quad),
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 7,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
        easing: Easing.out(Easing.back(1.5)),
      }),
      // Text Staggered Entrance
      Animated.sequence([
        Animated.delay(300),
        Animated.spring(textSlideAnim, {
          toValue: 0,
          friction: 8,
          useNativeDriver: true,
        }),
      ]),
      // Progress Bar
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: MIN_SPLASH_TIME_MS - 200, // Sync with min splash time roughly
        useNativeDriver: false, // Width animation requires false
      }),
    ]).start();

    // Cleanup loop on unmount
    return () => orbAnimation.stop();
  }, []);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const startTime = Date.now();
      // Run checks in parallel with minimum timer
      const [user, onboardingCompleted] = await Promise.all([
        getSession(),
        hasCompletedOnboarding(),
        new Promise((resolve) => setTimeout(resolve, MIN_SPLASH_TIME_MS)), // Ensure min display time
      ]);

      if (!mounted) return;

      // Exit Animation before navigation
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 1.1, duration: 300, useNativeDriver: true }),
      ]).start(() => {
        // Use reset to prevent back-navigation to splash
        if (user) {
          navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
        } else if (onboardingCompleted) {
          navigation.reset({ index: 0, routes: [{ name: 'Auth' }] });
        } else {
          navigation.reset({ index: 0, routes: [{ name: 'Onboarding' }] });
        }
      });
    };

    init();

    return () => {
      mounted = false;
    };
  }, []);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  // Dynamic Sizing based on screen width
  const logoSize = Math.min(width * 0.35, 150); // 35% of width, max 150px
  const footerBottom = Math.max(insets.bottom + 20, 30); // Dynamic bottom padding

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      {/* BACKGROUND SVG */}
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={colors.background || '#ffffff'} stopOpacity={1} />
            <Stop offset="100%" stopColor="#Eef2ff" stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#bg)" />
      </Svg>

      {/* ANIMATED BACKGROUND ORBS */}
      <Animated.View
        style={[
          styles.orb,
          {
            top: -height * 0.1,
            right: -width * 0.1,
            backgroundColor: `${colors.primary || '#4F46E5'}15`,
            transform: [{ scale: orbPulse }, { translateY: orbTranslate }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.orb,
          {
            bottom: -height * 0.1,
            left: -width * 0.1,
            backgroundColor: `${colors.secondary || '#EC4899'}15`,
            transform: [{ scale: orbPulse }, { translateY: Animated.multiply(orbTranslate, -1) }],
          },
        ]}
      />

      {/* MAIN CONTENT CENTER */}
      <View style={styles.centerContent}>
        {/* LOGO */}
        <Animated.View
          style={[
            styles.logoWrapper,
            {
              width: logoSize,
              height: logoSize,
              borderRadius: logoSize * 0.25,
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }, { translateY: slideAnim }],
            },
          ]}
        >
          <Image
            source={(() => {
              try {
                // Safe require logic
                return require('../../assets/splash-icon.png');
              } catch (e) {
                return { uri: 'https://via.placeholder.com/150' }; // Fallback
              }
            })()}
            style={[styles.logo, { borderRadius: logoSize * 0.25 }]}
            resizeMode="cover"
          />
        </Animated.View>

        {/* APP NAME & TAGLINE */}
        <Animated.View
          style={{
            opacity: fadeAnim,
            transform: [{ translateY: textSlideAnim }],
            alignItems: 'center',
          }}
        >
          <Text style={[styles.appName, { fontSize: Math.min(width * 0.1, 40) }]}>DhanDiary</Text>
          <Text style={styles.tagline}>Intelligent Finance Tracker</Text>
        </Animated.View>

        {/* PROGRESS BAR */}
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
        </View>
      </View>

      {/* FOOTER BADGES - Safe Area Aware */}
      <Animated.View
        style={[
          styles.footer,
          {
            opacity: fadeAnim,
            bottom: footerBottom,
          },
        ]}
      >
        <View style={styles.badgeRow}>
          <View style={styles.badge}>
            <MaterialIcon name="bolt" size={16} color={colors.accentOrange || '#F59E0B'} />
            <Text style={styles.badgeText}>Instant Sync</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.badge}>
            <MaterialIcon name="lock" size={16} color={colors.primary || '#4F46E5'} />
            <Text style={styles.badgeText}>Encrypted</Text>
          </View>
        </View>

        <Text style={styles.powered}>
          Powered by <Text style={styles.brand}>EllowDigital</Text>
        </Text>
      </Animated.View>
    </View>
  );
};

export default SplashScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background || '#ffffff',
    overflow: 'hidden',
  },
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    width: '100%',
    paddingHorizontal: 20,
  },

  /* LOGO */
  logoWrapper: {
    marginBottom: 30,
    backgroundColor: 'white',
    shadowColor: colors.primary || '#4F46E5',
    shadowOffset: { width: 0, height: 15 },
    shadowOpacity: 0.25,
    shadowRadius: 30,
    elevation: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: '100%',
    height: '100%',
  },

  /* TYPOGRAPHY */
  appName: {
    fontWeight: '800',
    color: colors.text || '#111827',
    textAlign: 'center',
    letterSpacing: -1,
    includeFontPadding: false,
  },
  tagline: {
    fontSize: 16,
    color: colors.muted || '#6B7280',
    marginTop: 8,
    textAlign: 'center',
    fontWeight: '500',
    letterSpacing: 0.5,
  },

  /* PROGRESS */
  progressTrack: {
    width: '50%',
    maxWidth: 200,
    height: 4,
    borderRadius: 2,
    marginTop: 45,
    backgroundColor: 'rgba(0,0,0,0.06)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary || '#4F46E5',
    borderRadius: 2,
  },

  /* DECORATION */
  orb: {
    position: 'absolute',
    width: 350,
    height: 350,
    borderRadius: 175,
  },

  /* FOOTER */
  footer: {
    position: 'absolute',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 20,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 30,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,1)',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 4,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text || '#111827',
  },
  divider: {
    width: 1,
    height: 14,
    backgroundColor: colors.border || '#E5E7EB',
    marginHorizontal: 16,
  },
  powered: {
    fontSize: 12,
    color: colors.muted || '#6B7280',
    opacity: 0.8,
  },
  brand: {
    fontWeight: '700',
    color: colors.text || '#111827',
  },
});

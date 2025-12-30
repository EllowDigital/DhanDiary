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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';

// --- CUSTOM IMPORTS ---
// Ensure these paths match your project structure
import { RootStackParamList } from '../types/navigation';
import { getSession } from '../db/session';
import { hasCompletedOnboarding } from '../utils/onboarding';
import { colors } from '../utils/design';

type SplashNavProp = NativeStackNavigationProp<RootStackParamList>;

// Configuration
const MIN_SPLASH_TIME_MS = 2500; // Minimum time to show splash for branding/smoothness

const SplashScreen = () => {
  const navigation = useNavigation<SplashNavProp>();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // --- ANIMATION VALUES ---
  // Entrance animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const textSlideAnim = useRef(new Animated.Value(20)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Background "Breathing" Orbs
  const orbPulse = useRef(new Animated.Value(1)).current;
  const orbTranslate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 1. Background Ambient Animation (Infinite Loop)
    const orbLoop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(orbPulse, {
            toValue: 1.15,
            duration: 4000,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.sin),
          }),
          Animated.timing(orbPulse, {
            toValue: 1,
            duration: 4000,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.sin),
          }),
        ]),
        Animated.sequence([
          Animated.timing(orbTranslate, {
            toValue: 20,
            duration: 5000,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.sin),
          }),
          Animated.timing(orbTranslate, {
            toValue: 0,
            duration: 5000,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.sin),
          }),
        ]),
      ])
    );
    orbLoop.start();

    // 2. Main Entrance Sequence
    Animated.parallel([
      // Logo Entrance
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      // Text Staggered Entrance (slightly delayed)
      Animated.sequence([
        Animated.delay(200),
        Animated.parallel([
          Animated.timing(textSlideAnim, {
            toValue: 0,
            duration: 600,
            useNativeDriver: true,
            easing: Easing.out(Easing.cubic),
          }),
        ]),
      ]),
      // Progress Bar Fill
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: MIN_SPLASH_TIME_MS, // Sync with min splash time
        easing: Easing.linear,
        useNativeDriver: false, // Width requires false
      }),
    ]).start();

    return () => orbLoop.stop();
  }, []);

  useEffect(() => {
    let mounted = true;

    const initApp = async () => {
      let user = null;
      let onboardingCompleted = false;

      try {
        // Helper: Timeout to prevent indefinite hanging on DB calls
        const timeout = (ms: number) =>
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms));

        // 1. Fetch Session (Safe Race)
        const fetchSession = async () => {
          try {
            return await Promise.race([getSession(), timeout(3000)]);
          } catch (e) {
            console.warn('[Splash] Session check failed/timed out', e);
            return null;
          }
        };

        // 2. Fetch Onboarding Status (Safe Race)
        const fetchOnboarding = async () => {
          try {
            return await Promise.race([hasCompletedOnboarding(), timeout(2000)]);
          } catch (e) {
            console.warn('[Splash] Onboarding check failed', e);
            return false;
          }
        };

        // 3. Minimum Timer (Branding)
        const minTimer = new Promise((resolve) => setTimeout(resolve, MIN_SPLASH_TIME_MS));

        // Wait for all
        const [sessionResult, onboardingResult] = await Promise.all([
          fetchSession(),
          fetchOnboarding(),
          minTimer,
        ]);

        user = sessionResult;
        onboardingCompleted = Boolean(onboardingResult);
      } catch (e) {
        console.error('[Splash] Critical init error', e);
      }

      if (!mounted) return;

      // Exit Animation & Navigation
      // We animate out slightly before navigating to make the transition seamless
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1.1, // Slight zoom out effect on exit
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        // Determine Route
        if (user) {
          navigation.reset({ index: 0, routes: [{ name: 'Main' as any }] }); // Adjust 'Main' to your stack name
        } else if (onboardingCompleted) {
          navigation.reset({ index: 0, routes: [{ name: 'Auth' as any }] });
        } else {
          navigation.reset({ index: 0, routes: [{ name: 'Onboarding' as any }] });
        }
      });
    };

    initApp();

    return () => {
      mounted = false;
    };
  }, []);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  // Dynamic Sizing
  const logoSize = Math.min(width * 0.3, 140);
  const footerBottom = Math.max(insets.bottom + 20, 32);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      {/* --- 1. BACKGROUND LAYER --- */}
      <View style={StyleSheet.absoluteFill}>
        <Svg style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity="1" />
              <Stop offset="1" stopColor="#F8FAFC" stopOpacity="1" />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#grad)" />
        </Svg>

        {/* Ambient Orbs */}
        <Animated.View
          style={[
            styles.orb,
            {
              top: -height * 0.15,
              right: -width * 0.2,
              backgroundColor: `${colors.primary || '#3B82F6'}15`, // Very low opacity
              transform: [{ scale: orbPulse }, { translateY: orbTranslate }],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.orb,
            {
              bottom: -height * 0.1,
              left: -width * 0.2,
              backgroundColor: `${colors.secondary || '#8B5CF6'}15`,
              transform: [{ scale: orbPulse }, { translateY: Animated.multiply(orbTranslate, -1) }],
            },
          ]}
        />
      </View>

      {/* --- 2. MAIN CONTENT --- */}
      <View style={styles.centerContent}>
        {/* Logo Box */}
        <Animated.View
          style={[
            styles.logoContainer,
            {
              width: logoSize,
              height: logoSize,
              borderRadius: logoSize * 0.22,
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }, { translateY: slideAnim }],
            },
          ]}
        >
          <Image
            source={require('../../assets/splash-icon.png')} // Update path if needed
            style={styles.logo}
            resizeMode="contain"
          />
        </Animated.View>

        {/* Text Content */}
        <Animated.View
          style={{
            opacity: fadeAnim,
            transform: [{ translateY: textSlideAnim }],
            alignItems: 'center',
          }}
        >
          <Text style={styles.appName}>DhanDiary</Text>
          <Text style={styles.tagline}>Smart Finance Tracker</Text>
        </Animated.View>

        {/* Progress Bar */}
        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressFill,
              {
                width: progressWidth,
                backgroundColor: colors.primary || '#3B82F6',
              },
            ]}
          />
        </View>
      </View>

      {/* --- 3. FOOTER BADGES --- */}
      <Animated.View
        style={[
          styles.footer,
          {
            bottom: footerBottom,
            opacity: fadeAnim,
          },
        ]}
      >
        {/* Trust Badges */}
        <View style={styles.badgeContainer}>
          <View style={styles.badge}>
            <MaterialIcon name="bolt" size={14} color={colors.accentOrange || '#F59E0B'} />
            <Text style={styles.badgeText}>Instant Sync</Text>
          </View>
          <View style={styles.badgeDivider} />
          <View style={styles.badge}>
            <MaterialIcon name="lock" size={14} color={colors.primary || '#3B82F6'} />
            <Text style={styles.badgeText}>Encrypted</Text>
          </View>
        </View>

        <Text style={styles.poweredBy}>
          Powered by <Text style={styles.brandName}>EllowDigital</Text>
        </Text>
      </Animated.View>
    </View>
  );
};

export default SplashScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  /* DECORATION */
  orb: {
    position: 'absolute',
    width: 400,
    height: 400,
    borderRadius: 200,
    // Blur effect works best on iOS, using opacity for cross-platform fallback
    opacity: 0.8,
  },

  /* CONTENT */
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: 20,
    zIndex: 10,
  },
  logoContainer: {
    marginBottom: 32,
    backgroundColor: '#FFFFFF',
    // Premium Shadow
    shadowColor: colors.primary || '#3B82F6',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12, // Android
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2, // Slight border effect
  },
  logo: {
    width: '100%',
    height: '100%',
    borderRadius: 24, // Inner radius
  },
  appName: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.text || '#1E293B',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.muted || '#64748B',
    letterSpacing: 0.5,
  },

  /* PROGRESS BAR */
  progressTrack: {
    width: 140,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.05)',
    marginTop: 40,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },

  /* FOOTER */
  footer: {
    position: 'absolute',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    marginBottom: 16,
    // Glassmorphism feel
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text || '#334155',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  badgeDivider: {
    width: 1,
    height: 12,
    backgroundColor: '#CBD5E1',
    marginHorizontal: 12,
  },
  poweredBy: {
    fontSize: 12,
    color: colors.muted || '#94A3B8',
    fontWeight: '500',
  },
  brandName: {
    fontWeight: '700',
    color: colors.text || '#1E293B',
  },
});

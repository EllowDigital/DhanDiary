import React, { useEffect, useRef } from 'react';
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
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '@clerk/clerk-expo';

// --- CUSTOM IMPORTS ---
import { RootStackParamList } from '../types/navigation';
import { getSession } from '../db/session';
import { hasCompletedOnboarding } from '../utils/onboarding';
import { colors } from '../utils/design';
import { useToast } from '../context/ToastContext';

type SplashNavProp = NativeStackNavigationProp<RootStackParamList>;

// Configuration
const MIN_SPLASH_TIME_MS = 2500;

const SplashScreen = () => {
  const navigation = useNavigation<SplashNavProp>();
  const { showToast } = useToast();
  const { isSignedIn, isLoaded: authLoaded } = useAuth();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isLandscape = width > height;

  const decidedRef = useRef(false);

  // --- RESPONSIVE VALUES ---
  // Use the smaller dimension to calculate logo size ensures it fits on Landscape
  const minDim = Math.min(width, height);
  const logoSize = Math.min(minDim * 0.35, 140);

  // Dynamic Footer handling for landscape constraints
  const footerBottom = isLandscape ? 10 : Math.max(insets.bottom + 20, 32);

  // --- ANIMATION VALUES ---
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const textSlideAnim = useRef(new Animated.Value(20)).current;

  // PERFORMANCE FIX: Use ScaleX instead of Width for Native Driver support
  const progressScale = useRef(new Animated.Value(0)).current;

  // Background "Breathing" Orbs
  const orbPulse = useRef(new Animated.Value(1)).current;
  const orbTranslate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 1. Background Ambient Animation
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
      // Text Staggered Entrance
      Animated.sequence([
        Animated.delay(200),
        Animated.timing(textSlideAnim, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
          easing: Easing.out(Easing.cubic),
        }),
      ]),
      // Progress Bar Fill (Native Driver Enabled via scaleX)
      Animated.timing(progressScale, {
        toValue: 1,
        duration: MIN_SPLASH_TIME_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ]).start();

    return () => orbLoop.stop();
  }, []);

  useEffect(() => {
    let mounted = true;

    const navigateToNextScreen = (routeName: keyof RootStackParamList) => {
      if (!mounted) return;
      if (decidedRef.current) return;
      decidedRef.current = true;

      // Per UX spec: explain redirects triggered by auth state.
      try {
        if (routeName === 'Announcement') {
          showToast('Welcome back! Loading your dashboard…', 'info', 2500);
        } else if (routeName === 'Auth') {
          showToast('Please sign in to continue.', 'info', 2500);
        }
      } catch (e) { }

      // Exit Animation
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1.1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(async () => {
        try {
          const { resetRoot } = await import('../utils/rootNavigation');
          resetRoot({ index: 0, routes: [{ name: routeName }] });
        } catch (e) {
          // Fallback if rootNavigation utility isn't ready
          navigation.reset({ index: 0, routes: [{ name: routeName as any }] });
        }
      });
    };

    const initApp = async () => {
      try {
        const timeout = (ms: number) =>
          new Promise((_, r) => setTimeout(() => r(new Error('Timeout')), ms));

        // Parallel Execution
        const [session, onboarding, _] = await Promise.allSettled([
          Promise.race([getSession(), timeout(3000)]),
          Promise.race([hasCompletedOnboarding(), timeout(2000)]),
          new Promise((resolve) => setTimeout(resolve, MIN_SPLASH_TIME_MS)),
        ]);

        // Logic Determination
        const user = session.status === 'fulfilled' ? session.value : null;
        const isExitingUser = onboarding.status === 'fulfilled' ? !!onboarding.value : false;

        // Determine online/offline (needed for offline-first session gating)
        let online = true;
        try {
          const net = await NetInfo.fetch();
          online = !!net.isConnected && net.isInternetReachable !== false;
        } catch (e) {
          online = true;
        }

        if (user) {
          const hasClerkIdentity = !!(user as any)?.clerk_id;
          // If this session is tied to Clerk but Clerk is not signed in (and we are online),
          // force re-auth instead of silently letting a stale local session through.
          if (online && hasClerkIdentity) {
            // Wait briefly for Clerk auth state to load before deciding.
            if (!authLoaded) {
              const start = Date.now();
              while (Date.now() - start < 5000) {
                await new Promise((r) => setTimeout(r, 200));
                if (authLoaded) break;
              }
            }
            if (authLoaded && !isSignedIn) {
              showToast('Your session has expired. Please log in again.', 'error', 3500);
              navigateToNextScreen('Auth');
              return;
            }
          }
          navigateToNextScreen('Announcement'); // Or Home/Main
        } else if (isExitingUser) {
          navigateToNextScreen('Auth');
        } else {
          navigateToNextScreen('Onboarding');
        }
      } catch (e) {
        console.error('[Splash] Critical init error', e);
        // Fallback to Auth on critical failure
        navigateToNextScreen('Auth');
      }
    };

    initApp();

    return () => {
      mounted = false;
    };
  }, [authLoaded, isSignedIn, showToast]);

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
              top: -minDim * 0.2, // Responsive positioning
              right: -minDim * 0.3,
              backgroundColor: `${colors.primary || '#3B82F6'}10`,
              transform: [{ scale: orbPulse }, { translateY: orbTranslate }],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.orb,
            {
              bottom: -minDim * 0.1,
              left: -minDim * 0.2,
              backgroundColor: `${colors.secondary || '#8B5CF6'}10`,
              transform: [{ scale: orbPulse }, { translateY: Animated.multiply(orbTranslate, -1) }],
            },
          ]}
        />
      </View>

      {/* --- 2. MAIN CONTENT --- */}
      <View style={[styles.centerContent, isLandscape && { flexDirection: 'row', gap: 30 }]}>
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
            source={require('../../assets/splash-icon.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </Animated.View>

        {/* Text Wrapper (Grouped for Layout) */}
        <View style={{ alignItems: isLandscape ? 'flex-start' : 'center' }}>
          <Animated.View
            style={{
              opacity: fadeAnim,
              transform: [{ translateY: textSlideAnim }],
              alignItems: isLandscape ? 'flex-start' : 'center',
            }}
          >
            <Text style={styles.appName}>DhanDiary</Text>
            <Text style={styles.tagline}>Smart Finance Tracker</Text>
          </Animated.View>

          {/* Progress Bar */}
          <View style={[styles.progressTrack, isLandscape && { marginTop: 24 }]}>
            <Animated.View
              style={[
                styles.progressFill,
                {
                  backgroundColor: colors.primary || '#3B82F6',
                  transform: [{ scaleX: progressScale }], // NATIVE DRIVER PERFORMANCE
                },
              ]}
            />
          </View>
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
  orb: {
    position: 'absolute',
    width: 400,
    height: 400,
    borderRadius: 200,
    opacity: 0.8,
  },
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
    shadowColor: colors.primary || '#3B82F6',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  logo: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
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
  progressTrack: {
    width: 140,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.05)',
    marginTop: 40,
    overflow: 'hidden',
    // align items flex-start is crucial for scaleX to grow from left
    alignItems: 'flex-start',
  },
  progressFill: {
    height: '100%',
    width: '100%', // Start at full width, manipulate via scaleX
    borderRadius: 2,
  },
  footer: {
    position: 'absolute',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)', // Slightly more opaque for legibility
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    marginBottom: 16,
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

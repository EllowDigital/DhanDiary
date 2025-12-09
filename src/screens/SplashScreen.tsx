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
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { getSession } from '../db/session';
import { colors, shadows, spacing } from '../utils/design';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';

type SplashNavProp = NativeStackNavigationProp<RootStackParamList, 'Splash'>;

const MIN_SPLASH_TIME_MS = 1500; // Gave it a bit more time to breathe
const MAX_SPLASH_WAIT_MS = 8000;

const SplashScreen = () => {
  const navigation = useNavigation<SplashNavProp>();
  const { width, height } = useWindowDimensions();

  // --- ANIMATION REFS (Standard RN Animated) ---
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 1. Entrance Animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: 1500,
        useNativeDriver: false, // Width doesn't support native driver
      }),
    ]).start();

    // 2. Navigation Logic
    const startedAt = Date.now();
    let hasNavigated = false;
    const timeoutIds: NodeJS.Timeout[] = [];

    const runNavigation = (route: 'Auth' | 'Main') => {
      if (!hasNavigated) {
        hasNavigated = true;
        // Smooth fade out before replacing
        Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true
        }).start(() => {
            navigation.replace(route);
        });
      }
    };

    const checkSessionAndNavigate = async () => {
      try {
        const session = await getSession();
        const elapsed = Date.now() - startedAt;
        const delay = Math.max(0, MIN_SPLASH_TIME_MS - elapsed);
        
        timeoutIds.push(setTimeout(() => {
          runNavigation(session ? 'Main' : 'Auth');
        }, delay));
      } catch (e) {
        runNavigation('Auth');
      }
    };

    checkSessionAndNavigate();
    
    // Safety fallback
    timeoutIds.push(setTimeout(() => runNavigation('Auth'), MAX_SPLASH_WAIT_MS));

    return () => timeoutIds.forEach(clearTimeout);
  }, []);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      {/* BACKGROUND */}
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={colors.background} stopOpacity={1} />
            <Stop offset="100%" stopColor="#F0F4FF" stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#bg)" />
      </Svg>

      {/* DECORATIVE ORBS */}
      <View style={[styles.orb, { top: -100, right: -50, backgroundColor: `${colors.primary}10` }]} />
      <View style={[styles.orb, { bottom: -100, left: -50, backgroundColor: `${colors.secondary}10` }]} />

      <View style={styles.centerContent}>
        {/* LOGO */}
        <Animated.View style={[styles.logoWrapper, { opacity: fadeAnim, transform: [{ scale: scaleAnim }, { translateY: slideAnim }] }]}>
          <Image
            source={require('../../assets/icon.png')}
            style={styles.logo}
            resizeMode="cover"
          />
        </Animated.View>

        {/* TEXT */}
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          <Text style={styles.appName}>DhanDiary</Text>
          <Text style={styles.tagline}>Intelligent Finance Tracker</Text>
        </Animated.View>

        {/* PROGRESS BAR */}
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
        </View>
      </View>

      {/* FOOTER BADGES */}
      <Animated.View style={[styles.footer, { opacity: fadeAnim }]}>
        <View style={styles.badgeRow}>
          <View style={styles.badge}>
            <MaterialIcon name="bolt" size={16} color={colors.accentOrange} />
            <Text style={styles.badgeText}>Instant Sync</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.badge}>
            <MaterialIcon name="lock" size={16} color={colors.primary} />
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
    backgroundColor: colors.background,
  },
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  
  /* LOGO */
  logoWrapper: {
    marginBottom: 24,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  logo: {
    width: 120,
    height: 120,
    borderRadius: 30,
    backgroundColor: 'white',
  },

  /* TYPOGRAPHY */
  appName: {
    fontSize: 40,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    letterSpacing: -1,
  },
  tagline: {
    fontSize: 16,
    color: colors.muted,
    marginTop: 8,
    textAlign: 'center',
    fontWeight: '500',
    letterSpacing: 0.5,
  },

  /* PROGRESS */
  progressTrack: {
    width: 180,
    height: 4,
    borderRadius: 2,
    marginTop: 40,
    backgroundColor: 'rgba(0,0,0,0.05)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
  },

  /* DECORATION */
  orb: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
  },

  /* FOOTER */
  footer: {
    position: 'absolute',
    bottom: 40,
    alignItems: 'center',
    width: '100%',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    ...shadows.small,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  divider: {
    width: 1,
    height: 14,
    backgroundColor: colors.border,
    marginHorizontal: 12,
  },
  powered: {
    fontSize: 13,
    color: colors.muted,
  },
  brand: {
    fontWeight: '700',
    color: colors.text,
  },
});
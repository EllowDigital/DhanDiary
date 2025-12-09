import React, { useEffect } from 'react';
import {
  View,
  StyleSheet,
  useWindowDimensions,
  Image,
  StatusBar,
  Text,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { getSession } from '../db/session';
import { colors, shadows } from '../utils/design';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  interpolate,
  withRepeat,
} from 'react-native-reanimated';

type SplashNavProp = NativeStackNavigationProp<RootStackParamList, 'Splash'>;

const FEATURE_CARDS = [
  { icon: 'bolt', title: 'Instant Sync', subtitle: 'Auto secure backup' },
  { icon: 'shield', title: 'Private Mode', subtitle: 'Offline-first safety' },
];

const MIN_SPLASH_TIME_MS = 400;
const MAX_SPLASH_WAIT_MS = 8000;

const SplashScreen = () => {
  const navigation = useNavigation<SplashNavProp>();
  const { width, height } = useWindowDimensions();

  const animation = useSharedValue(0);
  const orbit = useSharedValue(0);
  const cardLift = useSharedValue(0);

  useEffect(() => {
    animation.value = withTiming(1, { duration: 1200, easing: Easing.out(Easing.exp) });

    orbit.value = withRepeat(withTiming(1, { duration: 2200 }), -1, true);
    cardLift.value = withRepeat(withDelay(120, withTiming(1, { duration: 5200 })), -1, true);

    const startedAt = Date.now();
    let hasNavigated = false;
    const timeoutIds: any[] = [];

    const runNavigation = (route: keyof RootStackParamList) => {
      if (!hasNavigated) {
        hasNavigated = true;
        navigation.replace(route);
      }
    };

    const checkSessionAndNavigate = async () => {
      try {
        const session = await getSession();
        const delay = Math.max(0, MIN_SPLASH_TIME_MS - (Date.now() - startedAt));
        timeoutIds.push(setTimeout(() => runNavigation(session ? 'Main' : 'Auth'), delay));
      } catch {
        runNavigation('Auth');
      }
    };

    checkSessionAndNavigate();
    timeoutIds.push(setTimeout(() => runNavigation('Auth'), MAX_SPLASH_WAIT_MS));

    return () => timeoutIds.forEach(clearTimeout);
  }, []);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: animation.value,
    transform: [
      { translateY: interpolate(animation.value, [0, 1], [30, 0]) },
      { scale: interpolate(animation.value, [0, 1], [0.85, 1]) },
    ],
  }));

  const textStyle = useAnimatedStyle(() => ({
    opacity: interpolate(animation.value, [0.4, 1], [0, 1]),
  }));

  const orbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(orbit.value, [0, 1], [-20, 20]) }],
    opacity: 0.3 + orbit.value * 0.25,
  }));

  const cardFloat = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(cardLift.value, [0, 1], [0, -8]) }],
  }));

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Background Gradient */}
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={colors.primary} stopOpacity={0.2} />
            <Stop offset="100%" stopColor={colors.secondary} stopOpacity={0.08} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={colors.background} />
        <Rect width="100%" height="100%" fill="url(#bg)" />
      </Svg>

      {/* Glow Orbs */}
      <Animated.View style={[styles.orb, { top: height * 0.18, left: 30 }, orbStyle]} />
      <Animated.View style={[styles.orb, { top: height * 0.48, right: 25 }, orbStyle]} />

      {/* Logo */}
      <Animated.View style={[styles.logoWrapper, logoStyle]}>
        <Image
          source={require('../../assets/icon.png')}
          style={{ width: width * 0.28, height: width * 0.28, borderRadius: 28 }}
        />
      </Animated.View>

      {/* App Name */}
      <Animated.Text style={[styles.appName, textStyle]}>
        DhanDiary
      </Animated.Text>

      <Animated.Text style={[styles.tagline, textStyle]}>
        Faster • Safer • Smarter
      </Animated.Text>

      {/* Progress Bar */}
      <View style={styles.progressTrack}>
        <Animated.View style={styles.progressFill} />
      </View>

      {/* Feature Cards */}
      <View style={styles.featureRow}>
        {FEATURE_CARDS.map((item, index) => (
          <Animated.View
            key={index}
            style={[
              styles.card,
              { backgroundColor: index === 0 ? colors.primary : colors.secondary },
              cardFloat,
            ]}>
            <MaterialIcon name={item.icon as any} size={22} color={colors.white} />
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardSub}>{item.subtitle}</Text>
          </Animated.View>
        ))}
      </View>

      {/* Brand Footer */}
      <View style={styles.footer}>
        <Text style={styles.powered}>Powered by <Text style={styles.brand}>EllowDigital</Text></Text>
        <Text style={styles.loading}>Launching optimized experience…</Text>
      </View>
    </View>
  );
};

export default SplashScreen;

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  logoWrapper: { marginBottom: 22, ...shadows.medium },

  appName: { fontSize: 36, fontWeight: '800', color: colors.text },

  tagline: { fontSize: 16, color: colors.muted, marginTop: 4 },

  progressTrack: {
    width: 220,
    height: 6,
    borderRadius: 10,
    marginTop: 18,
    backgroundColor: `${colors.card}66`,
    overflow: 'hidden',
  },

  progressFill: { flex: 1, backgroundColor: colors.primary },

  orb: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 120,
    backgroundColor: colors.secondary,
    opacity: 0.25,
  },

  featureRow: {
    flexDirection: 'row',
    marginTop: 28,
    gap: 16,
  },

  card: {
    width: 150,
    padding: 16,
    borderRadius: 22,
    ...shadows.small,
  },

  cardTitle: { marginTop: 10, color: colors.white, fontWeight: '700' },

  cardSub: { marginTop: 4, fontSize: 13, color: `${colors.white}CC` },

  footer: {
    position: 'absolute',
    bottom: 32,
    alignItems: 'center',
  },

  powered: { fontSize: 14, color: colors.muted },

  brand: { fontWeight: 'bold', color: colors.primary },

  loading: { marginTop: 4, fontSize: 12, color: colors.mutedSoft },
});

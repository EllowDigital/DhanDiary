import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions, Image, StatusBar, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { getSession } from '../db/session';
import { colors, shadows } from '../utils/design';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
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

const { height } = Dimensions.get('window');
const FEATURE_CARDS = [
  {
    icon: 'bolt',
    title: 'Instant sync',
    subtitle: 'Entries backed up securely',
  },
  {
    icon: 'shield',
    title: 'Private mode',
    subtitle: 'Offline-first encryption',
  },
];

const MIN_SPLASH_TIME_MS = 4600;
const MAX_SPLASH_WAIT_MS = 8000;

const SplashScreen = () => {
  const navigation = useNavigation<SplashNavProp>();

  const animation = useSharedValue(0);
  const orbit = useSharedValue(0);
  const cardLift = useSharedValue(0);

  useEffect(() => {
    animation.value = withTiming(1, {
      duration: 1200,
      easing: Easing.out(Easing.exp),
    });

    orbit.value = withRepeat(
      withTiming(1, {
        duration: 2200,
        easing: Easing.inOut(Easing.quad),
      }),
      -1,
      true
    );

    cardLift.value = withRepeat(
      withDelay(
        150,
        withTiming(1, {
          duration: 5400,
          easing: Easing.inOut(Easing.ease),
        })
      ),
      -1,
      true
    );

    const startedAt = Date.now();
    let hasNavigated = false;
    const timeoutIds: ReturnType<typeof setTimeout>[] = [];

    const runNavigation = (route: keyof RootStackParamList) => {
      if (hasNavigated) return;
      hasNavigated = true;
      navigation.replace(route);
    };

    const scheduleNavigation = (route: keyof RootStackParamList) => {
      const elapsed = Date.now() - startedAt;
      const delay = Math.max(0, MIN_SPLASH_TIME_MS - elapsed);
      const id = setTimeout(() => runNavigation(route), delay);
      timeoutIds.push(id);
    };

    const checkSessionAndNavigate = async () => {
      try {
        const session = await getSession();
        scheduleNavigation(session ? 'Main' : 'Auth');
      } catch (err) {
        console.error('Session check failed:', err);
        scheduleNavigation('Auth');
      }
    };

    checkSessionAndNavigate();
    timeoutIds.push(
      setTimeout(() => runNavigation('Auth'), MAX_SPLASH_WAIT_MS)
    );

    return () => {
      timeoutIds.forEach((id) => clearTimeout(id));
    };
  }, [navigation, animation]);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: animation.value,
    transform: [
      {
        translateY: interpolate(animation.value, [0, 1], [30, 0]),
      },
      {
        scale: interpolate(animation.value, [0, 1], [0.9, 1]),
      },
    ],
  }));

  const textStyle = useAnimatedStyle(() => ({
    opacity: interpolate(animation.value, [0.5, 1], [0, 1]),
    transform: [
      {
        translateY: interpolate(animation.value, [0.5, 1], [20, 0]),
      },
    ],
  }));

  const brandStyle = useAnimatedStyle(() => ({
    opacity: interpolate(animation.value, [0.7, 1], [0, 1]),
  }));

  const orbLeftStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + orbit.value * 0.2,
    transform: [
      { translateX: interpolate(orbit.value, [0, 1], [-18, 18]) },
      { translateY: interpolate(orbit.value, [0, 1], [12, -12]) },
      { scale: 0.9 + orbit.value * 0.1 },
    ],
  }));

  const orbRightStyle = useAnimatedStyle(() => ({
    opacity: 0.28 + orbit.value * 0.15,
    transform: [
      { translateX: interpolate(orbit.value, [0, 1], [12, -16]) },
      { translateY: interpolate(orbit.value, [0, 1], [-18, 8]) },
      { scale: 0.85 + orbit.value * 0.12 },
    ],
  }));

  const progressStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: 0.45 + animation.value * 0.55 }],
    opacity: interpolate(animation.value, [0.2, 1], [0, 1]),
  }));

  const cardFloatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(cardLift.value, [0, 1], [0, -6]) }],
  }));

  const cardFloatLagStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(cardLift.value, [0, 1], [-4, 4]) }],
  }));

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgLinearGradient id="splashGradient" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={colors.primary} stopOpacity={0.22} />
            <Stop offset="70%" stopColor={colors.secondary} stopOpacity={0.08} />
          </SvgLinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={colors.background} />
        <Rect width="100%" height="100%" fill="url(#splashGradient)" />
      </Svg>

      <Animated.View style={[styles.glowOrb, orbLeftStyle]} />
      <Animated.View style={[styles.glowOrb, styles.glowOrbRight, orbRightStyle]} />

      <Animated.View style={[styles.logoContainer, logoStyle]}>
        <Image source={require('../../assets/icon.png')} style={styles.logo} />
      </Animated.View>

      <Animated.Text style={[styles.appName, textStyle]}>DhanDiary</Animated.Text>

      <Animated.Text style={[styles.tagline, textStyle]}>Now optimized for quicker starts</Animated.Text>

      <Animated.View style={[styles.progressTrack, progressStyle]}>
        <View style={styles.progressFill} />
      </Animated.View>

      <View style={styles.featureRow}>
        <Animated.View style={[styles.featureCard, cardFloatStyle]}>
          <MaterialIcon name={FEATURE_CARDS[0].icon as any} size={22} color={colors.white} />
          <Text style={styles.featureTitle}>{FEATURE_CARDS[0].title}</Text>
          <Text style={styles.featureSubtitle}>{FEATURE_CARDS[0].subtitle}</Text>
        </Animated.View>

        <Animated.View style={[styles.featureCard, styles.featureCardOffset, cardFloatLagStyle]}>
          <MaterialIcon name={FEATURE_CARDS[1].icon as any} size={22} color={colors.white} />
          <Text style={styles.featureTitle}>{FEATURE_CARDS[1].title}</Text>
          <Text style={styles.featureSubtitle}>{FEATURE_CARDS[1].subtitle}</Text>
        </Animated.View>
      </View>

      <Animated.View style={[styles.brandContainer, brandStyle]}>
        <Animated.Text style={styles.poweredText}>
          Powered by <Animated.Text style={styles.brandName}>EllowDigital</Animated.Text>
        </Animated.Text>
        <Animated.Text style={styles.loadingText}>Performance boost applied — launching...</Animated.Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  logoContainer: {
    marginBottom: 24,
    ...shadows.medium,
  },
  logo: {
    width: 120,
    height: 120,
    borderRadius: 28,
  },
  appName: {
    fontSize: 40,
    fontWeight: 'bold',
    color: colors.text,
  },
  tagline: {
    fontSize: 18,
    color: colors.muted,
    marginTop: 4,
  },
  progressTrack: {
    marginTop: 18,
    width: 220,
    height: 6,
    backgroundColor: `${colors.card}66`,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    flex: 1,
    backgroundColor: colors.primary,
  },
  brandContainer: {
    position: 'absolute',
    bottom: height * 0.06,
    alignItems: 'center',
  },
  poweredText: {
    fontSize: 15,
    color: colors.muted,
  },
  brandName: {
    fontWeight: 'bold',
    color: colors.primary,
  },
  loadingText: {
    marginTop: 4,
    fontSize: 13,
    color: colors.mutedSoft,
  },
  glowOrb: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 120,
    backgroundColor: colors.secondary,
    opacity: 0.25,
    top: height * 0.15,
    left: 40,
    shadowColor: colors.secondary,
    shadowOpacity: 0.3,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 0 },
  },
  glowOrbRight: {
    width: 140,
    height: 140,
    right: 40,
    left: undefined,
    top: height * 0.45,
  },
  featureRow: {
    flexDirection: 'row',
    gap: 18,
    marginTop: 26,
  },
  featureCard: {
    width: 150,
    padding: 16,
    borderRadius: 20,
    backgroundColor: colors.primary,
    ...shadows.small,
  },
  featureCardOffset: {
    backgroundColor: colors.secondary,
  },
  featureTitle: {
    marginTop: 12,
    color: colors.white,
    fontWeight: '700',
    fontSize: 16,
  },
  featureSubtitle: {
    marginTop: 4,
    color: `${colors.white}CC`,
    fontSize: 13,
  },
});

export default SplashScreen;

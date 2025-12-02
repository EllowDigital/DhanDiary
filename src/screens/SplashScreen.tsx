import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { getSession } from '../db/session';
import { colors, shadows } from '../utils/design';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  interpolate,
} from 'react-native-reanimated';

type SplashNavProp = NativeStackNavigationProp<RootStackParamList, 'Splash'>;

const { height } = Dimensions.get('window');

const SplashScreen = () => {
  const navigation = useNavigation<SplashNavProp>();

  const animation = useSharedValue(0);

  useEffect(() => {
    animation.value = withTiming(1, {
      duration: 1200,
      easing: Easing.out(Easing.exp),
    });

    const checkSessionAndNavigate = async () => {
      try {
        const session = await getSession();
        setTimeout(() => {
          navigation.replace(session ? 'Main' : 'Auth');
        }, 1800);
      } catch (err) {
        console.error('Session check failed:', err);
        setTimeout(() => navigation.replace('Auth'), 1800);
      }
    };

    checkSessionAndNavigate();
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

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.logoContainer, logoStyle]}>
        <Image source={require('../../assets/icon.png')} style={styles.logo} />
      </Animated.View>

      <Animated.Text style={[styles.appName, textStyle]}>DhanDiary</Animated.Text>

      <Animated.Text style={[styles.tagline, textStyle]}>Smart Personal Finance</Animated.Text>

      <Animated.View style={[styles.brandContainer, brandStyle]}>
        <Animated.Text style={styles.poweredText}>
          Powered by <Animated.Text style={styles.brandName}>EllowDigital</Animated.Text>
        </Animated.Text>
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
  brandContainer: {
    position: 'absolute',
    bottom: height * 0.06,
  },
  poweredText: {
    fontSize: 15,
    color: colors.muted,
  },
  brandName: {
    fontWeight: 'bold',
    color: colors.primary,
  },
});

export default SplashScreen;

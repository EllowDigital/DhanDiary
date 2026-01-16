import React, { useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  StatusBar,
  ScrollView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../utils/design';

const AccountDeletedScreen = () => {
  const navigation = useNavigation<any>();
  const { width, height } = useWindowDimensions();

  // --- RESPONSIVE VALUES ---
  const isLandscape = width > height;
  const isTablet = width >= 600;

  // Calculate dynamic sizes based on current screen dimensions
  const iconSize = Math.min(width * 0.3, 120);
  const verticalSpacing = height < 700 ? 24 : 40;

  // --- ANIMATIONS ---
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // --- NAVIGATION HANDLERS ---

  // Prefer navigating within the current Auth stack so the user can go back
  // to this screen from Register/Login. If the screen is ever shown outside
  // the Auth stack, fall back to a root reset.
  const goToAuthScreen = useCallback(
    async (targetScreen: 'Register' | 'Login') => {
      try {
        navigation.navigate(targetScreen);
        return;
      } catch (e) {
        // ignore
      }

      try {
        const { resetRoot } = await import('../utils/rootNavigation');
        resetRoot({
          index: 0,
          routes: [{ name: 'Auth', state: { routes: [{ name: 'AccountDeleted' }, { name: targetScreen }] } }],
        });
        return;
      } catch (e) {
        // ignore
      }

      navigation.reset({
        index: 0,
        routes: [{ name: 'Auth', state: { routes: [{ name: 'AccountDeleted' }, { name: targetScreen }] } }],
      });
    },
    [navigation]
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <Animated.View
          style={[
            styles.container,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
              // Constrain width for tablets/landscape
              maxWidth: isTablet || isLandscape ? 500 : '100%',
            },
          ]}
        >
          {/* 1. Icon Section */}
          <Animated.View
            style={[
              styles.iconCircle,
              {
                width: iconSize,
                height: iconSize,
                borderRadius: iconSize / 2,
                marginBottom: verticalSpacing,
                transform: [{ scale: scaleAnim }],
              },
            ]}
          >
            <MaterialCommunityIcons
              name="heart-broken"
              size={iconSize * 0.5}
              color={colors.accentRed || '#EF4444'}
            />
          </Animated.View>

          {/* 2. Text Content */}
          <View style={[styles.textContainer, { marginBottom: verticalSpacing * 1.5 }]}>
            <Text style={styles.title}>So sad to see you go...</Text>
            <Text style={styles.subtitle}>
              Your account and all local data have been permanently deleted. We hope to see you
              again someday.
            </Text>
          </View>

          {/* 3. Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => goToAuthScreen('Register')}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryText}>Create New Account</Text>
              <MaterialCommunityIcons name="arrow-right" size={20} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.ghostButton}
              onPress={() => goToAuthScreen('Login')}
              activeOpacity={0.7}
            >
              <Text style={styles.ghostText}>Sign In to Existing Account</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  container: {
    alignItems: 'center',
    width: '100%',
    alignSelf: 'center',
  },

  /* Icon Styling */
  iconCircle: {
    backgroundColor: '#FEF2F2', // Soft red background
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    // Soft shadow
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },

  /* Typography */
  textContainer: {
    alignItems: 'center',
    width: '100%',
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1F2937',
    marginBottom: 12,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: '90%',
  },

  /* Buttons */
  actions: {
    width: '100%',
    gap: 16,
  },
  primaryButton: {
    backgroundColor: colors.primary || '#2563EB',
    height: 56,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary || '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
    width: '100%',
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginRight: 8,
  },
  ghostButton: {
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    width: '100%',
  },
  ghostText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default AccountDeletedScreen;

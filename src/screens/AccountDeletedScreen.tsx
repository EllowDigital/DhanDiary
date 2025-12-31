import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  StatusBar,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../utils/design';

const { width, height } = Dimensions.get('window');

// Dynamic sizing for responsiveness
const ICON_SIZE = Math.min(width * 0.35, 140); // Max 140px, but scales down
const SPACING_VERTICAL = height > 700 ? 32 : 16; // Tighter spacing on small screens

const AccountDeletedScreen = () => {
  const navigation = useNavigation<any>();

  // Animation Values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    // Start entrance animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const handleCreateAccount = async () => {
    // Attempt global reset if utility exists
    try {
      // @ts-ignore - Dynamic import for optional module
      const { resetRoot } = await import('../utils/rootNavigation');
      resetRoot({
        index: 0,
        routes: [{ name: 'Auth', state: { routes: [{ name: 'Register' }] } }],
      });
      return;
    } catch (e) {
      // Ignore module not found
    }

    // Fallback standard navigation reset
    navigation.reset({
      index: 1,
      routes: [
        { name: 'Auth', params: { screen: 'Login' } },
        { name: 'Auth', params: { screen: 'Register' } },
      ],
    });
  };

  const handleSignIn = async () => {
    try {
      // @ts-ignore
      const { resetRoot } = await import('../utils/rootNavigation');
      resetRoot({
        index: 0,
        routes: [{ name: 'Auth', state: { routes: [{ name: 'Login' }] } }],
      });
      return;
    } catch (e) {
      // Ignore module not found
    }

    navigation.reset({
      index: 0,
      routes: [{ name: 'Auth', params: { screen: 'Login' } }],
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <Animated.View
          style={[
            styles.content,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          {/* Visual Icon */}
          <View style={[styles.iconCircle, { width: ICON_SIZE, height: ICON_SIZE, borderRadius: ICON_SIZE / 2 }]}>
            <MaterialCommunityIcons name="heart-broken" size={ICON_SIZE * 0.5} color="#EF4444" />
          </View>

          {/* Text Content */}
          <View style={styles.textContainer}>
            <Text style={styles.title}>So sad to see you go...</Text>
            <Text style={styles.subtitle}>
              Your account and all local data have been permanently deleted. We hope to see you again someday.
            </Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleCreateAccount}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryText}>Create New Account</Text>
              <MaterialCommunityIcons name="arrow-right" size={20} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.ghostButton}
              onPress={handleSignIn}
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
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 20,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24, // Responsive padding
    width: '100%',
    maxWidth: 600, // Tablet constraint
    alignSelf: 'center',
  },

  /* Icon Styling */
  iconCircle: {
    backgroundColor: '#FEF2F2', // Soft red background
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING_VERTICAL,
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
    marginBottom: SPACING_VERTICAL * 1.5,
    alignItems: 'center',
  },
  title: {
    fontSize: width < 380 ? 20 : 24, // Responsive font size
    fontWeight: '800',
    color: '#1F2937',
    marginBottom: 12,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: width < 380 ? 14 : 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: '90%',
  },

  /* Buttons */
  actions: {
    width: '100%',
    gap: 16,
    paddingBottom: Platform.OS === 'android' ? 20 : 0,
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
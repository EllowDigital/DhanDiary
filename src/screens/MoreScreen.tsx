import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Animated,
  Easing,
  StatusBar,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@rneui/themed';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import { colors, spacing } from '../utils/design';
import ScreenHeader from '../components/ScreenHeader';

type RouteName = 'Settings' | 'About' | 'Account' | 'Stats' | string;

const MoreScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<Record<string, object>>>();
  const [scrollOffset, setScrollOffset] = useState(0);
  const insets = useSafeAreaInsets();

  // --- ANIMATION SETUP ---
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
    ]).start();
  }, []);

  const navigateParent = useCallback(
    (route: RouteName) => {
      navigation.navigate(route as any);
    },
    [navigation]
  );

  // --- CONFIG ---
  const primaryLinks = useMemo(
    () => [
      {
        icon: 'bar-chart',
        label: 'Stats & Analytics',
        description: 'Trends, spending, and reports',
        action: () => navigateParent('Stats'),
        color: colors.accentOrange,
      },
      {
        icon: 'person',
        label: 'Account & Profile',
        description: 'Security, personal info',
        action: () => navigateParent('Account'),
        color: colors.primary,
      },
      {
        icon: 'settings',
        label: 'Settings',
        description: 'Preferences, data, backups',
        action: () => navigateParent('Settings'),
        color: colors.secondary,
      },
      {
        icon: 'info',
        label: 'About & Updates',
        description: 'Version info, release notes',
        action: () => navigateParent('About'),
        color: colors.accentBlue,
      },
    ],
    [navigateParent]
  );

  const supportLinks = useMemo(
    () => [
      {
        icon: 'map',
        label: 'Roadmap',
        description: 'See what is coming next',
        action: () => Linking.openURL('https://ellowdigital.netlify.app'),
        color: colors.accentGreen,
      },
      {
        icon: 'support-agent',
        label: 'Contact Support',
        description: 'Get help or report bugs',
        action: () =>
          Linking.openURL(
            'mailto:sarwanyadav26@outlook.com?subject=DhanDiary%20Support&body=Hi%20team%2C'
          ),
        color: colors.accentRed,
      },
    ],
    []
  );

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrollOffset(event.nativeEvent.contentOffset.y);
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <ScreenHeader
        title="More"
        subtitle="Menu & Tools"
        scrollOffset={scrollOffset}
        showScrollHint
      />

      <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={[styles.content, { paddingBottom: 32 + insets.bottom }]}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          {/* HERO CARD */}
          <View style={styles.heroCard}>
            <View style={styles.heroContent}>
              <Text style={styles.heroEyebrow}>DhanDiary Hub</Text>
              <Text style={styles.heroTitle}>Control Center</Text>
              <Text style={styles.heroSubtitle}>
                Manage your analytics, preferences, and account details from one place.
              </Text>
            </View>
            <View style={styles.heroIconBg}>
              <MaterialIcon name="dashboard" size={80} color="rgba(0,0,0,0.05)" />
            </View>
          </View>

          {/* PRIMARY NAVIGATION */}
          <Text style={styles.sectionLabel}>Essentials</Text>
          <View style={styles.menuContainer}>
            {primaryLinks.map((item, index) => (
              <MenuRow key={item.label} {...item} isLast={index === primaryLinks.length - 1} />
            ))}
          </View>

          {/* SUPPORT NAVIGATION */}
          <Text style={styles.sectionLabel}>Help & Info</Text>
          <View style={styles.menuContainer}>
            {supportLinks.map((item, index) => (
              <MenuRow key={item.label} {...item} isLast={index === supportLinks.length - 1} />
            ))}
          </View>

          <Text style={styles.footnote}>DhanDiary v1.0.2 • Made with ❤️</Text>
        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
};

/* --- SUB COMPONENTS --- */

const MenuRow = ({ icon, label, description, action, color, isLast }: any) => (
  <TouchableOpacity
    onPress={action}
    activeOpacity={0.7}
    style={[styles.row, isLast && styles.rowLast]}
  >
    <View style={[styles.iconBox, { backgroundColor: `${color}15` }]}>
      <MaterialIcon name={icon} size={22} color={color} />
    </View>
    <View style={styles.rowTextContainer}>
      <Text style={styles.rowTitle}>{label}</Text>
      <Text style={styles.rowDesc}>{description}</Text>
    </View>
    <MaterialIcon name="chevron-right" size={22} color={colors.border} />
  </TouchableOpacity>
);

/* --- STYLES --- */

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },

  /* HERO */
  heroCard: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    position: 'relative',
    // Shadow
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  heroContent: {
    zIndex: 2,
  },
  heroIconBg: {
    position: 'absolute',
    right: -10,
    bottom: -10,
    zIndex: 1,
  },
  heroEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
    maxWidth: '85%',
  },

  /* SECTION & MENU */
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
    marginLeft: 6,
  },
  menuContainer: {
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 24,
    overflow: 'hidden',
  },

  /* ROW */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border, // Very subtle separator
    backgroundColor: colors.card,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  rowTextContainer: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  rowDesc: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },

  /* FOOTER */
  footnote: {
    textAlign: 'center',
    color: colors.muted,
    fontSize: 12,
    marginTop: 8,
    opacity: 0.6,
  },
});

export default MoreScreen;

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
  useWindowDimensions,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@rneui/themed';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import { colors, spacing } from '../utils/design';
import ScreenHeader from '../components/ScreenHeader';
import appConfig from '../../app.json';
let pkg: any = {};
try {
  if (typeof require === 'function') {
    // static package.json require (safe when bundler provides require)
    pkg = require('../../package.json');
  }
} catch (e) {
  pkg = {};
}

type RouteName = 'Settings' | 'About' | 'Account' | 'Stats' | string;

const MoreScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<Record<string, object>>>();
  const [scrollOffset, setScrollOffset] = useState(0);
  const insets = useSafeAreaInsets();

  // --- RESPONSIVE LOGIC ---
  const { width, scale } = useWindowDimensions();

  // Dynamic Width:
  // - On Phones: Use 92% of screen width (spacing(2) margin on sides)
  // - On Tablets: Cap at 600px width and center it
  const isTablet = width >= 768;
  const contentWidth = Math.min(width - spacing(4), 600);

  // Calculate bottom padding to clear navigation bars
  const bottomContentPadding = useMemo(() => spacing(10) + insets.bottom + 20, [insets.bottom]);

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
        easing: Easing.out(Easing.back(1.5)),
      }),
    ]).start();
  }, []);

  const navigateParent = useCallback(
    (route: RouteName) => {
      navigation.navigate(route as any);
    },
    [navigation]
  );

  const handleEmail = useCallback(() => {
    Linking.openURL('mailto:sarwanyadav26@outlook.com?subject=DhanDiary%20Support');
  }, []);

  const handleRoadmap = useCallback(() => {
    Linking.openURL('https://ellowdigital.netlify.app');
  }, []);

  // --- CONFIG ---
  const primaryLinks = useMemo(
    () => [
      {
        icon: 'bar-chart',
        label: 'Stats & Analytics',
        description: 'Trends, spending reports',
        action: () => navigateParent('Stats'),
        color: colors.accentOrange,
      },
      {
        icon: 'person',
        label: 'Account',
        description: 'Profile, personal info',
        action: () => navigateParent('Account'),
        color: colors.primary,
      },
      {
        icon: 'tune',
        label: 'Settings',
        description: 'Preferences, data, backups',
        action: () => navigateParent('Settings'),
        color: colors.secondary,
      },
      {
        icon: 'info-outline',
        label: 'About',
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
        action: handleRoadmap,
        color: colors.accentGreen,
      },
      {
        icon: 'support-agent',
        label: 'Contact Support',
        description: 'Get help or report bugs',
        action: handleEmail,
        color: colors.accentRed,
      },
    ],
    [handleRoadmap, handleEmail]
  );

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrollOffset(event.nativeEvent.contentOffset.y);
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <SafeAreaView style={styles.safeArea}>
        {/* Header Container - Aligned with content */}
        <View style={{ alignItems: 'center', width: '100%' }}>
          <View style={{ width: contentWidth }}>
            <ScreenHeader
              title="More"
              subtitle="Menu & Tools"
              scrollOffset={scrollOffset}
              showScrollHint
              useSafeAreaPadding={false}
            />
          </View>
        </View>

        <Animated.View
          style={{
            flex: 1,
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          }}
        >
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomContentPadding }]}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
          >
            {/* Responsive Wrapper:
                This View centers the content and enforces the max-width 
                calculated in the logic above.
            */}
            <View style={[styles.responsiveWrapper, { width: contentWidth }]}>
              {/* HERO CARD */}
              <View style={styles.heroCard}>
                <View style={styles.heroBgCircle} />

                <View style={styles.heroContent}>
                  <View style={styles.heroHeaderRow}>
                    <Text style={styles.heroEyebrow}>DhanDiary Hub</Text>
                    <MaterialIcon name="verified" size={16} color="rgba(255,255,255,0.6)" />
                  </View>
                  <Text style={styles.heroTitle} numberOfLines={1} adjustsFontSizeToFit>
                    Control Center
                  </Text>
                  <Text style={styles.heroSubtitle}>
                    Manage your analytics, preferences, and account details.
                  </Text>
                </View>
                <View style={styles.heroIconPos}>
                  <MaterialIcon name="dashboard" size={90} color="rgba(255,255,255,0.1)" />
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

              <Text style={styles.footnote}>
                v{pkg.version} ({appConfig.expo.version || '1.0.0'}) • Made with ❤️
              </Text>
            </View>
          </ScrollView>
        </Animated.View>
      </SafeAreaView>
    </View>
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
      <Text style={styles.rowTitle} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.rowDesc} numberOfLines={1} ellipsizeMode="tail">
        {description}
      </Text>
    </View>
    <MaterialIcon name="chevron-right" size={24} color={colors.border} />
  </TouchableOpacity>
);

/* --- STYLES --- */

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  safeArea: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center', // Essential for centering the responsiveWrapper
    paddingTop: spacing(2),
  },
  responsiveWrapper: {
    // Width is handled dynamically inline
    flexDirection: 'column',
  },

  /* HERO */
  heroCard: {
    backgroundColor: colors.primary,
    borderRadius: 24,
    padding: 24,
    marginBottom: 28,
    overflow: 'hidden',
    position: 'relative',
    // Android Shadow
    elevation: 8,
    // iOS Shadow
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
  },
  heroBgCircle: {
    position: 'absolute',
    top: -50,
    right: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  heroContent: {
    zIndex: 2,
    // Ensure text doesn't overlap with the background icon on small screens
    paddingRight: 60,
  },
  heroHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  heroIconPos: {
    position: 'absolute',
    right: -10,
    bottom: -15,
    zIndex: 1,
    transform: [{ rotate: '-10deg' }],
  },
  heroEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.8)',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 20,
    fontWeight: '500',
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
    // Android Shadow
    elevation: 2,
    // iOS Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 8,
  },

  /* ROW */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceMuted || '#F3F4F6',
    backgroundColor: colors.card,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  rowTextContainer: {
    flex: 1,
    justifyContent: 'center',
    marginRight: 8, // Prevent text touching the arrow
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  rowDesc: {
    fontSize: 13,
    color: colors.muted,
  },

  /* FOOTER */
  footnote: {
    textAlign: 'center',
    color: colors.muted,
    fontSize: 12,
    marginTop: 8,
    opacity: 0.5,
  },
});

export default MoreScreen;

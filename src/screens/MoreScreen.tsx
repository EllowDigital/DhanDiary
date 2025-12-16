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
import Svg, { Defs, LinearGradient, Stop, Rect, Circle } from 'react-native-svg';
import { colors, spacing } from '../utils/design';
import ScreenHeader from '../components/ScreenHeader';
import appConfig from '../../app.json';

// --- SAFE PACKAGE IMPORT ---
let pkg: { version?: string } = {};
try {
  // Safe require for Metro bundler
  pkg = require('../../package.json');
} catch (e) {
  pkg = { version: '1.0.0' };
}

type RouteName = 'Settings' | 'About' | 'Account' | 'Stats' | string;

interface MenuItem {
  icon: keyof typeof MaterialIcon.glyphMap;
  label: string;
  description: string;
  action: () => void;
  color: string;
}

const MoreScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<Record<string, object>>>();
  const [scrollOffset, setScrollOffset] = useState(0);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  // --- RESPONSIVE LAYOUT ---
  // Cap content width on tablets, full width with margins on phones
  const contentWidth = Math.min(width - spacing(4), 600);
  const bottomPadding = spacing(10) + insets.bottom + 20;

  // --- ANIMATIONS ---
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 16 }),
    ]).start();
  }, []);

  // --- ACTIONS ---
  const navigateParent = useCallback((route: RouteName) => navigation.navigate(route as any), [navigation]);
  
  const handleEmail = useCallback(() => {
    Linking.openURL('mailto:sarwanyadav26@outlook.com?subject=DhanDiary%20Support');
  }, []);

  const handleRoadmap = useCallback(() => {
    Linking.openURL('https://ellowdigital.netlify.app');
  }, []);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrollOffset(event.nativeEvent.contentOffset.y);
  }, []);

  // --- MENU CONFIG ---
  const primaryLinks = useMemo<MenuItem[]>(() => [
    { icon: 'bar-chart', label: 'Analytics', description: 'Spending trends & reports', action: () => navigateParent('Stats'), color: colors.accentOrange },
    { icon: 'person', label: 'Account', description: 'Profile & personal details', action: () => navigateParent('Account'), color: colors.primary },
    { icon: 'tune', label: 'Settings', description: 'Preferences & backups', action: () => navigateParent('Settings'), color: colors.secondary },
  ], [navigateParent]);

  const supportLinks = useMemo<MenuItem[]>(() => [
    { icon: 'map', label: 'Roadmap', description: 'Upcoming features', action: handleRoadmap, color: colors.accentGreen },
    { icon: 'info-outline', label: 'About', description: 'Version & legal', action: () => navigateParent('About'), color: colors.accentBlue },
    { icon: 'support-agent', label: 'Support', description: 'Contact us', action: handleEmail, color: colors.accentRed },
  ], [handleRoadmap, handleEmail, navigateParent]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <SafeAreaView style={styles.safeArea}>
        
        {/* HEADER */}
        <View style={styles.headerWrapper}>
          <View style={{ width: contentWidth }}>
            <ScreenHeader
              title="More"
              subtitle="Tools & Menu"
              scrollOffset={scrollOffset}
              showScrollHint
              useSafeAreaPadding={false}
            />
          </View>
        </View>

        <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPadding }]}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
          >
            <View style={{ width: contentWidth }}>
              
              {/* HERO CARD */}
              <View style={styles.heroCard}>
                <Svg style={StyleSheet.absoluteFill}>
                  <Defs>
                    <LinearGradient id="heroGrad" x1="0" y1="0" x2="1" y2="1">
                      <Stop offset="0" stopColor={colors.primary} />
                      <Stop offset="1" stopColor={colors.secondary} />
                    </LinearGradient>
                  </Defs>
                  <Rect width="100%" height="100%" rx={24} fill="url(#heroGrad)" />
                  <Circle cx="85%" cy="15%" r="80" fill="white" fillOpacity="0.1" />
                </Svg>

                <View style={styles.heroContent}>
                  <View style={styles.heroTopRow}>
                    <Text style={styles.heroEyebrow}>CONTROL CENTER</Text>
                    <MaterialIcon name="verified" size={14} color="rgba(255,255,255,0.6)" />
                  </View>
                  <Text style={styles.heroTitle}>DhanDiary Hub</Text>
                  <Text style={styles.heroSubtitle}>Manage your data, preferences, and account.</Text>
                </View>
                
                <MaterialIcon name="dashboard" size={80} color="rgba(255,255,255,0.1)" style={styles.heroIconPos} />
              </View>

              {/* SECTION: ESSENTIALS */}
              <Text style={styles.sectionLabel}>Essentials</Text>
              <View style={styles.menuGroup}>
                {primaryLinks.map((item, index) => (
                  <MenuRow key={item.label} {...item} isLast={index === primaryLinks.length - 1} />
                ))}
              </View>

              {/* SECTION: HELP */}
              <Text style={styles.sectionLabel}>Help & Info</Text>
              <View style={styles.menuGroup}>
                {supportLinks.map((item, index) => (
                  <MenuRow key={item.label} {...item} isLast={index === supportLinks.length - 1} />
                ))}
              </View>

              {/* FOOTER */}
              <View style={styles.footer}>
                <Text style={styles.footerText}>
                  v{pkg.version || '1.0.0'} • Build {appConfig.expo.version || '1'}
                </Text>
                <Text style={styles.footerSubText}>Made with ❤️ in India</Text>
              </View>

            </View>
          </ScrollView>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
};

// --- SUB-COMPONENT: MENU ROW ---
const MenuRow = ({ icon, label, description, action, color, isLast }: MenuItem & { isLast: boolean }) => (
  <TouchableOpacity onPress={action} activeOpacity={0.7} style={[styles.row, isLast && styles.rowLast]}>
    <View style={[styles.iconBox, { backgroundColor: `${color}15` }]}>
      <MaterialIcon name={icon} size={22} color={color} />
    </View>
    <View style={styles.rowTextContainer}>
      <Text style={styles.rowTitle} numberOfLines={1}>{label}</Text>
      <Text style={styles.rowDesc} numberOfLines={1}>{description}</Text>
    </View>
    <MaterialIcon name="chevron-right" size={20} color={colors.border} />
  </TouchableOpacity>
);

// --- STYLES ---
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  safeArea: { flex: 1 },
  headerWrapper: { alignItems: 'center', width: '100%' },
  
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, alignItems: 'center', paddingTop: spacing(2) },

  // Hero
  heroCard: { height: 160, borderRadius: 24, marginBottom: 28, overflow: 'hidden', position: 'relative', elevation: 8, shadowColor: colors.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 16 },
  heroContent: { padding: 24, zIndex: 2, justifyContent: 'center', height: '100%' },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  heroEyebrow: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 1 },
  heroTitle: { fontSize: 28, fontWeight: '800', color: '#FFFFFF', marginBottom: 4, letterSpacing: -0.5 },
  heroSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.85)', fontWeight: '500', maxWidth: '85%' },
  heroIconPos: { position: 'absolute', right: -10, bottom: -10, zIndex: 1, transform: [{ rotate: '-10deg' }] },

  // Menu Groups
  sectionLabel: { fontSize: 13, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, marginLeft: 8 },
  menuGroup: { backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.border, marginBottom: 24, overflow: 'hidden', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 8 },
  
  // Rows
  row: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.surfaceMuted || '#F3F4F6', backgroundColor: colors.card },
  rowLast: { borderBottomWidth: 0 },
  iconBox: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  rowTextContainer: { flex: 1, justifyContent: 'center', marginRight: 8 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 2 },
  rowDesc: { fontSize: 13, color: colors.muted },

  // Footer
  footer: { alignItems: 'center', marginTop: 8 },
  footerText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  footerSubText: { color: colors.muted, fontSize: 11, marginTop: 4, opacity: 0.6 },
});

export default MoreScreen;
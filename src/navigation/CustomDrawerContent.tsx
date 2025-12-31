import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  TouchableOpacity,
  Animated,
  Easing,
  Platform,
  ViewStyle,
} from 'react-native';
import { DrawerContentScrollView, DrawerContentComponentProps } from '@react-navigation/drawer';
import { Text } from '@rneui/themed';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { subscribeBanner, isBannerVisible } from '../utils/bannerState';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import Constants from 'expo-constants'; // Standard way to access version

// --- CUSTOM IMPORTS ---
// Ensure these paths are correct in your project
import { colors } from '../utils/design';
import UserAvatar from '../components/UserAvatar';
import { logout } from '../services/auth';
import { resetRoot } from '../utils/rootNavigation';
import { getSession } from '../db/session';
import { subscribeSession } from '../utils/sessionEvents';

// --- CONSTANTS ---
const ACTIVE_COLOR = (colors as any).primary || '#2563EB';
const INACTIVE_COLOR = '#64748B';
const BACKGROUND_COLOR = (colors as any).background || '#F8FAFC';
const DANGER_COLOR = (colors as any).danger || '#EF4444';
const TEXT_SUB_COLOR = INACTIVE_COLOR;

// --- DRAWER COMPONENT ---
const CustomDrawerContent = (props: DrawerContentComponentProps) => {
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const { user } = useUser();
  const [fallbackSession, setFallbackSession] = useState<any>(null);
  const [bannerVisible, setBannerVisible] = useState<boolean>(isBannerVisible());

  // Animation Refs
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  // Entrance Animation
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 15,
        stiffness: 90,
      }),
    ]).start();
    let mounted = true;
    // Load persisted fallback session (used when Clerk user isn't available, e.g., offline)
    const load = async () => {
      try {
        const s = await getSession();
        if (mounted) setFallbackSession(s);
      } catch (e) {
        // ignore
      }
    };
    load();

    // Subscribe to session changes so UI updates when login/logout/saveSession runs
    const unsub = subscribeSession((s) => {
      if (mounted) setFallbackSession(s);
    });

    return () => {
      mounted = false;
      try {
        unsub();
      } catch (e) { }
    };
  }, []);

  // subscribe to banner visibility so drawer top padding doesn't double-up
  useEffect(() => {
    const unsub = subscribeBanner((v) => setBannerVisible(!!v));
    return () => {
      if (unsub) unsub();
    };
  }, []);

  const handleNavigate = (routeName: string) => {
    props.navigation.navigate(routeName);
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut(); // Clerk
            await logout(); // Local storage clean up

            // Reset nav stack to prevent going back
            try {
              resetRoot({ index: 0, routes: [{ name: 'Auth' }] });
            } catch (e) {
              // fallback
              props.navigation.reset({ index: 0, routes: [{ name: 'Auth' }] });
            }
          } catch (e) {
            console.error('[Drawer] Logout failed', e);
            Alert.alert('Error', 'Failed to sign out. Please try again.');
          }
        },
      },
    ]);
  };

  // Icon Helper
  const getIconName = (routeName: string, label?: string): string => {
    const key = (routeName || '').toString();
    const lookup: Record<string, string> = {
      Dashboard: 'dashboard',
      DashboardStack: 'dashboard',
      Home: 'home',
      HomeStack: 'home',
      History: 'history',
      Income: 'arrow-downward',
      Expenses: 'arrow-upward',
      Analytics: 'bar-chart',
      Account: 'person',
      Profile: 'person',
      Settings: 'settings',
      About: 'info',
      Export: 'file-download',
      ExportData: 'file-download',
      PrivacyPolicy: 'shield',
      AddEntry: 'add',
    };

    if (lookup[key]) return lookup[key];

    const labelKey = (label || '').toLowerCase();
    if (labelKey.includes('export') || labelKey.includes('backup')) return 'file-download';
    if (labelKey.includes('history')) return 'history';
    if (labelKey.includes('income')) return 'arrow-downward';
    if (labelKey.includes('expense') || labelKey.includes('expenses')) return 'arrow-upward';
    if (labelKey.includes('analytics') || labelKey.includes('stats')) return 'bar-chart';
    if (labelKey.includes('account') || labelKey.includes('profile')) return 'person';
    if (labelKey.includes('settings')) return 'settings';
    if (labelKey.includes('about')) return 'info';

    return 'circle';
  };

  // Safe Version Access
  const appVersion = Constants.expoConfig?.version || '1.0.0';
  const buildVersion =
    Constants.expoConfig?.android?.versionCode || Constants.expoConfig?.ios?.buildNumber || '1';
  const versionLabel = `v${appVersion} (${buildVersion})`;

  return (
    <View style={styles.container}>
      {/* 1. SCROLLABLE CONTENT */}
      <DrawerContentScrollView
        {...props}
        contentContainerStyle={{
          paddingTop: 0, // We handle padding manually for full control
        }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={{
            opacity: fadeAnim,
            transform: [{ translateX: slideAnim }],
            paddingTop: bannerVisible ? 0 : Platform.OS === 'ios' ? 0 : insets.top, // Handle Android StatusBar and banner
          }}
        >
          {/* USER PROFILE SECTION */}
          <TouchableOpacity
            style={styles.profileHeader}
            activeOpacity={0.8}
            onPress={() => props.navigation.navigate('Account')}
          >
            {/* Prefer Clerk user when available, otherwise fall back to locally persisted session */}
            <View style={styles.avatarWrap}>
              <UserAvatar
                size={56}
                name={user?.fullName || user?.firstName || fallbackSession?.name}
                imageUrl={user?.imageUrl || fallbackSession?.imageUrl || fallbackSession?.image}
              />
              {(() => {
                // Show local badge only when there is no active Clerk `user` and
                // we have a persisted fallback session. This avoids showing both
                // the verified badge (which belongs to a live Clerk user) and
                // the local badge at the same time.
                const usingLocal = Boolean(fallbackSession && !user);
                if (!usingLocal) return null;
                return (
                  <View style={styles.localBadge}>
                    <MaterialIcon name="cloud-off" size={12} color="#B91C1C" />
                  </View>
                );
              })()}
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName} numberOfLines={1}>
                {user?.fullName || user?.firstName || fallbackSession?.name || 'Guest User'}
              </Text>
              <Text style={styles.profileEmail} numberOfLines={1}>
                {user?.primaryEmailAddress?.emailAddress ||
                  fallbackSession?.email ||
                  'Sign in to sync'}
              </Text>
            </View>
            <MaterialIcon name="chevron-right" size={24} color={colors.border || '#CBD5E1'} />
          </TouchableOpacity>

          <View style={styles.divider} />

          {/* NAVIGATION MENU */}
          <View style={styles.menuSection}>
            <Text style={styles.sectionTitle}>MENU</Text>
            {props.state.routes.map((route, index) => {
              const focused = props.state.index === index;
              const { options } = props.descriptors[route.key];

              // Filter hidden routes
              const isHidden = (options.drawerItemStyle as ViewStyle)?.display === 'none';
              if (isHidden) return null;

              const label = options.title !== undefined ? options.title : route.name;
              const iconName = getIconName(route.name, String(label));

              return (
                <TouchableOpacity
                  key={route.key}
                  onPress={() => handleNavigate(route.name)}
                  style={[styles.menuItem, focused && styles.menuItemActive]}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ selected: focused }}
                >
                  <View style={styles.iconWrapper}>
                    <View
                      style={[
                        styles.iconCircle,
                        focused
                          ? { backgroundColor: ACTIVE_COLOR }
                          : { backgroundColor: '#E6EEF8' },
                      ]}
                    >
                      <MaterialIcon
                        name={iconName as any}
                        size={18}
                        color={focused ? '#fff' : INACTIVE_COLOR}
                      />
                    </View>
                  </View>
                  <Text style={[styles.menuText, focused && styles.menuTextActive]}>{label}</Text>

                  {/* Active Pill Indicator */}
                  {focused && <View style={styles.activeIndicator} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>
      </DrawerContentScrollView>

      {/* 2. STICKY FOOTER */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.divider} />

        <TouchableOpacity
          style={styles.footerItem}
          onPress={() => handleNavigate('Export')}
          activeOpacity={0.7}
        >
          <View style={styles.iconWrapper}>
            <MaterialIcon name="cloud-download" size={22} color={colors.text || '#334155'} />
          </View>
          <Text style={styles.footerText}>Backup & Export</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.footerItem} onPress={handleLogout} activeOpacity={0.7}>
          <View style={styles.iconWrapper}>
            <MaterialIcon name="logout" size={22} color={DANGER_COLOR} />
          </View>
          <Text style={[styles.footerText, { color: DANGER_COLOR }]}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={styles.versionText}>{versionLabel}</Text>
      </View>
    </View>
  );
};

// --- STYLES ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BACKGROUND_COLOR,
  },

  /* HEADER */
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
    marginTop: 8,
  },
  profileInfo: {
    flex: 1,
    marginLeft: 14,
    justifyContent: 'center',
  },
  profileName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text || '#0F172A',
    marginBottom: 2,
    letterSpacing: 0.3,
  },
  profileEmail: {
    fontSize: 12,
    color: TEXT_SUB_COLOR,
    fontWeight: '500',
  },

  divider: {
    height: 1,
    backgroundColor: colors.border || '#E2E8F0',
    width: '90%',
    alignSelf: 'center',
    marginVertical: 10,
    opacity: 0.6,
  },

  avatarWrap: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },

  localBadge: {
    position: 'absolute',
    right: -6,
    bottom: -6,
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(185,28,28,0.12)',
  },

  /* MENU */
  menuSection: {
    paddingHorizontal: 12,
    marginTop: 10,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
    marginBottom: 8,
    marginLeft: 16,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 4,
  },
  menuItemActive: {
    backgroundColor: colors.primarySoft || 'rgba(37, 99, 235, 0.08)',
  },
  iconWrapper: { width: 44, alignItems: 'center', marginRight: 12 },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuText: {
    fontSize: 15,
    fontWeight: '600',
    color: INACTIVE_COLOR,
    flex: 1,
  },
  menuTextActive: {
    color: ACTIVE_COLOR,
    fontWeight: '700',
  },
  activeIndicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: ACTIVE_COLOR,
    marginLeft: 8,
  },

  /* FOOTER */
  footer: {
    paddingHorizontal: 12,
    backgroundColor: BACKGROUND_COLOR,
    // Ensure footer sits above content if minimal scrolling
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.03)',
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  footerText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text || '#334155',
  },
  versionText: {
    marginTop: 8,
    fontSize: 10,
    color: '#CBD5E1',
    textAlign: 'center',
    fontWeight: '500',
    letterSpacing: 0.5,
  },
});

export default CustomDrawerContent;

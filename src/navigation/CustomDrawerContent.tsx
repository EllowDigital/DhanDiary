import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
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
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import Constants from 'expo-constants';
import NetInfo from '@react-native-community/netinfo';

// --- CUSTOM IMPORTS ---
import { colors } from '../utils/design';
import UserAvatar from '../components/UserAvatar';
import { performHardSignOut } from '../services/signOutFlow';
import { resetRoot } from '../utils/rootNavigation';
import { getSession } from '../db/session';
import { subscribeSession } from '../utils/sessionEvents';
import { useToast } from '../context/ToastContext';
import { tryShowNativeConfirm } from '../utils/nativeConfirm';
import { isNetOnline } from '../utils/netState';

// --- CONSTANTS ---
const ACTIVE_COLOR = colors.primary || '#2563EB';
const INACTIVE_COLOR = '#64748B';
const BACKGROUND_COLOR = colors.background || '#F8FAFC';
const DANGER_COLOR = colors.accentRed || '#EF4444';
const TEXT_SUB_COLOR = INACTIVE_COLOR;

// --- DRAWER COMPONENT ---
const CustomDrawerContent = (props: DrawerContentComponentProps) => {
  const insets = useSafeAreaInsets();
  const { signOut: clerkSignOut } = useAuth();
  const { user } = useUser();
  const { showToast, showActionToast } = useToast();
  const [fallbackSession, setFallbackSession] = useState<any>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean | null>(true);

  useEffect(() => {
    let mounted = true;
    NetInfo.fetch().then((state) => {
      if (mounted) setIsOnline(isNetOnline(state));
    });
    const unsub = NetInfo.addEventListener((state) => {
      if (mounted) setIsOnline(isNetOnline(state));
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  // Animation Refs
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  // Entrance Animation & Session Sync
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
    const loadSession = async () => {
      try {
        const s = await getSession();
        if (mounted) setFallbackSession(s);
      } catch (e) {}
    };
    loadSession();

    const unsub = subscribeSession((s) => {
      if (mounted) setFallbackSession(s);
    });

    return () => {
      mounted = false;
      try {
        unsub();
      } catch (e) {}
    };
  }, []);

  // --- HELPER: Find Deepest Route for Active Tab Check ---
  const getDeepestActiveRouteName = (route: any): string => {
    try {
      let current = route;
      while (current?.state && typeof current.state.index === 'number') {
        const next = current.state.routes?.[current.state.index];
        if (!next) break;
        current = next;
      }
      return current?.name || route?.name || '';
    } catch (e) {
      return route?.name || '';
    }
  };

  const drawerFocusedRoute = props.state.routes[props.state.index];
  const nestedFocusedRouteName = getDeepestActiveRouteName(drawerFocusedRoute);

  const closeDrawerSafely = () => {
    try {
      (props.navigation as any).closeDrawer?.();
    } catch (e) {}
  };

  const goToDashboardTab = (screen: 'Home' | 'History') => {
    closeDrawerSafely();
    (props.navigation as any).navigate('Dashboard', { screen });
  };

  const handleNavigate = (routeName: string) => {
    if (routeName === 'Dashboard') {
      goToDashboardTab('Home');
      return;
    }
    closeDrawerSafely();
    (props.navigation as any).navigate(routeName);
  };

  const handleLogout = async () => {
    if (isSigningOut) return;

    // Sign-out must be done online so we can sync pending changes first.
    try {
      const net = await NetInfo.fetch();
      if (!isNetOnline(net)) {
        showToast('Please go online to sign out and sync your data to cloud.', 'info', 5000);
        return;
      }
    } catch (e) {
      // If NetInfo fails, allow the user to proceed.
    }

    const doSignOut = async () => {
      if (isSigningOut) return;
      setIsSigningOut(true);
      try {
        await performHardSignOut({
          clerkSignOut: async () => {
            await clerkSignOut();
          },
          onProgress: (msg) => {
            // Drawer could also show status if we added state for it.
          },
          navigateToAuth: () => {
            try {
              resetRoot({ index: 0, routes: [{ name: 'Auth' }] });
            } catch (e) {
              props.navigation.reset({ index: 0, routes: [{ name: 'Auth' }] });
            }
          },
        });
      } catch (e) {
        console.error('[Drawer] Logout failed', e);
        showToast('Failed to sign out. Please try again.', 'error');
      } finally {
        setIsSigningOut(false);
      }
    };

    closeDrawerSafely();

    // Prefer native confirm; fall back to in-app confirm when Android Activity isn't ready.
    const usedNative = await tryShowNativeConfirm({
      title: 'Sign Out',
      message: 'Are you sure you want to sign out?',
      confirmText: 'Sign Out',
      destructive: true,
      onConfirm: doSignOut,
    });

    if (!usedNative) {
      showActionToast('Sign out now?', 'Sign Out', doSignOut, 'info', 7000);
    }
  };

  // --- ICON MAPPER ---
  const getIconName = (routeName: string, label?: string): string => {
    const key = (routeName || '').toString();
    const lbl = (label || '').toLowerCase();

    const lookup: Record<string, string> = {
      Dashboard: 'dashboard',
      Home: 'home',
      History: 'history',
      Income: 'arrow-downward',
      Expenses: 'arrow-upward',
      Analytics: 'bar-chart',
      Account: 'person',
      Settings: 'settings',
      About: 'info',
      Export: 'file-download',
      PrivacyPolicy: 'security',
      Terms: 'description',
      Eula: 'gavel',
      AddEntry: 'add-circle-outline',
    };

    if (lookup[key]) return lookup[key];
    if (lbl.includes('export')) return 'file-download';
    if (lbl.includes('profile')) return 'person';
    if (lbl.includes('policy')) return 'security';

    return 'circle';
  };

  const appVersion = Constants.expoConfig?.version || '1.0.0';
  const buildVersion =
    Constants.expoConfig?.android?.versionCode || Constants.expoConfig?.ios?.buildNumber || '1';
  const versionLabel = `v${appVersion} (${buildVersion})`;

  return (
    <View style={styles.container}>
      <DrawerContentScrollView
        {...props}
        contentContainerStyle={{ paddingTop: 0 }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={{
            opacity: fadeAnim,
            transform: [{ translateX: slideAnim }],
            paddingTop: Platform.OS === 'ios' ? 0 : insets.top,
          }}
        >
          {/* --- PROFILE HEADER --- */}
          <TouchableOpacity
            style={styles.profileHeader}
            activeOpacity={0.8}
            onPress={() => props.navigation.navigate('Account')}
          >
            <View style={styles.avatarWrap}>
              <UserAvatar
                size={56}
                name={user?.fullName || user?.firstName || fallbackSession?.name}
                imageUrl={user?.imageUrl || fallbackSession?.imageUrl || fallbackSession?.image}
              />
              {/* Local Session Indicator (when offline/no clerk user yet) */}
              {Boolean(fallbackSession && !user) && (
                <View style={styles.localBadge}>
                  <MaterialIcon name="cloud-off" size={12} color="#B91C1C" />
                </View>
              )}
            </View>

            <View style={styles.profileInfo}>
              <Text style={styles.profileName} numberOfLines={1}>
                {user?.fullName || user?.firstName || fallbackSession?.name || 'Guest User'}
              </Text>
              <Text style={styles.profileEmail} numberOfLines={1}>
                {user?.primaryEmailAddress?.emailAddress ||
                  fallbackSession?.email ||
                  fallbackSession?.email ||
                  (isOnline === false ? 'Offline' : 'Sign in to sync')}
              </Text>
            </View>
            <MaterialIcon name="chevron-right" size={24} color={colors.border || '#CBD5E1'} />
          </TouchableOpacity>

          <View style={styles.divider} />

          {/* --- MENU ITEMS --- */}
          <View style={styles.menuSection}>
            <Text style={styles.sectionTitle}>MENU</Text>

            {/* 1. Dashboard (Home) */}
            {(() => {
              const focused =
                drawerFocusedRoute.name === 'Dashboard' &&
                (nestedFocusedRouteName === 'Home' || !nestedFocusedRouteName);
              return (
                <TouchableOpacity
                  style={[styles.menuItem, focused && styles.menuItemActive]}
                  onPress={() => goToDashboardTab('Home')}
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
                        name="home"
                        size={18}
                        color={focused ? '#fff' : INACTIVE_COLOR}
                      />
                    </View>
                  </View>
                  <Text style={[styles.menuText, focused && styles.menuTextActive]}>Home</Text>
                  {focused && <View style={styles.activeIndicator} />}
                </TouchableOpacity>
              );
            })()}

            {/* 2. History */}
            {(() => {
              const focused =
                drawerFocusedRoute.name === 'Dashboard' && nestedFocusedRouteName === 'History';
              return (
                <TouchableOpacity
                  style={[styles.menuItem, focused && styles.menuItemActive]}
                  onPress={() => goToDashboardTab('History')}
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
                        name="history"
                        size={18}
                        color={focused ? '#fff' : INACTIVE_COLOR}
                      />
                    </View>
                  </View>
                  <Text style={[styles.menuText, focused && styles.menuTextActive]}>
                    History Log
                  </Text>
                  {focused && <View style={styles.activeIndicator} />}
                </TouchableOpacity>
              );
            })()}

            {/* 3. Dynamic Routes */}
            {props.state.routes.map((route, index) => {
              if (route.name === 'Dashboard' || route.name === 'History') return null;

              const focused = props.state.index === index;
              const { options } = props.descriptors[route.key];
              const isHidden = (options.drawerItemStyle as ViewStyle)?.display === 'none';
              if (isHidden) return null;

              const label = options.title !== undefined ? options.title : route.name;
              const iconName = getIconName(route.name, String(label));

              return (
                <TouchableOpacity
                  key={route.key}
                  style={[styles.menuItem, focused && styles.menuItemActive]}
                  onPress={() => handleNavigate(route.name)}
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
                  {focused && <View style={styles.activeIndicator} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>
      </DrawerContentScrollView>

      {/* --- FOOTER --- */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BACKGROUND_COLOR },

  /* HEADER */
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
    marginTop: 8,
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
  profileInfo: { flex: 1, marginLeft: 14, justifyContent: 'center' },
  profileName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text || '#0F172A',
    marginBottom: 2,
    letterSpacing: 0.3,
  },
  profileEmail: { fontSize: 12, color: TEXT_SUB_COLOR, fontWeight: '500' },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border || '#E2E8F0',
    width: '100%',
    alignSelf: 'stretch',
    marginVertical: 10,
    opacity: 0.6,
  },

  /* MENU */
  menuSection: { paddingHorizontal: 12, marginTop: 6 },
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
  menuItemActive: { backgroundColor: colors.primarySoft || 'rgba(37, 99, 235, 0.08)' },
  iconWrapper: { width: 40, alignItems: 'center', marginRight: 12 },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuText: { fontSize: 15, fontWeight: '600', color: INACTIVE_COLOR, flex: 1 },
  menuTextActive: { color: ACTIVE_COLOR, fontWeight: '700' },
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
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border || 'rgba(0,0,0,0.08)',
    paddingTop: 8,
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  footerText: { fontSize: 14, fontWeight: '600', color: colors.text || '#334155' },
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

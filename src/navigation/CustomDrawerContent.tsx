import React, { useEffect, useMemo, useRef } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  TouchableOpacity,
  Animated,
  Easing,
  Image,
  useWindowDimensions,
} from 'react-native';
import { DrawerContentScrollView, DrawerContentComponentProps } from '@react-navigation/drawer';
import { Text } from '@rneui/themed';
import { CommonActions } from '@react-navigation/native';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';

import { colors, spacing } from '../utils/design';
import UserAvatar from '../components/UserAvatar';
import { logout } from '../services/auth';
import appConfig from '../../app.json';

const BRAND_ICON = require('../../assets/adaptive-icon.png');

const CustomDrawerContent = (props: DrawerContentComponentProps) => {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { signOut } = useAuth();
  const { user } = useUser();

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  // Staggered list animations
  const listAnims = useMemo(
    () => props.state.routes.map(() => new Animated.Value(0)),
    [props.state.routes.length]
  );

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
        damping: 20,
      }),
      Animated.stagger(
        50,
        listAnims.map((anim) =>
          Animated.timing(anim, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
            easing: Easing.out(Easing.quad),
          })
        )
      ),
    ]).start();
  }, []);

  const handleNavigate = (routeName: string) => {
    props.navigation.navigate(routeName);
  };

  const versionLabel = `v${appConfig.expo.version} (${appConfig.expo.android.versionCode})`;

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            try {
              await signOut(); // Sign out from Clerk
            } catch (e) {
              console.warn('Clerk signOut failed', e);
            }

            try {
              await logout(); // Clear local DB and session
            } catch (e) {
              console.warn('Local logout failed', e);
            }

            // Close drawer first
            try {
              props.navigation.closeDrawer();
            } catch (e) {}

            // Try to reset the root navigator so auth stack is shown.
            try {
              // climb to the top-most navigator
              let rootNav: any = props.navigation as any;
              while (rootNav.getParent && rootNav.getParent()) {
                const p = rootNav.getParent();
                if (!p || p === rootNav) break;
                rootNav = p;
              }
              // Reset to Auth stack at root
              if (rootNav && typeof rootNav.reset === 'function') {
                rootNav.reset({ index: 0, routes: [{ name: 'Auth' }] });
              } else {
                // fallback
                props.navigation.reset({ index: 0, routes: [{ name: 'Auth' }] });
              }
            } catch (e) {
              // as a final fallback, navigate to Auth on current navigator
              try {
                props.navigation.navigate('Auth');
              } catch (e2) {}
            }
          } catch (e) {
            console.error('Logout failed', e);
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.mainContainer}>
      <DrawerContentScrollView
        {...props}
        contentContainerStyle={{
          paddingTop: insets.top + spacing(1),
          paddingBottom: spacing(4),
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* --- USER PROFILE (moved to top, brand removed) --- */}
        <Animated.View
          style={[
            styles.headerContainer,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <TouchableOpacity
            style={styles.userHeader}
            activeOpacity={0.8}
            onPress={() => {
              try {
                props.navigation.closeDrawer();
              } catch (e) {}
              // slight delay to avoid drawer animation conflicts
              setTimeout(() => {
                try {
                  props.navigation.navigate('Account');
                } catch (e) {
                  // best-effort: try to find top-level nav and navigate
                  try {
                    let rootNav: any = props.navigation as any;
                    while (rootNav.getParent && rootNav.getParent()) {
                      const p = rootNav.getParent();
                      if (!p || p === rootNav) break;
                      rootNav = p;
                    }
                    if (rootNav && typeof rootNav.navigate === 'function') {
                      rootNav.navigate('Account');
                    }
                  } catch (e2) {}
                }
              }, 220);
            }}
          >
            <UserAvatar
              size={44}
              name={user?.fullName || user?.firstName}
              imageUrl={user?.imageUrl || (user as any)?.image}
            />
            <View style={styles.userInfo}>
              <Text style={styles.userName} numberOfLines={1}>
                {user?.fullName || 'Guest User'}
              </Text>
              <Text style={styles.userEmail} numberOfLines={1}>
                {user?.primaryEmailAddress?.emailAddress || ''}
              </Text>
            </View>
          </TouchableOpacity>
          <View style={styles.headerDivider} />
        </Animated.View>

        <View style={styles.headerDivider} />
        <View style={styles.menuContainer}>
          <Text style={styles.sectionLabel}>Navigation</Text>

          {props.state.routes.map((route, index) => {
            const focused = props.state.index === index;
            const { options } = props.descriptors[route.key];

            // Hide hidden items
            const flattenedStyle = options.drawerItemStyle
              ? StyleSheet.flatten(options.drawerItemStyle)
              : undefined;
            if (flattenedStyle?.display === 'none') return null;

            const label =
              options.drawerLabel !== undefined
                ? options.drawerLabel
                : options.title !== undefined
                  ? options.title
                  : route.name;

            // Animation values for this item
            const itemAnim = listAnims[index] || new Animated.Value(1);
            const itemTranslate = itemAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [20, 0],
            });

            return (
              <Animated.View
                key={route.key}
                style={{ opacity: itemAnim, transform: [{ translateX: itemTranslate }] }}
              >
                <TouchableOpacity
                  onPress={() => handleNavigate(route.name)}
                  style={[styles.menuItem, focused && styles.menuItemActive]}
                  activeOpacity={0.7}
                >
                  <View style={[styles.iconBox, focused && styles.iconBoxActive]}>
                    {options.drawerIcon ? (
                      options.drawerIcon({
                        focused,
                        color: focused ? colors.primary : colors.muted,
                        size: 22,
                      })
                    ) : (
                      <MaterialIcon
                        name="circle"
                        size={8}
                        color={focused ? colors.primary : colors.muted}
                      />
                    )}
                  </View>

                  <Text style={[styles.menuLabel, focused && styles.menuLabelActive]}>
                    {label as string}
                  </Text>

                  {focused && <View style={styles.activeDot} />}
                </TouchableOpacity>
              </Animated.View>
            );
          })}
        </View>
      </DrawerContentScrollView>

      {/* --- FOOTER (Fixed at bottom) --- */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.footerDivider} />

        <TouchableOpacity
          style={styles.footerBtn}
          onPress={() => props.navigation.navigate('Export')}
          activeOpacity={0.7}
        >
          <View style={styles.footerIconBox}>
            <MaterialIcon name="file-upload" size={20} color={colors.text} />
          </View>
          <Text style={styles.footerBtnText}>Export Data</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.footerBtn, styles.logoutBtn]}
          onPress={handleLogout}
          activeOpacity={0.7}
        >
          <View style={styles.footerIconBox}>
            <MaterialIcon name="logout" size={20} color={colors.accentRed} />
          </View>
          <Text style={[styles.footerBtnText, { color: colors.accentRed }]}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={styles.versionText}>{versionLabel}</Text>
      </View>
    </View>
  );
};

export default CustomDrawerContent;

/* --- STYLES --- */
const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },

  /* HEADER */
  headerContainer: {
    paddingHorizontal: spacing(3),
    marginBottom: spacing(2),
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  logoContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  logoImage: {
    width: 28,
    height: 28,
  },
  brandTextContainer: {
    flex: 1,
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
  },
  brandSubtitle: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: '500',
  },
  headerDivider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.05)',
    width: '100%',
  },

  /* USER HEADER */
  userHeader: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E2E8F0',
    marginRight: 16,
  },
  userInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  userName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 12,
    color: colors.muted,
  },

  editButton: {
    padding: 8,
    marginLeft: 8,
  },

  /* MENU */
  menuContainer: {
    paddingHorizontal: spacing(2),
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    marginBottom: 12,
    marginLeft: 12,
    marginTop: 12,
    letterSpacing: 1,
    opacity: 0.6,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginBottom: 4,
  },
  menuItemActive: {
    backgroundColor: colors.primarySoft || '#EEF2FF',
  },
  iconBox: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  iconBoxActive: {
    // Optional: transform scale if desired
  },
  menuLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  menuLabelActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
    marginRight: 4,
  },

  /* FOOTER */
  footer: {
    paddingHorizontal: spacing(3),
    backgroundColor: colors.background,
  },
  footerDivider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.05)',
    marginBottom: 20,
  },
  footerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 4,
  },
  logoutBtn: {
    marginBottom: 16,
  },
  footerIconBox: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  footerBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  versionText: {
    fontSize: 11,
    color: colors.muted,
    textAlign: 'center',
    opacity: 0.5,
    fontWeight: '500',
  },
});

import React, { useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet, Alert, TouchableOpacity, Animated, Easing, Image } from 'react-native';
import { DrawerContentScrollView, DrawerContentComponentProps } from '@react-navigation/drawer';
import { Text } from '@rneui/themed';
import { CommonActions } from '@react-navigation/native';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Logic & Utils
import { logout } from '../services/auth';
import { colors, spacing, shadows } from '../utils/design';
import appConfig from '../../app.json';
const pkg = require('../../package.json');

// CHANGED: Using splash-icon.png now
const brandIcon = require('../../assets/splash-icon.png');

const CustomDrawerContent = (props: DrawerContentComponentProps) => {
  const insets = useSafeAreaInsets();

  // --- ANIMATIONS ---
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const listAnims = useRef([...Array(10)].map(() => new Animated.Value(0))).current;

  useEffect(() => {
    // 1. Header Animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
    ]).start();

    // 2. Staggered List Animation
    const staggerAnimations = listAnims.map((anim) =>
      Animated.timing(anim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
        easing: Easing.out(Easing.quad),
      })
    );
    Animated.stagger(50, staggerAnimations).start();
  }, []);

  const versionLabel = useMemo(() => {
    const build = appConfig.expo.android?.versionCode ?? appConfig.expo.ios?.buildNumber;
    return build ? `v${pkg.version} (Build ${build})` : `v${pkg.version}`;
  }, []);

  const handleNavigate = (routeName: string) => {
    if (routeName === 'HomeTabs') {
      props.navigation.dispatch(
        CommonActions.navigate({
          name: 'HomeTabs',
          params: { screen: 'Dashboard' },
        })
      );
    } else {
      props.navigation.navigate(routeName);
    }
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await logout();
            props.navigation.closeDrawer();
            props.navigation.reset({
              index: 0,
              routes: [{ name: 'Auth' }],
            });
          } catch (e) {
            console.error('Logout failed', e);
          }
        },
      },
    ]);
  };

  return (
    <DrawerContentScrollView
      {...props}
      contentContainerStyle={[
        styles.container,
        {
          paddingTop: insets.top + spacing(3),
          paddingBottom: insets.bottom + spacing(4),
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* PROFILE HEADER */}
      <Animated.View
        style={[styles.headerCard, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
      >
        <View style={styles.brandRow}>
          {/* UPDATED: Wrapper logic changed (no border) */}
          <View style={styles.brandIconWrap}>
            <Image source={brandIcon} style={styles.brandIcon} resizeMode="cover" />
          </View>
          <View>
            <Text style={styles.brandTitle}>DhanDiary</Text>
            <Text style={styles.brandSubtitle}>Smarter money tracking</Text>
          </View>
        </View>
      </Animated.View>

      {/* NAVIGATION MENU */}
      <View style={styles.menuContainer}>
        <Text style={styles.sectionLabel}>Menu</Text>

        {props.state.routes.map((route, index) => {
          const focused = props.state.index === index;
          const { options } = props.descriptors[route.key];
          const label =
            options.drawerLabel !== undefined
              ? options.drawerLabel
              : options.title !== undefined
                ? options.title
                : route.name;

          const flattenedStyle = options.drawerItemStyle
            ? StyleSheet.flatten(options.drawerItemStyle)
            : undefined;
          if (flattenedStyle?.display === 'none') return null;

          const itemAnim = listAnims[index] || new Animated.Value(1);
          const itemTranslate = itemAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [10, 0],
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
                      size={10}
                      color={focused ? colors.primary : colors.muted}
                    />
                  )}
                </View>
                <Text style={[styles.menuLabel, focused && styles.menuLabelActive]}>
                  {label as string}
                </Text>
                {focused && <View style={styles.activeIndicator} />}
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </View>

      {/* FOOTER */}
      <View style={styles.footer}>
        <View style={styles.divider} />
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <View style={[styles.iconBox, styles.logoutIconBox]}>
            <MaterialIcon name="logout" size={20} color={colors.accentRed} />
          </View>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
        <Text style={styles.versionText}>{versionLabel}</Text>
      </View>
    </DrawerContentScrollView>
  );
};

export default CustomDrawerContent;

/* --- STYLES --- */
const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: colors.background,
    padding: spacing(3),
  },

  /* HEADER */
  headerCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 16,
    marginBottom: 24,
    ...shadows.small,
    // Removed border here too for a cleaner look, optional
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.03)',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 4, // Reduced margin to make card tighter
  },
  brandIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16, // Slightly softer radius
    backgroundColor: colors.primarySoft || '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden', // Ensures the image respects the radius
    // CHANGED: Removed borderWidth and borderColor
  },
  brandIcon: {
    width: '100%', // Fill the container
    height: '100%',
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
    marginTop: 2,
    fontWeight: '500',
  },

  /* MENU */
  menuContainer: {
    flex: 1,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    marginBottom: 12,
    marginLeft: 8,
    letterSpacing: 0.5,
    opacity: 0.7,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    marginBottom: 8,
  },
  menuItemActive: {
    backgroundColor: colors.primarySoft || '#eff6ff',
  },
  iconBox: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  iconBoxActive: {},
  menuLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
    flex: 1,
  },
  menuLabelActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  activeIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },

  /* FOOTER */
  footer: {
    marginTop: 16,
    paddingBottom: 12,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border || '#f3f4f6',
    marginBottom: 20,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  logoutIconBox: {
    width: 32,
    alignItems: 'center',
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.accentRed,
  },
  versionText: {
    textAlign: 'center',
    fontSize: 11,
    color: colors.muted,
    marginTop: 16,
    opacity: 0.4,
  },
});

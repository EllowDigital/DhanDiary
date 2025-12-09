import React, { useEffect, useMemo, useRef } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  TouchableOpacity,
  Animated,
  Easing,
  Image,
  Platform,
} from 'react-native';
import { DrawerContentScrollView, DrawerContentComponentProps } from '@react-navigation/drawer';
import { Text, Button } from '@rneui/themed';
import { CommonActions } from '@react-navigation/native';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';

// Logic & Utils
import { logout } from '../services/auth';
import { useAuth } from '../hooks/useAuth';
import { colors, spacing, shadows } from '../utils/design';

const CustomDrawerContent = (props: DrawerContentComponentProps) => {
  const { user } = useAuth();

  // --- ANIMATIONS ---
  // Standard Animated API (Crash Proof)
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  // Create an array of animated values for staggered list items
  // Assuming max 10 menu items for safety
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

  // --- LOGIC ---
  const initials = useMemo(() => {
    if (!user?.name) return 'U';
    return user.name
      .split(' ')
      .slice(0, 2)
      .map((c) => c[0])
      .join('')
      .toUpperCase();
  }, [user?.name]);

  const handleNavigate = (routeName: string) => {
    // Handling nested navigators if needed
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
    // Optional: Close drawer after tap
    // props.navigation.closeDrawer();
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
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* PROFILE HEADER */}
      <Animated.View
        style={[styles.headerCard, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
      >
        <View style={styles.userRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName} numberOfLines={1}>
              {user?.name || 'Guest'}
            </Text>
            <Text style={styles.userEmail} numberOfLines={1}>
              {user?.email || 'No email linked'}
            </Text>
          </View>
        </View>
        <View style={styles.planBadge}>
          <MaterialIcon name="verified" size={14} color={colors.primary} />
          <Text style={styles.planText}>Standard Plan</Text>
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

          // Skip hidden routes if any
          if (options.drawerItemStyle?.display === 'none') return null;

          // Animation for this item
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
                  {/* Render Icon if provided in navigation options */}
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
        <Text style={styles.versionText}>v1.0.2</Text>
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
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.small,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.primary,
  },
  userInfo: {
    flex: 1,
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
  planBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
    gap: 6,
  },
  planText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text,
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
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginBottom: 8,
  },
  menuItemActive: {
    backgroundColor: colors.primarySoft, // Light blue bg for active
  },
  iconBox: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  iconBoxActive: {
    // Optional: distinct styling for active icon container
  },
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
    marginTop: 20,
    paddingBottom: 20,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: 20,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    // backgroundColor: 'rgba(239, 68, 68, 0.05)', // Optional red tint
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
    opacity: 0.5,
  },
});

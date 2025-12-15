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
  useWindowDimensions,
} from 'react-native';
import { DrawerContentScrollView, DrawerContentComponentProps } from '@react-navigation/drawer';
import { Text } from '@rneui/themed';
import { CommonActions } from '@react-navigation/native';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Logic & Utils
import { logoutUser } from '../services/firebaseAuth';
import { colors, spacing, shadows } from '../utils/design';
import appConfig from '../../app.json';
let pkg: any = {};
try {
  const req: any = typeof globalThis !== 'undefined' && typeof (globalThis as any).require === 'function' ? (globalThis as any).require : typeof require === 'function' ? require : null;
  if (req) pkg = req('../../package.json');
} catch (e) {
  pkg = {};
}

// Assets
const brandIcon = require('../../assets/splash-icon.png');

const CustomDrawerContent = (props: DrawerContentComponentProps) => {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  // --- ANIMATIONS ---
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  // Create animations for up to 10 menu items
  const listAnims = useRef([...Array(10)].map(() => new Animated.Value(0))).current;

  useEffect(() => {
    // 1. Header Entrance
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

    // 2. Staggered Menu List
    const staggerAnimations = listAnims.map((anim) =>
      Animated.timing(anim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
        easing: Easing.out(Easing.back(1.5)), // Slight bounce effect
      })
    );
    Animated.stagger(50, staggerAnimations).start();
  }, []);

  const versionLabel = useMemo(() => {
    const build = appConfig.expo.android?.versionCode ?? appConfig.expo.ios?.buildNumber;
    return build ? `v${pkg.version} (${build})` : `v${pkg.version}`;
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
            await logoutUser();
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
          paddingTop: insets.top + spacing(2),
          paddingBottom: insets.bottom + spacing(4),
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* --- PROFILE HEADER --- */}
      <Animated.View
        style={[styles.headerCard, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
      >
        <View style={styles.brandRow}>
          <View style={styles.brandIconWrap}>
            <Image source={brandIcon} style={styles.brandIcon} resizeMode="contain" />
          </View>
          <View style={styles.brandTextCol}>
            <Text style={styles.brandTitle}>DhanDiary</Text>
            <Text style={styles.brandSubtitle}>Smart Finance</Text>
          </View>
        </View>
      </Animated.View>

      {/* --- NAVIGATION MENU --- */}
      <View style={styles.menuContainer}>
        <Text style={styles.sectionLabel}>Menu</Text>

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
            outputRange: [15, 0],
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

                {focused && <View style={styles.activeIndicator} />}
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </View>

      {/* --- FOOTER --- */}
      <View style={styles.footer}>
        <View style={styles.divider} />

        <TouchableOpacity
          style={styles.quickExportBtn}
          onPress={() => props.navigation.navigate('Export')}
          activeOpacity={0.7}
        >
          <View style={[styles.iconBox, styles.exportIconBox]}>
            <MaterialIcon name="file-upload" size={18} color={colors.primary} />
          </View>
          <Text style={styles.exportText}>Export</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
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
    paddingHorizontal: spacing(3),
  },

  /* HEADER */
  headerCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 16,
    marginBottom: 24,
    // Modern Shadow
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.02)',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  brandIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#f1f5f9',
    overflow: 'hidden',
  },
  brandIcon: {
    width: '80%',
    height: '80%',
  },
  brandTextCol: {
    flex: 1,
    justifyContent: 'center',
  },
  brandTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  brandSubtitle: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  /* MENU */
  menuContainer: {
    flex: 1,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginLeft: 12,
    letterSpacing: 1,
    opacity: 0.6,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginBottom: 6,
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
    // Optional: Add specific active icon style
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
  activeIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
    marginLeft: 8,
  },

  /* FOOTER */
  footer: {
    marginTop: 16,
    paddingBottom: 10,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border || '#f3f4f6',
    marginBottom: 16,
    marginHorizontal: 4,
  },
  quickExportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  exportIconBox: {
    width: 32,
    alignItems: 'center',
  },
  exportText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    // Optional: Red tint background on hover/press could be added
  },
  logoutIconBox: {
    width: 32,
    alignItems: 'center',
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.accentRed,
  },
  versionText: {
    textAlign: 'center',
    fontSize: 11,
    color: colors.muted,
    marginTop: 16,
    opacity: 0.4,
    fontWeight: '500',
  },
});

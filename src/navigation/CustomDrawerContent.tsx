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
import { useAuth } from '@clerk/clerk-expo';

// ...

const CustomDrawerContent = (props: DrawerContentComponentProps) => {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { signOut } = useAuth();

  // ...

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut(); // Sign out from Clerk
            await logout();  // Clear local DB
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
    <View style={styles.mainContainer}>
      <DrawerContentScrollView
        {...props}
        contentContainerStyle={{
          paddingTop: insets.top + spacing(1),
          paddingBottom: spacing(4),
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* --- BRAND HEADER --- */}
        <Animated.View
          style={[
            styles.headerContainer,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <View style={styles.brandRow}>
            <View style={styles.logoContainer}>
              <Image source={BRAND_ICON} style={styles.logoImage} resizeMode="contain" />
            </View>
            <View style={styles.brandTextContainer}>
              <Text style={styles.brandTitle}>DhanDiary</Text>
              <Text style={styles.brandSubtitle}>Personal Finance</Text>
            </View>
          </View>
          <View style={styles.headerDivider} />
        </Animated.View>

        {/* --- MENU ITEMS --- */}
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

import React, { useEffect, useMemo, useCallback } from 'react';
import { View, StyleSheet, Alert, Dimensions, TouchableOpacity } from 'react-native';
import { DrawerContentScrollView, DrawerContentComponentProps } from '@react-navigation/drawer';
import { Text, Button } from '@rneui/themed';
import { CommonActions } from '@react-navigation/native';

import { logout } from '../services/auth';
import { useAuth } from '../hooks/useAuth';
import { colors } from '../utils/design';

import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  FadeInDown,
} from 'react-native-reanimated';

const { width } = Dimensions.get('window');
const scale = width / 390;
const font = (s: number) => Math.round(s * scale);

const CustomDrawerContent = React.memo((props: DrawerContentComponentProps) => {
  const { user } = useAuth();

  const fade = useSharedValue(0);

  useEffect(() => {
    fade.value = withTiming(1, {
      duration: 450,
      easing: Easing.out(Easing.cubic),
    });
  }, [fade]);

  const aStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateY: (1 - fade.value) * 16 }],
  }));

  const initials = useMemo(() => {
    if (!user?.name) return 'DD';
    return user.name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((chunk) => chunk[0].toUpperCase())
      .join('');
  }, [user?.name]);

  const handleNavigate = useCallback(
    (routeName: string) => {
      if (routeName === 'HomeTabs') {
        props.navigation.dispatch(
          CommonActions.navigate({
            name: 'HomeTabs',
            params: { screen: 'Dashboard' },
          })
        );
      } else {
        props.navigation.navigate(routeName as never);
      }
      props.navigation.closeDrawer();
    },
    [props.navigation]
  );

  const drawerItems = useMemo(
    () =>
      props.state.routes.map((route, idx) => {
        const focused = props.state.index === idx;
        const descriptor = props.descriptors[route.key];
        const { drawerLabel, drawerIcon } = descriptor.options;
        const iconColor = focused ? colors.primary : colors.muted;
        const label =
          typeof drawerLabel === 'function'
            ? drawerLabel({ color: iconColor, focused })
            : drawerLabel || route.name;
        return (
          <Animated.View
            key={route.key}
            entering={FadeInDown.delay(60 + idx * 50)
              .springify()
              .damping(16)}
            style={styles.menuItemWrapper}
          >
            <TouchableOpacity
              style={[styles.menuItem, focused && styles.menuItemActive]}
              activeOpacity={0.9}
              onPress={() => handleNavigate(route.name)}
            >
              <View style={[styles.menuIndicator, focused && styles.menuIndicatorActive]} />
              <View style={styles.menuRow}>
                {drawerIcon ? (
                  <View style={[styles.menuIconWrap, focused && styles.menuIconActive]}>
                    {drawerIcon({ color: iconColor, size: 22, focused })}
                  </View>
                ) : null}
                <Text style={[styles.menuLabel, focused && styles.menuLabelActive]}>{label}</Text>
              </View>
            </TouchableOpacity>
          </Animated.View>
        );
      }),
    [props.state.routes, props.state.index, props.descriptors, handleNavigate]
  );

  const handleLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          try {
            await logout();
            props.navigation.closeDrawer();
            props.navigation.reset({
              index: 0,
              routes: [{ name: 'Auth' as never }],
            });
          } catch (e) {
            console.error('Logout failed', e);
          }
        },
      },
    ]);
  };

  return (
    <DrawerContentScrollView {...props} contentContainerStyle={styles.container}>
      <Animated.View style={[styles.headerCard, aStyle]}>
        <View style={styles.userRow}>
          <View style={styles.avatarWrap}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.userMeta}>
            <Text style={styles.userName}>{user?.name || 'Guest user'}</Text>
            <Text style={styles.userEmail}>{user?.email || 'Stay in control of cash'}</Text>
          </View>
        </View>
        <Text style={styles.appSub}>Personal finance hub</Text>
      </Animated.View>

      <Text style={styles.sectionHeading}>Quick navigation</Text>
      <View style={styles.menuWrap}>{drawerItems}</View>

      <View style={styles.footer}>
        <Button
          title="Log out"
          onPress={handleLogout}
          type="outline"
          icon={{ name: 'logout', color: colors.accentRed, size: 18 }}
          buttonStyle={styles.logoutBtn}
          titleStyle={styles.logoutTitle}
        />
      </View>
    </DrawerContentScrollView>
  );
});

export default CustomDrawerContent;

/* ============  STYLES  ============ */
const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: colors.background,
    paddingBottom: 32,
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  headerCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 18,
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: font(17),
  },
  userMeta: {
    marginLeft: 12,
    flex: 1,
  },
  userName: {
    color: colors.text,
    fontSize: font(16),
    fontWeight: '700',
  },
  userEmail: {
    color: colors.muted,
    fontSize: font(13),
    marginTop: 2,
  },
  appSub: {
    fontSize: font(12),
    color: colors.muted,
    fontWeight: '600',
    marginTop: 4,
  },
  sectionHeading: {
    fontSize: font(13),
    fontWeight: '700',
    color: colors.muted,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  menuWrap: {
    paddingHorizontal: 2,
  },
  menuItemWrapper: {
    marginBottom: 10,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  menuItemActive: {
    borderColor: `${colors.primary}55`,
    backgroundColor: colors.primarySoft,
  },
  menuIndicator: {
    width: 4,
    backgroundColor: 'transparent',
    borderRadius: 999,
    marginRight: 12,
    alignSelf: 'stretch',
  },
  menuIndicatorActive: {
    backgroundColor: colors.primary,
  },
  menuRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  menuIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    backgroundColor: colors.softCard,
  },
  menuIconActive: {
    backgroundColor: colors.card,
  },
  menuLabel: {
    color: colors.muted,
    fontSize: font(15),
    fontWeight: '600',
    flex: 1,
  },
  menuLabelActive: {
    color: colors.text,
  },
  footer: {
    paddingHorizontal: 2,
    paddingTop: 24,
  },
  logoutBtn: {
    borderColor: colors.accentRed,
    borderWidth: 1,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: 'transparent',
  },
  logoutTitle: {
    color: colors.accentRed,
    fontWeight: '700',
  },
});

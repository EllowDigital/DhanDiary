import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet, Alert, Dimensions, TouchableOpacity } from 'react-native';
import { DrawerContentScrollView, DrawerContentComponentProps } from '@react-navigation/drawer';
import { Text, Button } from '@rneui/themed';

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
  }, []);

  const aStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateY: (1 - fade.value) * 18 }],
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
              onPress={() => props.navigation.navigate(route.name as never)}
            >
              {drawerIcon ? (
                <View style={[styles.menuIconWrap, focused && styles.menuIconActive]}>
                  {drawerIcon({ color: iconColor, size: 22, focused })}
                </View>
              ) : null}
              <Text style={[styles.menuLabel, focused && styles.menuLabelActive]}>{label}</Text>
            </TouchableOpacity>
          </Animated.View>
        );
      }),
    [props.state.routes, props.state.index, props.descriptors, props.navigation]
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

      <View style={styles.menuWrap}>{drawerItems}</View>

      {/* LOGOUT */}
      <View style={styles.footer}>
        <Button
          title="Logout"
          onPress={handleLogout}
          icon={{ name: 'logout', color: '#fff', size: 18 }}
          buttonStyle={styles.logoutBtn}
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
    paddingBottom: 24,
  },
  headerCard: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 20,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.text,
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 4,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatarWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: font(18),
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
  },
  menuWrap: {
    paddingHorizontal: 12,
  },
  menuItemWrapper: {
    marginBottom: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  menuItemActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  menuIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    backgroundColor: colors.softCard,
  },
  menuIconActive: {
    backgroundColor: colors.card,
  },
  menuLabel: {
    color: colors.muted,
    fontSize: font(15),
    fontWeight: '600',
  },
  menuLabelActive: {
    color: colors.text,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  logoutBtn: {
    backgroundColor: colors.accentRed,
    paddingVertical: 12,
    borderRadius: 14,
  },
});

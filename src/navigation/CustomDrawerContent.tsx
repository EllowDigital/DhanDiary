import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet, Image, Alert, Dimensions, TouchableOpacity } from 'react-native';
import {
  DrawerContentScrollView,
  DrawerContentComponentProps,
} from '@react-navigation/drawer';
import { Text, Button } from '@rneui/themed';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';

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
        const { drawerLabel, drawerIcon } = props.descriptors[route.key].options;
        const label =
          typeof drawerLabel === 'function'
            ? drawerLabel({ color: focused ? colors.text : colors.muted, focused })
            : drawerLabel || route.name;
        return (
          <Animated.View
            key={route.key}
            entering={FadeInDown.delay(80 + idx * 60).springify().damping(14)}
            style={styles.menuItemWrapper}
          >
            <TouchableOpacity
              style={[styles.menuItem, focused && styles.menuItemActive]}
              activeOpacity={0.85}
              onPress={() => props.navigation.navigate(route.name as never)}
            >
              <View style={[styles.menuIconWrap, focused && styles.menuIconActive]}>
                {drawerIcon &&
                  drawerIcon({ color: focused ? colors.text : colors.muted, size: 24, focused })}
              </View>
              <Text style={[styles.menuLabel, focused && styles.menuLabelActive]}>{label}</Text>
              <MaterialIcon
                name="chevron-right"
                size={20}
                color={focused ? colors.text : colors.muted}
                style={{ marginLeft: 'auto' }}
              />
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
        <View style={styles.brandRow}>
          <Image source={require('../../assets/icon.png')} style={styles.drawerIcon} />
          <View>
            <Text style={styles.appHeading}>DhanDiary</Text>
            <Text style={styles.appSub}>Personal finance hub</Text>
          </View>
        </View>

        <View style={styles.userRow}>
          <View style={styles.avatarWrap}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.userMeta}>
            <Text style={styles.userName}>{user?.name || 'Guest user'}</Text>
            <Text style={styles.userEmail}>{user?.email || 'Stay in control of cash'}</Text>
          </View>
        </View>

        <View style={styles.userBadges}>
          <View style={styles.badgePill}>
            <MaterialIcon name="verified" size={16} color={colors.accentGreen} />
            <Text style={styles.badgeText}>Secure sync</Text>
          </View>
          <View style={styles.badgePill}>
            <MaterialIcon name="schedule" size={16} color={colors.secondary} />
            <Text style={styles.badgeText}>Realtime updates</Text>
          </View>
        </View>
      </Animated.View>

      <View style={styles.quickActionsRow}>
        <TouchableOpacity
          style={styles.quickAction}
          onPress={() => props.navigation.navigate('AddEntry' as never)}
          activeOpacity={0.85}
        >
          <View style={[styles.quickIconWrap, { backgroundColor: colors.primary }]}>
            <MaterialIcon name="add" size={18} color="#fff" />
          </View>
          <Text style={styles.quickLabel}>Add entry</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickAction}
          onPress={() => props.navigation.navigate('Stats' as never)}
          activeOpacity={0.85}
        >
          <View style={[styles.quickIconWrap, { backgroundColor: colors.secondary }]}>
            <MaterialIcon name="insights" size={18} color="#fff" />
          </View>
          <Text style={styles.quickLabel}>Insights</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.menuWrap}>{drawerItems}</View>

      <View style={styles.promoCard}>
        <View>
          <Text style={styles.promoTitle}>Need detailed reports?</Text>
          <Text style={styles.promoText}>Jump into Stats to see cash flow analytics.</Text>
        </View>
        <TouchableOpacity
          style={styles.promoBtn}
          onPress={() => props.navigation.navigate('Stats' as never)}
        >
          <Text style={styles.promoBtnText}>Open stats</Text>
        </TouchableOpacity>
      </View>

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
    paddingTop: 0,
    paddingBottom: 24,
  },

  headerCard: {
    backgroundColor: colors.card,
    borderRadius: 28,
    paddingVertical: 26,
    paddingHorizontal: 20,
    alignItems: 'flex-start',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 18,
    shadowColor: colors.text,
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  appHeading: {
    fontSize: font(20),
    fontWeight: '800',
    color: colors.text,
  },
  appSub: {
    fontSize: font(12),
    color: colors.muted,
    marginTop: 4,
    fontWeight: '600',
  },
  drawerIcon: {
    width: 54,
    height: 54,
    borderRadius: 16,
    marginRight: 12,
    backgroundColor: colors.softCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarWrap: {
    width: 52,
    height: 52,
    borderRadius: 18,
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
    marginLeft: 14,
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
    marginTop: 4,
  },
  userBadges: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.softCard,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginRight: 10,
  },
  badgeText: {
    color: colors.muted,
    fontSize: font(11),
    fontWeight: '600',
    marginLeft: 6,
  },
  quickActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 18,
  },
  quickAction: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: 6,
  },
  quickIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  quickLabel: {
    color: colors.text,
    fontWeight: '600',
  },
  menuWrap: {
    flexGrow: 1,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  menuItemWrapper: {
    marginBottom: 6,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  menuItemActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  menuIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: colors.softCard,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
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
  promoCard: {
    backgroundColor: colors.softCard,
    borderRadius: 20,
    padding: 18,
    marginHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  promoTitle: {
    color: colors.text,
    fontWeight: '700',
    marginBottom: 6,
  },
  promoText: {
    color: colors.muted,
    fontSize: 13,
    marginBottom: 10,
  },
  promoBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  promoBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  footer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },

  logoutBtn: {
    backgroundColor: colors.accentRed,
    paddingVertical: 14,
    borderRadius: 16,
  },
});

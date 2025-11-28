import React, { useEffect } from 'react';
import { View, StyleSheet, Image, Alert, Dimensions, TouchableOpacity } from 'react-native';
import {
  DrawerContentScrollView,
  DrawerItemList,
  DrawerContentComponentProps,
} from '@react-navigation/drawer';
import { Text, Button } from '@rneui/themed';

import { logout } from '../services/auth';
import { useAuth } from '../hooks/useAuth';

import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
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

  const iconSize = width >= 420 ? 90 : width >= 360 ? 78 : 64;

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
      {/* HEADER */}
      <Animated.View style={[styles.headerCard, aStyle]}>
        <Image
          source={require('../../assets/icon.png')}
          style={[styles.logo, { width: iconSize, height: iconSize }]}
        />

        <Text style={styles.appName}>DhanDiary</Text>
        <Text style={styles.username}>{user?.name || 'Guest Profile'}</Text>
      </Animated.View>

      {/* DRAWER ITEM LIST */}
      <View style={styles.menuWrap}>
        {React.useMemo(
          () =>
            props.state.routes.map((route, idx) => {
              const focused = props.state.index === idx;
              const { drawerLabel, drawerIcon } = props.descriptors[route.key].options;
              return (
                <TouchableOpacity
                  key={route.key}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    backgroundColor: focused ? '#e0e7ef' : 'transparent',
                    borderRadius: 16,
                    marginBottom: 2,
                  }}
                  activeOpacity={0.7}
                  onPress={() => props.navigation.navigate(route.name)}
                >
                  {drawerIcon && drawerIcon({ color: focused ? '#1E293B' : '#64748B', size: 26 })}
                  <Text
                    style={{
                      marginLeft: 14,
                      fontSize: 16,
                      fontWeight: focused ? '700' : '600',
                      color: focused ? '#1E293B' : '#64748B',
                    }}
                  >
                    {drawerLabel || route.name}
                  </Text>
                </TouchableOpacity>
              );
            }),
          [props.state.routes, props.state.index, props.descriptors]
        )}
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
    backgroundColor: '#F1F5F9',
    paddingTop: 0,
  },

  /* Header card */
  headerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingVertical: 32,
    paddingHorizontal: 20,
    alignItems: 'center',
    margin: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },

  logo: {
    borderRadius: 20,
    marginBottom: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },

  appName: {
    fontSize: font(24),
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.5,
  },

  username: {
    fontSize: font(14),
    marginTop: 6,
    color: '#334155',
    fontWeight: '600',
  },

  // powered: removed

  /* menu items */
  menuWrap: {
    flexGrow: 1,
    paddingHorizontal: 4,
    marginBottom: 10,
  },

  /* logout button */
  footer: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    marginTop: 8,
  },

  logoutBtn: {
    backgroundColor: '#EF4444',
    paddingVertical: 12,
    borderRadius: 12,
  },
});

import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  TouchableOpacity,
  Animated,
  Easing,
  Platform,
} from 'react-native';
import { DrawerContentScrollView, DrawerContentComponentProps } from '@react-navigation/drawer';
import { Text } from '@rneui/themed';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';

// --- CUSTOM IMPORTS ---
import { colors, spacing } from '../utils/design';
import UserAvatar from '../components/UserAvatar';
import { logout } from '../services/auth';
import appConfig from '../../app.json';

// --- DRAWER COMPONENT ---
const CustomDrawerContent = (props: DrawerContentComponentProps) => {
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const { user } = useUser();

  // Animation Refs
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
        easing: Easing.out(Easing.quad),
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
      }),
    ]).start();
  }, []);

  const handleNavigate = (routeName: string) => {
    props.navigation.navigate(routeName);
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut(); // Clerk
            await logout(); // Local Data
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

  const getIconName = (routeName: string): keyof typeof MaterialIcon.glyphMap => {
    switch (routeName) {
      case 'Dashboard':
        return 'dashboard';
      case 'History':
        return 'history';
      case 'Income':
        return 'arrow-downward';
      case 'Expenses':
        return 'arrow-upward';
      case 'Analytics':
        return 'bar-chart';
      case 'My Profile':
      case 'Account':
        return 'person';
      case 'App Settings':
      case 'Settings':
        return 'settings';
      case 'About':
        return 'info';
      case 'Export Data':
      case 'Export':
        return 'file-download';
      default:
        return 'circle';
    }
  };

  // Safe Version Access
  const versionLabel = `v${appConfig?.expo?.version || '1.0.0'} (${appConfig?.expo?.android?.versionCode || '1'})`;

  return (
    <View style={styles.container}>
      {/* Scrollable Area */}
      <DrawerContentScrollView
        {...props}
        contentContainerStyle={{
          paddingTop: Platform.OS === 'ios' ? 0 : insets.top, // Handle Android status bar
          paddingBottom: 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          {/* 1. USER PROFILE HEADER */}
          <TouchableOpacity
            style={styles.profileHeader}
            activeOpacity={0.7}
            onPress={() => props.navigation.navigate('Account')}
          >
            <UserAvatar
              size={52}
              name={user?.fullName || user?.firstName}
              imageUrl={user?.imageUrl}
            />
            <View style={styles.profileInfo}>
              <Text style={styles.profileName} numberOfLines={1}>
                {user?.fullName || 'Guest User'}
              </Text>
              <Text style={styles.profileEmail} numberOfLines={1}>
                {user?.primaryEmailAddress?.emailAddress || 'Not signed in'}
              </Text>
            </View>
            <MaterialIcon name="chevron-right" size={24} color={colors.muted || '#94A3B8'} />
          </TouchableOpacity>

          <View style={styles.divider} />

          {/* 2. NAVIGATION MENU */}
          <View style={styles.menuSection}>
            <Text style={styles.sectionTitle}>NAVIGATION</Text>
            {props.state.routes.map((route, index) => {
              const focused = props.state.index === index;
              const { options } = props.descriptors[route.key];

              // Skip hidden items if needed
              if (options.drawerItemStyle && (options.drawerItemStyle as any).display === 'none')
                return null;

              const label = options.title !== undefined ? options.title : route.name;
              const icon = getIconName(label);

              return (
                <TouchableOpacity
                  key={route.key}
                  onPress={() => handleNavigate(route.name)}
                  style={[styles.menuItem, focused && styles.menuItemActive]}
                  activeOpacity={0.7}
                >
                  <View style={[styles.iconContainer, focused && styles.iconContainerActive]}>
                    <MaterialIcon
                      name={icon}
                      size={22}
                      color={focused ? colors.primary || '#2563EB' : colors.muted || '#64748B'}
                    />
                  </View>
                  <Text style={[styles.menuText, focused && styles.menuTextActive]}>{label}</Text>
                  {focused && <View style={styles.activeIndicator} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>
      </DrawerContentScrollView>

      {/* 3. FOOTER ACTIONS */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.divider} />

        <TouchableOpacity
          style={styles.footerItem}
          onPress={() => props.navigation.navigate('Export')}
        >
          <MaterialIcon name="file-upload" size={20} color={colors.text || '#1E293B'} />
          <Text style={styles.footerText}>Export Data</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.footerItem} onPress={handleLogout}>
          <MaterialIcon name="logout" size={20} color="#EF4444" />
          <Text style={[styles.footerText, { color: '#EF4444' }]}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={styles.versionText}>{versionLabel}</Text>
      </View>
    </View>
  );
};

// --- STYLES ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background || '#F8FAFC',
  },

  /* HEADER */
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
    backgroundColor: colors.background || '#F8FAFC',
  },
  profileInfo: {
    flex: 1,
    marginLeft: 16,
    justifyContent: 'center',
  },
  profileName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text || '#0F172A',
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 12,
    color: colors.muted || '#64748B',
  },

  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    width: '100%',
    marginVertical: 8,
  },

  /* MENU SECTION */
  menuSection: {
    paddingHorizontal: 12,
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    marginBottom: 12,
    marginLeft: 16,
    letterSpacing: 1,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 4,
  },
  menuItemActive: {
    backgroundColor: '#EFF6FF', // Light Blue Tint
  },
  iconContainer: {
    width: 24,
    alignItems: 'center',
    marginRight: 12,
  },
  iconContainerActive: {
    // Optional: scale up slightly
  },
  menuText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#334155',
    flex: 1,
  },
  menuTextActive: {
    color: colors.primary || '#2563EB',
    fontWeight: '700',
  },
  activeIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary || '#2563EB',
  },

  /* FOOTER */
  footer: {
    paddingHorizontal: 24,
    paddingTop: 10,
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  footerText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text || '#1E293B',
  },
  versionText: {
    marginTop: 20,
    fontSize: 11,
    color: '#CBD5E1',
    textAlign: 'center',
  },
});

export default CustomDrawerContent;

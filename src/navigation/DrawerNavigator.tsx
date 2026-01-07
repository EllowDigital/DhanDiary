import React, { useMemo } from 'react';
import { useWindowDimensions, View, Platform } from 'react-native';
import { createDrawerNavigator, DrawerNavigationOptions } from '@react-navigation/drawer';
import { MaterialCommunityIcons } from '@expo/vector-icons';

// --- SCREENS ---
import BottomTabNavigator from './BottomTabNavigator';
import AddEntryScreen from '../screens/AddEntryScreen';
import CashInList from '../screens/CashInList';
import CashOutList from '../screens/CashOutList';
import StatsScreen from '../screens/StatsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import AccountManagementScreen from '../screens/AccountManagementScreen';
import AboutScreen from '../screens/AboutScreen';
import ExportScreen from '../screens/ExportScreen';
import PrivacyPolicyScreen from '../screens/PrivacyPolicyScreen';
import TermsScreen from '../screens/TermsScreen';
import EulaScreen from '../screens/EulaScreen';

// --- CUSTOM COMPONENTS ---
import CustomDrawerContent from './CustomDrawerContent';
import SyncStatusBanner from '../components/SyncStatusBanner';
import { colors } from '../utils/design';

// --- TYPES ---
export type DrawerParamList = {
  Dashboard: undefined;
  AddEntry: { local_id?: string } | undefined;
  Income: undefined;
  Expenses: undefined;
  Analytics: undefined;
  Account: undefined;
  Settings: undefined;
  About: undefined;
  Export: undefined;
  PrivacyPolicy: undefined;
  Terms: undefined;
  Eula: undefined;
};

const Drawer = createDrawerNavigator<DrawerParamList>();

const DrawerNavigator = () => {
  const { width } = useWindowDimensions();
  const [isDrawerOpen, setIsDrawerOpen] = React.useState(false);

  // --- RESPONSIVE CONFIG ---
  const isTablet = width >= 768;

  // Calculate Drawer Width:
  // Tablets: Fixed 320px for a "sidebar" feel
  // Phones: 78% of screen width, maxing out at 300px
  const drawerWidth = isTablet ? 320 : Math.min(width * 0.78, 300);

  // Memoize options to prevent re-renders
  const screenOptions: DrawerNavigationOptions = useMemo(
    () => ({
      headerShown: false,
      drawerType: isTablet ? 'front' : 'front', // 'slide' or 'permanent' can be used for tablets if preferred

      // Layout Styles
      drawerStyle: {
        backgroundColor: colors.background || '#F8FAFC',
        width: drawerWidth,
        borderTopRightRadius: isTablet ? 0 : 20, // Rounded corner on mobile only
        borderBottomRightRadius: isTablet ? 0 : 20,
      },

      // Item Styling
      drawerActiveTintColor: colors.primary || '#2563EB',
      drawerInactiveTintColor: colors.text || '#334155',
      drawerActiveBackgroundColor: colors.primarySoft || '#EFF6FF', // Very light blue

      drawerItemStyle: {
        borderRadius: 12,
        paddingHorizontal: 8,
        marginVertical: 4,
        marginHorizontal: 12,
      },

      drawerLabelStyle: {
        fontSize: 15,
        fontWeight: '600',
        marginLeft: -12, // Pull text closer to icon
      },

      // Overlay & Interaction
      overlayColor: 'rgba(15, 23, 42, 0.4)', // Slate-900 with opacity
      swipeEdgeWidth: 100,
      swipeEnabled: true,
    }),
    [drawerWidth, isTablet]
  );

  return (
    <View style={{ flex: 1 }}>
      {/* Global Sync Banner 
        Hidden when drawer is open to prevent visual clutter/overlap 
      */}
      {!isDrawerOpen && <SyncStatusBanner />}

      <Drawer.Navigator
        drawerContent={(props) => <CustomDrawerContent {...props} />}
        screenOptions={screenOptions}
        screenListeners={{
          state: (e) => {
            // Check strictly if drawer is open to toggle banner visibility
            try {
              const state = (e.data as any)?.state;
              const history = state?.history || [];
              const isOpen =
                Array.isArray(history) && history.some((it: any) => it?.type === 'drawer');
              setIsDrawerOpen(Boolean(isOpen));
            } catch (err) {
              // If we can't determine state, keep banner visible.
              setIsDrawerOpen(false);
            }
          },
        }}
        initialRouteName="Dashboard"
      >
        {/* =============================================
            SECTION 1: CORE NAVIGATION
        ============================================= */}
        <Drawer.Screen
          name="Dashboard"
          component={BottomTabNavigator}
          options={{
            title: 'Overview',
            drawerIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="view-dashboard-outline" color={color} size={24} />
            ),
          }}
        />

        <Drawer.Screen
          name="AddEntry"
          component={AddEntryScreen}
          options={{
            title: 'New Transaction',
            drawerIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="plus-circle-outline" color={color} size={24} />
            ),
          }}
        />

        {/* =============================================
            SECTION 2: FINANCE MANAGEMENT
        ============================================= */}
        <Drawer.Screen
          name="Income"
          component={CashInList}
          options={{
            title: 'Income',
            drawerIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="arrow-down-circle-outline" color={color} size={24} />
            ),
          }}
        />

        <Drawer.Screen
          name="Expenses"
          component={CashOutList}
          options={{
            title: 'Expenses',
            drawerIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="arrow-up-circle-outline" color={color} size={24} />
            ),
          }}
        />

        <Drawer.Screen
          name="Analytics"
          component={StatsScreen}
          options={{
            title: 'Analytics',
            drawerIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="chart-box-outline" color={color} size={24} />
            ),
          }}
        />

        {/* =============================================
            SECTION 3: DATA & SETTINGS
        ============================================= */}
        <Drawer.Screen
          name="Export"
          component={ExportScreen}
          options={{
            title: 'Export Data',
            drawerIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="file-download-outline" color={color} size={24} />
            ),
          }}
        />

        <Drawer.Screen
          name="Account"
          component={AccountManagementScreen}
          options={{
            title: 'My Profile',
            drawerIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="account-outline" color={color} size={24} />
            ),
          }}
        />

        <Drawer.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            title: 'Settings',
            drawerIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="cog-outline" color={color} size={24} />
            ),
          }}
        />

        <Drawer.Screen
          name="About"
          component={AboutScreen}
          options={{
            title: 'About',
            drawerIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="information-outline" color={color} size={24} />
            ),
          }}
        />

        {/* =============================================
            SECTION 4: HIDDEN SCREENS (Legal)
            These are accessible via navigation but hidden from the menu
        ============================================= */}
        <Drawer.Screen
          name="PrivacyPolicy"
          component={PrivacyPolicyScreen}
          options={{ drawerItemStyle: { display: 'none' }, title: 'Privacy Policy' }}
        />
        <Drawer.Screen
          name="Terms"
          component={TermsScreen}
          options={{ drawerItemStyle: { display: 'none' }, title: 'Terms of Use' }}
        />
        <Drawer.Screen
          name="Eula"
          component={EulaScreen}
          options={{ drawerItemStyle: { display: 'none' }, title: 'EULA' }}
        />
      </Drawer.Navigator>
    </View>
  );
};

export default DrawerNavigator;

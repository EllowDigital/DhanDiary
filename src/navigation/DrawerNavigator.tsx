import React from 'react';
import { useWindowDimensions, Platform } from 'react-native';
import { createDrawerNavigator, DrawerNavigationOptions } from '@react-navigation/drawer';
import { MaterialCommunityIcons } from '@expo/vector-icons';

// --- SCREENS ---
import BottomTabNavigator from './BottomTabNavigator';
import AddEntryScreen from '../screens/AddEntryScreen';
import CashInList from '../screens/CashInList';
import CashOutList from '../screens/CashOutList';
import HistoryScreen from '../screens/HistoryScreen';
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
import { colors } from '../utils/design';

// --- TYPES ---
export type DrawerParamList = {
  Dashboard: undefined;
  AddEntry: { local_id?: string } | undefined;
  History: undefined;
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

  // --- RESPONSIVE CONFIG ---
  // Tablet breakpoint usually around 768px
  const isLargeScreen = width >= 768;

  // On large screens, show drawer permanently on the left.
  // On phones, it slides over as a modal.
  const drawerType = isLargeScreen ? 'permanent' : 'front';

  // Cap width so it doesn't look ridiculous on landscape tablets
  const drawerWidth = Math.min(280, width * 0.75);

  const screenOptions: DrawerNavigationOptions = {
    headerShown: false, // We usually handle headers inside the screens/stacks

    // Layout
    drawerType,
    drawerStyle: {
      backgroundColor: colors.background || '#F8FAFC',
      width: drawerWidth,
      borderRightWidth: isLargeScreen ? 1 : 0,
      borderRightColor: 'rgba(0,0,0,0.06)',
    },

    // Item Styling
    drawerActiveTintColor: colors.primary || '#2563EB',
    drawerInactiveTintColor: colors.text || '#1E293B',
    drawerActiveBackgroundColor: colors.primarySoft || 'rgba(37, 99, 235, 0.1)',

    drawerLabelStyle: {
      fontSize: 14,
      fontWeight: '600',
      marginLeft: -10,
    },

    drawerItemStyle: {
      borderRadius: 12,
      paddingHorizontal: 8,
      marginVertical: 4,
    },

    // Overlay (Mobile 'front' mode only)
    overlayColor: 'rgba(0,0,0,0.5)',
    swipeEdgeWidth: width * 0.25, // Wider grab area for better UX
    swipeEnabled: !isLargeScreen, // Disable swipe on desktop/tablet permanent mode
  };

  return (
    <Drawer.Navigator
      drawerContent={(props) => <CustomDrawerContent {...props} />}
      screenOptions={screenOptions}
      initialRouteName="Dashboard"
    >
      {/* --- 1. MAIN DASHBOARD --- */}
      <Drawer.Screen
        name="Dashboard"
        component={BottomTabNavigator}
        options={{
          title: 'Home',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="home-variant-outline" color={color} size={22} />
          ),
        }}
      />

      {/* --- 2. CORE ACTIONS --- */}
      <Drawer.Screen
        name="AddEntry"
        component={AddEntryScreen}
        options={{
          title: 'New Transaction',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="plus-circle-outline" color={color} size={22} />
          ),
        }}
      />

      <Drawer.Screen
        name="History"
        component={HistoryScreen}
        options={{
          title: 'History Log',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="history" color={color} size={22} />
          ),
        }}
      />

      {/* --- 3. CATEGORIES & LISTS --- */}
      <Drawer.Screen
        name="Income"
        component={CashInList}
        options={{
          title: 'Income',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="arrow-down-bold-box-outline" color={color} size={22} />
          ),
        }}
      />

      <Drawer.Screen
        name="Expenses"
        component={CashOutList}
        options={{
          title: 'Expenses',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="arrow-up-bold-box-outline" color={color} size={22} />
          ),
        }}
      />

      {/* --- 4. DATA & ANALYTICS --- */}
      <Drawer.Screen
        name="Analytics"
        component={StatsScreen}
        options={{
          title: 'Analytics & Charts',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="chart-bar" color={color} size={22} />
          ),
        }}
      />

      <Drawer.Screen
        name="Export"
        component={ExportScreen}
        options={{
          title: 'Export Data',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="file-export-outline" color={color} size={22} />
          ),
        }}
      />

      {/* --- 5. USER & SETTINGS --- */}
      <Drawer.Screen
        name="Account"
        component={AccountManagementScreen}
        options={{
          title: 'My Profile',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-circle-outline" color={color} size={22} />
          ),
        }}
      />

      <Drawer.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: 'App Settings',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="cog-outline" color={color} size={22} />
          ),
        }}
      />

      <Drawer.Screen
        name="About"
        component={AboutScreen}
        options={{
          title: 'About App',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="information-outline" color={color} size={22} />
          ),
        }}
      />

      {/* --- HIDDEN SCREENS (Accessible via navigation, hidden from menu) --- */}
      <Drawer.Screen
        name="PrivacyPolicy"
        component={PrivacyPolicyScreen}
        options={{
          drawerItemStyle: { display: 'none' },
          title: 'Privacy Policy',
        }}
      />

      <Drawer.Screen
        name="Terms"
        component={TermsScreen}
        options={{
          drawerItemStyle: { display: 'none' },
          title: 'Terms of Use',
        }}
      />

      <Drawer.Screen
        name="Eula"
        component={EulaScreen}
        options={{
          drawerItemStyle: { display: 'none' },
          title: 'EULA',
        }}
      />
    </Drawer.Navigator>
  );
};

export default DrawerNavigator;

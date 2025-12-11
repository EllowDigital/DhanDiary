import React from 'react';
import { useWindowDimensions } from 'react-native';
import { createDrawerNavigator } from '@react-navigation/drawer';

// Navigators & Screens
import BottomTabNavigator from './BottomTabNavigator';
import AddEntryScreen from '../screens/AddEntryScreen';
import CashInList from '../screens/CashInList';
import CashOutList from '../screens/CashOutList';
import HistoryScreen from '../screens/HistoryScreen';
import StatsScreen from '../screens/StatsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import AccountManagementScreen from '../screens/AccountManagementScreen';
import AboutScreen from '../screens/AboutScreen';
import PrivacyPolicyScreen from '../screens/PrivacyPolicyScreen';
import TermsScreen from '../screens/TermsScreen';

// Components & Theme
import CustomDrawerContent from './CustomDrawerContent';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../utils/design';

const Drawer = createDrawerNavigator();

const DrawerNavigator = () => {
  const { width } = useWindowDimensions();

  // --- RESPONSIVE CONFIG ---
  const isLargeScreen = width >= 768; // Tablet breakpoint
  
  // On large screens, show drawer permanently on the left.
  // On phones, it slides over as a modal.
  const drawerType = isLargeScreen ? 'permanent' : 'front';
  
  // Cap width so it doesn't look ridiculous on landscape tablets
  const drawerWidth = Math.min(300, width * 0.75);

  return (
    <Drawer.Navigator
      drawerContent={(props) => <CustomDrawerContent {...props} />}
      screenOptions={{
        headerShown: false,

        // Drawer Layout
        drawerType,
        drawerStyle: {
          backgroundColor: colors.card, // Match theme card background
          width: drawerWidth,
          borderRightWidth: isLargeScreen ? 1 : 0, // Divider for permanent drawer
          borderRightColor: colors.border,
        },

        // Item Styling
        drawerActiveTintColor: colors.primary,
        drawerInactiveTintColor: colors.text,
        drawerActiveBackgroundColor: colors.primarySoft || '#EEF2FF',
        
        drawerLabelStyle: {
          fontSize: 14,
          fontWeight: '600',
          marginLeft: -10, // Pull label closer to icon
        },
        
        drawerItemStyle: {
          borderRadius: 12,
          paddingHorizontal: 8,
          marginVertical: 4,
        },

        // Overlay (only for mobile 'front' mode)
        overlayColor: 'rgba(0,0,0,0.5)',
        swipeEdgeWidth: width * 0.25, // Make swipe area larger for easier opening
      }}
    >
      {/* --- DASHBOARD (Tabs) --- */}
      <Drawer.Screen
        name="HomeTabs"
        component={BottomTabNavigator}
        options={{
          title: 'Dashboard',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="view-dashboard-outline" color={color} size={size} />
          ),
        }}
      />

      {/* --- CORE ACTIONS --- */}
      <Drawer.Screen
        name="AddEntry"
        component={AddEntryScreen}
        options={{
          title: 'New Transaction',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="plus-circle-outline" color={color} size={size} />
          ),
        }}
      />

      <Drawer.Screen
        name="History"
        component={HistoryScreen}
        options={{
          title: 'History Log',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="history" color={color} size={size} />
          ),
        }}
      />

      {/* --- LISTS --- */}
      <Drawer.Screen
        name="Income"
        component={CashInList}
        options={{
          title: 'Income',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="arrow-down-bold-box-outline" color={color} size={size} />
          ),
        }}
      />

      <Drawer.Screen
        name="Expense"
        component={CashOutList}
        options={{
          title: 'Expenses',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="arrow-up-bold-box-outline" color={color} size={size} />
          ),
        }}
      />

      {/* --- ANALYTICS --- */}
      <Drawer.Screen
        name="Stats"
        component={StatsScreen}
        options={{
          title: 'Analytics',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="chart-box-outline" color={color} size={size} />
          ),
        }}
      />

      {/* --- SETTINGS GROUP --- */}
      <Drawer.Screen
        name="Account"
        component={AccountManagementScreen}
        options={{
          title: 'My Profile',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-circle-outline" color={color} size={size} />
          ),
        }}
      />

      <Drawer.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: 'App Settings',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="cog-outline" color={color} size={size} />
          ),
        }}
      />

      <Drawer.Screen
        name="About"
        component={AboutScreen}
        options={{
          title: 'About',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="information-outline" color={color} size={size} />
          ),
        }}
      />

      {/* --- HIDDEN SCREENS (Navigable but not in menu) --- */}
      <Drawer.Screen
        name="PrivacyPolicy"
        component={PrivacyPolicyScreen}
        options={{
          title: 'Privacy Policy',
          drawerItemStyle: { display: 'none' }, // Hides from drawer list
        }}
      />

      <Drawer.Screen
        name="Terms"
        component={TermsScreen}
        options={{
          title: 'Terms of Use',
          drawerItemStyle: { display: 'none' },
        }}
      />
    </Drawer.Navigator>
  );
};

export default DrawerNavigator;
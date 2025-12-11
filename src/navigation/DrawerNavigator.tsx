import React from 'react';
import { Dimensions, useWindowDimensions } from 'react-native';
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
import MaterialCommunityIcon from '@expo/vector-icons/MaterialCommunityIcons';
import { colors } from '../utils/design';

const Drawer = createDrawerNavigator();

const DrawerNavigator = () => {
  const { width } = useWindowDimensions();

  // Responsive Drawer Config
  const isLargeScreen = width >= 768;
  const drawerType = isLargeScreen ? 'permanent' : 'front';
  const drawerWidth = Math.min(320, width * 0.75); // Cap width for tablets

  return (
    <Drawer.Navigator
      drawerContent={(props) => <CustomDrawerContent {...props} />}
      screenOptions={{
        headerShown: false,

        // Drawer Appearance
        drawerType,
        drawerStyle: {
          backgroundColor: colors.card,
          width: drawerWidth,
          borderTopRightRadius: isLargeScreen ? 0 : 20,
          borderBottomRightRadius: isLargeScreen ? 0 : 20,
        },

        // Item Styling
        drawerActiveTintColor: colors.primary,
        drawerInactiveTintColor: colors.text,
        drawerActiveBackgroundColor: colors.primarySoft,
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

        // Overlay
        overlayColor: 'rgba(0,0,0,0.4)',
        swipeEdgeWidth: width * 0.2, // Easier to swipe open
      }}
    >
      {/* --- CORE --- */}
      <Drawer.Screen
        name="HomeTabs"
        component={BottomTabNavigator}
        options={{
          title: 'Dashboard',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcon name="view-dashboard-outline" color={color} size={size} />
          ),
        }}
      />

      {/* --- TRANSACTIONS --- */}
      <Drawer.Screen
        name="AddEntry"
        component={AddEntryScreen}
        options={{
          title: 'New Transaction',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcon name="plus-circle-outline" color={color} size={size} />
          ),
        }}
      />

      <Drawer.Screen
        name="History"
        component={HistoryScreen}
        options={{
          title: 'History Log',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcon name="history" color={color} size={size} />
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
            <MaterialCommunityIcon name="arrow-down-bold-box-outline" color={color} size={size} />
          ),
        }}
      />

      <Drawer.Screen
        name="Expense"
        component={CashOutList}
        options={{
          title: 'Expenses',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcon name="arrow-up-bold-box-outline" color={color} size={size} />
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
            <MaterialCommunityIcon name="chart-box-outline" color={color} size={size} />
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
            <MaterialCommunityIcon name="account-circle-outline" color={color} size={size} />
          ),
        }}
      />

      <Drawer.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: 'App Settings',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcon name="cog-outline" color={color} size={size} />
          ),
        }}
      />

      <Drawer.Screen
        name="About"
        component={AboutScreen}
        options={{
          title: 'About',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcon name="information-outline" color={color} size={size} />
          ),
        }}
      />

      <Drawer.Screen
        name="PrivacyPolicy"
        component={PrivacyPolicyScreen}
        options={{
          title: 'Privacy Policy',
          drawerItemStyle: { display: 'none' },
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

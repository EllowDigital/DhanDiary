import React from 'react';
import { Dimensions } from 'react-native';
import { createDrawerNavigator } from '@react-navigation/drawer';

import BottomTabNavigator from './BottomTabNavigator';
import AddEntryScreen from '../screens/AddEntryScreen';
import CashInList from '../screens/CashInList';
import CashOutList from '../screens/CashOutList';
import HistoryScreen from '../screens/HistoryScreen';
import StatsScreen from '../screens/StatsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import AccountManagementScreen from '../screens/AccountManagementScreen';
import AboutScreen from '../screens/AboutScreen';

import MaterialIcon from 'react-native-vector-icons/MaterialIcons';
import MaterialCommunityIcon from 'react-native-vector-icons/MaterialCommunityIcons';

import CustomDrawerContent from './CustomDrawerContent';

const Drawer = createDrawerNavigator();

const DrawerNavigator = () => {
  const { width } = Dimensions.get('window');
  const drawerWidth = Math.min(360, Math.round(width * 0.78));

  return (
    <Drawer.Navigator
      drawerContent={(props) => <CustomDrawerContent {...props} />}
      screenOptions={{
        headerStyle: { backgroundColor: '#1E293B' },
        headerTintColor: '#fff',
        drawerActiveTintColor: '#1E293B',
        drawerInactiveTintColor: '#64748B',
        drawerLabelStyle: { fontSize: 16, fontWeight: '600', marginLeft: -20 },
        drawerStyle: {
          backgroundColor: '#F1F5F9',
          width: drawerWidth,
          borderTopRightRadius: 20,
          borderBottomRightRadius: 20,
        },
      }}
    >
      {/* Dashboard Tabs */}
      <Drawer.Screen
        name="HomeTabs"
        component={BottomTabNavigator}
        options={{
          title: 'Dashboard',
          drawerIcon: ({ color }) => (
            <MaterialCommunityIcon name="view-dashboard-outline" color={color} size={26} />
          ),
        }}
      />

      {/* Add New Transaction */}
      <Drawer.Screen
        name="AddEntry"
        component={AddEntryScreen}
        options={{
          title: 'Add Transaction',
          drawerIcon: ({ color }) => (
            <MaterialCommunityIcon name="plus-circle-outline" color={color} size={24} />
          ),
        }}
      />

      {/* Income List */}
      <Drawer.Screen
        name="Income"
        component={CashInList}
        options={{
          title: 'Cash (IN)',
          drawerIcon: ({ color }) => (
            <MaterialCommunityIcon name="cash-plus" color={color} size={24} />
          ),
        }}
      />

      {/* Expense List */}
      <Drawer.Screen
        name="Expense"
        component={CashOutList}
        options={{
          title: 'Cash (OUT)',
          drawerIcon: ({ color }) => (
            <MaterialCommunityIcon name="cash-minus" color={color} size={24} />
          ),
        }}
      />

      {/* History */}
      <Drawer.Screen
        name="History"
        component={HistoryScreen}
        options={{
          title: 'History',
          drawerIcon: ({ color }) => (
            <MaterialCommunityIcon name="history" color={color} size={24} />
          ),
        }}
      />

      {/* Statistics */}
      <Drawer.Screen
        name="Stats"
        component={StatsScreen}
        options={{
          title: 'Stats & Analytics',
          drawerIcon: ({ color }) => (
            <MaterialCommunityIcon name="chart-bar" color={color} size={24} />
          ),
        }}
      />

      {/* Account / User Settings */}
      <Drawer.Screen
        name="Account"
        component={AccountManagementScreen}
        options={{
          title: 'Manage Account',
          drawerIcon: ({ color }) => (
            <MaterialCommunityIcon name="account-cog-outline" color={color} size={24} />
          ),
        }}
      />

      {/* App Settings */}
      <Drawer.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: 'Settings',
          drawerIcon: ({ color }) => (
            <MaterialCommunityIcon name="cog-outline" color={color} size={24} />
          ),
        }}
      />

      {/* About Screen */}
      <Drawer.Screen
        name="About"
        component={AboutScreen}
        options={{
          title: 'About App',
          drawerIcon: ({ color }) => (
            <MaterialCommunityIcon name="information-outline" color={color} size={24} />
          ),
        }}
      />
    </Drawer.Navigator>
  );
};

export default DrawerNavigator;

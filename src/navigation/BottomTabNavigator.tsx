import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Platform, Dimensions } from 'react-native';

import HomeScreen from '../screens/HomeScreenFixed';
import HistoryScreen from '../screens/HistoryScreen';
import MoreScreen from '../screens/MoreScreen';

import AnimatedTabIcon from '../components/AnimatedTabIcon';
import TabBarButton from '../components/TabBarButton';

const Tab = createBottomTabNavigator();
const { width } = Dimensions.get('window');

const BottomTabNavigator = () => {
  return (
    <View style={{ flex: 1 }}>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,

          // Colors
          tabBarActiveTintColor: '#1E293B',
          tabBarInactiveTintColor: '#64748B',

          // Floating tab bar
          tabBarStyle: {
            position: 'absolute',
            bottom: Platform.OS === 'ios' ? 22 : 16,
            left: 10,
            right: 10,
            height: 68,
            borderRadius: 20,

            backgroundColor: '#FFFFFF',
            paddingBottom: 10,
            paddingTop: 6,

            // Soft shadow
            shadowColor: '#000',
            shadowOpacity: 0.08,
            shadowOffset: { width: 0, height: 6 },
            shadowRadius: 12,
            elevation: 8,

            borderTopWidth: 0,
          },

          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: '600',
            marginTop: -4,
          },

          tabBarItemStyle: {
            paddingVertical: 4,
          },
        }}
      >
        {/* DASHBOARD */}
        <Tab.Screen
          name="Dashboard"
          component={HomeScreen}
          options={{
            tabBarLabel: 'Dashboard',
            tabBarIcon: ({ color, size, focused }) => (
              <AnimatedTabIcon
                library="mc"
                name="view-dashboard"
                color={color}
                size={size}
                focused={focused}
              />
            ),
            tabBarButton: (props) => <TabBarButton {...props} />,
          }}
        />

        {/* HISTORY */}
        <Tab.Screen
          name="History"
          component={HistoryScreen}
          options={{
            tabBarLabel: 'History',
            tabBarIcon: ({ color, size, focused }) => (
              <AnimatedTabIcon
                library="material"
                name="history"
                color={color}
                size={size}
                focused={focused}
              />
            ),
            tabBarButton: (props) => <TabBarButton {...props} />,
          }}
        />

        {/* MORE */}
        <Tab.Screen
          name="More"
          component={MoreScreen}
          options={{
            tabBarLabel: 'More',
            tabBarIcon: ({ color, size, focused }) => (
              <AnimatedTabIcon
                library="mc"
                name="dots-horizontal"
                color={color}
                size={size}
                focused={focused}
              />
            ),
            tabBarButton: (props) => <TabBarButton {...props} />,
          }}
        />
      </Tab.Navigator>
    </View>
  );
};

export default BottomTabNavigator;

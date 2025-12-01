import React, { useMemo } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import HomeScreen from '../screens/HomeScreenFixed';
import HistoryScreen from '../screens/HistoryScreen';
import MoreScreen from '../screens/MoreScreen';

import AnimatedTabIcon from '../components/AnimatedTabIcon';
import TabBarButton from '../components/TabBarButton';

const Tab = createBottomTabNavigator();
const BottomTabNavigator = () => {
  const insets = useSafeAreaInsets();

  const tabBarStyle = useMemo(() => {
    const insetBottom = Math.max(insets.bottom, Platform.OS === 'android' ? 18 : 24);
    return {
      position: 'absolute',
      bottom: insetBottom,
      left: 16,
      right: 16,
      height: 70 + Math.min(insets.bottom, 16),
      borderRadius: 26,
      backgroundColor: '#FFFFFF',
      paddingBottom: Math.max(insets.bottom / 2, 12),
      paddingTop: 10,
      shadowColor: '#0F172A',
      shadowOpacity: 0.08,
      shadowOffset: { width: 0, height: 8 },
      shadowRadius: 20,
      elevation: 12,
      borderTopWidth: 0,
    } as const;
  }, [insets.bottom]);

  const screenOptions = useMemo(
    () => ({
      headerShown: false,
      tabBarActiveTintColor: '#0F172A',
      tabBarInactiveTintColor: '#94A3B8',
      tabBarHideOnKeyboard: true,
      tabBarStyle,
      tabBarLabelStyle: {
        fontSize: 12,
        fontWeight: '600',
        marginTop: -4,
      },
      tabBarItemStyle: {
        paddingVertical: 0,
        marginHorizontal: 6,
        borderRadius: 18,
      },
    }),
    [tabBarStyle]
  );

  return (
    <View style={{ flex: 1 }}>
      <Tab.Navigator screenOptions={screenOptions}>
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

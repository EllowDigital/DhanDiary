import React, { useMemo } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Platform, TextStyle, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import HomeScreen from '../screens/HomeScreenFixed';
import HistoryScreen from '../screens/HistoryScreen';
import MoreScreen from '../screens/MoreScreen';

import AnimatedTabIcon from '../components/AnimatedTabIcon';
import TabBarButton from '../components/TabBarButton';
import { colors } from '../utils/design';

const Tab = createBottomTabNavigator();

const labelStyle: TextStyle = {
  fontSize: 11,
  fontWeight: '600' as TextStyle['fontWeight'],
  marginTop: 4,
};

const itemStyle: ViewStyle = {
  paddingVertical: 0,
  marginHorizontal: 4,
  borderRadius: 22,
};

const BottomTabNavigator = () => {
  const insets = useSafeAreaInsets();

  const tabBarStyle = useMemo(() => {
    const safeBottom = insets.bottom;
    const floatingOffset = Platform.OS === 'android' ? 12 : 18;
    const bottomPosition = Math.max(safeBottom * 0.35 + 8, floatingOffset);
    const extraPadding = Math.max(safeBottom * 0.5, 8);
    const baseHeight = 54;
    return {
      position: 'absolute',
      bottom: bottomPosition,
      left: 20,
      right: 20,
      height: baseHeight + extraPadding,
      borderRadius: 28,
      backgroundColor: colors.card,
      paddingBottom: extraPadding,
      paddingTop: 10,
      paddingHorizontal: 6,
      shadowColor: colors.shadow,
      shadowOpacity: 0.15,
      shadowOffset: { width: 0, height: 10 },
      shadowRadius: 24,
      elevation: 10,
      borderWidth: 1,
      borderColor: colors.border,
    } as const;
  }, [insets.bottom]);

  const screenOptions = useMemo(
    () => ({
      headerShown: false,
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.muted,
      tabBarHideOnKeyboard: true,
      tabBarStyle,
      tabBarLabelStyle: labelStyle,
      tabBarItemStyle: itemStyle,
      sceneContainerStyle: { backgroundColor: colors.background },
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

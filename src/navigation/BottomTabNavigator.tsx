import React, { useMemo } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Screens
import HomeScreen from '../screens/HomeScreen';
import HistoryScreen from '../screens/HistoryScreen';
import MoreScreen from '../screens/MoreScreen';

// Components
import AnimatedTabIcon from '../components/AnimatedTabIcon';
import TabBarButton from '../components/TabBarButton';
import { colors, shadows } from '../utils/design';

const Tab = createBottomTabNavigator();

const BottomTabNavigator = () => {
  const insets = useSafeAreaInsets();

  const screenOptions = useMemo(() => {
    // --- POSITIONING LOGIC ---
    // iOS: Sit exactly on top of the Home Indicator (insets.bottom).
    // Android: Sit 16px from bottom (standard margin) as insets.bottom is usually 0 or included in navigation bar.
    // This removes the "floating gap" look while respecting gestures.
    const isIOS = Platform.OS === 'ios';
    const bottomPosition = isIOS ? insets.bottom : 16; 
    const tabHeight = 60; // Slightly more compact

    return {
      headerShown: false,
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.muted,
      tabBarHideOnKeyboard: true,
      
      // Floating Pill Style
      tabBarStyle: {
        position: 'absolute',
        bottom: bottomPosition, 
        left: 20,
        right: 20,
        height: tabHeight,
        borderRadius: 30,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        paddingBottom: 0,
        paddingTop: 0,
        
        // Shadow that blends better with the bottom
        shadowColor: colors.shadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 8,
      },
      
      // Tab Items
      tabBarItemStyle: {
        height: tabHeight,
        paddingVertical: 8,
        borderRadius: 30,
      },
      
      // Text Labels
      tabBarLabelStyle: {
        fontSize: 10,
        fontWeight: '700',
        paddingBottom: 4,
      },
      
      // Background
      sceneContainerStyle: { 
        backgroundColor: colors.background 
      },
    } as const;
  }, [insets.bottom]);

  return (
    <View style={styles.container}>
      <Tab.Navigator screenOptions={screenOptions as any}>
        
        {/* DASHBOARD */}
        <Tab.Screen
          name="Dashboard"
          component={HomeScreen}
          options={{
            tabBarLabel: 'Home',
            tabBarIcon: ({ color, size, focused }) => (
              <AnimatedTabIcon
                library="mc"
                name={focused ? "view-dashboard" : "view-dashboard-outline"}
                color={color}
                size={22}
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
                size={24}
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
            tabBarLabel: 'Menu',
            tabBarIcon: ({ color, size, focused }) => (
              <AnimatedTabIcon
                library="mc"
                name={focused ? "dots-horizontal-circle" : "dots-horizontal"}
                color={color}
                size={22}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    position: 'relative', 
  },
});
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
import { colors } from '../utils/design';

const Tab = createBottomTabNavigator();

const BottomTabNavigator = () => {
  const insets = useSafeAreaInsets();

  const screenOptions = useMemo(() => {
    const isIOS = Platform.OS === 'ios';
    const baseHorizontal = 16;
    const tabHeight = 56;
    const iosBottomInset = Math.max(insets.bottom, 10);
    const androidGestureInset = Math.max(insets.bottom, 24);

    const floatingOffsets = {
      left: baseHorizontal + insets.left,
      right: baseHorizontal + insets.right,
    } as const;

    const iosBottomPosition = iosBottomInset + 8;
    const iosExtraBottomPadding = Math.max(iosBottomInset * 0.6, 8);
    const iosTabBarHeight = tabHeight + iosExtraBottomPadding + 8;

    const androidTabBarHeight = tabHeight + androidGestureInset + 16;

    const tabBarStyle = isIOS
      ? {
          position: 'absolute',
          bottom: iosBottomPosition,
          left: floatingOffsets.left,
          right: floatingOffsets.right,
          height: iosTabBarHeight,
          borderRadius: 30,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          paddingBottom: iosExtraBottomPadding,
          paddingTop: 10,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.1,
          shadowRadius: 12,
          elevation: 8,
        }
      : {
          // Android gets an anchored rail so it clears system gestures
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: androidTabBarHeight,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
          backgroundColor: colors.card,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          paddingBottom: androidGestureInset,
          paddingTop: 12,
          paddingHorizontal: baseHorizontal,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.08,
          shadowRadius: 10,
          elevation: 18,
        };

    const scenePaddingBottom = isIOS
      ? iosTabBarHeight + iosBottomPosition
      : androidTabBarHeight + 8;

    return {
      headerShown: false,
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.muted,
      tabBarHideOnKeyboard: true,
      tabBarStyle,

      tabBarSafeAreaInsets: {
        bottom: isIOS ? 0 : androidGestureInset,
      },

      tabBarItemStyle: {
        height: tabHeight,
        paddingVertical: 6,
        borderRadius: 30,
      },

      tabBarLabelStyle: {
        fontSize: 10,
        fontWeight: '700',
        paddingBottom: 0,
      },

      sceneContainerStyle: {
        backgroundColor: colors.background,
        paddingBottom: scenePaddingBottom,
      },
    } as const;
  }, [insets.bottom, insets.left, insets.right]);

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
                name={focused ? 'view-dashboard' : 'view-dashboard-outline'}
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
                name={focused ? 'dots-horizontal-circle' : 'dots-horizontal'}
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

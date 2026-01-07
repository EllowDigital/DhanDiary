import React, { useEffect } from 'react';
import { View, StyleSheet, Pressable, Text, useWindowDimensions } from 'react-native';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  withSpring,
  withTiming,
  useSharedValue,
  interpolate,
  useDerivedValue,
} from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';

// --- Placeholder Screens (Ensure these match your actual file structure) ---
import HomeScreen from '../screens/HomeScreen';
import HistoryScreen from '../screens/HistoryScreen';
import MoreScreen from '../screens/MoreScreen';

// --- Design System ---
const colors = {
  primary: '#2563EB', // Brand Blue (Matches Drawer)
  background: '#F8FAFC',
  card: '#FFFFFF',
  text: '#1E293B',
  muted: '#94A3B8',
  activePill: '#EFF6FF', // Light Blue Tint
  shadow: '#000000',
  border: '#E2E8F0',
};

const TAB_HEIGHT = 64; // Compact height
const ICON_SIZE = 24;
const SPRING_CONFIG = { damping: 15, stiffness: 100 };

const Tab = createBottomTabNavigator();

// --- Components ---

/**
 * Individual Tab Button Component
 */
const TabButton = ({
  isFocused,
  label,
  iconName,
  onPress,
}: {
  isFocused: boolean;
  label: string;
  iconName: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress: () => void;
}) => {
  const scale = useSharedValue(1);

  // Derived value for focus animation (0 to 1)
  const focusValue = useDerivedValue(() => {
    return withTiming(isFocused ? 1 : 0, { duration: 200 });
  }, [isFocused]);

  const handlePressIn = () => {
    scale.value = withSpring(0.95);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1);
    onPress();
  };

  // Icon Animation: Bounce + Color Transition logic (handled via props mostly)
  const animatedIconStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { scale: scale.value },
        // Slight vertical nudge when active
        { translateY: interpolate(focusValue.value, [0, 1], [0, -2]) },
      ],
    };
  });

  // Label Animation: Fade In + Slide Up
  const animatedLabelStyle = useAnimatedStyle(() => {
    return {
      opacity: focusValue.value,
      transform: [
        { translateY: interpolate(focusValue.value, [0, 1], [4, 0]) },
        { scale: interpolate(focusValue.value, [0, 1], [0.9, 1]) },
      ],
    };
  });

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.tabItem}
      accessibilityRole="button"
      accessibilityState={isFocused ? { selected: true } : {}}
    >
      <Animated.View style={[styles.iconContainer, animatedIconStyle]}>
        <MaterialCommunityIcons
          name={iconName}
          size={ICON_SIZE}
          color={isFocused ? colors.primary : colors.muted}
        />
      </Animated.View>

      <Animated.View style={animatedLabelStyle}>
        <Text style={[styles.label, { color: isFocused ? colors.primary : colors.muted }]}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
};

/**
 * Custom Tab Bar Background & Logic
 */
const CustomTabBar = ({ state, descriptors, navigation }: BottomTabBarProps) => {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();

  const tabWidth = screenWidth / state.routes.length;
  const translateX = useSharedValue(0);

  // Sync indicator position
  useEffect(() => {
    translateX.value = withSpring(state.index * tabWidth, SPRING_CONFIG);
  }, [state.index, tabWidth]);

  const animatedIndicatorStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: translateX.value }],
      width: tabWidth,
    };
  });

  return (
    <View style={styles.tabBarWrapper}>
      <View
        style={[
          styles.tabBarContainer,
          {
            paddingBottom: insets.bottom,
            height: TAB_HEIGHT + insets.bottom,
          },
        ]}
      >
        {/* Animated Background Pill */}
        <Animated.View style={[styles.activeBackgroundContainer, animatedIndicatorStyle]}>
          <View style={styles.activePill} />
        </Animated.View>

        {/* Tab Buttons Row */}
        <View style={styles.tabBarContent}>
          {state.routes.map((route, index) => {
            const { options } = descriptors[route.key];
            const isFocused = state.index === index;

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });

              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            };

            // Icon Logic (Filled vs Outline)
            let iconName: keyof typeof MaterialCommunityIcons.glyphMap = 'circle';
            if (route.name === 'Home') {
              iconName = isFocused ? 'home' : 'home-outline';
            } else if (route.name === 'History') {
              iconName = isFocused ? 'clock' : 'clock-outline';
            } else if (route.name === 'More') {
              iconName = 'dots-horizontal'; // Menu icon
            }

            return (
              <TabButton
                key={route.key}
                isFocused={isFocused}
                label={options.tabBarLabel?.toString() || route.name}
                iconName={iconName}
                onPress={onPress}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
};

// --- Main Navigator ---

const BottomTabNavigator = () => {
  return (
    <View style={styles.mainContainer}>
      <Tab.Navigator
        tabBar={(props) => <CustomTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          tabBarHideOnKeyboard: true, // Hide on keyboard open
        }}
      >
        <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarLabel: 'Home' }} />
        <Tab.Screen
          name="History"
          component={HistoryScreen}
          options={{ tabBarLabel: 'Activity' }}
        />
        <Tab.Screen name="More" component={MoreScreen} options={{ tabBarLabel: 'Menu' }} />
      </Tab.Navigator>
    </View>
  );
};

export default BottomTabNavigator;

// --- Styles ---

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  tabBarWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    elevation: 0, // Remove default Android shadow to use custom one
    zIndex: 100,
  },
  tabBarContainer: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,

    // Smooth Shadow
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 10,

    borderTopWidth: 1,
    borderTopColor: colors.border,
    justifyContent: 'flex-start',
  },
  tabBarContent: {
    flexDirection: 'row',
    height: TAB_HEIGHT,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    zIndex: 2,
  },
  iconContainer: {
    marginBottom: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  // Animated Pill Container
  activeBackgroundContainer: {
    position: 'absolute',
    top: 0,
    height: TAB_HEIGHT,
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activePill: {
    width: 50,
    height: 50,
    backgroundColor: colors.activePill,
    borderRadius: 25,
    marginBottom: 10, // Center it visually relative to icon
  },
});

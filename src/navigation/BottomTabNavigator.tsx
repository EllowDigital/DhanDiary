import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  LayoutChangeEvent,
  Pressable,
  Text,
  Platform,
  Dimensions,
} from 'react-native';
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

// --- Placeholder Screens (Replace with your actual imports) ---
import HomeScreen from '../screens/HomeScreen';
import HistoryScreen from '../screens/HistoryScreen';
import MoreScreen from '../screens/MoreScreen';

// --- Design System ---
const colors = {
  primary: '#000000', // Active Icon Color
  background: '#F8FAFC', // Screen Background
  card: '#FFFFFF', // Tab Bar Background
  text: '#1E293B',
  muted: '#94A3B8', // Inactive Icon Color
  activePill: '#F1F5F9', // Soft background for active tab
  shadow: '#000000',
};

const TAB_HEIGHT = 70; // Slightly taller for modern look
const ICON_SIZE = 24;
const SPRING_CONFIG = { damping: 15, stiffness: 120 };

// --- Types ---
type TabRouteName = 'Home' | 'History' | 'More';

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

  // Derived animation values based on focus state
  const focusValue = useDerivedValue(() => {
    return withTiming(isFocused ? 1 : 0, { duration: 250 });
  }, [isFocused]);

  const handlePressIn = () => {
    scale.value = withSpring(0.9, { duration: 100 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { duration: 100 });
    onPress();
  };

  // Styles
  const animatedIconStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { scale: scale.value },
        // Subtle bounce up when focused
        { translateY: interpolate(focusValue.value, [0, 1], [0, -2]) },
      ],
      // Color interpolation logic is usually handled better via React state for Icons,
      // but opacity works well for transitions
      opacity: interpolate(focusValue.value, [0, 1], [0.6, 1]),
    };
  });

  const animatedLabelStyle = useAnimatedStyle(() => {
    return {
      opacity: focusValue.value,
      transform: [
        { translateY: interpolate(focusValue.value, [0, 1], [4, 0]) },
        { scale: interpolate(focusValue.value, [0, 1], [0.8, 1]) }
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
        <Text style={styles.label}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
};

/**
 * Custom Tab Bar Background & Logic
 */
const CustomTabBar = ({ state, descriptors, navigation }: BottomTabBarProps) => {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = Dimensions.get('window');
  
  // Calculate tab width based on screen width directly to avoid layout jumping
  const tabWidth = screenWidth / state.routes.length;
  
  const translateX = useSharedValue(0);

  // Update position when index changes
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
        {/* Animated Pill Indicator */}
        <Animated.View style={[styles.activeBackgroundContainer, animatedIndicatorStyle]}>
          <View style={styles.activePill} />
        </Animated.View>

        {/* Tab Buttons */}
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

            // Icon Logic
            let iconName: keyof typeof MaterialCommunityIcons.glyphMap = 'circle';
            if (route.name === 'Home') {
              iconName = isFocused ? 'home-variant' : 'home-variant-outline';
            } else if (route.name === 'History') {
              iconName = isFocused ? 'clock' : 'clock-outline';
            } else if (route.name === 'More') {
              iconName = isFocused ? 'dots-grid' : 'dots-grid'; // Modern "Menu" icon
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
          // Optimization: Don't unmount inactive screens to keep state
          tabBarHideOnKeyboard: true, 
        }}
      >
        <Tab.Screen 
          name="Home" 
          component={HomeScreen} 
          options={{ tabBarLabel: 'Home' }} 
        />
        <Tab.Screen 
          name="History" 
          component={HistoryScreen} 
          options={{ tabBarLabel: 'Activity' }} 
        />
        <Tab.Screen 
          name="More" 
          component={MoreScreen} 
          options={{ tabBarLabel: 'Menu' }} 
        />
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
  // Wrapper allows for absolute positioning/shadows without clipping
  tabBarWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  tabBarContainer: {
    backgroundColor: colors.card,
    
    // --- Modern Rounded Top ---
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,

    // --- High Quality Shadow ---
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 10,

    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.03)', // Subtle border for definition
    
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
    zIndex: 2, // Ensure clicks go above background
  },
  iconContainer: {
    marginBottom: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    marginTop: 2,
  },
  // The animated container that slides left/right
  activeBackgroundContainer: {
    position: 'absolute',
    top: 0,
    height: TAB_HEIGHT,
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The actual visual "Pill"
  activePill: {
    width: 64, // Fixed width for the pill looks cleaner than percentage
    height: 44,
    backgroundColor: colors.activePill,
    borderRadius: 16,
    marginBottom: 10, // Push slightly up from bottom
  },
});
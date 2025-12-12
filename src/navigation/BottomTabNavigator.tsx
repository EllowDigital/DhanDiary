import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  LayoutChangeEvent,
  Platform,
  Pressable,
  Text,
  Dimensions,
} from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  withSpring,
  withTiming,
  useSharedValue,
} from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';

// --- Placeholder Screens ---
import HomeScreen from '../screens/HomeScreen';
import HistoryScreen from '../screens/HistoryScreen';
import MoreScreen from '../screens/MoreScreen';

// --- Design Tokens ---
const colors = {
  primary: '#000000',
  background: '#f7f8fa',
  card: '#ffffff',
  text: '#1A1A1A',
  muted: '#9CA3AF',
  border: '#E5E7EB',
  shadow: '#000',
  activeBackground: '#EEF2FF',
};

const TAB_HEIGHT = 60; // Height of the icon area
const ICON_SIZE = 24;

const Tab = createBottomTabNavigator();

// --- Components ---

const TabButton = ({
  isFocused,
  label,
  iconName,
  onPress,
  onLayout,
}: {
  isFocused: boolean;
  label: string;
  iconName: any;
  onPress: () => void;
  onLayout: (e: LayoutChangeEvent) => void;
}) => {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(isFocused ? 1 : 0.6);

  useEffect(() => {
    opacity.value = withTiming(isFocused ? 1 : 0.6, { duration: 200 });
  }, [isFocused]);

  const handlePressIn = () => {
    scale.value = withSpring(0.9, { duration: 100 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { duration: 100 });
    onPress();
  };

  const animatedIconStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
      opacity: opacity.value,
    };
  });

  const animatedLabelStyle = useAnimatedStyle(() => {
    return {
      opacity: withTiming(isFocused ? 1 : 0, { duration: 200 }),
      transform: [{ translateY: withTiming(isFocused ? 0 : 5, { duration: 200 }) }],
      height: isFocused ? 'auto' : 0,
    };
  });

  return (
    <Pressable
      onLayout={onLayout}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.tabItem}
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

const CustomTabBar = ({ state, descriptors, navigation }: any) => {
  const insets = useSafeAreaInsets();
  const [layout, setLayout] = useState({ width: 0, height: 0 });

  const tabWidth = layout.width / state.routes.length;
  const translateX = useSharedValue(0);

  useEffect(() => {
    if (tabWidth > 0) {
      translateX.value = withSpring(state.index * tabWidth, {
        damping: 15,
        stiffness: 120,
      });
    }
  }, [state.index, tabWidth]);

  const animatedIndicatorStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: translateX.value }],
      width: tabWidth - 20, // Padding inside the active area
    };
  });

  const onTabbarLayout = (e: LayoutChangeEvent) => {
    setLayout({
      width: e.nativeEvent.layout.width,
      height: e.nativeEvent.layout.height,
    });
  };

  return (
    <View
      style={[
        styles.tabBarContainer,
        {
          // We add the bottom inset here so the white background extends to the bottom edge
          paddingBottom: insets.bottom,
          // Calculate height to include safe area
          height: TAB_HEIGHT + insets.bottom,
        },
      ]}
    >
      {/* This internal View holds the actual tab items and animation.
        It sits at the top of the container.
      */}
      <View style={styles.tabBarContent} onLayout={onTabbarLayout}>
        {tabWidth > 0 && (
          <Animated.View
            style={[
              styles.activeBackground,
              animatedIndicatorStyle,
              { left: 10 }, // Center alignment correction
            ]}
          />
        )}

        {state.routes.map((route: any, index: number) => {
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

          let iconName = 'circle';
          if (route.name === 'Dashboard')
            iconName = isFocused ? 'view-dashboard' : 'view-dashboard-outline';
          if (route.name === 'History') iconName = 'history';
          if (route.name === 'More')
            iconName = isFocused ? 'dots-horizontal-circle' : 'dots-horizontal';

          return (
            <TabButton
              key={route.key}
              isFocused={isFocused}
              label={options.tabBarLabel || route.name}
              iconName={iconName}
              onPress={onPress}
              onLayout={(e) => {}}
            />
          );
        })}
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
        }}
      >
        <Tab.Screen name="Dashboard" component={HomeScreen} options={{ tabBarLabel: 'Home' }} />
        <Tab.Screen name="History" component={HistoryScreen} options={{ tabBarLabel: 'History' }} />
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
  tabBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.card,

    // --- CURVED TOP CORNERS ---
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,

    // Shadow
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 10, // Android Shadow

    // Border for definition
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',

    justifyContent: 'flex-start', // Align content to top
  },
  tabBarContent: {
    flexDirection: 'row',
    width: '100%',
    height: TAB_HEIGHT, // Height of the interactive area
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tabItem: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  activeBackground: {
    position: 'absolute',
    height: TAB_HEIGHT - 16, // Smaller than full height
    backgroundColor: colors.activeBackground,
    borderRadius: 20, // Fully rounded pill
    zIndex: 1,
  },
});

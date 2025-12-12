import React, { useEffect } from 'react';
import { Pressable, StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
  withTiming,
  interpolate,
} from 'react-native-reanimated';

// --- Types ---
type Props = {
  children: React.ReactNode;
  onPress?: (e?: any) => void;
  accessibilityState?: { selected?: boolean };
  style?: ViewStyle;
};

// --- Configuration ---
const SPRING_CONFIG = {
  damping: 12,
  stiffness: 150,
};

const TabBarButton = ({ children, onPress, accessibilityState, style }: Props) => {
  const focused = !!accessibilityState?.selected;

  // 1. Shared Values for Animation
  const focusProgress = useSharedValue(focused ? 1 : 0);
  const scale = useSharedValue(1);

  // 2. Sync Focus State
  useEffect(() => {
    focusProgress.value = withSpring(focused ? 1 : 0, SPRING_CONFIG);
  }, [focused]);

  // 3. Press Handlers (Tactile Feedback)
  const handlePressIn = () => {
    scale.value = withSpring(0.9, { damping: 10, stiffness: 200 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, SPRING_CONFIG);
    onPress?.();
  };

  // 4. Animated Styles

  // Background "Pill" Animation
  const animatedBackgroundStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(focusProgress.value, [0, 1], [0, 1]),
      transform: [{ scale: interpolate(focusProgress.value, [0, 1], [0.5, 1]) }],
    };
  });

  // Container Scale Animation (for Press effect)
  const animatedContainerStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  // Icon Lift Animation (Optional: moves icon up slightly when focused)
  const animatedContentStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: interpolate(focusProgress.value, [0, 1], [0, -2]) }],
    };
  });

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[styles.container, style]}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
    >
      <Animated.View style={[styles.wrapper, animatedContainerStyle]}>
        {/* Active Background Indicator */}
        <Animated.View style={[styles.activeBackground, animatedBackgroundStyle]} />

        {/* Icon / Label Content */}
        <Animated.View style={[styles.content, animatedContentStyle]}>{children}</Animated.View>
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 50, // Fixed touch target size
    height: 50,
  },
  content: {
    zIndex: 2, // Ensure icon sits above background
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(99, 102, 241, 0.15)', // Light Indigo tint
    borderRadius: 16,
    zIndex: 1,
  },
});

export default TabBarButton;

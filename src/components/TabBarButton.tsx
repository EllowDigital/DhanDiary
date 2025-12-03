import React, { useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Animated } from 'react-native';

type Props = {
  children: React.ReactNode;
  // react-navigation may pass an event argument to onPress; accept optional param
  onPress?: (e?: any) => void;
  accessibilityState?: { selected?: boolean };
};

const TabBarButton = ({ children, onPress, accessibilityState }: Props) => {
  const focused = !!accessibilityState?.selected;
  const focusAnim = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(focusAnim, {
      toValue: focused ? 1 : 0,
      useNativeDriver: true,
      tension: 140,
      friction: 14,
    }).start();
  }, [focused, focusAnim]);

  const highlightStyle = useMemo(
    () => ({
      opacity: focusAnim,
      transform: [
        {
          scale: focusAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0.85, 1],
          }),
        },
        {
          translateY: focusAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [10, 0],
          }),
        },
      ],
    }),
    [focusAnim]
  );

  const contentTranslate = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -2],
  });

  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: 'rgba(37,99,235,0.15)', borderless: true }}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
    >
      <Animated.View pointerEvents="none" style={[styles.cardBehind, highlightStyle]} />
      <Animated.View style={[styles.content, { transform: [{ translateY: contentTranslate }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
  },
  content: {
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBehind: {
    position: 'absolute',
    width: 64,
    height: 40,
    borderRadius: 18,
    backgroundColor: 'rgba(37,99,235,0.12)',
    zIndex: 1,
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 5,
  },
});

export default TabBarButton;

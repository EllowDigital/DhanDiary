import React, { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import MaterialCommunityIcon from '@expo/vector-icons/MaterialCommunityIcons';

type Props = {
  name: string;
  library?: 'material' | 'mc';
  color: string;
  size: number;
  focused?: boolean;
};

const AnimatedIcon = Animated.createAnimatedComponent(Animated.View);

const AnimatedTabIcon = ({ name, library = 'material', color, size, focused = false }: Props) => {
  const anim = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: focused ? 1 : 0,
      useNativeDriver: true,
      tension: 180,
      friction: 16,
    }).start();
  }, [focused, anim]);

  const IconComponent = library === 'mc' ? MaterialCommunityIcon : MaterialIcon;

  const animatedStyle = {
    transform: [
      {
        scale: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.96, 1.12],
        }),
      },
      {
        translateY: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [2, -4],
        }),
      },
    ],
  } as const;

  return (
    <AnimatedIcon style={animatedStyle}>
      <IconComponent name={name as any} color={color} size={size} />
    </AnimatedIcon>
  );
};

export default AnimatedTabIcon;

import React, { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import MaterialIcon from 'react-native-vector-icons/MaterialIcons';
import MaterialCommunityIcon from 'react-native-vector-icons/MaterialCommunityIcons';

type Props = {
  name: string;
  library?: 'material' | 'mc';
  color: string;
  size: number;
  focused?: boolean;
};

const AnimatedIcon = Animated.createAnimatedComponent(Animated.View);

const AnimatedTabIcon = ({ name, library = 'material', color, size, focused = false }: Props) => {
  const scale = useRef(new Animated.Value(focused ? 1.08 : 1)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: focused ? 1.08 : 1,
      useNativeDriver: true,
      friction: 8,
      tension: 80,
    }).start();
  }, [focused, scale]);

  const IconComponent = library === 'mc' ? MaterialCommunityIcon : MaterialIcon;

  return (
    <AnimatedIcon style={{ transform: [{ scale }] }}>
      <IconComponent name={name as any} color={color} size={size} />
    </AnimatedIcon>
  );
};

export default AnimatedTabIcon;

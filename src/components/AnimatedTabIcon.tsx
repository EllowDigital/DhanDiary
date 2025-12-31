import React, { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import MaterialCommunityIcon from '@expo/vector-icons/MaterialCommunityIcons';

// --- Types ---
type IconLibrary = 'material' | 'material-community';

export type AnimatedTabIconProps = {
  /** The name of the icon glyph */
  name: string;
  /** Which icon library to use. Defaults to 'material' */
  library?: IconLibrary;
  /** Color of the icon */
  color: string;
  /** Size of the icon in pixels */
  size: number;
  /** Whether this tab is currently active */
  focused?: boolean;
};

// Create animated wrappers for the icons directly to reduce view nesting
const AnimatedMaterialIcon = Animated.createAnimatedComponent(MaterialIcon);
const AnimatedMCIcon = Animated.createAnimatedComponent(MaterialCommunityIcon);

const AnimatedTabIcon: React.FC<AnimatedTabIconProps> = ({
  name,
  library = 'material',
  color,
  size,
  focused = false,
}) => {
  // Animation value: 0 = unfocused, 1 = focused
  const anim = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: focused ? 1 : 0,
      useNativeDriver: true,
      bounciness: 12, // Playful bounce
      speed: 14, // Snappy response
    }).start();
  }, [focused, anim]);

  // Interpolations for lift and scale
  const animatedStyle = {
    transform: [
      {
        scale: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.2], // Zoom from 1.0x to 1.2x
        }),
      },
      {
        translateY: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -4], // Lift up 4 pixels when focused
        }),
      },
    ],
    // Optional: Subtle opacity shift for inactive state
    opacity: anim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.8, 1],
    }),
  };

  // Render the specific library component
  if (library === 'material-community') {
    return (
      <AnimatedMCIcon
        name={name as keyof typeof MaterialCommunityIcon.glyphMap}
        size={size}
        color={color}
        style={animatedStyle}
      />
    );
  }

  return (
    <AnimatedMaterialIcon
      name={name as keyof typeof MaterialIcon.glyphMap}
      size={size}
      color={color}
      style={animatedStyle}
    />
  );
};

export default React.memo(AnimatedTabIcon);

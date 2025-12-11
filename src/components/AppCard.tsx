import React from 'react';
import { 
  View, 
  StyleSheet, 
  ViewStyle, 
  StyleProp, 
  Pressable, 
  Platform 
} from 'react-native';

// --- Design Tokens (Replace with your own theme file) ---
const colors = {
  cardBg: '#FFFFFF',
  border: '#E5E7EB',
  shadow: '#000000',
};

type CardVariant = 'elevated' | 'outlined' | 'flat';

interface AppCardProps extends React.ComponentProps<typeof View> {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: CardVariant;
  onPress?: () => void;
  disabled?: boolean;
}

const AppCard: React.FC<AppCardProps> = ({ 
  children, 
  style, 
  variant = 'elevated', 
  onPress,
  disabled,
  ...rest 
}) => {
  
  // 1. Determine base styles based on variant
  const variantStyles = {
    elevated: styles.elevated,
    outlined: styles.outlined,
    flat: styles.flat,
  };

  // 2. Base Container Style
  const containerStyle = [
    styles.card,
    variantStyles[variant],
    style,
    disabled && styles.disabled,
  ];

  // 3. Render as Pressable if interactive
  if (onPress) {
    return (
      <Pressable
        onPress={disabled ? undefined : onPress}
        style={({ pressed }) => [
          containerStyle,
          pressed && !disabled && styles.pressed,
        ]}
        {...(rest as any)}
      >
        {children}
      </Pressable>
    );
  }

  // 4. Default Static View
  return (
    <View style={containerStyle} {...rest}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.cardBg,
    marginVertical: 6,
  },
  
  // --- Variants ---
  elevated: {
    // Android
    elevation: 4,
    // iOS Soft Shadow
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
  },
  outlined: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'transparent', // or colors.cardBg depending on preference
    elevation: 0,
  },
  flat: {
    backgroundColor: '#F3F4F6', // Light gray background
    elevation: 0,
  },

  // --- Interaction ---
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }], // Subtle shrink effect
  },
  disabled: {
    opacity: 0.6,
  },
});

export default AppCard;
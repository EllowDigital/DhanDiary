import React, { useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, Platform } from 'react-native';
import Animated, { FadeInUp, FadeOutUp, Layout } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

// --- Theme Configuration (Replace with your actual design system import) ---
const theme = {
  colors: {
    bg: '#1F2937', // Dark Grey/Slate
    surface: '#374151', // Lighter Grey for icon bg
    textPrimary: '#F9FAFB',
    textSecondary: '#D1D5DB',
    accent: '#10B981', // Emerald Green
    white: '#FFFFFF',
    shadow: '#000000',
  },
  spacing: {
    s: 8,
    m: 12,
    l: 16,
  },
  borderRadius: 16,
};

type Props = {
  visible: boolean;
  message?: string;
  duration?: number;
  onPress?: () => void;
  onClose?: () => void;
};

const UpdateBanner: React.FC<Props> = ({
  visible,
  message = 'Tap to install the latest version',
  duration = 6000,
  onPress,
  onClose,
}) => {
  const insets = useSafeAreaInsets();

  // Auto-dismiss logic
  useEffect(() => {
    let timeoutRef: ReturnType<typeof setTimeout> | null = null;

    if (visible && duration > 0) {
      timeoutRef = setTimeout(() => {
        if (onClose) onClose();
      }, duration);
    }

    return () => {
      if (timeoutRef !== null) clearTimeout(timeoutRef as any);
    };
  }, [visible, duration, onClose]);

  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeInUp.springify().damping(16).stiffness(150)}
      exiting={FadeOutUp.duration(200)}
      layout={Layout.springify()}
      style={[
        styles.absoluteContainer,
        { top: insets.top + 8 }, // Dynamic safe area spacing
      ]}
    >
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.banner,
          pressed && styles.bannerPressed, // Visual feedback on press
        ]}
        accessibilityRole="button"
        accessibilityLabel="Update available. Tap to update."
      >
        {/* Icon */}
        <View style={styles.iconWrapper}>
          <MaterialCommunityIcons
            name="arrow-up-bold-circle-outline"
            size={24}
            color={theme.colors.accent}
          />
        </View>

        {/* Text Content */}
        <View style={styles.textContainer}>
          <Text style={styles.title}>Update Available</Text>
          <Text style={styles.message} numberOfLines={1} ellipsizeMode="tail">
            {message}
          </Text>
        </View>

        {/* CTA "Button" (Visual only, part of the main pressable) */}
        <View style={styles.ctaBadge}>
          <Text style={styles.ctaText}>UPDATE</Text>
        </View>

        {/* Close Button (Separate Hit Zone) */}
        {onClose && (
          <Pressable
            onPress={(e) => {
              // Stop event from bubbling to the main "Update" action
              e.stopPropagation();
              onClose();
            }}
            hitSlop={12}
            style={({ pressed }) => [styles.closeButton, pressed && { opacity: 0.5 }]}
            accessibilityRole="button"
            accessibilityLabel="Dismiss update notification"
          >
            <MaterialCommunityIcons name="close" size={20} color={theme.colors.textSecondary} />
          </Pressable>
        )}
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  absoluteContainer: {
    position: 'absolute',
    left: theme.spacing.l,
    right: theme.spacing.l,
    zIndex: 9999, // Ensure it floats above everything
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.bg,
    borderRadius: theme.borderRadius,
    padding: theme.spacing.m,

    // Modern Shadow
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,

    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)', // Subtle border for definition
  },
  bannerPressed: {
    transform: [{ scale: 0.98 }], // Micro-interaction squeeze
    opacity: 0.95,
  },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(16, 185, 129, 0.15)', // Transparent Accent
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.m,
  },
  textContainer: {
    flex: 1, // Takes up remaining space
    justifyContent: 'center',
    marginRight: theme.spacing.s,
  },
  title: {
    color: theme.colors.textPrimary,
    fontWeight: '700',
    fontSize: 14,
    marginBottom: 2,
    letterSpacing: 0.3,
  },
  message: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  ctaBadge: {
    backgroundColor: theme.colors.accent,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginRight: theme.spacing.s,
  },
  ctaText: {
    color: theme.colors.white,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  closeButton: {
    padding: 4,
    marginLeft: 2,
  },
});

export default UpdateBanner;

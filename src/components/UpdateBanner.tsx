import React, { useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Pressable } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

// --- Mock Colors (Replace with your '../utils/design') ---
const colors = {
  backgroundDark: '#1F2937', // Dark Grey/Black for contrast
  textLight: '#F9FAFB',
  textMuted: '#9CA3AF',
  primary: '#10B981', // Green for update action
  white: '#FFFFFF',
};

type Props = {
  visible: boolean;
  message?: string;
  duration?: number; // ms
  onPress?: () => void;
  onClose?: () => void;
};

const UpdateBanner: React.FC<Props> = ({
  visible,
  message,
  duration = 6000, // Increased default slightly for readability
  onPress,
  onClose,
}) => {
  const insets = useSafeAreaInsets();

  // Auto-dismiss logic
  useEffect(() => {
    let timeoutRef: ReturnType<typeof setTimeout> | undefined;
    if (visible && duration > 0) {
      timeoutRef = setTimeout(() => {
        onClose?.();
      }, duration);
    }
    return () => {
      if (timeoutRef) {
        clearTimeout(timeoutRef);
      }
    };
  }, [visible, duration, onClose]);

  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeInUp.springify().damping(15)}
      exiting={FadeOutUp}
      style={[
        styles.container,
        { top: insets.top + 8 }, // Respect Safe Area + padding
      ]}
    >
      <TouchableOpacity style={styles.banner} activeOpacity={0.9} onPress={onPress}>
        {/* Left Icon */}
        <View style={styles.iconContainer}>
          <MaterialCommunityIcons name="cloud-download-outline" size={24} color={colors.primary} />
        </View>

        {/* Text Content */}
        <View style={styles.content}>
          <Text style={styles.title}>Update Available</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {message || 'Tap to install the latest version'}
          </Text>
        </View>

        {/* Action Button */}
        <View style={styles.actionButton}>
          <Text style={styles.actionText}>Update</Text>
        </View>

        {/* Close Button (Optional) */}
        {onClose && (
          <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
            <MaterialCommunityIcons name="close" size={18} color={colors.textMuted} />
          </Pressable>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundDark,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,

    // High-end Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  iconContainer: {
    marginRight: 12,
    backgroundColor: 'rgba(16, 185, 129, 0.1)', // Very subtle green bg
    padding: 8,
    borderRadius: 12,
  },
  content: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    color: colors.textLight,
    fontWeight: '700',
    fontSize: 14,
    marginBottom: 2,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
  actionButton: {
    backgroundColor: colors.primary,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    marginRight: 8,
  },
  actionText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  closeBtn: {
    marginLeft: 4,
    opacity: 0.8,
  },
});

export default UpdateBanner;

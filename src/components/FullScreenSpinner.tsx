import React from 'react';
import { View, StyleSheet, ActivityIndicator, Text, ViewStyle, TextStyle } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

type Props = {
  visible?: boolean;
  message?: string;
  mode?: 'overlay' | 'inline';
  theme?: 'light' | 'dark'; // New: Choose visual style
  color?: string; // Override spinner color
  size?: 'small' | 'large' | number;
};

// --- Configuration Constants ---
const THEMES = {
  light: {
    backdrop: 'rgba(255, 255, 255, 0.6)', // Milky white backdrop
    cardBg: '#FFFFFF',
    text: '#1F2937',
    spinnerDefault: '#4F46E5', // Indigo
    shadow: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 12,
      elevation: 5,
    },
  },
  dark: {
    backdrop: 'rgba(0, 0, 0, 0.4)', // Dimmed dark backdrop
    cardBg: 'rgba(30, 30, 30, 0.95)', // Almost opaque dark grey
    text: '#F3F4F6',
    spinnerDefault: '#FFFFFF',
    shadow: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 10,
      elevation: 8,
    },
  },
};

const LoadingSpinner: React.FC<Props> = ({
  visible = false,
  message,
  mode = 'overlay',
  theme = 'light', // Default to modern light theme
  color,
  size = 'large',
}) => {
  if (!visible) return null;

  const currentTheme = THEMES[theme];
  const spinnerColor = color || currentTheme.spinnerDefault;

  // --- Render: Inline Mode ---
  if (mode === 'inline') {
    return (
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(200)}
        style={styles.inlineWrap}
      >
        <ActivityIndicator size={size} color={spinnerColor} />
        {message && <Text style={[styles.msgInline, { color: currentTheme.text }]}>{message}</Text>}
      </Animated.View>
    );
  }

  // --- Render: Overlay Mode ---
  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      exiting={FadeOut.duration(300)}
      style={[styles.backdrop, { backgroundColor: currentTheme.backdrop }]}
      pointerEvents="auto" // Blocks touches behind the spinner
    >
      <View style={[styles.card, { backgroundColor: currentTheme.cardBg }, currentTheme.shadow]}>
        <ActivityIndicator size={size} color={spinnerColor} />
        {message && <Text style={[styles.msg, { color: currentTheme.text }]}>{message}</Text>}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  // Overlay Styles
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  card: {
    paddingVertical: 24,
    paddingHorizontal: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 120,
  },
  msg: {
    marginTop: 16,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },

  // Inline Styles
  inlineWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  msgInline: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '500',
    opacity: 0.8,
  },
});

export default LoadingSpinner;

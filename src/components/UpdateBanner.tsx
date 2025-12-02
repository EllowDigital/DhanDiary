import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { colors } from '../utils/design';

type Props = {
  visible: boolean;
  message?: string;
  duration?: number; // ms
  onPress?: () => void;
  onClose?: () => void;
};

const UpdateBanner: React.FC<Props> = ({ visible, message, duration = 4000, onPress, onClose }) => {
  const translateY = React.useRef(new Animated.Value(visible ? 0 : 1)).current;

  useEffect(() => {
    Animated.spring(translateY, { toValue: visible ? 0 : 1, useNativeDriver: true }).start();
    let t: any = null;
    if (visible) {
      t = setTimeout(() => {
        if (onClose) {
          onClose();
        }
      }, duration);
    }
    return () => {
      if (t) clearTimeout(t);
    };
  }, [visible, duration, onClose]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [
            {
              translateY: (translateY as any).interpolate({
                inputRange: [0, 1],
                outputRange: [0, 80],
              }),
            },
          ],
        },
      ]}
      pointerEvents="box-none"
    >
      <TouchableOpacity style={styles.banner} onPress={onPress} activeOpacity={0.9}>
        <View style={styles.bannerContent}>
          <Text style={styles.title}>New update available</Text>
          <Text style={styles.subtitle}>{message || 'Tap to review and install'}</Text>
        </View>
        <View style={styles.ctaPill}>
          <Text style={styles.ctaText}>Update</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 32,
    left: 16,
    right: 16,
    zIndex: 2000,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.text,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 16,
    width: '100%',
    justifyContent: 'space-between',
  },
  bannerContent: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    color: colors.card,
    fontWeight: '700',
    marginBottom: 2,
    fontSize: 14,
  },
  subtitle: {
    color: colors.mutedSoft,
    fontSize: 13,
  },
  ctaPill: {
    backgroundColor: colors.accentGreen,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 24,
  },
  ctaText: {
    color: colors.white,
    fontWeight: '700',
  },
});

export default UpdateBanner;

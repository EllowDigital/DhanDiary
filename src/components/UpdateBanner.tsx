import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';

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
      <View style={styles.banner}>
        <Text style={styles.text}>{message || 'A new update is available'}</Text>
        <TouchableOpacity style={styles.button} onPress={onPress}>
          <Text style={styles.buttonText}>Update</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 40,
    left: 12,
    right: 12,
    zIndex: 2000,
    alignItems: 'center',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    width: '100%',
    justifyContent: 'space-between',
  },
  text: {
    color: 'white',
    flex: 1,
    marginRight: 12,
  },
  button: {
    backgroundColor: '#10B981',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: 'white',
    fontWeight: '600',
  },
});

export default UpdateBanner;

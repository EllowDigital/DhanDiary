import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { colors } from '../utils/design';

type Props = {
  size?: number;
  name?: string | null;
  imageUrl?: string | null;
  onPress?: () => void;
  style?: ViewStyle;
};

const MIN_TOUCH = 44;

export default function UserAvatar({ size = 36, name, imageUrl, onPress, style }: Props) {
  const initial = (name && name.trim().charAt(0).toUpperCase()) || 'U';
  const radius = Math.round(size / 2);
  const fontSize = Math.round(size * 0.45);

  const Container: any = onPress ? TouchableOpacity : View;

  return (
    <Container
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.touchWrap, { minWidth: MIN_TOUCH, minHeight: MIN_TOUCH }, style]}
    >
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={{ width: size, height: size, borderRadius: radius }}
          resizeMode="cover"
        />
      ) : (
        <View
          style={[
            styles.fallback,
            { width: size, height: size, borderRadius: radius, backgroundColor: colors.primarySoft },
          ]}
        >
          <Text style={[styles.initial, { fontSize, color: colors.primary }]}>{initial}</Text>
        </View>
      )}
    </Container>
  );
}

const styles = StyleSheet.create({
  touchWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    fontWeight: '700',
  },
});

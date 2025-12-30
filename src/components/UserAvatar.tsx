import React, { useMemo, useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { colors } from '../utils/design';

type Props = {
  size?: number;
  name?: string | null;
  // Accept flexible shapes: string URL or an object returned by some auth SDKs
  imageUrl?: any;
  onPress?: () => void;
  style?: ViewStyle;
};

const MIN_TOUCH = 44;

export default function UserAvatar({ size = 36, name, imageUrl, onPress, style }: Props) {
  const [imgError, setImgError] = useState(false);
  const initial = (name && name.trim().charAt(0).toUpperCase()) || 'U';
  const radius = Math.round(size / 2);
  const fontSize = Math.round(size * 0.45);

  const Container: any = onPress ? TouchableOpacity : View;

  const resolvedUrl = useMemo(() => {
    if (!imageUrl) return null;
    if (typeof imageUrl === 'string') return imageUrl;
    // Try common object shapes returned by different auth providers
    if (typeof imageUrl === 'object') {
      return imageUrl.imageUrl || imageUrl.profileImageUrl || imageUrl.url || imageUrl.uri || null;
    }
    return null;
  }, [imageUrl]);

  return (
    <Container
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.touchWrap, { minWidth: MIN_TOUCH, minHeight: MIN_TOUCH }, style]}
    >
      {resolvedUrl && !imgError ? (
        <Image
          source={{ uri: resolvedUrl }}
          style={{ width: size, height: size, borderRadius: radius }}
          resizeMode="cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <View
          style={[
            styles.fallback,
            {
              width: size,
              height: size,
              borderRadius: radius,
              backgroundColor: colors.primarySoft,
            },
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

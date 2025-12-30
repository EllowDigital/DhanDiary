import React, { useMemo, useState, useEffect } from 'react';
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
  const [lastGoodUrl, setLastGoodUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState<string | null>(null);
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

  // Keep last successfully loaded URL so transient prop changes don't remove the avatar
  useEffect(() => {
    if (resolvedUrl && resolvedUrl !== lastGoodUrl) {
      // Begin attempting to load new URL but don't clear lastGoodUrl until load succeeds
      setLoadingUrl(resolvedUrl);
      setImgError(false);
    }
    // If resolvedUrl is null, keep showing lastGoodUrl (avoid flicker)
  }, [resolvedUrl, lastGoodUrl]);

  return (
    <Container
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.touchWrap, { minWidth: MIN_TOUCH, minHeight: MIN_TOUCH }, style]}
    >
      {((resolvedUrl || lastGoodUrl) && !imgError) ? (
        <Image
          source={{ uri: (resolvedUrl || lastGoodUrl) as string }}
          style={{ width: size, height: size, borderRadius: radius }}
          resizeMode="cover"
          onError={() => {
            setImgError(true);
            setLoadingUrl(null);
          }}
          onLoad={() => {
            // Mark current resolvedUrl as good
            const urlLoaded = resolvedUrl || lastGoodUrl;
            if (urlLoaded) setLastGoodUrl(urlLoaded as string);
            setImgError(false);
            setLoadingUrl(null);
          }}
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

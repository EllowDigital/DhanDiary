import React from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';

type Props = {
  visible?: boolean;
  message?: string;
  /** 'overlay' shows a full-screen dimmed backdrop; 'inline' renders just a centered spinner box */
  mode?: 'overlay' | 'inline';
  color?: string;
  size?: 'small' | 'large' | number;
};

const FullScreenSpinner: React.FC<Props> = ({
  visible = false,
  message,
  mode = 'overlay',
  color = '#fff',
  size = 'large',
}) => {
  if (!visible) return null;

  if (mode === 'inline') {
    return (
      <View style={styles.inlineWrap} pointerEvents="box-none">
        <View style={styles.inlineCard}>
          <ActivityIndicator size={size} color={color} />
          {message ? <Text style={styles.msgInline}>{message}</Text> : null}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.backdrop} pointerEvents="auto" accessible accessibilityRole="alert">
      <View style={styles.card}>
        <ActivityIndicator size={size} color={color} />
        {message ? <Text style={styles.msg}>{message}</Text> : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2000,
  },
  card: {
    padding: 20,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
  },
  msg: {
    color: '#fff',
    marginTop: 10,
  },
  inlineWrap: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 20,
  },
  inlineCard: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
  },
  msgInline: {
    color: '#fff',
    marginTop: 8,
    fontSize: 13,
  },
});

export default FullScreenSpinner;

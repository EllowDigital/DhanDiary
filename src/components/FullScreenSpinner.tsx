import React from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';

type Props = {
  visible?: boolean;
  message?: string;
};

const FullScreenSpinner: React.FC<Props> = ({ visible = false, message }) => {
  if (!visible) return null;

  return (
    <View style={styles.backdrop} pointerEvents="auto" accessible accessibilityRole="alert">
      <View style={styles.card}>
        <ActivityIndicator size="large" color="#fff" />
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
});

export default FullScreenSpinner;

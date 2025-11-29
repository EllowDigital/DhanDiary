import React from 'react';
import { TouchableOpacity, View, StyleSheet } from 'react-native';

type Props = {
  children: React.ReactNode;
  // react-navigation may pass an event argument to onPress; accept optional param
  onPress?: (e?: any) => void;
  accessibilityState?: { selected?: boolean };
};

const TabBarButton = ({ children, onPress, accessibilityState }: Props) => {
  const focused = !!(accessibilityState && accessibilityState.selected);

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={styles.container}>
      {focused && <View style={styles.cardBehind} />}
      <View style={styles.content}>{children}</View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBehind: {
    position: 'absolute',
    width: 68,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#E2E8F0', // a light blue-gray
    bottom: 10,
    zIndex: 1,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 6,
  },
});

export default TabBarButton;

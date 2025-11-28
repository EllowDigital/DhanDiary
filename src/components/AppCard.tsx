import React from 'react';
import { View, StyleSheet, ViewProps } from 'react-native';

const AppCard: React.FC<ViewProps> = ({ children, style, ...rest }) => {
  return (
    <View style={[styles.card, style]} {...rest}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    // Android shadow
    elevation: 3,
    // iOS shadow
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
  },
});

export default AppCard;

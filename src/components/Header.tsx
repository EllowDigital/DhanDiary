import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const Header: React.FC<{ title?: string }> = ({ title }) => (
  <View style={styles.container}>
    <Text style={styles.title}>{title || 'App'}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#eee' },
  title: { fontSize: 18, fontWeight: '700' },
});

export default Header;

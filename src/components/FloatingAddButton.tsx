import React from 'react';
import { TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcon from 'react-native-vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';

const FloatingAddButton = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  return (
    <TouchableOpacity
      style={[styles.button, { bottom: Math.max(16, insets.bottom + 12) }]}
      onPress={() => navigation.navigate('AddEntry' as any)}
      onLongPress={() => {
        Alert.alert('Quick Add', 'Add Cash (IN) or Cash (OUT)?', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Cash (IN)',
            onPress: () => navigation.navigate('AddEntry' as any, { defaultType: 'in' }),
          },
          {
            text: 'Cash (OUT)',
            onPress: () => navigation.navigate('AddEntry' as any, { defaultType: 'out' }),
          },
        ]);
      }}
      accessibilityLabel="Add entry"
    >
      <MaterialIcon name="add" size={28} color="#fff" />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    right: 20,
    bottom: 70,
    backgroundColor: '#2089dc',
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
});

export default FloatingAddButton;

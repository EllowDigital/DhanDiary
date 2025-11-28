import React from 'react';
import { Modal, View, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { Text, Button } from '@rneui/themed';
import MaterialIcon from 'react-native-vector-icons/MaterialIcons';

const DEFAULT_CATEGORIES = [
  'General',
  'Salary',
  'Groceries',
  'Transport',
  'Bills',
  'Entertainment',
  'Health',
  'Other',
];

const CategoryPickerModal = ({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (c: string) => void;
}) => {
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.backdrop}>
        <View style={styles.container}>
          <Text h4 style={{ textAlign: 'center', marginBottom: 10 }}>
            Select Category
          </Text>
          <FlatList
            data={DEFAULT_CATEGORIES}
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.item} onPress={() => onSelect(item)}>
                <MaterialIcon name="label" size={18} />
                <Text style={{ marginLeft: 10 }}>{item}</Text>
              </TouchableOpacity>
            )}
          />
          <Button title="Close" type="clear" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    padding: 16,
    maxHeight: '50%',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
});

export default CategoryPickerModal;

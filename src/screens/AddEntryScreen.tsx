// src/screens/AddEntryScreen.tsx
import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  Dimensions,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Input, Button, Text } from '@rneui/themed';
import SimpleButtonGroup from '../components/SimpleButtonGroup';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import { useNavigation, useRoute } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useEntries } from '../hooks/useEntries';
import { useToast } from '../context/ToastContext';
import runInBackground from '../utils/background';
import CategoryPickerModal from '../components/CategoryPickerModal';
import { v4 as uuidv4 } from 'uuid';

import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const scale = SCREEN_WIDTH / 390;
const font = (s: number) => Math.round(s * scale);

const AddEntryScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const editingParamId = route?.params?.local_id;

  const { addEntry, entries, updateEntry } = useEntries();

  const [editingLocalId, setEditingLocalId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [typeIndex, setTypeIndex] = useState(0);
  const [category, setCategory] = useState('General');
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);

  const [date, setDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const types: ('out' | 'in')[] = ['out', 'in'];

  useEffect(() => {
    if (editingParamId && entries) {
      const found = entries.find((e: any) => e.local_id === editingParamId);
      if (found) {
        setAmount(String(found.amount ?? ''));
        setNote(found.note ?? '');
        setTypeIndex(found.type === 'in' ? 1 : 0);
        setCategory(found.category ?? 'General');
        const fallback = found.date ?? found.created_at ?? found.updated_at;
        setDate(fallback ? new Date(fallback) : new Date());
        setEditingLocalId(found.local_id);
      }
    }
  }, [editingParamId, entries]);

  const onPickCategory = (c: string) => {
    setCategory(c);
    setCategoryModalVisible(false);
  };

  const parseAmount = () => {
    const parsed = parseFloat(amount.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : NaN;
  };

  const { showToast } = useToast();

  const handleSave = () => {
    const parsed = parseAmount();
    if (!amount.trim() || isNaN(parsed) || parsed <= 0) {
      return Alert.alert('Validation', 'Please enter a valid amount.');
    }

    // Prepare payload
    const payload = {
      amount: parsed,
      type: types[typeIndex],
      category,
      note,
      currency: 'INR',
      date: date.toISOString(),
    };

    // Optimistic UX: navigate back immediately and run work in background
    showToast(editingLocalId ? 'Updating...' : 'Saving...');
    navigation.goBack();

    runInBackground(async () => {
      try {
        if (editingLocalId) {
          await updateEntry({ local_id: editingLocalId, updates: payload });
          showToast('Updated');
        } else {
          await addEntry({ local_id: uuidv4(), ...payload });
          showToast('Saved');
        }
      } catch (err: any) {
        // If background save fails, inform user
        showToast(err?.message || 'Save failed');
      }
    });
  };

  // CARD ANIMATION
  const scaleValue = useSharedValue(1);
  const shadowValue = useSharedValue(5);

  const onPressInCard = () => {
    scaleValue.value = withSpring(1.02);
    shadowValue.value = withTiming(14);
  };
  const onPressOutCard = () => {
    scaleValue.value = withSpring(1);
    shadowValue.value = withTiming(5);
  };

  const animatedCardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleValue.value }],
    elevation: shadowValue.value,
    shadowRadius: shadowValue.value,
    shadowOpacity: 0.09,
  }));

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>
            {editingLocalId ? 'Edit Transaction' : 'Add Transaction'}
          </Text>

          {/* TYPE SELECTOR */}
          <SimpleButtonGroup
            buttons={['Cash (OUT)', 'Cash (IN)']}
            selectedIndex={typeIndex}
            onPress={setTypeIndex}
            containerStyle={styles.typeGroup}
            buttonStyle={styles.typeButton}
            selectedButtonStyle={{
              backgroundColor: typeIndex === 0 ? '#FF5D5D' : '#3CCB75',
            }}
            textStyle={styles.typeText}
          />

          {/* MAIN CARD */}
          <Pressable onPressIn={onPressInCard} onPressOut={onPressOutCard}>
            <Animated.View style={[styles.cardWrapper, animatedCardStyle]}>
              <View style={styles.cardInner}>
                {/* AMOUNT */}
                <View style={styles.amountRow}>
                  <Text style={styles.currency}>₹</Text>
                  <Input
                    placeholder="0"
                    keyboardType="numeric"
                    value={amount}
                    onChangeText={setAmount}
                    containerStyle={{ flex: 1, paddingLeft: 0 }}
                    inputContainerStyle={{ borderBottomWidth: 0 }}
                    inputStyle={styles.amountInput}
                  />
                </View>

                {/* CATEGORY */}
                <Pressable style={styles.row} onPress={() => setCategoryModalVisible(true)}>
                  <View style={styles.rowLeft}>
                    <MaterialIcon name="category" size={20} color="#475569" />
                    <Text style={styles.rowLabel}>Category</Text>
                  </View>
                  <Text style={styles.rowValue}>{category}</Text>
                </Pressable>

                {/* DATE */}
                <Pressable style={styles.row} onPress={() => setShowDatePicker(true)}>
                  <View style={styles.rowLeft}>
                    <MaterialIcon name="event" size={20} color="#475569" />
                    <Text style={styles.rowLabel}>Date</Text>
                  </View>
                  <Text style={styles.rowValue}>{date.toDateString()}</Text>
                </Pressable>

                {showDatePicker && (
                  <DateTimePicker
                    value={date}
                    mode="date"
                    display="default"
                    onChange={(e, d) => {
                      setShowDatePicker(false);
                      if (d) setDate(d);
                    }}
                  />
                )}

                {/* NOTE */}
                <Input
                  placeholder="Note (optional)"
                  value={note}
                  onChangeText={setNote}
                  multiline
                  inputContainerStyle={styles.noteInput}
                />
              </View>
            </Animated.View>
          </Pressable>

          {/* SAVE BUTTON */}
          <Button
            title={editingLocalId ? 'Update Transaction' : 'Save Transaction'}
            onPress={handleSave}
            buttonStyle={styles.saveButton}
            containerStyle={{ marginTop: 15 }}
          />

          <CategoryPickerModal
            visible={categoryModalVisible}
            onClose={() => setCategoryModalVisible(false)}
            onSelect={onPickCategory}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default AddEntryScreen;

/* ------------------------------------
   MODERN RESPONSIVE STYLES
------------------------------------ */

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F6F8FB',
  },

  scrollContainer: {
    padding: 20,
    paddingBottom: 40,
  },

  title: {
    textAlign: 'center',
    fontSize: font(22),
    fontWeight: '700',
    marginBottom: 14,
    color: '#0F172A',
  },

  /* TYPE BUTTON GROUP */
  typeGroup: {
    width: '78%',
    alignSelf: 'center',
    marginBottom: 20,
  },
  typeButton: {
    paddingVertical: 8,
    borderRadius: 10,
  },
  typeText: {
    fontSize: font(14),
    fontWeight: '600',
  },

  /* MAIN CARD */
  cardWrapper: {
    backgroundColor: '#FFFFFF',
    padding: 10,
    borderRadius: 18,
    marginBottom: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 5,
  },

  cardInner: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
  },

  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingBottom: 10,
  },

  currency: {
    fontSize: font(28),
    fontWeight: '800',
    color: '#0F172A',
    marginRight: 10,
  },

  amountInput: {
    fontSize: font(36),
    fontWeight: '800',
    color: '#0F172A',
  },

  row: {
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    marginBottom: 10,

    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  rowLabel: {
    marginLeft: 10,
    fontWeight: '600',
    fontSize: font(16),
    color: '#475569',
  },

  rowValue: {
    fontWeight: '700',
    fontSize: font(16),
    color: '#111',
  },

  noteInput: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
    borderBottomWidth: 0,
  },

  saveButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 16,
    borderRadius: 12,
  },
});

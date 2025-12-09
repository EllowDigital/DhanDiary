import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  Dimensions,
  Alert,
  Animated,
  Easing,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Input, Button, Text } from '@rneui/themed';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import { useNavigation, useRoute } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useEntries } from '../hooks/useEntries';
import { useToast } from '../context/ToastContext';
import runInBackground from '../utils/background';
import CategoryPickerModal from '../components/CategoryPickerModal';
import { v4 as uuidv4 } from 'uuid';
import { colors, spacing, shadows } from '../utils/design';
import { ALLOWED_CATEGORIES, DEFAULT_CATEGORY, ensureCategory } from '../constants/categories';
import ScreenHeader from '../components/ScreenHeader';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const scale = SCREEN_WIDTH / 390;
const font = (s: number) => Math.round(s * scale);

const quickCategories = ALLOWED_CATEGORIES;

const typeConfigs = [
  {
    value: 'out',
    label: 'Cash Out',
    subtitle: 'Expense',
    accent: colors.accentRed,
    accentSoft: 'rgba(239, 68, 68, 0.1)',
    icon: 'arrow-outward',
  },
  {
    value: 'in',
    label: 'Cash In',
    subtitle: 'Income',
    accent: colors.accentGreen,
    accentSoft: 'rgba(34, 197, 94, 0.1)',
    icon: 'arrow-downward',
  },
];

const AddEntryScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const editingParamId = route?.params?.local_id;

  const { addEntry, entries, updateEntry } = useEntries();
  const { showToast } = useToast();

  // State
  const [editingLocalId, setEditingLocalId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [typeIndex, setTypeIndex] = useState(0); // 0 = out, 1 = in
  const [category, setCategory] = useState(DEFAULT_CATEGORY);
  const [date, setDate] = useState<Date>(new Date());

  // Modals
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Computed
  const activeType = typeConfigs[typeIndex];
  const noteLength = note.trim().length;

  // --- ANIMATIONS ---
  // Standard Animated API
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const toggleAnim = useRef(new Animated.Value(0)).current; // 0 to 1

  useEffect(() => {
    // Entrance
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
    ]).start();
  }, []);

  useEffect(() => {
    // Toggle switch animation
    Animated.timing(toggleAnim, {
      toValue: typeIndex,
      duration: 250,
      useNativeDriver: false, // width/left interpolation needs false sometimes, or transforms
      easing: Easing.inOut(Easing.ease),
    }).start();
  }, [typeIndex]);

  // Load existing data for editing
  useEffect(() => {
    if (editingParamId && entries) {
      const found = entries.find((e: any) => e.local_id === editingParamId);
      if (found) {
        setAmount(String(found.amount ?? ''));
        setNote(found.note ?? '');
        setTypeIndex(found.type === 'in' ? 1 : 0);
        setCategory(ensureCategory(found.category));
        const fallback = found.date ?? found.created_at ?? found.updated_at;
        setDate(fallback ? new Date(fallback) : new Date());
        setEditingLocalId(found.local_id);
      }
    }
  }, [editingParamId, entries]);

  // Handlers
  const onPickCategory = (c: string) => {
    setCategory(ensureCategory(c));
    setCategoryModalVisible(false);
  };

  const parseAmount = () => {
    const parsed = parseFloat(amount.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : NaN;
  };

  const handleSave = () => {
    const parsed = parseAmount();
    if (!amount.trim() || isNaN(parsed) || parsed <= 0) {
      return Alert.alert('Invalid Amount', 'Please enter a valid number.');
    }

    const payload = {
      amount: parsed,
      type: activeType.value,
      category: ensureCategory(category),
      note,
      currency: 'INR',
      date: date.toISOString(),
    };

    showToast(editingLocalId ? 'Updating...' : 'Saving...');
    navigation.goBack();

    runInBackground(async () => {
      try {
        if (editingLocalId) {
          await updateEntry({ local_id: editingLocalId, updates: payload });
          showToast('Transaction updated');
        } else {
          await addEntry({ local_id: uuidv4(), ...payload });
          showToast('Transaction saved');
        }
      } catch (err: any) {
        showToast(err?.message || 'Save failed');
      }
    });
  };

  // Interpolated Styles
  const toggleTranslate = toggleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [2, (SCREEN_WIDTH - 48) / 2], // Approx half width
  });

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <ScreenHeader
        title={editingLocalId ? 'Edit Entry' : 'New Entry'}
        subtitle={editingLocalId ? 'Update transaction details' : 'Record a new transaction'}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            {/* TOGGLE SWITCH */}
            <View style={styles.toggleContainer}>
              <Animated.View
                style={[
                  styles.toggleIndicator,
                  {
                    left: 0,
                    transform: [{ translateX: toggleTranslate }],
                    width: '49%', // slightly less than half to account for padding
                  },
                ]}
              />
              {typeConfigs.map((cfg, idx) => {
                const isActive = typeIndex === idx;
                return (
                  <Pressable
                    key={cfg.value}
                    style={styles.toggleBtn}
                    onPress={() => setTypeIndex(idx)}
                  >
                    <MaterialIcon
                      name={cfg.icon as any}
                      size={18}
                      color={isActive ? colors.text : colors.muted}
                    />
                    <Text style={[styles.toggleText, isActive && styles.toggleTextActive]}>
                      {cfg.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* AMOUNT CARD */}
            <View style={[styles.amountCard, { borderColor: activeType.accent }]}>
              <View style={styles.amountHeader}>
                <Text style={styles.cardLabel}>Amount</Text>
                <View style={[styles.badge, { backgroundColor: activeType.accentSoft }]}>
                  <Text style={[styles.badgeText, { color: activeType.accent }]}>
                    {activeType.subtitle}
                  </Text>
                </View>
              </View>

              <View style={styles.inputRow}>
                <Text style={[styles.currencySymbol, { color: activeType.accent }]}>₹</Text>
                <Input
                  placeholder="0"
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="numeric"
                  inputContainerStyle={{ borderBottomWidth: 0 }}
                  inputStyle={styles.amountInput}
                  containerStyle={{ paddingHorizontal: 0, flex: 1 }}
                  placeholderTextColor={colors.mutedSoft}
                  autoFocus={!editingLocalId}
                />
              </View>
            </View>

            {/* DETAILS GRID */}
            <View style={styles.gridRow}>
              <Pressable style={styles.gridItem} onPress={() => setCategoryModalVisible(true)}>
                <Text style={styles.gridLabel}>Category</Text>
                <View style={styles.gridValueRow}>
                  <Text style={styles.gridValue} numberOfLines={1}>
                    {category}
                  </Text>
                  <MaterialIcon name="arrow-drop-down" size={24} color={colors.muted} />
                </View>
              </Pressable>

              <Pressable style={styles.gridItem} onPress={() => setShowDatePicker(true)}>
                <Text style={styles.gridLabel}>Date</Text>
                <View style={styles.gridValueRow}>
                  <Text style={styles.gridValue}>{date.toLocaleDateString()}</Text>
                  <MaterialIcon name="event" size={20} color={colors.muted} />
                </View>
              </Pressable>
            </View>

            {/* QUICK CATEGORIES */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Quick Select</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
              >
                {quickCategories.map((cat) => {
                  const isSelected = category === cat;
                  return (
                    <Pressable
                      key={cat}
                      style={[
                        styles.chip,
                        isSelected && {
                          backgroundColor: activeType.accentSoft,
                          borderColor: activeType.accent,
                        },
                      ]}
                      onPress={() => setCategory(cat)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          isSelected && { color: activeType.accent, fontWeight: '700' },
                        ]}
                      >
                        {cat}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {/* NOTES */}
            <View style={styles.section}>
              <View style={styles.noteHeader}>
                <Text style={styles.sectionTitle}>Note</Text>
                <Text style={styles.charCount}>{noteLength}/100</Text>
              </View>
              <Input
                placeholder="Add a description (optional)"
                value={note}
                onChangeText={(t) => setNote(t.slice(0, 100))}
                inputContainerStyle={styles.noteInput}
                inputStyle={{ fontSize: 15 }}
                multiline
              />
            </View>

            {/* ACTION BUTTON */}
            <Button
              title={editingLocalId ? 'Update Transaction' : 'Save Transaction'}
              onPress={handleSave}
              buttonStyle={[styles.saveBtn, { backgroundColor: activeType.accent }]}
              titleStyle={styles.saveBtnText}
              containerStyle={styles.saveBtnContainer}
              icon={
                <MaterialIcon name="check" size={20} color="white" style={{ marginRight: 8 }} />
              }
            />
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* MODALS */}
      <CategoryPickerModal
        visible={categoryModalVisible}
        onClose={() => setCategoryModalVisible(false)}
        onSelect={onPickCategory}
      />

      {showDatePicker && (
        <DateTimePicker
          value={date}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(e, d) => {
            setShowDatePicker(false);
            if (d) setDate(d);
          }}
        />
      )}
    </SafeAreaView>
  );
};

export default AddEntryScreen;

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContainer: {
    padding: 20,
    paddingBottom: 40,
  },

  /* TOGGLE */
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 16,
    padding: 4,
    height: 56,
    marginBottom: 24,
    position: 'relative',
  },
  toggleIndicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    backgroundColor: colors.card,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    zIndex: 1,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.muted,
  },
  toggleTextActive: {
    color: colors.text,
    fontWeight: '700',
  },

  /* AMOUNT CARD */
  amountCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1.5, // Thicker active border
    marginBottom: 20,
    ...shadows.medium,
  },
  amountHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  cardLabel: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currencySymbol: {
    fontSize: 32,
    fontWeight: '700',
    marginRight: 8,
  },
  amountInput: {
    fontSize: 36,
    fontWeight: '700',
    color: colors.text,
  },

  /* GRID */
  gridRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  gridItem: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  gridLabel: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '600',
    marginBottom: 6,
  },
  gridValueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gridValue: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },

  /* CHIPS */
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  chipRow: {
    paddingRight: 20,
    gap: 10,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
  },
  chipText: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '500',
  },

  /* NOTES */
  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  charCount: {
    fontSize: 12,
    color: colors.muted,
  },
  noteInput: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
    borderBottomWidth: 0,
    paddingHorizontal: 12,
    height: 80,
    alignItems: 'flex-start', // for multiline top alignment
  },

  /* SAVE BTN */
  saveBtnContainer: {
    marginTop: 10,
    borderRadius: 16,
    ...shadows.medium,
  },
  saveBtn: {
    paddingVertical: 14,
    borderRadius: 16,
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
});

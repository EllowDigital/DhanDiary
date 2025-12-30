import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  Alert,
  Animated,
  Easing,
  StatusBar,
  TextInput,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Text } from '@rneui/themed';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import { useNavigation, useRoute, useFocusEffect, RouteProp } from '@react-navigation/native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';

// --- CUSTOM IMPORTS ---
import { useEntries } from '../hooks/useEntries';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../context/ToastContext';
import runInBackground from '../utils/background';
import CategoryPickerModal from '../components/CategoryPickerModal';
import { colors } from '../utils/design';
import { ALLOWED_CATEGORIES, DEFAULT_CATEGORY, ensureCategory } from '../constants/categories';
import ScreenHeader from '../components/ScreenHeader';
import { isIncome, toCanonical } from '../utils/transactionType';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android') {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

// --- TYPES ---
type RootStackParamList = {
  AddEntry: { local_id?: string; type?: 'in' | 'out' };
};

type AddEntryRouteProp = RouteProp<RootStackParamList, 'AddEntry'>;

const typeConfigs = [
  {
    value: 'out',
    label: 'Expense',
    color: '#EF4444', // Red
    bg: '#FEF2F2',
    border: '#FECACA',
    icon: 'arrow-outward',
  },
  {
    value: 'in',
    label: 'Income',
    color: '#10B981', // Green
    bg: '#ECFDF5',
    border: '#A7F3D0',
    icon: 'arrow-downward',
  },
] as const;

const AddEntryScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<AddEntryRouteProp>();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  const { user } = useAuth();
  const { addEntry, entries, updateEntry } = useEntries(user?.id);
  const { showToast } = useToast();

  // Params
  const editingParamId = route.params?.local_id;
  // Initialize type based on params, default to Expense (0)
  const initialType = isIncome(route.params?.type) ? 1 : 0;

  // --- STATE ---
  const [editingLocalId, setEditingLocalId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [typeIndex, setTypeIndex] = useState(initialType);
  const [category, setCategory] = useState(DEFAULT_CATEGORY);
  const [date, setDate] = useState<Date>(new Date());
  const [saving, setSaving] = useState(false);

  // Modals
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // --- ANIMATIONS ---
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const colorAnim = useRef(new Animated.Value(initialType)).current;

  const activeType = typeConfigs[typeIndex];

  // Dynamic Theme Interpolation
  const themeColor = colorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#EF4444', '#10B981'],
  });

  const themeBg = colorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#FEF2F2', '#ECFDF5'],
  });

  const themeBorder = colorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#FECACA', '#A7F3D0'],
  });

  useEffect(() => {
    // Entrance Animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  // Trigger Color Animation on Type Change
  useEffect(() => {
    Animated.timing(colorAnim, {
      toValue: typeIndex,
      duration: 300,
      useNativeDriver: false, // Required for color interpolation
    }).start();
  }, [typeIndex, colorAnim]);

  // Helper to parse dates safely
  const parseToDate = (v: any): Date => {
    if (!v && v !== 0) return new Date();
    // Numbers (could be seconds or ms)
    if (typeof v === 'number') {
      const n = Number(v);
      if (n < 1e12) return new Date(n * 1000); // likely seconds
      return new Date(n); // likely ms
    }
    // Strings
    if (typeof v === 'string') {
      const p = Date.parse(v);
      if (!Number.isNaN(p)) return new Date(p);
      // Try parsing numeric string
      const asNum = Number(v);
      if (!Number.isNaN(asNum)) {
        if (asNum < 1e12) return new Date(asNum * 1000);
        return new Date(asNum);
      }
      return new Date();
    }
    // If it's already a Date object (or Date-like)
    if (v instanceof Date) return v;

    return new Date();
  };

  // Load Data for Editing
  useEffect(() => {
    if (editingParamId && entries) {
      const found = entries.find((e: any) => e.local_id === editingParamId);
      if (found) {
        setAmount(String(found.amount));
        setNote(found.note ?? '');
        setTypeIndex(isIncome(found.type) ? 1 : 0);
        setCategory(ensureCategory(found.category));

        const d = found.date || found.created_at;
        setDate(parseToDate(d));
        setEditingLocalId(found.local_id);
      }
    }
  }, [editingParamId, entries]);

  // Reset form when opened in Add mode (no editing param)
  useEffect(() => {
    if (!editingParamId) {
      setEditingLocalId(null);
      setAmount('');
      setNote('');
      // If user navigated via "Add Income" button, respect that type
      setTypeIndex(isIncome(route.params?.type) ? 1 : 0);
      setCategory(DEFAULT_CATEGORY);
      setDate(new Date());
      setSaving(false);
    }
  }, [editingParamId, route.params?.type]);

  // Clear params / editing state when the screen loses focus to avoid stale edit mode
  useFocusEffect(
    useCallback(() => {
      return () => {
        try {
          // Reset params on blur so next open is clean
          navigation.setParams({ local_id: undefined } as any);
        } catch (e) {
          // ignore navigation errors
        }
        setEditingLocalId(null);
        setSaving(false);
      };
    }, [navigation])
  );

  // --- HANDLERS ---

  const handleSave = () => {
    if (saving) return;
    if (!user?.id) {
      showToast('Please sign in to save transactions.', 'error');
      return;
    }

    // Clean Amount Input (remove commas, spaces)
    const cleanAmount = amount.replace(/,/g, '').trim();
    const parsedAmount = parseFloat(cleanAmount);

    if (!cleanAmount || isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount greater than 0.');
      return;
    }

    const payload = {
      amount: parsedAmount,
      type: toCanonical(activeType.value),
      category: ensureCategory(category),
      note: note.trim(),
      currency: 'INR',
      date: date.toISOString(),
    };

    showToast(editingLocalId ? 'Updating transaction...' : 'Saving transaction...');
    setSaving(true);

    // Perform the write in background; navigate back only after the local write completes
    runInBackground(async () => {
      try {
        if (editingLocalId) {
          await updateEntry({ local_id: editingLocalId, updates: payload });
          showToast('Updated successfully');
        } else {
          await addEntry({ local_id: uuidv4(), ...payload });
          showToast('Transaction saved');
        }
        // Navigate back on success
        navigation.goBack();
      } catch (err) {
        console.error(err);
        showToast('Failed to save. Please try again.', 'error');
        setSaving(false); // Re-enable button on error
      }
    });
  };

  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    if (event.type === 'dismissed') return;
    if (selectedDate) setDate(selectedDate);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background || '#F8FAFC'} />

      <ScreenHeader
        title={editingLocalId ? 'Edit Transaction' : 'New Transaction'}
        subtitle={dayjs(date).format('dddd, D MMMM')}
        useSafeAreaPadding={false}
        showScrollHint={false}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <View style={styles.contentWrapper}>
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
              {/* 1. TYPE TOGGLE */}
              <View style={styles.toggleWrapper}>
                <View style={styles.toggleContainer}>
                  {typeConfigs.map((cfg, idx) => {
                    const isActive = typeIndex === idx;
                    return (
                      <Pressable
                        key={cfg.value}
                        style={[styles.toggleBtn, isActive && styles.toggleBtnActive]}
                        onPress={() => {
                          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                          setTypeIndex(idx);
                        }}
                      >
                        <MaterialIcon
                          name={cfg.icon as any}
                          size={20}
                          color={isActive ? cfg.color : colors.muted || '#94A3B8'}
                        />
                        <Text
                          style={[
                            styles.toggleText,
                            isActive && { color: cfg.color, fontWeight: '700' },
                          ]}
                        >
                          {cfg.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* 2. AMOUNT CARD */}
              <Animated.View
                style={[styles.amountCard, { backgroundColor: themeBg, borderColor: themeBorder }]}
              >
                <Text style={[styles.inputLabel, { color: activeType.color }]}>AMOUNT</Text>
                <View style={styles.amountInputRow}>
                  <Animated.Text style={[styles.currencySymbol, { color: themeColor }]}>
                    ₹
                  </Animated.Text>
                  <TextInput
                    value={amount}
                    onChangeText={setAmount}
                    placeholder="0"
                    placeholderTextColor="rgba(0,0,0,0.2)"
                    keyboardType="numeric"
                    style={[styles.amountInput, { color: activeType.color }]}
                    autoFocus={!editingLocalId} // Only auto-focus on fresh entry
                  />
                </View>
              </Animated.View>

              {/* 3. DETAILS GRID */}
              <View style={styles.gridContainer}>
                <Pressable style={styles.gridCard} onPress={() => setCategoryModalVisible(true)}>
                  <View style={styles.gridIconBg}>
                    <MaterialIcon name="category" size={22} color={colors.primary || '#2563EB'} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.gridLabel}>Category</Text>
                    <Text style={styles.gridValue} numberOfLines={1}>
                      {category}
                    </Text>
                  </View>
                  <MaterialIcon name="chevron-right" size={24} color={colors.border || '#E2E8F0'} />
                </Pressable>

                <Pressable style={styles.gridCard} onPress={() => setShowDatePicker(true)}>
                  <View style={[styles.gridIconBg, { backgroundColor: '#EFF6FF' }]}>
                    <MaterialIcon name="event" size={22} color="#3B82F6" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.gridLabel}>Date</Text>
                    <Text style={styles.gridValue}>{dayjs(date).format('DD MMM YYYY')}</Text>
                  </View>
                  <MaterialIcon name="chevron-right" size={24} color={colors.border || '#E2E8F0'} />
                </Pressable>
              </View>

              {/* 4. NOTE INPUT */}
              <View style={styles.noteSection}>
                <Text style={styles.sectionTitle}>Description</Text>
                <View style={styles.noteInputWrapper}>
                  <TextInput
                    value={note}
                    onChangeText={setNote}
                    placeholder="What is this transaction for?"
                    placeholderTextColor={colors.muted || '#94A3B8'}
                    multiline
                    style={styles.noteInput}
                  />
                  <MaterialIcon
                    name="edit"
                    size={18}
                    color={colors.muted || '#94A3B8'}
                    style={styles.noteIcon}
                  />
                </View>
              </View>

              {/* 5. QUICK CATEGORIES */}
              <Text style={styles.sectionTitle}>Quick Select</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipScroll}
              >
                {ALLOWED_CATEGORIES.map((cat) => (
                  <Pressable
                    key={cat}
                    style={[
                      styles.chip,
                      category === cat && {
                        backgroundColor: activeType.color,
                        borderColor: activeType.color,
                      },
                    ]}
                    onPress={() => {
                      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                      setCategory(cat);
                    }}
                  >
                    <Text style={[styles.chipText, category === cat && { color: 'white' }]}>
                      {cat}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </Animated.View>
          </ScrollView>

          {/* FOOTER BUTTON */}
          <View
            style={[
              styles.footerContainer,
              { paddingBottom: Platform.OS === 'ios' ? insets.bottom : 20 },
            ]}
          >
            <Button
              title={editingLocalId ? 'Update Transaction' : 'Add Transaction'}
              onPress={handleSave}
              loading={saving}
              disabled={saving}
              icon={
                <MaterialIcon name="check" size={22} color="white" style={{ marginRight: 8 }} />
              }
              buttonStyle={[styles.saveBtn, { backgroundColor: activeType.color }]}
              titleStyle={{ fontWeight: '700', fontSize: 16 }}
            />
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* --- MODALS --- */}
      <CategoryPickerModal
        visible={categoryModalVisible}
        onClose={() => setCategoryModalVisible(false)}
        onSelect={(c) => {
          setCategory(c);
          setCategoryModalVisible(false);
        }}
      />

      {showDatePicker && (
        <DateTimePicker
          value={date}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleDateChange}
          minimumDate={new Date('2000-01-01')}
          maximumDate={new Date()} // Prevent future dates
        />
      )}
    </SafeAreaView>
  );
};

export default AddEntryScreen;

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background || '#F8FAFC' },
  contentWrapper: { flex: 1, justifyContent: 'space-between' },
  scrollContent: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 40 },

  /* TOGGLE */
  toggleWrapper: { alignItems: 'center', marginBottom: 20 },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 16,
    padding: 4,
    width: '100%',
    maxWidth: 320,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
  },
  toggleBtnActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  toggleText: { fontSize: 14, fontWeight: '600', color: colors.muted || '#64748B' },

  /* AMOUNT CARD */
  amountCard: {
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1.5,
    marginBottom: 24,
  },
  inputLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 8, opacity: 0.8 },
  amountInputRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  currencySymbol: { fontSize: 32, fontWeight: '700', marginRight: 4 },
  amountInput: { fontSize: 42, fontWeight: '800', minWidth: 100, textAlign: 'center', padding: 0 },

  /* GRID */
  gridContainer: { gap: 12, marginBottom: 24 },
  gridCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 16,
  },
  gridIconBg: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridLabel: { fontSize: 12, color: colors.muted || '#64748B', marginBottom: 2 },
  gridValue: { fontSize: 16, fontWeight: '600', color: colors.text || '#1E293B' },

  /* NOTE INPUT */
  noteSection: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text || '#1E293B',
    marginBottom: 10,
    marginLeft: 4,
  },
  noteInputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F1F5F9', // Muted Surface
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'transparent',
    minHeight: 100,
  },
  noteInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text || '#1E293B',
    textAlignVertical: 'top',
    paddingTop: 0,
    height: '100%',
  },
  noteIcon: { marginTop: 2, marginLeft: 8 },

  /* CHIPS */
  chipScroll: { paddingRight: 20, gap: 10, paddingBottom: 20 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.text || '#1E293B' },

  /* FOOTER */
  footerContainer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    backgroundColor: colors.background || '#F8FAFC',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  saveBtn: {
    paddingVertical: 16,
    borderRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
});

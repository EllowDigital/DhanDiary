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
  TextInput,
  LayoutAnimation,
  UIManager,
  Keyboard,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Text } from '@rneui/themed';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import { useNavigation, useRoute } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useEntries } from '../hooks/useEntries';
import { useToast } from '../context/ToastContext';
import runInBackground from '../utils/background';
import CategoryPickerModal from '../components/CategoryPickerModal';
import { v4 as uuidv4 } from 'uuid';
import { colors, shadows } from '../utils/design';
import { ALLOWED_CATEGORIES, DEFAULT_CATEGORY, ensureCategory } from '../constants/categories';
import ScreenHeader from '../components/ScreenHeader';
import dayjs from 'dayjs';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const typeConfigs = [
  {
    value: 'out',
    label: 'Expense',
    color: colors.accentRed,
    bg: '#FEF2F2', // Light Red
    border: '#FECACA',
    icon: 'arrow-outward',
  },
  {
    value: 'in',
    label: 'Income',
    color: colors.accentGreen,
    bg: '#ECFDF5', // Light Green
    border: '#A7F3D0',
    icon: 'arrow-downward',
  },
] as const;

const AddEntryScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  const { addEntry, entries, updateEntry } = useEntries();
  const { showToast } = useToast();
  const editingParamId = route?.params?.local_id;

  // --- STATE ---
  const [editingLocalId, setEditingLocalId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [typeIndex, setTypeIndex] = useState(0); // 0: Out, 1: In
  const [category, setCategory] = useState(DEFAULT_CATEGORY);
  const [date, setDate] = useState<Date>(new Date());

  // Modals
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // --- ANIMATIONS ---
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const colorAnim = useRef(new Animated.Value(0)).current; // 0 -> 1

  const activeType = typeConfigs[typeIndex];

  // Interpolate Colors based on Type (Red <-> Green)
  const themeColor = colorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.accentRed, colors.accentGreen],
  });

  const themeBg = colorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#FEF2F2', '#ECFDF5'], // Light Red -> Light Green
  });

  useEffect(() => {
    // Entrance Animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
        easing: Easing.out(Easing.back(1.5)),
      }),
    ]).start();
  }, []);

  // Theme Transition Effect
  useEffect(() => {
    Animated.timing(colorAnim, {
      toValue: typeIndex,
      duration: 300,
      useNativeDriver: false, // Color interpolation requires false
    }).start();
  }, [typeIndex]);

  // Load Data for Editing
  useEffect(() => {
    if (editingParamId && entries) {
      const found = entries.find((e: any) => e.local_id === editingParamId);
      if (found) {
        setAmount(String(found.amount));
        setNote(found.note ?? '');
        setTypeIndex(found.type === 'in' ? 1 : 0);
        setCategory(ensureCategory(found.category));
        setDate(new Date(found.date || found.created_at));
        setEditingLocalId(found.local_id);
      }
    }
  }, [editingParamId, entries]);

  // --- HANDLERS ---
  const handleSave = () => {
    // Basic Validation
    const parsed = parseFloat(amount.replace(/,/g, ''));
    if (!amount.trim() || isNaN(parsed) || parsed <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a value greater than 0.');
      return;
    }

    const payload = {
      amount: parsed,
      type: activeType.value as 'in' | 'out',
      category: ensureCategory(category),
      note: note.trim(),
      currency: 'INR',
      date: date.toISOString(),
    };

    showToast(editingLocalId ? 'Updating...' : 'Saving...');
    navigation.goBack();

    runInBackground(async () => {
      try {
        if (editingLocalId) {
          await updateEntry({ local_id: editingLocalId, updates: payload });
          showToast('Updated successfully');
        } else {
          await addEntry({ local_id: uuidv4(), ...payload });
          showToast('Added successfully');
        }
      } catch (err) {
        showToast('Failed to save');
      }
    });
  };

  const scrollToBottom = () => {
    // Wait for keyboard to open then scroll
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      <ScreenHeader
        title={editingLocalId ? 'Edit Transaction' : 'New Transaction'}
        subtitle={dayjs(date).format('dddd, D MMMM')} // Dynamic Date Subtitle
        useSafeAreaPadding={false}
        showScrollHint={false}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            {/* 1. TYPE SEGMENTED CONTROL */}
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
                        color={isActive ? cfg.color : colors.muted}
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

            {/* 2. AMOUNT INPUT CARD */}
            <Animated.View
              style={[styles.amountCard, { backgroundColor: themeBg, borderColor: themeColor }]}
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
                  autoFocus={!editingLocalId}
                />
              </View>
            </Animated.View>

            {/* 3. DETAILS GRID */}
            <View style={styles.gridContainer}>
              {/* Category Picker */}
              <Pressable style={styles.gridCard} onPress={() => setCategoryModalVisible(true)}>
                <View style={styles.gridIconBg}>
                  <MaterialIcon name="category" size={22} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.gridLabel}>Category</Text>
                  <Text style={styles.gridValue} numberOfLines={1}>
                    {category}
                  </Text>
                </View>
                <MaterialIcon name="chevron-right" size={24} color={colors.border} />
              </Pressable>

              {/* Date Picker */}
              <Pressable style={styles.gridCard} onPress={() => setShowDatePicker(true)}>
                <View style={[styles.gridIconBg, { backgroundColor: '#eff6ff' }]}>
                  <MaterialIcon name="event" size={22} color={colors.accentBlue} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.gridLabel}>Date</Text>
                  <Text style={styles.gridValue}>{dayjs(date).format('DD MMM YYYY')}</Text>
                </View>
                <MaterialIcon name="chevron-right" size={24} color={colors.border} />
              </Pressable>
            </View>

            {/* 4. NOTE INPUT (Responsive) */}
            <View style={styles.noteSection}>
              <Text style={styles.sectionTitle}>Description</Text>
              <View style={styles.noteInputWrapper}>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder="What is this transaction for?"
                  placeholderTextColor={colors.muted}
                  multiline
                  style={styles.noteInput}
                  onFocus={scrollToBottom} // Scroll up when focused
                />
                <MaterialIcon name="edit" size={18} color={colors.muted} style={styles.noteIcon} />
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
                  onPress={() => setCategory(cat)}
                >
                  <Text style={[styles.chipText, category === cat && { color: 'white' }]}>
                    {cat}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* SPACE FOR KEYBOARD */}
            <View style={{ height: 100 }} />
          </Animated.View>
        </ScrollView>

        {/* FLOATING SAVE BUTTON */}
        <Animated.View style={[styles.footerContainer, { opacity: fadeAnim }]}>
          <Button
            title="Save Transaction"
            onPress={handleSave}
            icon={<MaterialIcon name="check" size={20} color="white" style={{ marginRight: 8 }} />}
            buttonStyle={[styles.saveBtn, { backgroundColor: activeType.color }]}
            titleStyle={{ fontWeight: '700', fontSize: 16 }}
          />
        </Animated.View>
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
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },

  /* TOGGLE */
  toggleWrapper: {
    alignItems: 'center',
    marginBottom: 20,
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 16,
    padding: 4,
    width: '100%',
    maxWidth: 300,
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
    backgroundColor: colors.card,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.muted,
  },

  /* AMOUNT CARD */
  amountCard: {
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1.5,
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
    opacity: 0.8,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  currencySymbol: {
    fontSize: 32,
    fontWeight: '700',
    marginRight: 4,
  },
  amountInput: {
    fontSize: 42,
    fontWeight: '800',
    minWidth: 100,
    textAlign: 'center',
    padding: 0, // Remove default padding
  },

  /* GRID */
  gridContainer: {
    gap: 12,
    marginBottom: 24,
  },
  gridCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 16,
  },
  gridIconBg: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#f3f4f6', // Light gray
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridLabel: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 2,
  },
  gridValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },

  /* NOTE INPUT */
  noteSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 10,
    marginLeft: 4,
  },
  noteInputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  noteInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    minHeight: 80, // Height for visibility
    textAlignVertical: 'top', // Android top align
    paddingTop: 0, // Align with icon
  },
  noteIcon: {
    marginTop: 2,
    marginLeft: 8,
  },

  /* CHIPS */
  chipScroll: {
    paddingRight: 20,
    gap: 10,
    paddingBottom: 20, // Space for shadow
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },

  /* FOOTER */
  footerContainer: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
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

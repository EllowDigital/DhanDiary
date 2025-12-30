import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Alert,
  Modal,
  ScrollView,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Platform,
  StatusBar,
  KeyboardAvoidingView,
  Keyboard,
  useWindowDimensions,
  Animated,
  UIManager,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, Button, Input } from '@rneui/themed';
import SimpleButtonGroup from '../components/SimpleButtonGroup';
import CategoryPickerModal from '../components/CategoryPickerModal';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useEntries } from '../hooks/useEntries';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../context/ToastContext';
import runInBackground from '../utils/background';
import useDelayedLoading from '../hooks/useDelayedLoading';
import FullScreenSpinner from '../components/FullScreenSpinner';
import { colors, spacing } from '../utils/design';
import { DEFAULT_CATEGORY, ensureCategory, getIconForCategory } from '../constants/categories';
import ScreenHeader from '../components/ScreenHeader';
import dayjs from 'dayjs';
import { Swipeable } from 'react-native-gesture-handler';
import { isIncome } from '../utils/transactionType';

// Fix Android Animation Layout
if (Platform.OS === 'android') {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

const resolveEntryMoment = (entry: any) => {
  const v = entry?.date || entry?.created_at;
  // normalize seconds vs ms vs ISO
  if (v == null) return dayjs();
  const num = Number(v);
  if (!Number.isNaN(num)) {
    const ms = num < 1e12 ? num * 1000 : num;
    return dayjs(ms);
  }
  return dayjs(v);
};

// --- 1. MEMOIZED LIST ITEM (Performance) ---
const SwipeableHistoryItem = React.memo(({ item, onEdit, onDelete }: any) => {
  const isInc = isIncome(item.type);
  const color = isInc ? colors.accentGreen : colors.accentRed;
  // Use category-based icon when available, fall back to type arrows
  const catIcon = getIconForCategory(item.category);
  const iconName = catIcon || (isInc ? 'arrow-downward' : 'arrow-upward');
  const dateStr = dayjs(item.date || item.created_at).format('MMM D, h:mm A');
  const swipeableRef = useRef<Swipeable>(null);

  const renderRightActions = (_: any, dragX: any) => {
    const scale = dragX.interpolate({
      inputRange: [-80, 0],
      outputRange: [1, 0],
      extrapolate: 'clamp',
    });
    return (
      <TouchableOpacity
        style={styles.rightAction}
        onPress={() => {
          swipeableRef.current?.close();
          onDelete();
        }}
      >
        <Animated.View style={{ transform: [{ scale }], alignItems: 'center' }}>
          <MaterialIcon name="delete" size={24} color="white" />
          <Text style={styles.actionText}>Delete</Text>
        </Animated.View>
      </TouchableOpacity>
    );
  };

  const renderLeftActions = (_: any, dragX: any) => {
    const scale = dragX.interpolate({
      inputRange: [0, 80],
      outputRange: [0, 1],
      extrapolate: 'clamp',
    });
    return (
      <TouchableOpacity
        style={styles.leftAction}
        onPress={() => {
          swipeableRef.current?.close();
          onEdit();
        }}
      >
        <Animated.View style={{ transform: [{ scale }], alignItems: 'center' }}>
          <MaterialIcon name="edit" size={24} color="white" />
          <Text style={styles.actionText}>Edit</Text>
        </Animated.View>
      </TouchableOpacity>
    );
  };

  return (
    <Swipeable
      ref={swipeableRef}
      renderLeftActions={renderLeftActions}
      renderRightActions={renderRightActions}
      containerStyle={styles.swipeContainer}
      friction={2}
      overshootRight={false}
      overshootLeft={false}
    >
      <View style={styles.compactRow}>
        <View style={[styles.compactIcon, { backgroundColor: isInc ? '#ecfdf5' : '#fef2f2' }]}>
          <MaterialIcon
            name={iconName as any}
            size={20}
            color={isInc ? colors.accentGreen : colors.accentRed}
          />
        </View>
        <View style={styles.compactContent}>
          <View style={styles.compactHeader}>
            <Text style={styles.compactCategory} numberOfLines={1}>
              {item.category}
            </Text>
            <Text style={[styles.compactAmount, { color }]}>
              {isInc ? '+' : '-'}₹{Number(item.amount).toLocaleString()}
            </Text>
          </View>
          <View style={styles.compactSubRow}>
            <Text style={styles.compactNote} numberOfLines={1}>
              {item.note || 'No description'}
            </Text>
            <Text style={styles.compactDate}>{dateStr}</Text>
          </View>
        </View>
      </View>
    </Swipeable>
  );
});

// --- 2. ISOLATED MODAL COMPONENT (Fixes Lag & Blank Screen) ---
const EditTransactionModal = React.memo(({ visible, entry, onClose, onSave }: any) => {
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(DEFAULT_CATEGORY);
  const [note, setNote] = useState('');
  const [typeIndex, setTypeIndex] = useState(0);
  const [date, setDate] = useState<Date>(new Date());

  // Pickers
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  // Initialize state when entry changes
  useEffect(() => {
    if (entry) {
      setAmount(String(entry.amount));
      setCategory(ensureCategory(entry.category));
      setNote(entry.note || '');
      setTypeIndex(isIncome(entry.type) ? 1 : 0);
      // normalize date value
      const v = entry.date || entry.created_at;
      if (v == null) setDate(new Date());
      else {
        const n = Number(v);
        if (!Number.isNaN(n)) setDate(new Date(n < 1e12 ? n * 1000 : n));
        else {
          const parsed = Date.parse(v);
          setDate(!Number.isNaN(parsed) ? new Date(parsed) : new Date());
        }
      }
    }
  }, [entry]);

  const handleSave = () => {
    if (saving) return;
    const clean = amount.replace(/,/g, '').trim();
    const amt = parseFloat(clean);
    if (!clean || isNaN(amt) || amt <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid number.');
      return;
    }
    setSaving(true);
    try {
      onSave(entry.local_id, {
        amount: amt,
        category,
        note,
        type: typeIndex === 1 ? 'in' : 'out',
        date,
      });
      onClose();
    } finally {
      // component may unmount after onClose; attempt to reset saving
      try {
        setSaving(false);
      } catch (e) { }
    }
  };

  const quickAmounts = ['100', '500', '1000', '2000'];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      {/* Fix: KeyboardAvoidingView must wrap the View directly */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.sheetHandle} />

              <View style={styles.modalHeaderRow}>
                <Text style={styles.modalTitle}>Edit Entry</Text>
                <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                  <MaterialIcon name="close" size={22} color={colors.text} />
                </TouchableOpacity>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: 20 }}
              >
                <SimpleButtonGroup
                  buttons={['Expense', 'Income']}
                  selectedIndex={typeIndex}
                  onPress={setTypeIndex}
                  containerStyle={{ marginBottom: 16 }}
                />

                <Input
                  label="Amount"
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="numeric"
                  inputContainerStyle={styles.modalInput}
                  inputStyle={{ color: colors.text }}
                  placeholderTextColor={colors.muted}
                  selectionColor={colors.primary}
                  leftIcon={<MaterialIcon name="currency-rupee" size={16} color={colors.muted} />}
                  renderErrorMessage={false}
                  autoFocus
                />

                <View style={styles.quickRow}>
                  {quickAmounts.map((val) => (
                    <TouchableOpacity
                      key={val}
                      onPress={() => setAmount(val)}
                      style={styles.quickChip}
                    >
                      <Text style={styles.quickChipText}>₹{val}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.rowInputs}>
                  <TouchableOpacity
                    style={[styles.pickerBtn, { marginRight: 8 }]}
                    onPress={() => setShowCatPicker(true)}
                  >
                    <Text style={styles.pickerLabel}>Category</Text>
                    <Text style={styles.pickerValue}>{category}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.pickerBtn}
                    onPress={() => setShowDatePicker(true)}
                  >
                    <Text style={styles.pickerLabel}>Date</Text>
                    <Text style={styles.pickerValue}>{dayjs(date).format('DD MMM')}</Text>
                  </TouchableOpacity>
                </View>

                <Input
                  label="Note"
                  value={note}
                  onChangeText={setNote}
                  inputContainerStyle={styles.modalInput}
                  inputStyle={{ color: colors.text }}
                  placeholder="Optional description"
                  placeholderTextColor={colors.muted}
                  selectionColor={colors.primary}
                  renderErrorMessage={false}
                />

                <Button
                  title="Save Changes"
                  onPress={handleSave}
                  loading={saving}
                  disabled={saving}
                  buttonStyle={{ backgroundColor: colors.primary, borderRadius: 12, height: 48 }}
                  containerStyle={{ marginTop: 20 }}
                />
              </ScrollView>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      <CategoryPickerModal
        visible={showCatPicker}
        onClose={() => setShowCatPicker(false)}
        onSelect={(c) => {
          setCategory(c);
          setShowCatPicker(false);
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
    </Modal>
  );
});

// --- 3. MAIN SCREEN ---
const HistoryScreen = () => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { entries = [], isLoading, updateEntry, deleteEntry } = useEntries(user?.id);
  const { showToast } = useToast();
  const { width } = useWindowDimensions();

  const showLoading = useDelayedLoading(Boolean(isLoading));

  // --- FILTERS ---
  const [quickFilter, setQuickFilter] = useState<'ALL' | 'WEEK' | 'MONTH'>('ALL');

  // --- EDIT ---
  const [editingEntry, setEditingEntry] = useState<any | null>(null);

  // --- LOGIC ---
  const filtered = useMemo(() => {
    let list = entries || [];
    const now = dayjs();

    if (quickFilter === 'WEEK') {
      const start = now.subtract(6, 'day').startOf('day');
      list = list.filter((e) => !resolveEntryMoment(e).isBefore(start));
    } else if (quickFilter === 'MONTH') {
      const start = now.startOf('month');
      list = list.filter((e) => resolveEntryMoment(e).isSame(start, 'month'));
    }

    return list.sort((a, b) => resolveEntryMoment(b).valueOf() - resolveEntryMoment(a).valueOf());
  }, [entries, quickFilter]);

  const summary = useMemo(() => {
    let net = 0;
    filtered.forEach((e) => {
      const val = Number(e.amount) || 0;
      net += isIncome(e.type) ? val : -val;
    });
    return { net, count: filtered.length };
  }, [filtered]);

  // --- HANDLERS ---
  const handleSaveEdit = useCallback(
    async (id: string, updates: any) => {
      setEditingEntry(null); // Close first for perceived speed
      showToast('Updating...');
      runInBackground(async () => {
        try {
          await updateEntry({ local_id: id, updates });
          showToast('Updated successfully');
        } catch (err) {
          showToast('Update failed');
        }
      });
    },
    [updateEntry]
  );

  const handleDelete = useCallback(
    (id: string) => {
      Alert.alert('Delete Transaction', 'This cannot be undone.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            runInBackground(async () => {
              await deleteEntry(id);
              showToast('Deleted');
            });
          },
        },
      ]);
    },
    [deleteEntry]
  );

  // --- HEADER ---
  const ListHeader = useMemo(
    () => (
      <View style={styles.headerContainer}>
        {/* Summary Card */}
        <View style={styles.compactHero}>
          <View>
            <Text style={styles.heroLabel}>Net Balance</Text>
            <Text
              style={[
                styles.heroValue,
                { color: summary.net >= 0 ? colors.primary : colors.accentRed },
              ]}
            >
              {summary.net >= 0 ? '+' : ''}₹{Math.abs(summary.net).toLocaleString()}
            </Text>
          </View>
          <View style={styles.countChip}>
            <Text style={styles.countText}>{summary.count} items</Text>
          </View>
        </View>

        {/* Quick Filters */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {['ALL', 'WEEK', 'MONTH'].map((f) => (
            <TouchableOpacity
              key={f}
              onPress={() => setQuickFilter(f as any)}
              style={[styles.filterChip, quickFilter === f && styles.filterChipActive]}
            >
              <Text
                style={[styles.filterChipText, quickFilter === f && styles.filterChipTextActive]}
              >
                {f === 'ALL' ? 'All Time' : f === 'WEEK' ? 'This Week' : 'This Month'}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    ),
    [summary, quickFilter]
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <View style={{ paddingHorizontal: width >= 768 ? spacing(4) : 0 }}>
        <ScreenHeader
          title="History"
          subtitle="Transaction Log"
          showScrollHint={false}
          useSafeAreaPadding={false}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.local_id}
        renderItem={({ item }) => (
          <SwipeableHistoryItem
            item={item}
            onEdit={() => setEditingEntry(item)}
            onDelete={() => handleDelete(item.local_id)}
          />
        )}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 80 }]}
        initialNumToRender={10}
        windowSize={5}
        removeClippedSubviews={true}
        ListEmptyComponent={
          !showLoading ? (
            <View style={styles.emptyState}>
              <MaterialIcon name="receipt-long" size={48} color={colors.border} />
              <Text style={styles.emptyText}>No records found</Text>
            </View>
          ) : null
        }
      />

      <FullScreenSpinner visible={showLoading} />

      {/* Optimized Modal */}
      <EditTransactionModal
        visible={!!editingEntry}
        entry={editingEntry}
        onClose={() => setEditingEntry(null)}
        onSave={handleSaveEdit}
      />
    </SafeAreaView>
  );
};

export default HistoryScreen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  listContent: { paddingHorizontal: 16 },
  headerContainer: { marginBottom: 12, marginTop: 8 },

  // Hero
  compactHero: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 2,
  },
  heroLabel: { fontSize: 11, color: colors.muted, textTransform: 'uppercase', fontWeight: '700' },
  heroValue: { fontSize: 24, fontWeight: '800', marginTop: 2 },
  countChip: {
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  countText: { fontSize: 12, fontWeight: '600', color: colors.text },

  // Chips
  chipRow: { gap: 8, paddingBottom: 8 },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
  },
  filterChipActive: { backgroundColor: colors.text, borderColor: colors.text },
  filterChipText: { fontSize: 13, fontWeight: '600', color: colors.muted },
  filterChipTextActive: { color: colors.background },

  // List Item
  swipeContainer: { marginBottom: 8, borderRadius: 14, overflow: 'hidden' },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.03)',
    height: 72,
  },
  compactIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  compactContent: { flex: 1 },
  compactHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  compactCategory: { fontSize: 15, fontWeight: '600', color: colors.text, flex: 1, marginRight: 8 },
  compactAmount: { fontSize: 15, fontWeight: '700' },
  compactSubRow: { flexDirection: 'row', justifyContent: 'space-between' },
  compactNote: { fontSize: 12, color: colors.muted, flex: 1, marginRight: 8 },
  compactDate: { fontSize: 11, color: colors.subtleText },

  // Swipe Actions
  leftAction: {
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    width: 70,
    height: '100%',
    borderRadius: 14,
    marginRight: 8,
  },
  rightAction: {
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    width: 70,
    height: '100%',
    borderRadius: 14,
    marginLeft: 8,
  },
  actionText: { color: 'white', fontSize: 11, fontWeight: '600', marginTop: 2 },

  // Empty State
  emptyState: { alignItems: 'center', paddingVertical: 60, opacity: 0.6 },
  emptyText: { marginTop: 12, color: colors.muted, fontSize: 15 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '90%',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  closeBtn: { padding: 4, backgroundColor: colors.surfaceMuted, borderRadius: 20 },
  modalInput: { borderBottomWidth: 1, borderColor: colors.border, marginBottom: 0 },

  // Quick Chips in Modal
  quickRow: { flexDirection: 'row', gap: 8, marginBottom: 16, marginTop: -8 },
  quickChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickChipText: { fontSize: 12, color: colors.text, fontWeight: '600' },

  rowInputs: { flexDirection: 'row', marginBottom: 16 },
  pickerBtn: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10 },
  pickerLabel: { fontSize: 10, color: colors.muted, marginBottom: 2, textTransform: 'uppercase' },
  pickerValue: { fontSize: 14, color: colors.text, fontWeight: '600' },
});

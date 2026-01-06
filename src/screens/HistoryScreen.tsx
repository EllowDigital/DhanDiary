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
  LayoutAnimation,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, Button, Input } from '@rneui/themed';
import { Swipeable } from 'react-native-gesture-handler';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import dayjs from 'dayjs';

// --- CUSTOM IMPORTS (Assumed Paths) ---
import SimpleButtonGroup from '../components/SimpleButtonGroup';
import CategoryPickerModal from '../components/CategoryPickerModal';
import { useEntries } from '../hooks/useEntries';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../context/ToastContext';
import { getTransactionByLocalId } from '../db/transactions';
import runInBackground from '../utils/background';
import useDelayedLoading from '../hooks/useDelayedLoading';
import FullScreenSpinner from '../components/FullScreenSpinner';
import { colors, spacing } from '../utils/design';
import { DEFAULT_CATEGORY, ensureCategory, getIconForCategory } from '../constants/categories';
import ScreenHeader from '../components/ScreenHeader';
import { formatDate } from '../utils/date';
import { isIncome } from '../utils/transactionType';

// --- TYPES ---
interface TransactionEntry {
  local_id: string;
  amount: number | string;
  category: string;
  type: 'in' | 'out';
  note?: string;
  date?: string | number | Date;
  created_at?: string | number | Date;
  sync_status?: number; // 0=pending, 1=synced, 2=deleted
  need_sync?: number; // 0/1
  deleted_at?: string | null;
}

type PreparedEntry = TransactionEntry & {
  __ts: number;
  __amountNum: number;
  __dateStr: string;
  __amountStr: string;
  __isIncome: boolean;
};

interface EditModalProps {
  visible: boolean;
  entryId: string | null;
  onClose: () => void;
  onSave: (id: string, updates: Partial<TransactionEntry>) => Promise<void>;
}

// --- SETUP ---
if (Platform.OS === 'android') {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

const resolveEntryMoment = (entry: TransactionEntry) => {
  const v = entry?.date || entry?.created_at;
  if (v === null || v === undefined) return dayjs();
  const num = Number(v);
  if (!Number.isNaN(num)) {
    // If it's a number, check if it's seconds or ms (heuristic: 1e12 is roughly year 2001 in ms)
    const ms = num < 1e12 ? num * 1000 : num;
    return dayjs(ms);
  }
  return dayjs(v);
};

const inrFormatter = new Intl.NumberFormat('en-IN');

// --- 1. SWIPEABLE LIST ITEM ---
const SwipeableHistoryItem = React.memo(
  ({
    item,
    onEdit,
    onDelete,
  }: {
    item: PreparedEntry;
    onEdit: (entry: PreparedEntry) => void;
    onDelete: (id: string) => void;
  }) => {
    const isInc = item.__isIncome;
    const color = isInc ? colors.accentGreen || '#10B981' : colors.accentRed || '#EF4444';
    const catIcon = getIconForCategory(item.category);
    const iconName = catIcon || (isInc ? 'arrow-downward' : 'arrow-upward');
    const dateStr = item.__dateStr;
    const swipeableRef = useRef<Swipeable>(null);

    const renderRightActions = (
      _progress: Animated.AnimatedInterpolation<number>,
      dragX: Animated.AnimatedInterpolation<number>
    ) => {
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
            onDelete(item.local_id);
          }}
        >
          <Animated.View style={{ transform: [{ scale }], alignItems: 'center' }}>
            <MaterialIcon name="delete" size={24} color="white" />
            <Text style={styles.actionText}>Delete</Text>
          </Animated.View>
        </TouchableOpacity>
      );
    };

    const renderLeftActions = (
      _progress: Animated.AnimatedInterpolation<number>,
      dragX: Animated.AnimatedInterpolation<number>
    ) => {
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
            onEdit(item);
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
          <View style={[styles.compactIcon, { backgroundColor: isInc ? '#ECFDF5' : '#FEF2F2' }]}>
            <MaterialIcon name={iconName as any} size={20} color={color} />
          </View>
          <View style={styles.compactContent}>
            <View style={styles.compactHeader}>
              <Text style={styles.compactCategory} numberOfLines={1}>
                {item.category}
              </Text>
              {/* Sync Status Badge */}
              <View style={styles.syncIconWrapper}>
                {item.sync_status === 1 ? (
                  <MaterialIcon name="check-circle" size={14} color="#10B981" />
                ) : item.sync_status === 0 ? (
                  <MaterialIcon name="access-time" size={14} color="#F59E0B" />
                ) : item.sync_status === 2 ? (
                  <MaterialIcon name="delete" size={14} color="#EF4444" />
                ) : null}
              </View>
              <Text style={[styles.compactAmount, { color }]}>
                {isInc ? '+' : '-'}₹{item.__amountStr}
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
  }
);

// --- 2. EDIT MODAL ---
const EditTransactionModal = React.memo(({ visible, entryId, onClose, onSave }: EditModalProps) => {
  const insets = useSafeAreaInsets();
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(DEFAULT_CATEGORY);
  const [note, setNote] = useState('');
  const [typeIndex, setTypeIndex] = useState(0);
  const [date, setDate] = useState<Date>(new Date());

  const [showCatPicker, setShowCatPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    if (!visible || !entryId) return;

    (async () => {
      try {
        const row = await getTransactionByLocalId(String(entryId));
        if (cancelled) return;
        if (!row) {
          onClose();
          return;
        }

        // Tombstone guard
        if ((row as any).deleted_at || Number((row as any).sync_status) === 2) {
          Alert.alert('Cannot edit', 'This transaction is deleted.');
          onClose();
          return;
        }

        const applyRowToState = () => {
          if (cancelled) return;
          setAmount(String((row as any).amount ?? ''));
          setCategory(ensureCategory((row as any).category));
          setNote((row as any).note || '');
          setTypeIndex(isIncome((row as any).type) ? 1 : 0);

          const v = (row as any).date || (row as any).created_at;
          if (v === null || v === undefined) {
            setDate(new Date());
          } else {
            const n = Number(v);
            if (!Number.isNaN(n)) {
              setDate(new Date(n < 1e12 ? n * 1000 : n));
            } else {
              const parsed = Date.parse(String(v));
              setDate(!Number.isNaN(parsed) ? new Date(parsed) : new Date());
            }
          }
        };

        // Optional: warn if pending sync
        if (Number((row as any).need_sync) === 1) {
          Alert.alert('Pending changes', 'This entry is waiting to sync. Edit anyway?', [
            { text: 'Cancel', style: 'cancel', onPress: onClose },
            { text: 'Edit', onPress: applyRowToState },
          ]);
          return;
        }

        applyRowToState();
      } catch (e) {
        onClose();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [entryId, onClose, visible]);

  const handleSave = async () => {
    if (!entryId) return;
    if (isSubmittingRef.current) return;

    const clean = amount.replace(/,/g, '').trim();
    const amt = parseFloat(clean);

    if (!clean || isNaN(amt) || amt <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid number.');
      return;
    }

    try {
      isSubmittingRef.current = true;
      await onSave(String(entryId), {
        amount: amt,
        category,
        note,
        type: typeIndex === 1 ? 'in' : 'out',
        date: date.toISOString(),
      });
      onClose();
    } catch (e) {
      Alert.alert('Error', 'Failed to save changes.');
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const onDateChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    if (selectedDate) {
      setDate(selectedDate);
    }
  };

  const quickAmounts = ['100', '500', '1000', '2000'];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
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
                contentContainerStyle={{ paddingBottom: Math.max(24, insets.bottom + 16) }}
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
                    <Text style={styles.pickerValue}>{formatDate(date, 'DD MMM YYYY')}</Text>
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
                  renderErrorMessage={false}
                />

                <Button
                  title="Save Changes"
                  onPress={handleSave}
                  buttonStyle={styles.saveBtn}
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
          onChange={onDateChange}
          maximumDate={new Date()}
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
  const [quickFilter, setQuickFilter] = useState<'ALL' | 'WEEK' | 'MONTH'>('ALL');
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);

  const toggleFilter = useCallback((f: 'ALL' | 'WEEK' | 'MONTH') => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setQuickFilter(f);
  }, []);

  // --- FILTER LOGIC ---
  const preparedEntries = useMemo<PreparedEntry[]>(() => {
    const list = entries || [];
    return list.map((e) => {
      const ts = resolveEntryMoment(e).valueOf();
      const amountNum = Number(e.amount) || 0;
      return {
        ...e,
        __ts: ts,
        __amountNum: amountNum,
        __dateStr: formatDate(e.date || e.created_at),
        __amountStr: inrFormatter.format(amountNum),
        __isIncome: isIncome(e.type),
      };
    });
  }, [entries]);

  const filtered = useMemo<PreparedEntry[]>(() => {
    const now = dayjs();
    const startWeekTs = now.subtract(6, 'day').startOf('day').valueOf();
    const startMonthTs = now.startOf('month').valueOf();

    let list = preparedEntries;
    if (quickFilter === 'WEEK') {
      list = preparedEntries.filter((e) => e.__ts >= startWeekTs);
    } else if (quickFilter === 'MONTH') {
      list = preparedEntries.filter((e) => e.__ts >= startMonthTs);
    }

    // Avoid mutating the source array
    return [...list].sort((a, b) => b.__ts - a.__ts);
  }, [preparedEntries, quickFilter]);

  const summary = useMemo(() => {
    let net = 0;
    filtered.forEach((e) => {
      net += e.__isIncome ? e.__amountNum : -e.__amountNum;
    });
    return { net, count: filtered.length };
  }, [filtered]);

  // --- ACTIONS ---
  const handleSaveEdit = useCallback(
    async (id: string, updates: Partial<TransactionEntry>) => {
      try {
        await updateEntry({ local_id: id, updates });
        showToast('Updated successfully');
        setEditingEntryId(null);
      } catch (err) {
        showToast('Update failed', 'error');
        // Rethrow to let the modal stay open if needed, or handle here
        throw err;
      }
    },
    [updateEntry, showToast]
  );

  const handleDelete = useCallback(
    (id: string) => {
      Alert.alert(
        'Delete Transaction',
        'This will delete it locally now and remove it from all devices after the next sync.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              runInBackground(async () => {
                try {
                  await deleteEntry(id);
                  showToast('Deleted');
                } catch (e) {
                  showToast('Delete failed', 'error');
                }
              });
            },
          },
        ]
      );
    },
    [deleteEntry, showToast]
  );

  const attemptEdit = useCallback((item: TransactionEntry) => {
    // Authoritative checks are done inside the modal via fresh SQLite read.
    setEditingEntryId(item.local_id);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: PreparedEntry }) => (
      <SwipeableHistoryItem item={item} onEdit={attemptEdit} onDelete={handleDelete} />
    ),
    [attemptEdit, handleDelete]
  );

  const renderHeader = useMemo(
    () => (
      <View style={styles.headerContainer}>
        <View style={styles.compactHero}>
          <View>
            <Text style={styles.heroLabel}>Net Balance</Text>
            <Text
              style={[
                styles.heroValue,
                {
                  color:
                    summary.net >= 0 ? colors.primary || '#2563EB' : colors.accentRed || '#EF4444',
                },
              ]}
            >
              {summary.net >= 0 ? '+' : ''}₹{Math.abs(summary.net).toLocaleString()}
            </Text>
          </View>
          <View style={styles.countChip}>
            <Text style={styles.countText}>{summary.count} items</Text>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {(['ALL', 'WEEK', 'MONTH'] as const).map((f) => (
            <TouchableOpacity
              key={f}
              onPress={() => toggleFilter(f)}
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
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
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
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 80 }]}
        initialNumToRender={10}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        showsVerticalScrollIndicator={false}
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

      <EditTransactionModal
        visible={!!editingEntryId}
        entryId={editingEntryId}
        onClose={() => setEditingEntryId(null)}
        onSave={handleSaveEdit}
      />
    </SafeAreaView>
  );
};

export default HistoryScreen;

// --- STYLES ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background || '#F8FAFC' },
  listContent: { paddingHorizontal: 16 },
  headerContainer: { marginBottom: 12, marginTop: 8 },

  // Hero Card
  compactHero: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.card || '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border || '#E2E8F0',
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 2,
  },
  heroLabel: {
    fontSize: 11,
    color: colors.muted || '#94A3B8',
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  heroValue: { fontSize: 24, fontWeight: '800', marginTop: 2 },
  countChip: {
    backgroundColor: colors.surfaceMuted || '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  countText: { fontSize: 12, fontWeight: '600', color: colors.text || '#1E293B' },

  // Filter Chips
  chipRow: { gap: 8, paddingBottom: 8 },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.card || '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border || '#E2E8F0',
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: colors.text || '#1E293B',
    borderColor: colors.text || '#1E293B',
  },
  filterChipText: { fontSize: 13, fontWeight: '600', color: colors.muted || '#94A3B8' },
  filterChipTextActive: { color: colors.background || '#FFFFFF' },

  // List Item
  swipeContainer: { marginBottom: 8, borderRadius: 14, overflow: 'hidden' },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card || '#FFFFFF',
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
  compactHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  compactCategory: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text || '#1E293B',
    flex: 1,
    marginRight: 8,
    flexShrink: 1,
  },
  syncIconWrapper: { marginLeft: 8, justifyContent: 'center' },
  compactAmount: { fontSize: 15, fontWeight: '700', marginLeft: 'auto' },
  compactSubRow: { flexDirection: 'row', justifyContent: 'space-between' },
  compactNote: { fontSize: 12, color: colors.muted || '#94A3B8', flex: 1, marginRight: 8 },
  compactDate: { fontSize: 11, color: colors.subtleText || '#CBD5E1' },

  // Actions
  leftAction: {
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    width: 70,
    height: '100%',
    borderRadius: 14,
    marginRight: 8,
  },
  rightAction: {
    backgroundColor: '#EF4444',
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
  emptyText: { marginTop: 12, color: colors.muted || '#94A3B8', fontSize: 15 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: colors.card || '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '90%',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: colors.border || '#E2E8F0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text || '#1E293B' },
  closeBtn: { padding: 4, backgroundColor: colors.surfaceMuted || '#F1F5F9', borderRadius: 20 },
  modalInput: { borderBottomWidth: 1, borderColor: colors.border || '#E2E8F0', marginBottom: 12 },
  saveBtn: { backgroundColor: colors.primary || '#2563EB', borderRadius: 12, height: 48 },

  // Quick Chips
  quickRow: { flexDirection: 'row', gap: 8, marginBottom: 16, marginTop: -8 },
  quickChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted || '#F1F5F9',
    borderWidth: 1,
    borderColor: colors.border || '#E2E8F0',
  },
  quickChipText: { fontSize: 12, color: colors.text || '#1E293B', fontWeight: '600' },

  rowInputs: { flexDirection: 'row', marginBottom: 16 },
  pickerBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border || '#E2E8F0',
    borderRadius: 12,
    padding: 10,
  },
  pickerLabel: {
    fontSize: 10,
    color: colors.muted || '#94A3B8',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  pickerValue: { fontSize: 14, color: colors.text || '#1E293B', fontWeight: '600' },
});

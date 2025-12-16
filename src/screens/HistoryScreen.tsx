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
  LayoutAnimation,
  Platform,
  StatusBar,
  KeyboardAvoidingView,
  Keyboard,
  useWindowDimensions,
  Animated,
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
import { DEFAULT_CATEGORY, ensureCategory } from '../constants/categories';
import ScreenHeader from '../components/ScreenHeader';
import dayjs from 'dayjs';
import { Swipeable } from 'react-native-gesture-handler';

const resolveEntryMoment = (entry: any) => dayjs(entry?.date || entry?.created_at);

// --- SWIPEABLE LIST ITEM ---
const SwipeableHistoryItem = React.memo(({ item, onEdit, onDelete }: any) => {
  const isIncome = item.type === 'in';
  const color = isIncome ? colors.accentGreen : colors.text;
  const iconName = isIncome ? 'arrow-downward' : 'arrow-upward';
  const dateStr = dayjs(item.date || item.created_at).format('MMM D, h:mm A');
  const swipeableRef = useRef<Swipeable>(null);

  // Left Action (Revealed when Swiping Right ->) => EDIT
  const renderLeftActions = (progress: any, dragX: any) => {
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

  // Right Action (Revealed when Swiping Left <-) => DELETE
  const renderRightActions = (progress: any, dragX: any) => {
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

  return (
    <Swipeable
      ref={swipeableRef}
      renderLeftActions={renderLeftActions}
      renderRightActions={renderRightActions}
      containerStyle={styles.swipeContainer}
      friction={2}
      leftThreshold={40}
      rightThreshold={40}
    >
      <View style={styles.compactRow}>
        <View style={[styles.compactIcon, { backgroundColor: isIncome ? '#ecfdf5' : '#fef2f2' }]}>
          <MaterialIcon
            name={iconName}
            size={18}
            color={isIncome ? colors.accentGreen : colors.accentRed}
          />
        </View>
        <View style={styles.compactContent}>
          <View style={styles.compactHeader}>
            <Text style={styles.compactCategory} numberOfLines={1}>
              {item.category}
            </Text>
            <Text style={[styles.compactAmount, { color }]}>
              {isIncome ? '+' : '-'}₹{Number(item.amount).toLocaleString()}
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

const HistoryScreen = () => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const {
    entries = [],
    isLoading,
    updateEntry,
    deleteEntry,
    queryError,
    listenerError,
  } = useEntries(user?.uid);
  const { showToast } = useToast();
  const _indexToastShown = useRef(false);
  React.useEffect(() => {
    const isMissing =
      (queryError as any)?.code === 'missing-index' ||
      String((listenerError as any)?.message || '').includes('requires an index');
    if (isMissing && !_indexToastShown.current) {
      _indexToastShown.current = true;
      console.warn('Firestore composite index required or building.');
      showToast('Loading delayed — syncing data. Please try again shortly.');
    }
  }, [queryError, listenerError, showToast]);
  const showLoading = useDelayedLoading(Boolean(isLoading));
  const { width, height } = useWindowDimensions();

  // Keyboard handling for edit modal to ensure inputs remain visible on Android/iOS
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      setKeyboardHeight(e.endCoordinates?.height || 250);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // --- FILTERS STATE ---
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [quickFilter, setQuickFilter] = useState<'ALL' | 'WEEK' | 'MONTH'>('ALL');

  // Advanced Filters
  const [typeIndex, setTypeIndex] = useState(0); // 0:All, 1:In, 2:Out
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('');

  // Picker visibility
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  // --- EDIT STATE ---
  const [editingEntry, setEditingEntry] = useState<any | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editCategory, setEditCategory] = useState(DEFAULT_CATEGORY);
  const [editNote, setEditNote] = useState('');
  const [editTypeIndex, setEditTypeIndex] = useState(0);
  const [editDate, setEditDate] = useState<Date | null>(null);
  const [showEditDatePicker, setShowEditDatePicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  // --- FILTER LOGIC ---
  const filtered = useMemo(() => {
    let list = entries || [];
    const now = dayjs();
    const quickStart = quickFilter === 'WEEK' ? now.subtract(6, 'day').startOf('day') : null;
    const quickMonth = quickFilter === 'MONTH' ? now.startOf('month') : null;
    const rangeStart = startDate ? dayjs(startDate).startOf('day') : null;
    const rangeEnd = endDate ? dayjs(endDate).endOf('day') : null;

    if (quickFilter === 'WEEK' && quickStart) {
      list = list.filter((entry) => !resolveEntryMoment(entry).isBefore(quickStart));
    } else if (quickFilter === 'MONTH' && quickMonth) {
      list = list.filter((entry) => resolveEntryMoment(entry).isSame(quickMonth, 'month'));
    }

    if (typeIndex === 1) list = list.filter((e) => e.type === 'in');
    if (typeIndex === 2) list = list.filter((e) => e.type === 'out');

    if (rangeStart) {
      list = list.filter((entry) => !resolveEntryMoment(entry).isBefore(rangeStart));
    }
    if (rangeEnd) {
      list = list.filter((entry) => !resolveEntryMoment(entry).isAfter(rangeEnd));
    }

    if (categoryFilter) {
      const q = categoryFilter.toLowerCase();
      list = list.filter((entry) => (entry.category || '').toLowerCase().includes(q));
    }

    return [...list].sort(
      (a, b) => resolveEntryMoment(b).valueOf() - resolveEntryMoment(a).valueOf()
    );
  }, [entries, typeIndex, startDate, endDate, categoryFilter, quickFilter]);

  // --- SUMMARY STATS ---
  const summary = useMemo(() => {
    let totalIn = 0;
    let totalOut = 0;
    filtered.forEach((e) => {
      const val = Number(e.amount) || 0;
      if (e.type === 'in') totalIn += val;
      else totalOut += val;
    });
    return {
      net: totalIn - totalOut,
      count: filtered.length,
    };
  }, [filtered]);

  // --- HANDLERS ---
  const toggleFilters = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setFiltersExpanded(!filtersExpanded);
  };

  const clearFilters = () => {
    setTypeIndex(0);
    setStartDate(null);
    setEndDate(null);
    setCategoryFilter('');
    setQuickFilter('ALL');
  };

  const openEdit = useCallback((item: any) => {
    setEditingEntry(item);
    setEditAmount(String(item.amount));
    setEditCategory(ensureCategory(item.category));
    setEditNote(item.note || '');
    setEditTypeIndex(item.type === 'in' ? 1 : 0);
    setEditDate(new Date(item.date || item.created_at));
  }, []);

  const handleSaveEdit = async () => {
    if (!editingEntry) return;
    const amt = parseFloat(editAmount);
    if (isNaN(amt) || amt <= 0)
      return Alert.alert('Invalid Amount', 'Please enter a valid number.');

    setEditingEntry(null);
    showToast('Updating...');

    runInBackground(async () => {
      try {
        const updates: any = {
          amount: amt,
          category: editCategory,
          note: editNote,
          type: editTypeIndex === 1 ? 'in' : 'out',
          date: editDate,
        };
        await updateEntry({ local_id: editingEntry.local_id, updates });
        showToast('Updated successfully');
      } catch (err: any) {
        showToast('Update failed');
      }
    });
  };

  const handleDelete = useCallback(
    (id: string) => {
      Alert.alert('Delete Transaction', 'This cannot be undone.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            // Visual feedback before deletion
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            showToast('Deleting...');
            runInBackground(async () => {
              await deleteEntry(id);
              showToast('Deleted');
            });
          },
        },
      ]);
    },
    [deleteEntry, showToast]
  );

  const quickAmounts = ['100', '500', '1000', '2000'];

  // --- HEADER RENDER ---
  const renderHeader = () => (
    <View style={styles.headerContainer}>
      {/* Compact Summary Card */}
      <View style={styles.compactHero}>
        <View>
          <Text style={styles.heroLabel}>Net Result (Selected Period)</Text>
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
          <Text style={styles.countText}>{summary.count} Txns</Text>
        </View>
      </View>

      {/* Quick Filter Chips */}
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
            <Text style={[styles.filterChipText, quickFilter === f && styles.filterChipTextActive]}>
              {f === 'ALL' ? 'All Time' : f === 'WEEK' ? 'This Week' : 'This Month'}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.filterIconBtn} onPress={toggleFilters}>
          <MaterialIcon
            name="tune"
            size={20}
            color={filtersExpanded ? colors.primary : colors.muted}
          />
        </TouchableOpacity>
      </ScrollView>

      {/* Expandable Advanced Filters */}
      {filtersExpanded && (
        <View style={styles.advancedFilters}>
          <SimpleButtonGroup
            buttons={['All Types', 'Income', 'Expense']}
            selectedIndex={typeIndex}
            onPress={setTypeIndex}
            containerStyle={{ marginBottom: 12, height: 36 }}
            textStyle={{ fontSize: 13 }}
          />

          <View style={styles.dateRow}>
            <Button
              title={startDate ? dayjs(startDate).format('DD MMM') : 'Start'}
              type="outline"
              buttonStyle={styles.dateBtn}
              titleStyle={styles.dateBtnText}
              onPress={() => setShowStartPicker(true)}
              icon={
                <MaterialIcon
                  name="calendar-today"
                  size={14}
                  color={colors.primary}
                  style={{ marginRight: 4 }}
                />
              }
            />
            <Text style={{ alignSelf: 'center', color: colors.muted }}>-</Text>
            <Button
              title={endDate ? dayjs(endDate).format('DD MMM') : 'End'}
              type="outline"
              buttonStyle={styles.dateBtn}
              titleStyle={styles.dateBtnText}
              onPress={() => setShowEndPicker(true)}
              icon={
                <MaterialIcon
                  name="calendar-today"
                  size={14}
                  color={colors.primary}
                  style={{ marginRight: 4 }}
                />
              }
            />
          </View>

          {(showStartPicker || showEndPicker) && (
            <DateTimePicker
              value={new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(e, d) => {
                if (showStartPicker) {
                  setShowStartPicker(false);
                  if (d) setStartDate(d);
                } else {
                  setShowEndPicker(false);
                  if (d) setEndDate(d);
                }
              }}
            />
          )}

          <Input
            placeholder="Search category or notes..."
            value={categoryFilter}
            onChangeText={setCategoryFilter}
            inputContainerStyle={styles.searchInput}
            inputStyle={{ fontSize: 14 }}
            leftIcon={<MaterialIcon name="search" size={18} color={colors.muted} />}
          />

          <TouchableOpacity onPress={clearFilters} style={{ alignSelf: 'flex-end' }}>
            <Text style={styles.clearText}>Reset Filters</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* User Hint for Swipe */}
      {filtered.length > 0 && (
        <View style={styles.tipContainer}>
          <MaterialIcon name="touch-app" size={14} color={colors.muted} />
          <Text style={styles.tipText}>
            Swipe <Text style={{ fontWeight: '700', color: colors.primary }}>Left</Text> to Delete •
            Swipe <Text style={{ fontWeight: '700', color: colors.accentRed }}>Right</Text> to Edit
          </Text>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      <View style={{ paddingHorizontal: width >= 768 ? spacing(4) : 0 }}>
        <ScreenHeader
          title="History"
          subtitle="Transaction log"
          showScrollHint={false}
          useSafeAreaPadding={false}
        />
        {/* Production: index-building banner removed to avoid exposing console URLs. */}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.local_id}
        renderItem={({ item }) => (
          <SwipeableHistoryItem
            item={item}
            onEdit={() => openEdit(item)}
            onDelete={() => handleDelete(item.local_id)}
          />
        )}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 80 },
          width >= 768 && { paddingHorizontal: spacing(4) },
        ]}
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={5}
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

      {/* EDIT MODAL */}
      <Modal
        visible={!!editingEntry}
        animationType="slide"
        transparent
        onRequestClose={() => setEditingEntry(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalOverlay}>
              <View
                style={[
                  styles.modalContent,
                  { maxWidth: 600, alignSelf: 'center', width: '100%', maxHeight: Math.max(300, Math.floor(height * 0.9)) },
                ]}
              >
                <View style={styles.sheetHandle} />
                <View style={styles.modalHeaderRow}>
                  <Text style={styles.modalTitle}>Edit Transaction</Text>
                  <TouchableOpacity onPress={() => setEditingEntry(null)} style={styles.closeBtn}>
                    <MaterialIcon name="close" size={22} color={colors.text} />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                  contentContainerStyle={{ paddingBottom: keyboardHeight + 24 }}
                >
                  <SimpleButtonGroup
                    buttons={['Expense', 'Income']}
                    selectedIndex={editTypeIndex}
                    onPress={setEditTypeIndex}
                    containerStyle={{ marginBottom: 16 }}
                  />

                  <Input
                    label="Amount"
                    value={editAmount}
                    onChangeText={setEditAmount}
                    keyboardType="numeric"
                    inputContainerStyle={styles.modalInput}
                    leftIcon={<MaterialIcon name="currency-rupee" size={16} color={colors.muted} />}
                  />

                  <View style={styles.quickRow}>
                    {quickAmounts.map((preset) => (
                      <TouchableOpacity
                        key={preset}
                        onPress={() => setEditAmount(preset)}
                        style={styles.quickChip}
                      >
                        <Text style={styles.quickChipText}>₹{preset}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={styles.rowInputs}>
                    <TouchableOpacity
                      style={[styles.pickerBtn, { marginRight: 12 }]}
                      onPress={() => setShowCategoryPicker(true)}
                    >
                      <Text style={styles.pickerLabel}>Category</Text>
                      <View style={styles.pickerValueRow}>
                        <Text style={styles.pickerValue}>{editCategory}</Text>
                        <MaterialIcon name="arrow-drop-down" size={20} color={colors.muted} />
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.pickerBtn}
                      onPress={() => setShowEditDatePicker(true)}
                    >
                      <Text style={styles.pickerLabel}>Date</Text>
                      <View style={styles.pickerValueRow}>
                        <Text style={styles.pickerValue}>
                          {editDate ? dayjs(editDate).format('DD MMM YYYY') : 'Select'}
                        </Text>
                        <MaterialIcon name="event" size={18} color={colors.muted} />
                      </View>
                    </TouchableOpacity>
                  </View>

                  <Input
                    label="Note"
                    value={editNote}
                    onChangeText={setEditNote}
                    inputContainerStyle={styles.modalInput}
                    placeholder="Description..."
                    leftIcon={<MaterialIcon name="edit" size={16} color={colors.muted} />}
                  />

                  <Button
                    title="Save Changes"
                    onPress={handleSaveEdit}
                    buttonStyle={{ backgroundColor: colors.primary, borderRadius: 12, height: 50 }}
                    containerStyle={{ marginTop: 10 }}
                  />
                </ScrollView>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>

      <CategoryPickerModal
        visible={showCategoryPicker}
        onClose={() => setShowCategoryPicker(false)}
        onSelect={(c) => {
          setEditCategory(c);
          setShowCategoryPicker(false);
        }}
      />

      {showEditDatePicker && (
        <DateTimePicker
          value={editDate || new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(e, d) => {
            setShowEditDatePicker(false);
            if (d) setEditDate(d);
          }}
        />
      )}
    </SafeAreaView>
  );
};

export default HistoryScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    paddingHorizontal: 16,
  },
  headerContainer: {
    marginBottom: 8,
    marginTop: 16,
  },

  /* COMPACT HERO */
  compactHero: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroLabel: {
    fontSize: 11,
    color: colors.muted,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  heroValue: {
    fontSize: 22,
    fontWeight: '800',
    marginTop: 2,
  },
  countChip: {
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  countText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },

  /* CHIPS */
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
    paddingRight: 10,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
  },
  filterChipTextActive: {
    color: colors.background,
  },
  filterIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginLeft: 4,
  },

  /* ADVANCED FILTERS */
  advancedFilters: {
    marginTop: 12,
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 10,
  },
  dateBtn: {
    borderColor: colors.border,
    borderRadius: 8,
    height: 36,
    paddingVertical: 0,
    minWidth: 100,
  },
  dateBtnText: {
    fontSize: 12,
    color: colors.text,
  },
  searchInput: {
    backgroundColor: colors.surfaceMuted,
    borderBottomWidth: 0,
    borderRadius: 10,
    height: 40,
    paddingHorizontal: 8,
  },
  clearText: {
    color: colors.accentRed,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
  },

  /* TIP */
  tipContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    marginBottom: 8,
    gap: 6,
    opacity: 0.8,
  },
  tipText: {
    fontSize: 12,
    color: colors.muted,
  },

  /* COMPACT ITEM */
  swipeContainer: {
    marginBottom: 8,
    borderRadius: 14,
    overflow: 'hidden',
  },
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
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  compactContent: {
    flex: 1,
  },
  compactHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  compactCategory: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    marginRight: 8,
  },
  compactAmount: {
    fontSize: 15,
    fontWeight: '700',
  },
  compactSubRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  compactNote: {
    fontSize: 12,
    color: colors.muted,
    flex: 1,
    marginRight: 8,
  },
  compactDate: {
    fontSize: 11,
    color: colors.subtleText,
  },

  /* SWIPE ACTIONS */
  leftAction: {
    backgroundColor: '#3b82f6', // Blue for Edit (Appears on Left when Swiping Right)
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
    borderRadius: 14,
    marginRight: 10,
  },
  rightAction: {
    backgroundColor: '#ef4444', // Red for Delete (Appears on Right when Swiping Left)
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
    borderRadius: 14,
    marginLeft: 10,
  },
  actionText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },

  /* EMPTY STATE */
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    opacity: 0.6,
  },
  emptyText: {
    marginTop: 12,
    color: colors.muted,
    fontSize: 15,
  },

  /* MODAL */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '85%',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  closeBtn: {
    padding: 4,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 20,
  },
  modalInput: {
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  quickRow: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  quickChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
  },
  quickChipText: {
    fontSize: 12,
    color: colors.text,
    fontWeight: '600',
  },
  rowInputs: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  pickerBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
  },
  pickerLabel: {
    fontSize: 11,
    color: colors.muted,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  pickerValueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pickerValue: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
});

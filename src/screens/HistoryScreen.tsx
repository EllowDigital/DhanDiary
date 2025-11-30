import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Alert,
  Modal,
  Dimensions,
  ScrollView,
  TouchableOpacity,
  LayoutAnimation,
} from 'react-native';
import { Text, Button, Input } from '@rneui/themed';
import SimpleButtonGroup from '../components/SimpleButtonGroup';
import CategoryPickerModal from '../components/CategoryPickerModal';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useEntries } from '../hooks/useEntries';
import { useAuth } from '../hooks/useAuth';
import TransactionCard from '../components/TransactionCard';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useToast } from '../context/ToastContext';
import runInBackground from '../utils/background';
import { getEntryByLocalId } from '../db/entries';
import { Animated as RNAnimated } from 'react-native';
import useDelayedLoading from '../hooks/useDelayedLoading';
import FullScreenSpinner from '../components/FullScreenSpinner';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const scale = SCREEN_WIDTH / 390;
const font = (s: number) => Math.round(s * scale);

const HistoryScreen = () => {
  const { user } = useAuth();
  const { entries = [], isLoading, updateEntry, deleteEntry } = useEntries(user?.id);
  const navigation = useNavigation<any>();
  type HistoryRouteParams = { edit_local_id?: string; edit_item?: any } | undefined;
  type HistoryRouteProp = RouteProp<Record<string, HistoryRouteParams>, string>;
  const route = useRoute<HistoryRouteProp>();

  // show spinner only if loading lasts more than a short delay
  const showLoading = useDelayedLoading(Boolean(isLoading));

  const [filtersVisible, setFiltersVisible] = useState(false);
  const [typeIndex, setTypeIndex] = useState(0); // all / in / out
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [amountMin, setAmountMin] = useState<string>('');
  const [amountMax, setAmountMax] = useState<string>('');
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('');

  const [editingEntry, setEditingEntry] = useState<any | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editCategory, setEditCategory] = useState('');
  // guard against multiple openEdit calls (double-tap / multiple navigations)
  const isOpeningRef = React.useRef(false);
  const setEditingSafely = (item: any | null) => {
    if (item) {
      if (isOpeningRef.current) return;
      isOpeningRef.current = true;
      setEditingEntry(item);
      // release guard after brief delay
      setTimeout(() => {
        isOpeningRef.current = false;
      }, 500);
    } else {
      // closing
      setEditingEntry(null);
      isOpeningRef.current = false;
    }
  };
  const [editNote, setEditNote] = useState('');
  const [editTypeIndex, setEditTypeIndex] = useState(0);
  const [editDate, setEditDate] = useState<Date | null>(null);
  const [showEditDatePicker, setShowEditDatePicker] = useState(false);
  const [editDateChanged, setEditDateChanged] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  const types = ['All', 'Cash (IN)', 'Cash (OUT)'];

  // -----------------------
  // FILTER RESULT
  // -----------------------
  const filtered = useMemo(() => {
    let list = entries || [];

    if (typeIndex === 1) list = list.filter((e) => e.type === 'in');
    if (typeIndex === 2) list = list.filter((e) => e.type === 'out');

    if (startDate)
      list = list.filter((e) => {
        try {
          return new Date(e.created_at).getTime() >= startDate.getTime();
        } catch (err) {
          return false;
        }
      });

    if (endDate)
      list = list.filter((e) => {
        try {
          return new Date(e.created_at).getTime() <= endDate.getTime();
        } catch (err) {
          return false;
        }
      });

    if (categoryFilter.trim().length > 0) {
      const q = categoryFilter.toLowerCase();
      list = list.filter((e) => (e.category || '').toLowerCase().includes(q));
    }

    // amount range filter
    const min = parseFloat(amountMin.replace(/,/g, ''));
    const max = parseFloat(amountMax.replace(/,/g, ''));
    if (!isNaN(min)) list = list.filter((e) => Number(e.amount || 0) >= min);
    if (!isNaN(max)) list = list.filter((e) => Number(e.amount || 0) <= max);

    return list;
  }, [entries, typeIndex, startDate, endDate, categoryFilter, amountMin, amountMax]);

  // compute active filters count for a small badge
  const activeFilterCount = useMemo(() => {
    let c = 0;
    if (typeIndex !== 0) c += 1;
    if (startDate) c += 1;
    if (endDate) c += 1;
    if (categoryFilter.trim().length > 0) c += 1;
    if (amountMin.trim().length > 0) c += 1;
    if (amountMax.trim().length > 0) c += 1;
    return c;
  }, [typeIndex, startDate, endDate, categoryFilter, amountMin, amountMax]);

  const toggleFilters = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setFiltersVisible(!filtersVisible);
  };

  const clearFilters = () => {
    setTypeIndex(0);
    setStartDate(null);
    setEndDate(null);
    setCategoryFilter('');
    setAmountMin('');
    setAmountMax('');
  };

  // -----------------------
  // EDIT ENTRY
  // -----------------------
  // If the screen was navigated to with a param to open an editor, do that now.
  React.useEffect(() => {
    try {
      // If the caller passed the full item, open it immediately (fast overlay)
      const editItem = (route?.params as any)?.edit_item;
      if (editItem) {
        openEdit(editItem);
        try {
          // clear the navigation params so we don't reopen repeatedly
          if (navigation.setParams) {
            navigation.setParams({ edit_item: undefined, edit_local_id: undefined });
          }
        } catch (e) {}
        return;
      }

      // Fallback: if only local id was passed, try to find it in entries
      const editId = route?.params?.edit_local_id;
      if (editId) {
        const found = entries.find((e) => e.local_id === editId);
        if (found) {
          openEdit(found);
          try {
            if (navigation.setParams) {
              navigation.setParams({ edit_item: undefined, edit_local_id: undefined });
            }
          } catch (e) {}
        } else {
          // try DB lookup to ensure freshest data even if entries not yet loaded
          (async () => {
            try {
              const r = await getEntryByLocalId(String(editId));
              if (r) {
                openEdit(r);
                try {
                  if (navigation.setParams) {
                    navigation.setParams({ edit_item: undefined, edit_local_id: undefined });
                  }
                } catch (e) {}
              }
            } catch (e) {
              // ignore lookup failures
            }
          })();
        }
      }
    } catch (e) {}
  }, [route?.params, entries]);
  const openEdit = (item: any) => {
    setEditingSafely(item);
    setEditAmount(String(item.amount));
    setEditCategory(item.category || 'General');
    setEditNote(item.note || '');
    setEditTypeIndex(item.type === 'in' ? 1 : 0);
    // initialize date but don't mark as changed until user picks a new value
    try {
      const d = (item && (item.date || item.created_at)) || null;
      setEditDate(d ? new Date(d) : null);
    } catch (e) {
      setEditDate(null);
    }
    setEditDateChanged(false);
  };

  // Focus amount input when editingEntry opens — hold a ref to Input
  const amountInputRef = React.useRef<any>(null);
  useEffect(() => {
    if (editingEntry) {
      // small timeout to wait for modal animation
      const t = setTimeout(() => {
        try {
          if (amountInputRef.current && amountInputRef.current.focus) {
            amountInputRef.current.focus();
          }
        } catch (e) {}
      }, 120);
      return () => clearTimeout(t);
    }
  }, [editingEntry]);

  const { showToast } = useToast();

  const handleSaveEdit = () => {
    if (!editingEntry) return;

    const amt = parseFloat(editAmount);
    if (isNaN(amt) || amt <= 0) return Alert.alert('Validation', 'Enter a valid amount');

    // Optimistic: close the modal and show immediate feedback.
    setEditingEntry(null);
    showToast('Saving...');

    // Run actual update in background so UI stays responsive.
    runInBackground(async () => {
      try {
        const updates: any = {
          amount: amt,
          category: editCategory,
          note: editNote,
          type: editTypeIndex === 1 ? 'in' : 'out',
        };
        if (editDateChanged && editDate) {
          updates.date = editDate;
        }
        await updateEntry({ local_id: editingEntry.local_id, updates });
        showToast('Saved');
      } catch (err: any) {
        showToast(err.message || 'Save failed');
      }
    });
  };

  const handleDelete = (local_id: string) => {
    Alert.alert('Delete', 'Delete this entry?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          // Immediate UI feedback, run deletion in background.
          showToast('Deleting...');
          runInBackground(async () => {
            try {
              await deleteEntry(local_id);
              showToast('Deleted');
            } catch (err: any) {
              showToast(err.message || 'Delete failed');
            }
          });
        },
      },
    ]);
  };

  // -----------------------
  // UI
  // -----------------------
  return (
    <View style={styles.container}>
      {/* FILTER TOGGLE */}
      <TouchableOpacity style={styles.filterToggle} onPress={toggleFilters}>
        <MaterialIcon name="filter-list" size={24} color="#2563EB" />
        <Text style={styles.filterToggleText}>Filters</Text>
        {activeFilterCount > 0 && (
          <View style={styles.filterBadge}>
            <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* FILTER CARD */}
      {filtersVisible && (
        <View style={styles.filterCard}>
          <SimpleButtonGroup
            buttons={types}
            selectedIndex={typeIndex}
            onPress={setTypeIndex}
            containerStyle={{ marginVertical: 10 }}
          />
          <View style={styles.dateRow}>
            <Button
              title={startDate ? startDate.toLocaleDateString() : 'Start Date'}
              type="outline"
              onPress={() => setShowStartPicker(true)}
              buttonStyle={styles.dateBtn}
              titleStyle={styles.dateBtnTitle}
            />
            <Button
              title={endDate ? endDate.toLocaleDateString() : 'End Date'}
              type="outline"
              onPress={() => setShowEndPicker(true)}
              buttonStyle={styles.dateBtn}
              titleStyle={styles.dateBtnTitle}
            />
          </View>

          {showStartPicker && (
            <DateTimePicker
              value={startDate || new Date()}
              mode="date"
              display="default"
              onChange={(e, d) => {
                setShowStartPicker(false);
                if (d) setStartDate(d);
              }}
            />
          )}

          {showEndPicker && (
            <DateTimePicker
              value={endDate || new Date()}
              mode="date"
              display="default"
              onChange={(e, d) => {
                setShowEndPicker(false);
                if (d) setEndDate(d);
              }}
            />
          )}

          <View style={styles.presetRow}>
            <Button
              title="Today"
              type="clear"
              onPress={() => {
                const now = new Date();
                setStartDate(new Date(now.setHours(0, 0, 0, 0)));
                setEndDate(new Date(now.setHours(23, 59, 59, 999)));
              }}
              titleStyle={styles.presetBtnTitle}
            />
            <Button
              title="This Week"
              type="clear"
              onPress={() => {
                const now = new Date();
                const start = new Date(now.setDate(now.getDate() - now.getDay()));
                setStartDate(new Date(start.setHours(0, 0, 0, 0)));
                setEndDate(new Date(now.setHours(23, 59, 59, 999)));
              }}
              titleStyle={styles.presetBtnTitle}
            />
            <Button
              title="This Month"
              type="clear"
              onPress={() => {
                const now = new Date();
                setStartDate(new Date(now.getFullYear(), now.getMonth(), 1));
                setEndDate(new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999));
              }}
              titleStyle={styles.presetBtnTitle}
            />
          </View>

          <Input
            placeholder="Filter by category..."
            value={categoryFilter}
            onChangeText={setCategoryFilter}
            inputContainerStyle={styles.input}
          />

          <View style={{ flexDirection: 'row' }}>
            <Input
              placeholder="Min amount"
              value={amountMin}
              onChangeText={setAmountMin}
              keyboardType="numeric"
              containerStyle={{ flex: 1 }}
              inputContainerStyle={styles.input}
            />
            <Input
              placeholder="Max amount"
              value={amountMax}
              onChangeText={setAmountMax}
              keyboardType="numeric"
              containerStyle={{ flex: 1 }}
              inputContainerStyle={styles.input}
            />
          </View>

          {activeFilterCount > 0 && (
            <Button
              title="Clear Filters"
              type="outline"
              onPress={clearFilters}
              buttonStyle={styles.clearButton}
              titleStyle={styles.clearButtonTitle}
            />
          )}
        </View>
      )}

      {/* EMPTY / LOADING STATE */}
      {showLoading ? (
        <FullScreenSpinner visible={true} />
      ) : filtered.length === 0 && !isLoading ? (
        <View style={styles.emptyWrap}>
          <MaterialIcon name="receipt-long" size={80} color="#9CA3AF" />
          <Text style={styles.emptyTitle}>No Transactions Found</Text>
          <Text style={styles.emptySubtitle}>
            Try adjusting the filters or adding a new transaction.
          </Text>
          <Button
            title="Add New Transaction"
            onPress={() => navigation.navigate('AddEntry')}
            buttonStyle={styles.emptyButton}
            titleStyle={styles.emptyButtonTitle}
            containerStyle={{ marginTop: 24 }}
          />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.local_id}
          contentContainerStyle={{ paddingBottom: 120 }}
          refreshing={isLoading}
          onRefresh={() => {}}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={15}
          removeClippedSubviews={true}
          renderItem={({ item }) => (
            <TransactionCard
              item={item}
              onEdit={() => openEdit(item)}
              onDelete={() => handleDelete(item.local_id)}
            />
          )}
        />
      )}

      {/* EDIT MODAL */}
      <Modal
        visible={!!editingEntry}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setEditingEntry(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalHeader}>Edit Transaction</Text>
            <ScrollView>
              <SimpleButtonGroup
                buttons={['Cash (OUT)', 'Cash (IN)']}
                selectedIndex={editTypeIndex}
                onPress={setEditTypeIndex}
                containerStyle={{ marginVertical: 10, borderRadius: 12 }}
                buttonStyle={{ paddingVertical: 10 }}
                selectedButtonStyle={{
                  backgroundColor: editTypeIndex === 0 ? '#FF5D5D' : '#3CCB75',
                }}
              />

              <Input
                label="Amount"
                placeholder="0.00"
                keyboardType="numeric"
                value={editAmount}
                onChangeText={setEditAmount}
                inputContainerStyle={styles.modalInput}
                labelStyle={styles.modalLabel}
                ref={amountInputRef}
              />
              <View style={{ marginBottom: 10 }}>
                <Text style={[styles.modalLabel, { marginBottom: 8 }]}>Category</Text>
                <Button
                  title={editCategory || 'Select Category'}
                  type="outline"
                  onPress={() => setShowCategoryPicker(true)}
                  buttonStyle={{ borderRadius: 10, paddingVertical: 10 }}
                />
                <CategoryPickerModal
                  visible={showCategoryPicker}
                  onClose={() => setShowCategoryPicker(false)}
                  onSelect={(c) => {
                    setEditCategory(c);
                    setShowCategoryPicker(false);
                  }}
                />
              </View>
              <View style={{ marginBottom: 10 }}>
                <Button
                  title={editDate ? editDate.toLocaleDateString() : 'Date'}
                  type="outline"
                  onPress={() => setShowEditDatePicker(true)}
                  buttonStyle={{ borderRadius: 10, paddingVertical: 10 }}
                />
                {showEditDatePicker && (
                  <DateTimePicker
                    value={editDate || new Date()}
                    mode="date"
                    display="default"
                    onChange={(e, d) => {
                      setShowEditDatePicker(false);
                      if (d) {
                        setEditDate(d);
                        setEditDateChanged(true);
                      }
                    }}
                  />
                )}
              </View>
              <Input
                label="Note (Optional)"
                placeholder="Add a short description"
                value={editNote}
                onChangeText={setEditNote}
                multiline
                inputContainerStyle={styles.modalInput}
                labelStyle={styles.modalLabel}
              />

              <View style={styles.modalButtons}>
                <Button
                  title="Cancel"
                  type="outline"
                  onPress={() => setEditingEntry(null)}
                  containerStyle={{ flex: 1, marginRight: 10 }}
                  buttonStyle={styles.modalCancelButton}
                  titleStyle={styles.modalCancelTitle}
                />
                <Button
                  title="Save Changes"
                  onPress={handleSaveEdit}
                  containerStyle={{ flex: 1 }}
                  buttonStyle={styles.modalSaveButton}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default HistoryScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    paddingHorizontal: 14,
    paddingTop: 10,
  },

  header: {
    fontSize: font(28),
    fontWeight: '800',
    marginBottom: 16,
    color: '#1F2937',
  },

  filterToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E9EFFB',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 14,
    alignSelf: 'flex-start',
  },
  filterToggleText: {
    fontSize: font(16),
    fontWeight: '700',
    color: '#2563EB',
    marginLeft: 8,
  },
  filterBadge: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  filterBadgeText: {
    color: '#fff',
    fontSize: font(12),
    fontWeight: '700',
  },

  filterCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 16,
    marginBottom: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },

  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: 10,
  },
  dateBtn: {
    flex: 1,
    marginHorizontal: 5,
    borderRadius: 10,
    borderColor: '#D1D5DB',
  },
  dateBtnTitle: {
    color: '#374151',
    fontSize: font(14),
  },

  presetRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 10,
  },
  presetBtnTitle: {
    color: '#2563EB',
    fontSize: font(14),
    fontWeight: '600',
  },

  input: {
    backgroundColor: '#F3F4F6',
    borderBottomWidth: 0,
    borderRadius: 10,
    paddingHorizontal: 10,
  },

  clearButton: {
    borderColor: '#EF4444',
    marginTop: 10,
  },
  clearButtonTitle: {
    color: '#EF4444',
  },

  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  emptyTitle: {
    marginTop: 20,
    fontSize: font(20),
    fontWeight: '700',
    color: '#374151',
  },
  emptySubtitle: {
    marginTop: 8,
    color: '#6B7280',
    textAlign: 'center',
    fontSize: font(15),
  },
  emptyButton: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 12,
  },
  emptyButtonTitle: {
    fontSize: font(16),
    fontWeight: '600',
  },

  // Modal Styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    elevation: 4,
  },
  modalHeader: {
    fontSize: font(20),
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#1F2937',
  },
  modalLabel: {
    fontSize: font(14),
    color: '#4B5563',
    fontWeight: '600',
    marginBottom: 4,
  },
  modalInput: {
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    borderBottomWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modalButtons: {
    flexDirection: 'row',
    marginTop: 24,
  },
  modalCancelButton: {
    borderColor: '#D1D5DB',
  },
  modalCancelTitle: {
    color: '#374151',
  },
  modalSaveButton: {
    backgroundColor: '#2563EB',
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
});

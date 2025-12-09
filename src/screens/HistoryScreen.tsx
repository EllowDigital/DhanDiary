import React, { useMemo, useState, useEffect, useRef } from 'react';
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
  Platform,
  UIManager,
  Animated,
  StatusBar
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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
import useDelayedLoading from '../hooks/useDelayedLoading';
import FullScreenSpinner from '../components/FullScreenSpinner';
import { colors, shadows, spacing } from '../utils/design';
import { DEFAULT_CATEGORY, FALLBACK_CATEGORY, ensureCategory } from '../constants/categories';
import ScreenHeader from '../components/ScreenHeader';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const scale = SCREEN_WIDTH / 390;
const font = (s: number) => Math.round(s * scale);

// --- ANIMATED LIST ITEM ---
const AnimatedTransaction = ({ item, index, onEdit, onDelete }: any) => {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 300,
      delay: index * 30, // Stagger effect
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [{
          translateY: anim.interpolate({
            inputRange: [0, 1],
            outputRange: [20, 0],
          }),
        }],
        marginBottom: 12,
      }}
    >
      <TransactionCard item={item} onEdit={onEdit} onDelete={onDelete} />
    </Animated.View>
  );
};

const HistoryScreen = () => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { entries = [], isLoading, updateEntry, deleteEntry } = useEntries(user?.id);
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { showToast } = useToast();

  const showLoading = useDelayedLoading(Boolean(isLoading));

  // --- FILTERS STATE ---
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [typeIndex, setTypeIndex] = useState(0); // 0:All, 1:In, 2:Out
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [amountMin, setAmountMin] = useState<string>('');
  const [amountMax, setAmountMax] = useState<string>('');
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

  // --- ANIMATIONS ---
  const heroOpacity = useRef(new Animated.Value(0)).current;
  const heroTranslate = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(heroOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.spring(heroTranslate, { toValue: 0, useNativeDriver: true }),
    ]).start();
  }, []);

  // --- FILTER LOGIC ---
  const filtered = useMemo(() => {
    let list = entries || [];

    if (typeIndex === 1) list = list.filter((e) => e.type === 'in');
    if (typeIndex === 2) list = list.filter((e) => e.type === 'out');

    if (startDate) list = list.filter((e) => new Date(e.created_at) >= startDate);
    if (endDate) list = list.filter((e) => new Date(e.created_at) <= endDate);

    if (categoryFilter) {
      const q = categoryFilter.toLowerCase();
      list = list.filter((e) => (e.category || '').toLowerCase().includes(q));
    }

    const min = parseFloat(amountMin);
    const max = parseFloat(amountMax);
    if (!isNaN(min)) list = list.filter((e) => Number(e.amount) >= min);
    if (!isNaN(max)) list = list.filter((e) => Number(e.amount) <= max);

    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [entries, typeIndex, startDate, endDate, categoryFilter, amountMin, amountMax]);

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
      totalIn,
      totalOut,
      net: totalIn - totalOut,
      count: filtered.length,
    };
  }, [filtered]);

  // --- HANDLERS ---
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

  const openEdit = (item: any) => {
    setEditingEntry(item);
    setEditAmount(String(item.amount));
    setEditCategory(ensureCategory(item.category));
    setEditNote(item.note || '');
    setEditTypeIndex(item.type === 'in' ? 1 : 0);
    setEditDate(new Date(item.date || item.created_at));
  };

  const handleSaveEdit = async () => {
    if (!editingEntry) return;
    const amt = parseFloat(editAmount);
    if (isNaN(amt) || amt <= 0) return Alert.alert('Invalid Amount', 'Please enter a valid number.');

    setEditingEntry(null); // Close optimistic
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

  const handleDelete = (id: string) => {
    Alert.alert('Confirm Delete', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          showToast('Deleting...');
          runInBackground(async () => {
            await deleteEntry(id);
            showToast('Transaction deleted');
          });
        },
      },
    ]);
  };

  // --- RENDER HEADER ---
  const renderHeader = () => (
    <View style={styles.headerWrapper}>
      <Animated.View style={{ opacity: heroOpacity, transform: [{ translateY: heroTranslate }] }}>
        <View style={styles.heroCard}>
          <View style={styles.heroRow}>
            <View>
              <Text style={styles.heroLabel}>Net Balance</Text>
              <Text style={[styles.heroValue, { color: summary.net >= 0 ? colors.primary : colors.accentRed }]}>
                {summary.net >= 0 ? '+' : ''}₹{Math.abs(summary.net).toLocaleString()}
              </Text>
            </View>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{summary.count} items</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.statsRow}>
            <View>
              <Text style={styles.statLabel}>Income</Text>
              <Text style={[styles.statValue, { color: colors.accentGreen }]}>₹{summary.totalIn.toLocaleString()}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.statLabel}>Expense</Text>
              <Text style={[styles.statValue, { color: colors.accentRed }]}>₹{summary.totalOut.toLocaleString()}</Text>
            </View>
          </View>
        </View>
      </Animated.View>

      <TouchableOpacity style={styles.filterBar} onPress={toggleFilters} activeOpacity={0.8}>
        <View style={styles.filterLeft}>
          <MaterialIcon name="filter-list" size={20} color={colors.primary} />
          <Text style={styles.filterTitle}>Filters</Text>
        </View>
        <MaterialIcon name={filtersVisible ? 'expand-less' : 'expand-more'} size={24} color={colors.muted} />
      </TouchableOpacity>

      {filtersVisible && (
        <View style={styles.filterPanel}>
          <SimpleButtonGroup
            buttons={['All', 'Income', 'Expense']}
            selectedIndex={typeIndex}
            onPress={setTypeIndex}
            containerStyle={{ marginBottom: 12 }}
          />
          
          <View style={styles.dateRow}>
            <Button
              title={startDate ? startDate.toLocaleDateString() : 'Start Date'}
              type="outline"
              buttonStyle={styles.dateBtn}
              titleStyle={styles.dateBtnText}
              onPress={() => setShowStartPicker(true)}
              icon={<MaterialIcon name="event" size={16} color={colors.primary} style={{ marginRight: 6 }} />}
            />
            <Button
              title={endDate ? endDate.toLocaleDateString() : 'End Date'}
              type="outline"
              buttonStyle={styles.dateBtn}
              titleStyle={styles.dateBtnText}
              onPress={() => setShowEndPicker(true)}
              icon={<MaterialIcon name="event" size={16} color={colors.primary} style={{ marginRight: 6 }} />}
            />
          </View>

          {/* DATE PICKERS (Platform specific handling) */}
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
            placeholder="Search category..."
            value={categoryFilter}
            onChangeText={setCategoryFilter}
            inputContainerStyle={styles.searchInput}
            leftIcon={<MaterialIcon name="search" size={20} color={colors.muted} />}
          />

          <Button
            title="Clear All Filters"
            type="clear"
            titleStyle={{ color: colors.accentRed, fontSize: 13 }}
            onPress={clearFilters}
          />
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <ScreenHeader title="History" subtitle="Detailed transactions log" showScrollHint={false} />
      
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.local_id}
        renderItem={({ item, index }) => (
          <AnimatedTransaction
            item={item}
            index={index}
            onEdit={() => openEdit(item)}
            onDelete={() => handleDelete(item.local_id)}
          />
        )}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]}
        ListEmptyComponent={
          !showLoading ? (
            <View style={styles.emptyState}>
              <MaterialIcon name="history" size={64} color={colors.border} />
              <Text style={styles.emptyText}>No transactions found</Text>
            </View>
          ) : null
        }
      />

      <FullScreenSpinner visible={showLoading} />

      {/* EDIT MODAL */}
      <Modal visible={!!editingEntry} animationType="slide" transparent onRequestClose={() => setEditingEntry(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Transaction</Text>
            
            <ScrollView>
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
              />

              <TouchableOpacity style={styles.modalPickerBtn} onPress={() => setShowCategoryPicker(true)}>
                <Text style={styles.modalPickerLabel}>Category: <Text style={{fontWeight:'700', color:colors.primary}}>{editCategory}</Text></Text>
                <MaterialIcon name="arrow-drop-down" size={24} color={colors.text} />
              </TouchableOpacity>

              <CategoryPickerModal
                visible={showCategoryPicker}
                onClose={() => setShowCategoryPicker(false)}
                onSelect={(c) => { setEditCategory(c); setShowCategoryPicker(false); }}
              />

              <Input
                label="Note"
                value={editNote}
                onChangeText={setEditNote}
                inputContainerStyle={styles.modalInput}
              />

              <View style={styles.modalActions}>
                <Button title="Cancel" type="outline" onPress={() => setEditingEntry(null)} containerStyle={{ flex: 1, marginRight: 8 }} />
                <Button title="Save" onPress={handleSaveEdit} containerStyle={{ flex: 1 }} buttonStyle={{ backgroundColor: colors.primary }} />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
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
    paddingTop: 8,
  },
  headerWrapper: {
    marginBottom: 16,
  },
  /* HERO CARD */
  heroCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.text,
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 3,
    marginBottom: 16,
  },
  heroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroLabel: {
    fontSize: 12,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
    fontWeight: '600',
  },
  heroValue: {
    fontSize: 28,
    fontWeight: '800',
  },
  countBadge: {
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  countText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 16,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statLabel: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 2,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  /* FILTER BAR */
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  filterPanel: {
    backgroundColor: colors.card,
    marginTop: 8,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateRow: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 8,
  },
  dateBtn: {
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 8,
  },
  dateBtnText: {
    fontSize: 12,
    color: colors.text,
  },
  searchInput: {
    backgroundColor: colors.surfaceMuted,
    borderBottomWidth: 0,
    borderRadius: 10,
    paddingHorizontal: 8,
    height: 40,
  },
  /* EMPTY STATE */
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    color: colors.muted,
    marginTop: 8,
    fontSize: 14,
  },
  /* MODAL */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
    color: colors.text,
  },
  modalInput: {
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  modalPickerBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    marginBottom: 16,
  },
  modalPickerLabel: {
    fontSize: 14,
    color: colors.text,
  },
  modalActions: {
    flexDirection: 'row',
    marginTop: 20,
  },
});
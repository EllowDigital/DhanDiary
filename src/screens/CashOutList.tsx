import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Dimensions,
  TouchableOpacity,
  useWindowDimensions,
  Animated,
  Easing,
  StatusBar,
  Platform,
} from 'react-native';
import type { ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Button } from '@rneui/themed';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import { useEntries } from '../hooks/useEntries';
import { useAuth } from '../hooks/useAuth';
import TransactionCard from '../components/TransactionCard';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import useDelayedLoading from '../hooks/useDelayedLoading';
import FullScreenSpinner from '../components/FullScreenSpinner';
import {
  buildEntryDisplay,
  EntrySortMode,
  EntryTimeframe,
  summarizeEntries,
} from '../utils/entryFilters';
import { colors, spacing, shadows } from '../utils/design';
import ScreenHeader from '../components/ScreenHeader';

// --- CONSTANTS ---
const TIME_FILTERS = [
  { label: 'All', value: 'all' as const },
  { label: '7 Days', value: '7d' as const },
  { label: '30 Days', value: '30d' as const },
];

const SORT_OPTIONS = [
  { label: 'Recent', value: 'recent' as const },
  { label: 'Amount', value: 'amount' as const },
];

const CashOutList = () => {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { entries, deleteEntry, isLoading, refetch } = useEntries(user?.id);
  const showLoading = useDelayedLoading(Boolean(isLoading), 200);

  // State
  const [timeFilter, setTimeFilter] = useState<EntryTimeframe>('all');
  const [sortMode, setSortMode] = useState<EntrySortMode>('recent');

  // Responsive
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const maxContentWidth = 700;
  const containerStyle = useMemo<ViewStyle>(
    () => ({
      width: '100%',
      maxWidth: maxContentWidth,
      alignSelf: 'center',
    }),
    [maxContentWidth]
  );

  // --- ANIMATIONS ---
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
    ]).start();
  }, []);

  useFocusEffect(
    useCallback(() => {
      refetch?.();
    }, [refetch])
  );

  // --- DATA PROCESSING ---
  const entryView = useMemo(
    () =>
      buildEntryDisplay(entries, {
        type: 'out',
        timeframe: timeFilter,
        sortMode,
      }),
    [entries, timeFilter, sortMode]
  );

  const summary = useMemo(
    () => summarizeEntries(entryView.filteredEntries),
    [entryView.filteredEntries]
  );

  // --- HANDLERS ---
  const handleEdit = (item: any) => {
    navigation.navigate('History', { edit_item: item });
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteEntry(id);
    } catch (err) {
      console.warn('Delete error', err);
    }
  };

  // --- SUB-COMPONENTS ---
  const FilterPill = ({ label, active, onPress }: any) => (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.pill, active && styles.pillActive]}
    >
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </TouchableOpacity>
  );

  const renderHeader = () => (
    <Animated.View
      style={[containerStyle, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
    >
      {/* HERO CARD */}
      <View style={styles.heroCard}>
        <View style={styles.heroHeader}>
          <View>
            <Text style={styles.heroLabel}>Total Outflow</Text>
            <Text style={styles.heroValue}>₹{summary.total.toLocaleString('en-IN')}</Text>
          </View>
          <View style={styles.iconCircle}>
            <MaterialIcon name="arrow-outward" size={24} color={colors.accentRed} />
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Entries</Text>
            <Text style={styles.statValue}>{summary.count}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Avg Spend</Text>
            <Text style={styles.statValue}>₹{summary.avg.toFixed(0)}</Text>
          </View>
          <View style={[styles.statItem, { flex: 1.5 }]}>
            <Text style={styles.statLabel}>Top Category</Text>
            <Text style={styles.statValue} numberOfLines={1}>
              {summary.topCategory || '-'}
            </Text>
          </View>
        </View>
      </View>

      {/* FILTERS ROW */}
      <View style={styles.filterContainer}>
        <MaterialIcon
          name="filter-list"
          size={20}
          color={colors.muted}
          style={{ marginRight: 8 }}
        />
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[...TIME_FILTERS, ...SORT_OPTIONS]}
          keyExtractor={(item) => item.label}
          renderItem={({ item }) => {
            // Check if this specific filter is active in either category
            const isActive = item.value === timeFilter || item.value === sortMode;

            return (
              <FilterPill
                label={item.label}
                active={isActive}
                onPress={() => {
                  // Determine which state to update based on value type
                  if (['all', '7d', '30d'].includes(item.value)) {
                    setTimeFilter(item.value as EntryTimeframe);
                  } else {
                    setSortMode(item.value as EntrySortMode);
                  }
                }}
              />
            );
          }}
          contentContainerStyle={{ gap: 8, paddingRight: 20 }}
        />
      </View>
    </Animated.View>
  );

  const emptyComponent = !showLoading ? (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <MaterialIcon name="money-off" size={40} color={colors.muted} />
      </View>
      <Text style={styles.emptyTitle}>No Expenses Found</Text>
      <Text style={styles.emptyDesc}>You haven't logged any cash outflows for this period.</Text>
      <Button
        title="Log Expense"
        onPress={() => navigation.navigate('AddEntry', { type: 'out' })}
        buttonStyle={styles.addBtn}
        titleStyle={{ fontWeight: '700' }}
        containerStyle={{ marginTop: 20, width: 200 }}
      />
    </View>
  ) : null;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <View style={[containerStyle, { paddingHorizontal: isTablet ? 0 : 20 }]}>
        <ScreenHeader
          title="Expenses"
          subtitle="Track your cash outflow"
          showScrollHint={false}
          useSafeAreaPadding={false}
        />
      </View>

      <FlatList
        data={entryView.sortedEntries}
        keyExtractor={(item) => item.local_id}
        contentContainerStyle={[
          styles.listContent,
          { maxWidth: maxContentWidth, alignSelf: 'center', width: '100%' },
        ]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={emptyComponent}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        renderItem={({ item }) => (
          <TransactionCard
            item={item}
            onEdit={() => handleEdit(item)}
            onDelete={() => handleDelete(item.local_id)}
          />
        )}
      />
      <FullScreenSpinner visible={showLoading} />
    </SafeAreaView>
  );
};

export default CashOutList;

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },

  /* HERO CARD */
  heroCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroLabel: {
    fontSize: 13,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
    marginBottom: 4,
  },
  heroValue: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.accentRed, // Red for outflow
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(239, 68, 68, 0.1)', // Light red
    alignItems: 'center',
    justifyContent: 'center',
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
  statItem: {
    flex: 1,
  },
  statLabel: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },

  /* FILTERS */
  filterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
  },
  pillActive: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  pillTextActive: {
    color: colors.background,
  },

  /* EMPTY STATE */
  emptyState: {
    alignItems: 'center',
    marginTop: 40,
    padding: 20,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    maxWidth: 250,
  },
  addBtn: {
    backgroundColor: colors.accentRed,
    borderRadius: 12,
    paddingVertical: 12,
  },
});

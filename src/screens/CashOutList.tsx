import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  useWindowDimensions,
  Animated,
  Easing,
  StatusBar,
  Platform,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, Button } from '@rneui/themed';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

// Custom Hooks & Components
import { useEntries } from '../hooks/useEntries';
import { useAuth } from '../hooks/useAuth';
import useDelayedLoading from '../hooks/useDelayedLoading';
import TransactionCard from '../components/TransactionCard';
import FullScreenSpinner from '../components/FullScreenSpinner';
import ScreenHeader from '../components/ScreenHeader';

// Utils
import {
  buildEntryDisplay,
  EntrySortMode,
  EntryTimeframe,
  summarizeEntries,
} from '../utils/entryFilters';
import { colors, spacing, shadows } from '../utils/design';

// --- CONSTANTS ---
const TIME_FILTERS = [
  { label: 'All Time', value: 'all' as const },
  { label: 'This Week', value: '7d' as const },
  { label: 'This Month', value: '30d' as const },
];

const SORT_OPTIONS = [
  { label: 'Newest', value: 'recent' as const },
  { label: 'Highest', value: 'amount' as const },
];

const CashOutList = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { user } = useAuth();

  // Data Fetching
  const { entries, deleteEntry, isLoading, refetch } = useEntries(user?.id);
  const showLoading = useDelayedLoading(Boolean(isLoading), 200);

  // Local State
  const [timeFilter, setTimeFilter] = useState<EntryTimeframe>('all');
  const [sortMode, setSortMode] = useState<EntrySortMode>('recent');

  // Animation Refs
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  // --- RESPONSIVENESS ---
  const isTablet = width >= 768;
  const MAX_WIDTH = 700;

  // Dynamic container style
  const contentContainerStyle: ViewStyle = {
    paddingHorizontal: isTablet ? 0 : 20,
    paddingTop: insets.top + 10, // Breathing room at top
    paddingBottom: insets.bottom + 80, // Space for bottom gestures
    width: '100%',
    maxWidth: MAX_WIDTH,
    alignSelf: 'center',
  };

  // --- EFFECTS ---
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 700,
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

  // --- DATA COMPUTATION ---
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
  const handleEdit = (item: any) => navigation.navigate('History', { edit_item: item });
  const handleDelete = async (id: string) => {
    try {
      await deleteEntry(id);
    } catch (err) {
      console.warn(err);
    }
  };

  // --- RENDER HELPERS ---

  // 1. Filter Pill
  const FilterPill = ({ label, active, onPress }: any) => (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.pill, active && styles.pillActive]}
      hitSlop={{ top: 10, bottom: 10, left: 5, right: 5 }}
    >
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </TouchableOpacity>
  );

  // 2. The Scrollable Header
  const renderHeader = () => (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      {/* Page Title */}
      <View style={{ marginBottom: 24 }}>
        <ScreenHeader
          title="Expenses"
          subtitle="Track your daily spending"
          showScrollHint={false}
          useSafeAreaPadding={false}
        />
      </View>

      {/* Hero Stats Card */}
      <View style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <View>
            <Text style={styles.heroLabel}>Total Spent</Text>
            <Text style={styles.heroValue}>₹{summary.total.toLocaleString('en-IN')}</Text>
          </View>
          <View style={styles.heroIcon}>
            <MaterialIcon name="arrow-outward" size={24} color={colors.accentRed} />
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.statsRow}>
          <View style={styles.statCol}>
            <Text style={styles.statLabel}>Entries</Text>
            <Text style={styles.statNum}>{summary.count}</Text>
          </View>
          <View style={styles.verticalDivider} />
          <View style={styles.statCol}>
            <Text style={styles.statLabel}>Average</Text>
            <Text style={styles.statNum}>₹{summary.avg.toFixed(0)}</Text>
          </View>
          <View style={styles.verticalDivider} />
          <View style={[styles.statCol, { flex: 1.5 }]}>
            <Text style={styles.statLabel}>Top Category</Text>
            <Text style={styles.statNum} numberOfLines={1}>
              {summary.topCategory || '-'}
            </Text>
          </View>
        </View>
      </View>

      {/* Filters Section */}
      <View style={styles.filterSection}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[...TIME_FILTERS, ...SORT_OPTIONS]}
          keyExtractor={(item) => item.label}
          renderItem={({ item }) => {
            const isActive = item.value === timeFilter || item.value === sortMode;
            const isSort = ['recent', 'amount'].includes(item.value);
            return (
              <FilterPill
                label={item.label}
                active={isActive}
                onPress={() => {
                  if (isSort) setSortMode(item.value as EntrySortMode);
                  else setTimeFilter(item.value as EntryTimeframe);
                }}
              />
            );
          }}
          contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
        />
      </View>

      {/* Section Label */}
      <Text style={styles.listSectionTitle}>Spending History</Text>
    </Animated.View>
  );

  // 3. Empty State
  const renderEmpty = () =>
    !showLoading ? (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconCircle}>
          <MaterialIcon name="money-off" size={40} color={colors.muted} />
        </View>
        <Text style={styles.emptyTitle}>No Expenses Found</Text>
        <Text style={styles.emptyText}>Any money you spend will be listed here.</Text>
        <Button
          title="Add Expense"
          onPress={() => navigation.navigate('AddEntry', { type: 'out' })}
          buttonStyle={styles.addBtn}
          containerStyle={{ marginTop: 24, width: '100%', maxWidth: 200 }}
        />
      </View>
    ) : null;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      <FlatList
        data={entryView.sortedEntries}
        keyExtractor={(item) => item.local_id}
        renderItem={({ item }) => (
          <TransactionCard
            item={item}
            onEdit={() => handleEdit(item)}
            onDelete={() => handleDelete(item.local_id)}
          />
        )}
        // Layout
        contentContainerStyle={contentContainerStyle}
        showsVerticalScrollIndicator={false}
        // Components
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        // Performance
        initialNumToRender={8}
        maxToRenderPerBatch={10}
        windowSize={10}
        removeClippedSubviews={Platform.OS === 'android'}
      />

      <FullScreenSpinner visible={showLoading} />
    </View>
  );
};

export default CashOutList;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },

  /* HEADER AREA */
  heroCard: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 20,
    marginBottom: 24,
    // Soft Red Shadow
    shadowColor: colors.accentRed,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.1)', // Subtle red border
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroLabel: {
    fontSize: 14,
    color: colors.muted,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  heroValue: {
    fontSize: 34,
    fontWeight: '800',
    color: colors.text, // Kept dark for readability, icon provides color context
    letterSpacing: -1,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 18,
    opacity: 0.6,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statCol: {
    flex: 1,
  },
  verticalDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.border,
    marginHorizontal: 12,
  },
  statLabel: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 4,
  },
  statNum: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },

  /* FILTERS */
  filterSection: {
    marginBottom: 24,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 100,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 10,
  },
  pillActive: {
    backgroundColor: colors.text, // Dark active state for Expenses
    borderColor: colors.text,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
  },
  pillTextActive: {
    color: colors.background,
  },

  /* LIST HEADERS */
  listSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
    marginLeft: 4,
  },

  /* EMPTY STATE */
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    paddingHorizontal: 30,
  },
  emptyIconCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
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
  emptyText: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
  addBtn: {
    backgroundColor: colors.accentRed,
    borderRadius: 14,
    paddingVertical: 14,
  },
});

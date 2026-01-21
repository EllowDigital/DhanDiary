import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  useWindowDimensions,
  Animated,
  Easing,
  StatusBar,
  LayoutAnimation,
  Alert,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, Button } from '@rneui/themed';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Swipeable } from 'react-native-gesture-handler';

// Custom Hooks & Components
import { useEntries } from '../hooks/useEntries';
import { useAuth } from '../hooks/useAuth';
import useDelayedLoading from '../hooks/useDelayedLoading';
import FullScreenSpinner from '../components/FullScreenSpinner';
import ScreenHeader from '../components/ScreenHeader';

// Utils
import {
  buildEntryDisplay,
  EntrySortMode,
  EntryTimeframe,
  summarizeEntries,
} from '../utils/entryFilters';
import { colors } from '../utils/design';
import { getIconForCategory } from '../constants/categories';
import { formatDate } from '../utils/date';
import { enableLegacyLayoutAnimations } from '../utils/layoutAnimation';

enableLegacyLayoutAnimations();

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

// --- SUB-COMPONENTS ---

const FilterPill = React.memo(({ label, active, onPress }: any) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.7}
    style={[styles.pill, active && styles.pillActive]}
  >
    <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
  </TouchableOpacity>
));

const ExpenseSummaryCard = React.memo(({ summary, fadeAnim, slideAnim }: any) => (
  <Animated.View
    style={[styles.heroCard, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
  >
    <View style={styles.heroBgDecoration} />

    <View style={styles.heroTopRow}>
      <View>
        <Text style={styles.heroLabel}>Total Spent</Text>
        <Text style={styles.heroValue}>₹{summary.total.toLocaleString('en-IN')}</Text>
      </View>
      <View style={styles.heroIcon}>
        <MaterialIcon name="arrow-outward" size={26} color="#b91c1c" />
      </View>
    </View>

    <View style={styles.divider} />

    <View style={styles.statsRow}>
      <View style={styles.statCol}>
        <Text style={styles.statLabel}>TXNS</Text>
        <Text style={styles.statNum}>{summary.count}</Text>
      </View>
      <View style={styles.verticalDivider} />
      <View style={styles.statCol}>
        <Text style={styles.statLabel}>AVG</Text>
        <Text style={styles.statNum}>₹{summary.avg.toFixed(0)}</Text>
      </View>
      <View style={styles.verticalDivider} />
      <View style={[styles.statCol, { flex: 1.5 }]}>
        <Text style={styles.statLabel}>TOP SPEND</Text>
        <Text style={styles.statNum} numberOfLines={1}>
          {summary.topCategory || '-'}
        </Text>
      </View>
    </View>
  </Animated.View>
));

// --- SWIPEABLE COMPACT ROW ---
const SwipeableExpenseItem = React.memo(({ item, onEdit, onDelete }: any) => {
  const swipeableRef = useRef<Swipeable>(null);
  const dateStr = formatDate(item.date || item.created_at);

  // Render Right Actions (Swipe Left -> Edit)
  const renderRightActions = (_progress: any, dragX: any) => {
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

  // Render Left Actions (Swipe Right -> Delete)
  const renderLeftActions = (_progress: any, dragX: any) => {
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
      renderRightActions={renderRightActions}
      renderLeftActions={renderLeftActions}
      containerStyle={styles.swipeContainer}
      friction={2}
      overshootRight={false}
      overshootLeft={false}
    >
      <View style={styles.compactRow}>
        <View style={[styles.compactIcon, { backgroundColor: '#fef2f2' }]}>
          <MaterialIcon name={getIconForCategory(item.category) as any} size={20} color="#b91c1c" />
        </View>
        <View style={styles.compactContent}>
          <View style={styles.compactHeader}>
            <Text style={styles.compactCategory} numberOfLines={1}>
              {item.category}
            </Text>
            <Text style={styles.compactAmount}>-₹{Number(item.amount).toLocaleString()}</Text>
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
  const slideAnim = useRef(new Animated.Value(20)).current;

  // --- RESPONSIVENESS ---
  const isTablet = width >= 768;
  const MAX_WIDTH = 700;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 90,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

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
  const handleEdit = useCallback(
    (item: any) => {
      navigation.navigate('AddEntry', {
        local_id: item.local_id,
        type: 'out', // Explicitly tell editor this is an expense
      });
    },
    [navigation]
  );

  const handleDelete = useCallback(
    (id: string) => {
      Alert.alert(
        'Delete Expense',
        'This will delete it locally now and remove it from all devices after the next sync.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteEntry(id);
              } catch (err) {
                console.warn(err);
              }
            },
          },
        ]
      );
    },
    [deleteEntry]
  );

  const handleFilterChange = useCallback((type: 'time' | 'sort', value: any) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (type === 'time') setTimeFilter(value);
    else setSortMode(value);
  }, []);

  // --- RENDER HELPERS ---
  const renderHeader = useMemo(
    () => (
      <View>
        <ExpenseSummaryCard summary={summary} fadeAnim={fadeAnim} slideAnim={slideAnim} />

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
                  onPress={() => handleFilterChange(isSort ? 'sort' : 'time', item.value)}
                />
              );
            }}
            contentContainerStyle={{ gap: 8, paddingHorizontal: 4 }}
          />
        </View>

        <View style={styles.listHeaderRow}>
          <Text style={styles.listSectionTitle}>Recent Transactions</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{entryView.filteredEntries.length}</Text>
          </View>
        </View>

        {/* Swipe Hint */}
        {entryView.filteredEntries.length > 0 && (
          <Text style={styles.swipeHint}>Swipe left to edit, right to delete</Text>
        )}
      </View>
    ),
    [
      summary,
      fadeAnim,
      slideAnim,
      timeFilter,
      sortMode,
      entryView.filteredEntries.length,
      handleFilterChange,
    ]
  );

  const renderEmpty = () =>
    !showLoading ? (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconCircle}>
          <MaterialIcon name="money-off" size={48} color={colors.muted} />
        </View>
        <Text style={styles.emptyTitle}>No Expenses Found</Text>
        <Text style={styles.emptyText}>
          Any money you spend for this period will be listed here.
        </Text>
        <Button
          title="Add Expense"
          onPress={() => navigation.navigate('AddEntry', { type: 'out' })}
          buttonStyle={styles.addBtn}
          containerStyle={{ marginTop: 24, width: '100%', maxWidth: 220 }}
          icon={<MaterialIcon name="add" size={20} color="white" style={{ marginRight: 8 }} />}
        />
      </View>
    ) : null;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      <View style={{ paddingHorizontal: isTablet ? 0 : 0 }}>
        <ScreenHeader
          title="Expenses"
          subtitle="Track your daily spending"
          showScrollHint={false}
          useSafeAreaPadding={true}
        />
      </View>

      <FlatList
        data={entryView.sortedEntries}
        keyExtractor={(item) => item.local_id}
        renderItem={({ item }) => (
          <SwipeableExpenseItem
            item={item}
            onEdit={() => handleEdit(item)}
            onDelete={() => handleDelete(item.local_id)}
          />
        )}
        contentContainerStyle={{
          paddingHorizontal: isTablet ? 0 : 20,
          paddingTop: 10,
          paddingBottom: insets.bottom + 80,
          width: '100%',
          maxWidth: MAX_WIDTH,
          alignSelf: 'center',
        }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        initialNumToRender={10}
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
    backgroundColor: colors.background || '#F8FAFC',
  },
  /* COMPACT ROW STYLES */
  swipeContainer: {
    marginBottom: 10,
    borderRadius: 14,
    overflow: 'hidden',
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card || '#FFFFFF',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    height: 72,
  },
  compactIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  compactContent: {
    flex: 1,
    justifyContent: 'center',
  },
  compactHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  compactCategory: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text || '#1E293B',
    flex: 1,
    marginRight: 8,
  },
  compactAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#b91c1c', // Red for expense
  },
  compactSubRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  compactNote: {
    fontSize: 12,
    color: colors.muted || '#94A3B8',
    flex: 1,
    marginRight: 8,
  },
  compactDate: {
    fontSize: 11,
    color: '#94A3B8',
  },
  /* SWIPE ACTIONS */
  leftAction: {
    backgroundColor: '#ef4444', // Red
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
    borderRadius: 14,
    marginRight: 8,
  },
  rightAction: {
    backgroundColor: '#3b82f6', // Blue
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
    borderRadius: 14,
    marginLeft: 8,
  },
  actionText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },

  /* HERO CARD (RED THEME) */
  heroCard: {
    backgroundColor: '#FEF2F2', // Light Red BG
    borderRadius: 24,
    padding: 24,
    marginBottom: 24,
    shadowColor: '#B91C1C',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#FECACA',
    position: 'relative',
    overflow: 'hidden',
  },
  heroBgDecoration: {
    position: 'absolute',
    top: -50,
    right: -50,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#FEE2E2',
    opacity: 0.5,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroLabel: {
    fontSize: 13,
    color: '#991B1B', // Dark Red
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  heroValue: {
    fontSize: 32,
    fontWeight: '800',
    color: '#7F1D1D', // Darker Red
    letterSpacing: -1,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  divider: {
    height: 1,
    backgroundColor: '#FECACA',
    marginVertical: 20,
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
    backgroundColor: '#FECACA',
    marginHorizontal: 12,
  },
  statLabel: {
    fontSize: 11,
    color: '#991B1B',
    marginBottom: 4,
    fontWeight: '600',
  },
  statNum: {
    fontSize: 15,
    fontWeight: '700',
    color: '#7F1D1D',
  },
  /* FILTERS */
  filterSection: {
    marginBottom: 24,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.card || '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border || '#E2E8F0',
    marginRight: 8,
  },
  pillActive: {
    backgroundColor: '#B91C1C', // Primary Red
    borderColor: '#B91C1C',
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted || '#94A3B8',
  },
  pillTextActive: {
    color: '#fff',
  },
  /* LIST HEADERS */
  listHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  listSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text || '#1E293B',
    marginLeft: 4,
  },
  badge: {
    backgroundColor: colors.surfaceMuted || '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text || '#1E293B',
  },
  swipeHint: {
    fontSize: 12,
    color: colors.muted || '#94A3B8',
    marginLeft: 4,
    marginBottom: 16,
    fontStyle: 'italic',
  },
  /* EMPTY STATE */
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 40,
    paddingHorizontal: 30,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text || '#1E293B',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: colors.muted || '#94A3B8',
    textAlign: 'center',
    lineHeight: 20,
  },
  addBtn: {
    backgroundColor: '#B91C1C',
    borderRadius: 14,
    paddingVertical: 14,
    shadowColor: '#B91C1C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
});

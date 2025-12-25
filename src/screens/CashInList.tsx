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
  UIManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, Button } from '@rneui/themed';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Swipeable } from 'react-native-gesture-handler';
import dayjs from 'dayjs';

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

// Enable LayoutAnimation for Android
if (Platform.OS === 'android') {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

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

const IncomeSummaryCard = React.memo(({ summary, fadeAnim, slideAnim }: any) => (
  <Animated.View
    style={[styles.heroCard, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
  >
    <View style={styles.heroBgDecoration} />

    <View style={styles.heroTopRow}>
      <View>
        <Text style={styles.heroLabel}>Total Received</Text>
        <Text style={styles.heroValue}>₹{summary.total.toLocaleString('en-IN')}</Text>
      </View>
      <View style={styles.heroIcon}>
        <MaterialIcon name="arrow-downward" size={26} color="#15803d" />
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
        <Text style={styles.statLabel}>TOP SOURCE</Text>
        <Text style={styles.statNum} numberOfLines={1}>
          {summary.topCategory || '-'}
        </Text>
      </View>
    </View>
  </Animated.View>
));

// --- SWIPEABLE COMPACT ROW ---
const SwipeableIncomeItem = React.memo(({ item, onEdit, onDelete }: any) => {
  const swipeableRef = useRef<Swipeable>(null);
  const dateStr = dayjs(item.date || item.created_at).format('MMM D, h:mm A');

  // Render Right Actions (Swipe Left -> Edit)
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
          onEdit();
        }}
      >
        <Animated.View style={{ transform: [{ scale }] }}>
          <MaterialIcon name="edit" size={24} color="white" />
          <Text style={styles.actionText}>Edit</Text>
        </Animated.View>
      </TouchableOpacity>
    );
  };

  // Render Left Actions (Swipe Right -> Delete)
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
          onDelete();
        }}
      >
        <Animated.View style={{ transform: [{ scale }] }}>
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
    >
      <View style={styles.compactRow}>
        <View style={[styles.compactIcon, { backgroundColor: '#ecfdf5' }]}>
          <MaterialIcon name={getIconForCategory(item.category) as any} size={18} color="#15803d" />
        </View>
        <View style={styles.compactContent}>
          <View style={styles.compactHeader}>
            <Text style={styles.compactCategory} numberOfLines={1}>
              {item.category}
            </Text>
            <Text style={styles.compactAmount}>+₹{Number(item.amount).toLocaleString()}</Text>
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

const CashInList = () => {
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
        type: 'in',
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
    // If you have a dedicated edit screen or modal, navigate there
    navigation.navigate('AddEntry', { 
        local_id: item.local_id, 
        type: 'in' // Ensure the editor knows it's an Income
    });
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete Income', 'Are you sure you want to remove this record?', [
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
    ]);
  };

  const handleFilterChange = (type: 'time' | 'sort', value: any) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (type === 'time') setTimeFilter(value);
    else setSortMode(value);
  };

  // --- RENDER HELPERS ---
  const renderHeader = () => (
    <View>
      <IncomeSummaryCard summary={summary} fadeAnim={fadeAnim} slideAnim={slideAnim} />

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
  );

  const renderEmpty = () =>
    !showLoading ? (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconCircle}>
          <MaterialIcon name="savings" size={48} color={colors.muted} />
        </View>
        <Text style={styles.emptyTitle}>No Income Yet</Text>
        <Text style={styles.emptyText}>Payments you receive for this period will appear here.</Text>
        <Button
          title="Add Income"
          onPress={() => navigation.navigate('AddEntry', { type: 'in' })}
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
          title="Income"
          subtitle="Track your cash inflows"
          showScrollHint={false}
          useSafeAreaPadding={true}
        />
      </View>

      <FlatList
        data={entryView.sortedEntries}
        keyExtractor={(item) => item.local_id}
        renderItem={({ item }) => (
          <SwipeableIncomeItem
            item={item}
            onEdit={() => handleEdit(item)}
            onDelete={() => handleDelete(item.local_id)}
          />
        )}
        contentContainerStyle={{
          paddingHorizontal: isTablet ? 0 : 20,
          paddingTop: 20,
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
      />

      <FullScreenSpinner visible={showLoading} />
    </View>
  );
};

export default CashInList;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  /* COMPACT ROW STYLES */
  swipeContainer: {
    marginBottom: 10,
    borderRadius: 14,
    overflow: 'hidden', // Ensures swipe corners match
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    height: 70, // Fixed height for consistent swipes
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
    color: colors.text,
    flex: 1,
    marginRight: 8,
  },
  compactAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#15803d',
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
    color: '#94a3b8',
  },
  /* SWIPE ACTIONS */
  leftAction: {
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
    borderRadius: 14,
    marginRight: 10, // Creates a gap between action and item
  },
  rightAction: {
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
    borderRadius: 14,
    marginLeft: 10, // Creates a gap
  },
  actionText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },

  /* HERO CARD */
  heroCard: {
    backgroundColor: '#f0fdf4',
    borderRadius: 24,
    padding: 24,
    marginBottom: 24,
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#bbf7d0',
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
    backgroundColor: '#dcfce7',
    opacity: 0.5,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroLabel: {
    fontSize: 13,
    color: '#166534',
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  heroValue: {
    fontSize: 36,
    fontWeight: '800',
    color: '#14532d',
    letterSpacing: -1,
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  divider: {
    height: 1,
    backgroundColor: '#bbf7d0',
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
    backgroundColor: '#bbf7d0',
    marginHorizontal: 12,
  },
  statLabel: {
    fontSize: 11,
    color: '#166534',
    marginBottom: 4,
    fontWeight: '600',
  },
  statNum: {
    fontSize: 15,
    fontWeight: '700',
    color: '#14532d',
  },
  /* FILTERS */
  filterSection: {
    marginBottom: 24,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
  },
  pillActive: {
    backgroundColor: '#15803d',
    borderColor: '#15803d',
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
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
    color: colors.text,
    marginLeft: 4,
  },
  badge: {
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },
  swipeHint: {
    fontSize: 12,
    color: colors.muted,
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
    backgroundColor: '#f0fdf4',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#bbf7d0',
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
    backgroundColor: '#15803d',
    borderRadius: 14,
    paddingVertical: 14,
    shadowColor: '#15803d',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
});
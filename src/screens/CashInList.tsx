import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, FlatList, Dimensions, TouchableOpacity } from 'react-native';
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
import { colors } from '../utils/design';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  FadeInDown,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const scale = SCREEN_WIDTH / 390;
const font = (s: number) => Math.round(s * scale);

const TIME_FILTERS = [
  { label: 'All time', value: 'all' as const },
  { label: '7 days', value: '7d' as const },
  { label: '30 days', value: '30d' as const },
];

const SORT_OPTIONS = [
  { label: 'Newest', value: 'recent' as const },
  { label: 'Amount', value: 'amount' as const },
];

const CashInList = () => {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { entries, deleteEntry, isLoading, refetch } = useEntries(user?.id);
  const showLoading = useDelayedLoading(Boolean(isLoading), 200);
  const [timeFilter, setTimeFilter] = useState<EntryTimeframe>('all');
  const [sortMode, setSortMode] = useState<EntrySortMode>('recent');

  useFocusEffect(
    useCallback(() => {
      refetch?.();
    }, [refetch])
  );

  const entryView = useMemo(
    () =>
      buildEntryDisplay(entries, {
        type: 'in',
        timeframe: timeFilter,
        sortMode,
      }),
    [entries, timeFilter, sortMode]
  );

  const summary = useMemo(() => summarizeEntries(entryView.filteredEntries), [entryView.filteredEntries]);
  const lastActivityLabel = summary.lastTimestamp
    ? new Date(summary.lastTimestamp).toLocaleDateString()
    : 'No activity';
  const listVersion = useMemo(
    () => entryView.sortedEntries.map((entry) => `${entry.local_id}-${entry.updated_at || entry.date || ''}`).join('|'),
    [entryView.sortedEntries]
  );
  const quickStats = useMemo(
    () => [
      { label: 'Entries', value: summary.count.toString() },
      { label: 'Avg deposit', value: `₹${summary.avg.toFixed(0)}` },
      { label: 'Top source', value: summary.topCategory },
      { label: 'Last income', value: lastActivityLabel },
    ],
    [summary, lastActivityLabel]
  );

  const fade = useSharedValue(0);
  useEffect(() => {
    fade.value = withTiming(1, {
      duration: 450,
      easing: Easing.out(Easing.cubic),
    });
  }, [fade]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateY: (1 - fade.value) * 18 }],
  }));

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

  const renderHeader = () => (
    <View style={styles.headerSection}>
      <View style={styles.heroCard}>
        <Text style={styles.heroOverline}>Cash In</Text>
        <Text style={styles.heroTitle}>Income</Text>
        <Text style={styles.heroSubtitle}>
          ₹{summary.total.toLocaleString('en-IN')} total · {summary.count} item{summary.count === 1 ? '' : 's'}
        </Text>
        <View style={styles.heroRow}>
          <View style={styles.heroCol}>
            <Text style={styles.heroLabel}>Average</Text>
            <Text style={styles.heroValue}>₹{summary.avg.toFixed(0)}</Text>
          </View>
          <View style={styles.heroCol}>
            <Text style={styles.heroLabel}>Top source</Text>
            <Text style={styles.heroValue}>{summary.topCategory}</Text>
          </View>
          <View style={[styles.heroCol, styles.heroColLast]}>
            <Text style={styles.heroLabel}>Last income</Text>
            <Text style={styles.heroValue}>{lastActivityLabel}</Text>
          </View>
        </View>
      </View>

      <View style={styles.quickGrid}>
        {quickStats.map((stat, index) => (
          <View
            key={stat.label}
            style={[styles.quickCard, (index + 1) % 2 === 0 && styles.quickCardEven]}
          >
            <Text style={styles.quickLabel}>{stat.label}</Text>
            <Text style={styles.quickValue}>{stat.value}</Text>
          </View>
        ))}
      </View>

      <View style={styles.pillSection}>
        <Text style={styles.pillHeading}>Timeframe</Text>
        <View style={styles.pillRow}>
          {TIME_FILTERS.map((filter) => {
            const active = timeFilter === filter.value;
            return (
              <TouchableOpacity
                key={filter.value}
                style={[styles.pill, active && styles.pillActive]}
                onPress={() => setTimeFilter(filter.value)}
              >
                <Text style={[styles.pillText, active && styles.pillTextActive]}>{filter.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.pillSection}>
        <Text style={styles.pillHeading}>Sort by</Text>
        <View style={styles.pillRow}>
          {SORT_OPTIONS.map((option) => {
            const active = sortMode === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[styles.pill, active && styles.pillActive]}
                onPress={() => setSortMode(option.value)}
              >
                <Text style={[styles.pillText, active && styles.pillTextActive]}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );

  const emptyComponent = !showLoading ? (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIconContainer}>
        <MaterialIcon name="trending-up" size={font(40)} color="#34D399" />
      </View>
      <Text style={styles.emptyTitle}>No income yet</Text>
      <Text style={styles.emptySubtitle}>Record your first earning to see it here.</Text>
      <Button
        title="Add Income"
        onPress={() => navigation.navigate('AddEntry')}
        buttonStyle={styles.addBtn}
        titleStyle={styles.addBtnTitle}
        containerStyle={{ marginTop: 24 }}
      />
    </View>
  ) : null;

  return (
    <Animated.View style={[styles.container, animStyle]}>
      <FlatList
        data={entryView.sortedEntries}
        extraData={listVersion + sortMode + timeFilter}
        keyExtractor={(item) => item.local_id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={emptyComponent}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={15}
        removeClippedSubviews={false}
        renderItem={({ item, index }) => (
          <Animated.View
            entering={FadeInDown.delay(index * 40).springify().damping(14)}
            style={styles.transactionWrapper}
          >
            <TransactionCard
              item={item}
              onEdit={() => handleEdit(item)}
              onDelete={() => handleDelete(item.local_id)}
            />
          </Animated.View>
        )}
      />
      <FullScreenSpinner visible={showLoading} />
    </Animated.View>
  );
};

export default CashInList;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#03130F',
  },
  listContent: {
    paddingHorizontal: Math.round(20 * scale),
    paddingBottom: 140,
    paddingTop: 10,
  },
  headerSection: {
    marginBottom: 24,
  },
  heroCard: {
    backgroundColor: '#052E27',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#0F3F33',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 16 },
    marginBottom: 18,
  },
  heroOverline: {
    fontSize: font(12),
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#6EE7B7',
  },
  heroTitle: {
    fontSize: font(30),
    fontWeight: '700',
    color: '#ECFDF5',
    marginTop: 4,
  },
  heroSubtitle: {
    fontSize: font(14),
    color: '#A7F3D0',
    marginTop: 8,
  },
  heroRow: {
    flexDirection: 'row',
    marginTop: 20,
  },
  heroCol: {
    flex: 1,
    marginRight: 12,
  },
  heroColLast: {
    marginRight: 0,
  },
  heroLabel: {
    fontSize: font(12),
    color: '#A7F3D0',
    marginBottom: 6,
  },
  heroValue: {
    fontSize: font(16),
    fontWeight: '600',
    color: '#ECFDF5',
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -8,
    marginBottom: 18,
  },
  quickCard: {
    width: '50%',
    flexBasis: '50%',
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#0F3F33',
    backgroundColor: '#03201A',
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  quickCardEven: {
    paddingLeft: 20,
  },
  quickLabel: {
    fontSize: font(12),
    color: '#93E6C9',
    marginBottom: 6,
  },
  quickValue: {
    fontSize: font(15),
    color: '#ECFDF5',
    fontWeight: '600',
  },
  pillSection: {
    marginBottom: 16,
  },
  pillHeading: {
    color: '#A7F3D0',
    fontSize: font(13),
    marginBottom: 8,
    fontWeight: '600',
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#0F3F33',
    margin: 4,
  },
  pillActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  pillText: {
    color: '#93E6C9',
    fontSize: font(13),
    fontWeight: '600',
  },
  pillTextActive: {
    color: '#FFFFFF',
  },
  transactionWrapper: {
    marginBottom: 12,
  },
  emptyWrap: {
    paddingVertical: 80,
    alignItems: 'center',
  },
  emptyIconContainer: {
    width: font(80),
    height: font(80),
    borderRadius: font(40),
    backgroundColor: '#052E27',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: font(20),
    fontWeight: '700',
    color: '#ECFDF5',
    textAlign: 'center',
  },
  emptySubtitle: {
    marginTop: 8,
    fontSize: font(14),
    color: '#A7F3D0',
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  addBtn: {
    backgroundColor: '#10B981',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  addBtnTitle: {
    fontSize: font(15),
    fontWeight: '600',
  },
});

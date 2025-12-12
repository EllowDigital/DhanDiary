import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Animated,
  LayoutAnimation,
  Platform,
  Pressable,
  StatusBar,
  UIManager,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@rneui/themed';
import { useEntries } from '../hooks/useEntries';
import { useAuth } from '../hooks/useAuth';
import { subscribeEntries } from '../utils/dbEvents';
import dayjs from 'dayjs';
import { getStartDateForFilter, getDaysCountForFilter } from '../utils/stats';
import { PieChart } from 'react-native-chart-kit';
import { colors, spacing } from '../utils/design';
import { ensureCategory } from '../constants/categories';
import ScreenHeader from '../components/ScreenHeader';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import DailyTrendChart from '../components/charts/DailyTrendChart';

// --- CONFIG ---
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
    : '0, 0, 0';
};

const FILTERS = ['7D', '30D', 'Month', 'Year'];

// Modern Palette
const CHART_COLORS = [
  '#F87171', // Red
  '#60A5FA', // Blue
  '#FBBF24', // Amber
  '#34D399', // Emerald
  '#818CF8', // Indigo
  '#A78BFA', // Violet
];

const chartConfig = {
  backgroundColor: 'transparent',
  backgroundGradientFrom: '#ffffff',
  backgroundGradientTo: '#ffffff',
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(${hexToRgb(colors.primary)}, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(${hexToRgb(colors.subtleText)}, ${opacity})`,
  barPercentage: 0.7,
  fillShadowGradient: colors.primary,
  fillShadowGradientOpacity: 1,
};

const StatsScreen = () => {
  const { width } = useWindowDimensions();
  const { user, loading: authLoading } = useAuth();
  const { entries = [], isLoading, refetch } = useEntries(user?.id);

  // Animation Refs
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  const [filter, setFilter] = useState('30D');

  // Load Data & Animate
  useEffect(() => {
    const unsub = subscribeEntries(() => {
      try {
        refetch();
      } catch (e) {}
    });
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 15 }),
    ]).start();
    return () => unsub();
  }, [refetch]);

  // --- RESPONSIVE CALCS ---
  const isTablet = width > 700;
  const containerWidth = Math.min(760, width - spacing(isTablet ? 3 : 2));
  const donutSize = Math.max(160, Math.min(isTablet ? 260 : 210, containerWidth - spacing(4)));
  const innerSize = Math.round(donutSize * 0.58);

  // --- DATA PROCESSING ---
  const filteredEntries = useMemo(() => {
    const startDate = getStartDateForFilter(filter);
    return entries.filter((e: any) => {
      const d = dayjs(e.date || e.created_at);
      return !d.isBefore(startDate);
    });
  }, [entries, filter]);

  // 1. Totals
  const stats = useMemo(() => {
    return filteredEntries.reduce(
      (acc, entry) => {
        const amount = Number(entry.amount) || 0;
        if (entry.type === 'in') acc.totalIn += amount;
        else acc.totalOut += amount;
        return acc;
      },
      { totalIn: 0, totalOut: 0, net: 0 }
    );
  }, [filteredEntries]);
  stats.net = stats.totalIn - stats.totalOut;

  // 2. Advanced Metrics
  const savingsRate = stats.totalIn > 0 ? Math.max(0, (stats.net / stats.totalIn) * 100) : 0;

  const maxExpense = useMemo(() => {
    const expenses = filteredEntries.filter((e) => e.type === 'out').map((e) => Number(e.amount));
    return expenses.length ? Math.max(...expenses) : 0;
  }, [filteredEntries]);

  const maxIncome = useMemo(() => {
    const incomes = filteredEntries.filter((e) => e.type === 'in').map((e) => Number(e.amount));
    return incomes.length ? Math.max(...incomes) : 0;
  }, [filteredEntries]);

  // 3. Donut Data
  const pieData = useMemo(() => {
    const expenseCategories = filteredEntries
      .filter((e) => e.type === 'out')
      .reduce(
        (acc, e) => {
          const cat = ensureCategory(e.category);
          acc[cat] = (acc[cat] || 0) + Number(e.amount);
          return acc;
        },
        {} as { [key: string]: number }
      );

    return Object.entries(expenseCategories)
      .map(([name, population], index) => ({
        name,
        population,
        color: CHART_COLORS[index % CHART_COLORS.length],
        legendFontColor: colors.text,
        legendFontSize: 12,
      }))
      .sort((a, b) => b.population - a.population);
  }, [filteredEntries]);

  const topCategoryName = pieData.length > 0 ? pieData[0].name : 'None';

  // 4. Scrollable Bar Chart Data
  const dailyTrend = useMemo(() => {
    const labels: string[] = [];
    const values: number[] = [];
    const indexByKey = new Map<string, number>();
    const now = dayjs();

    if (filter === 'Year') {
      for (let i = 0; i < 12; i++) {
        const monthLabel = now.month(i).format('MMM');
        labels.push(monthLabel);
        values.push(0);
        indexByKey.set(monthLabel, i);
      }
    } else {
      const startDate = getStartDateForFilter(filter, now);
      const days = getDaysCountForFilter(filter, now);
      const displayFormat = days > 30 ? 'D' : days > 15 ? 'DD' : 'ddd';

      for (let i = 0; i < days; i++) {
        const date = startDate.add(i, 'day');
        const labelKey = date.format('YYYY-MM-DD');
        labels.push(date.format(displayFormat));
        values.push(0);
        indexByKey.set(labelKey, i);
      }
    }

    filteredEntries.forEach((entry: any) => {
      const rawDate = dayjs(entry.date || entry.created_at);
      const amount = Number(entry.amount) || 0;
      const key = filter === 'Year' ? rawDate.format('MMM') : rawDate.format('YYYY-MM-DD');
      const targetIndex = indexByKey.get(key);
      if (targetIndex !== undefined && entry.type === 'out') {
        values[targetIndex] += amount;
      }
    });

    return labels.map((label, index) => ({ label, value: values[index] || 0 }));
  }, [filteredEntries, filter]);

  const trendChartWidth = useMemo(() => {
    const dataPoints = dailyTrend.length;
    const step = dataPoints > 45 ? 28 : dataPoints > 31 ? (isTablet ? 42 : 48) : isTablet ? 52 : 60;
    const minWidth = containerWidth - spacing(2);
    return Math.max(minWidth, dataPoints * step, 260);
  }, [dailyTrend.length, containerWidth, isTablet]);

  const dateRangeLabel = useMemo(() => {
    const now = dayjs();
    const start = getStartDateForFilter(filter, now);
    const end = filter === 'Year' ? now.endOf('month') : now;
    const sameMonth = start.format('MMM') === end.format('MMM');
    const sameYear = start.year() === end.year();
    if (filter === 'Year') {
      return `${start.startOf('year').format('MMM YYYY')} - ${end.format('MMM YYYY')}`;
    }
    if (sameMonth && sameYear) return `${start.format('D MMM')} - ${end.format('D MMM YYYY')}`;
    if (sameYear) return `${start.format('D MMM')} - ${end.format('D MMM YYYY')}`;
    return `${start.format('D MMM YYYY')} - ${end.format('D MMM YYYY')}`;
  }, [filter]);

  const hasTrendData = useMemo(() => dailyTrend.some((point) => point.value > 0), [dailyTrend]);
  const activeTrendDays = useMemo(
    () => dailyTrend.filter((point) => point.value > 0).length,
    [dailyTrend]
  );
  const totalTrendExpense = useMemo(
    () => dailyTrend.reduce((sum, point) => sum + point.value, 0),
    [dailyTrend]
  );
  const averageDailyExpense = activeTrendDays ? Math.round(totalTrendExpense / activeTrendDays) : 0;
  const peakTrendDay = useMemo(() => {
    return dailyTrend.reduce<{ label: string; value: number } | null>((best, point) => {
      if (!best || point.value > best.value) return point;
      return best;
    }, null);
  }, [dailyTrend]);

  const handleFilterPress = (nextFilter: string) => {
    if (nextFilter === filter) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setFilter(nextFilter);
  };

  if (isLoading || authLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      {/* HEADER WRAPPER */}
      <View
        style={{
          width: '100%',
          maxWidth: 700,
          alignSelf: 'center',
          paddingHorizontal: isTablet ? 0 : spacing(2),
        }}
      >
        <ScreenHeader
          title="Analytics"
          subtitle="Financial health overview"
          showScrollHint={false}
          useSafeAreaPadding={false}
        />
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scrollContent, { alignItems: 'center' }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={{
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
            width: containerWidth,
          }}
        >
          {/* FILTER TABS */}
          <View style={styles.filterContainer}>
            {FILTERS.map((f) => {
              const isActive = filter === f;
              return (
                <Pressable
                  key={f}
                  style={[styles.filterPill, isActive && styles.filterPillActive]}
                  onPress={() => handleFilterPress(f)}
                >
                  <Text style={[styles.filterText, isActive && styles.filterTextActive]}>{f}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* NET BALANCE HERO */}
          <View style={[styles.card, styles.heroCard]}>
            <View style={styles.heroHeader}>
              <Text style={styles.cardTitle}>Net Balance</Text>
              <View
                style={[
                  styles.trendBadge,
                  { backgroundColor: stats.net >= 0 ? '#dcfce7' : '#fee2e2' },
                ]}
              >
                <MaterialIcon
                  name={stats.net >= 0 ? 'trending-up' : 'trending-down'}
                  size={16}
                  color={stats.net >= 0 ? colors.accentGreen : colors.accentRed}
                />
                <Text
                  style={[
                    styles.trendText,
                    { color: stats.net >= 0 ? colors.accentGreen : colors.accentRed },
                  ]}
                >
                  {stats.net >= 0 ? 'Surplus' : 'Deficit'}
                </Text>
              </View>
            </View>

            <Text
              style={[
                styles.heroValue,
                { color: stats.net >= 0 ? colors.accentGreen : colors.accentRed },
              ]}
            >
              {stats.net >= 0 ? '+' : ''}₹{Math.abs(stats.net).toLocaleString()}
            </Text>

            <View style={styles.divider} />

            <View style={styles.heroRow}>
              <View style={styles.heroCol}>
                <Text style={styles.heroLabel}>Total Income</Text>
                <Text style={styles.incomeValue}>₹{stats.totalIn.toLocaleString()}</Text>
              </View>
              <View style={[styles.heroCol, { alignItems: 'flex-end' }]}>
                <Text style={styles.heroLabel}>Total Expense</Text>
                <Text style={styles.expenseValue}>₹{stats.totalOut.toLocaleString()}</Text>
              </View>
            </View>
          </View>

          {/* QUICK STATS GRID */}
          <View style={styles.gridContainer}>
            <View style={[styles.card, styles.gridItem]}>
              <MaterialIcon name="savings" size={24} color={colors.primary} />
              <Text style={styles.gridValue}>{savingsRate.toFixed(0)}%</Text>
              <Text style={styles.gridLabel}>Savings Rate</Text>
            </View>
            <View style={[styles.card, styles.gridItem]}>
              <MaterialIcon name="arrow-upward" size={24} color={colors.accentGreen} />
              <Text style={styles.gridValue}>₹{maxIncome.toLocaleString()}</Text>
              <Text style={styles.gridLabel}>Max Income</Text>
            </View>
            <View style={[styles.card, styles.gridItem]}>
              <MaterialIcon name="arrow-downward" size={24} color={colors.accentRed} />
              <Text style={styles.gridValue}>₹{maxExpense.toLocaleString()}</Text>
              <Text style={styles.gridLabel}>Max Expense</Text>
            </View>
          </View>

          {/* SCROLLABLE TREND CHART */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Daily Expense Trend</Text>
                <Text style={styles.rangeSubtitle}>{dateRangeLabel}</Text>
              </View>
              {/* Show Hint if content overflows */}
              {trendChartWidth > containerWidth && (
                <View style={styles.scrollHintContainer}>
                  <Text style={styles.scrollHint}>Swipe</Text>
                  <MaterialIcon name="arrow-forward" size={14} color={colors.primary} />
                </View>
              )}
            </View>

            {hasTrendData ? (
              <>
                <View style={styles.trendSummaryRow}>
                  <View style={styles.trendSummaryItem}>
                    <Text style={styles.trendSummaryLabel}>Avg Daily Spend</Text>
                    <Text style={styles.trendSummaryValue}>
                      ₹{averageDailyExpense.toLocaleString()}
                    </Text>
                    <Text style={styles.trendSummarySub}>
                      {activeTrendDays || 0} active {activeTrendDays === 1 ? 'day' : 'days'}
                    </Text>
                  </View>
                  <View style={styles.trendSummaryDivider} />
                  <View style={[styles.trendSummaryItem, { alignItems: 'flex-end' }]}>
                    <Text style={styles.trendSummaryLabel}>Peak Day</Text>
                    <Text style={styles.trendSummaryValue}>{peakTrendDay?.label || '--'}</Text>
                    <Text style={styles.trendSummarySub}>
                      ₹{peakTrendDay ? peakTrendDay.value.toLocaleString() : 0}
                    </Text>
                  </View>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingRight: spacing(2) }}
                >
                  <DailyTrendChart data={dailyTrend} width={trendChartWidth} />
                </ScrollView>
              </>
            ) : (
              <View style={styles.emptyChart}>
                <Text style={styles.emptyText}>No spending data available</Text>
              </View>
            )}
          </View>

          {/* DONUT CHART */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Spending Breakdown</Text>
            </View>

            {pieData.length > 0 ? (
              <View style={styles.donutContainer}>
                <View
                  style={{ position: 'relative', alignItems: 'center', justifyContent: 'center' }}
                >
                  <PieChart
                    data={pieData}
                    width={donutSize}
                    height={donutSize}
                    chartConfig={chartConfig}
                    accessor="population"
                    backgroundColor="transparent"
                    paddingLeft={`${donutSize / 4}`}
                    absolute={false}
                    hasLegend={false}
                    center={[0, 0]}
                  />
                  {/* DONUT HOLE */}
                  <View
                    style={[
                      styles.donutHole,
                      {
                        width: innerSize,
                        height: innerSize,
                        borderRadius: innerSize / 2,
                        left: (donutSize - innerSize) / 2,
                        top: (donutSize - innerSize) / 2,
                      },
                    ]}
                  >
                    <Text style={styles.holeAmount}>₹{stats.totalOut.toLocaleString()}</Text>
                    <Text style={styles.holeLabel} numberOfLines={1}>
                      {topCategoryName}
                    </Text>
                  </View>
                </View>

                {/* Custom Legend */}
                <View style={styles.legendContainer}>
                  {pieData.slice(0, 6).map((item, index) => (
                    <View key={index} style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                      <Text style={styles.legendText} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.legendValue}>
                        {Math.round((item.population / stats.totalOut) * 100)}%
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : (
              <View style={styles.emptyChart}>
                <Text style={styles.emptyText}>No expenses recorded</Text>
              </View>
            )}
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default StatsScreen;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
    paddingTop: 10,
    paddingHorizontal: spacing(2),
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* FILTERS */
  filterContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 4,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterPill: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10,
  },
  filterPillActive: {
    backgroundColor: colors.primary,
    elevation: 2,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
  },
  filterTextActive: {
    color: 'white',
  },

  /* CARDS */
  card: {
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  heroCard: {
    backgroundColor: '#fff',
    borderColor: '#e5e5e5',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  scrollHintContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  scrollHint: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: '600',
  },

  /* HERO STATS */
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  heroValue: {
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 16,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  trendText: {
    fontSize: 12,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: 16,
  },
  heroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heroCol: {
    flex: 1,
  },
  heroLabel: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  incomeValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.accentGreen,
  },
  expenseValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.accentRed,
  },

  /* GRID */
  gridContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  gridItem: {
    flex: 1,
    marginBottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    minWidth: 110,
    flexBasis: '30%',
    maxWidth: '48%',
  },
  gridValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginTop: 6,
  },
  gridLabel: {
    fontSize: 11,
    color: colors.muted,
  },

  /* TREND SUMMARY */
  trendSummaryRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 16,
    rowGap: 12,
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  trendSummaryItem: {
    flex: 1,
    minWidth: 140,
  },
  trendSummaryLabel: {
    fontSize: 12,
    color: colors.muted,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  trendSummaryValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  trendSummarySub: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  trendSummaryDivider: {
    width: 1,
    backgroundColor: colors.border,
    opacity: 0.6,
    alignSelf: 'stretch',
  },

  rangeSubtitle: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },

  /* DONUT CHART */
  donutContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutHole: {
    position: 'absolute',
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  holeAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.accentRed,
  },
  holeLabel: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
    maxWidth: 100,
  },
  legendContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    marginTop: 20,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  legendText: {
    fontSize: 11,
    color: colors.text,
    marginRight: 4,
    fontWeight: '500',
  },
  legendValue: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: '700',
  },
  emptyChart: {
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: colors.muted,
    fontStyle: 'italic',
  },
});

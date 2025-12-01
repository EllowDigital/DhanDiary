import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  useWindowDimensions,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@rneui/themed';
import SimpleButtonGroup from '../components/SimpleButtonGroup';
import TransactionCard from '../components/TransactionCard';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../hooks/useAuth';
import { useEntries } from '../hooks/useEntries';
import useDelayedLoading from '../hooks/useDelayedLoading';
import FullScreenSpinner from '../components/FullScreenSpinner';

import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  Easing,
  FadeInDown,
} from 'react-native-reanimated';

import { spacing, colors } from '../utils/design';

/* CHART KIT (safe load) */
let PieChart: any = null;
let BarChart: any = null;
try {
  const ck = require('react-native-chart-kit');
  PieChart = ck?.PieChart ?? ck.default?.PieChart ?? null;
  BarChart = ck?.BarChart ?? ck.default?.BarChart ?? null;
} catch (e) {
  console.warn('react-native-chart-kit not installed.');
}

const PIE_COLORS = [
  colors.primary,
  colors.accentBlue,
  colors.accentGreen,
  colors.accentOrange,
  colors.accentRed,
  colors.secondary,
];

const hexToRgb = (hex: string) => {
  const normalized = hex.replace('#', '');
  const bigint = parseInt(normalized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `${r}, ${g}, ${b}`;
};

const HomeScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { entries = [], isLoading = false } = useEntries(user?.id);
  const showLoading = useDelayedLoading(Boolean(isLoading), 200);
  const { width: SCREEN_WIDTH } = useWindowDimensions();

  // Dynamic sizing for responsiveness
  const CARD_PADDING = spacing(4);
  const CHART_WIDTH = SCREEN_WIDTH - CARD_PADDING * 2 - spacing(4);

  const [period, setPeriod] = useState<'week' | 'month'>('month');
  const [chartType, setChartType] = useState<'pie' | 'bar'>('pie');

  /* --- DATA LOGIC --- */
  const totalIn = useMemo(
    () => entries.filter((e) => e.type === 'in').reduce((s, x) => s + Number(x.amount || 0), 0),
    [entries]
  );

  const totalOut = useMemo(
    () => entries.filter((e) => e.type === 'out').reduce((s, x) => s + Number(x.amount || 0), 0),
    [entries]
  );

  const balance = totalIn - totalOut;

  const netTrend = useMemo(() => {
    if (!entries.length) return { current: 0, previous: 0, delta: null as number | null };
    const now = Date.now();
    const week = 7 * 24 * 60 * 60 * 1000;
    let current = 0;
    let previous = 0;
    entries.forEach((entry) => {
      const stamp = new Date(entry.date || entry.created_at).getTime();
      if (Number.isNaN(stamp)) return;
      const value = entry.type === 'in' ? Number(entry.amount || 0) : -Number(entry.amount || 0);
      if (stamp >= now - week) current += value;
      else if (stamp >= now - week * 2) previous += value;
    });
    const delta = previous === 0 ? null : ((current - previous) / Math.abs(previous)) * 100;
    return { current, previous, delta };
  }, [entries]);

  const filteredByPeriod = useMemo(() => {
    if (!entries) return [];
    const now = new Date();
    if (period === 'week') {
      const cutoff = now.getTime() - 7 * 24 * 60 * 60 * 1000;
      return (entries || []).filter((e: any) => {
        try {
          const t = new Date(e.date || e.created_at).getTime();
          return !isNaN(t) && t >= cutoff;
        } catch (err) {
          return false;
        }
      });
    }

    // month -> use calendar month start
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    return (entries || []).filter((e: any) => {
      try {
        const t = new Date(e.date || e.created_at).getTime();
        return !isNaN(t) && t >= startOfMonth;
      } catch (err) {
        return false;
      }
    });
  }, [entries, period]);

  const periodEntries = filteredByPeriod;
  const periodLabel = period === 'week' ? 'This week' : 'This month';

  const periodIncome = useMemo(
    () =>
      periodEntries.filter((e) => e.type === 'in').reduce((s, x) => s + Number(x.amount || 0), 0),
    [periodEntries]
  );

  const periodExpense = useMemo(
    () =>
      periodEntries.filter((e) => e.type === 'out').reduce((s, x) => s + Number(x.amount || 0), 0),
    [periodEntries]
  );

  const periodAverageTicket = useMemo(() => {
    if (!periodEntries.length) return 0;
    const sum = periodEntries.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
    return sum / periodEntries.length;
  }, [periodEntries]);

  const periodActiveDays = useMemo(() => {
    const set = new Set<string>();
    periodEntries.forEach((entry) => {
      try {
        const key = new Date(entry.date || entry.created_at).toISOString().slice(0, 10);
        if (key) set.add(key);
      } catch (err) {}
    });
    return set.size;
  }, [periodEntries]);

  const periodNet = periodIncome - periodExpense;

  // Pie chart: show both income and expense by category
  const pieByCategory = useMemo(() => {
    const map: Record<string, { in: number; out: number }> = {};
    filteredByPeriod.forEach((e) => {
      const cat = e.category || 'Other';
      if (!map[cat]) map[cat] = { in: 0, out: 0 };
      if (e.type === 'in') map[cat].in += Number(e.amount || 0);
      if (e.type === 'out') map[cat].out += Number(e.amount || 0);
    });
    return Object.entries(map).map(([category, vals]) => ({
      category,
      income: vals.in,
      expense: vals.out,
    }));
  }, [filteredByPeriod]);

  // For pie chart, show total expense by category
  const pieExpenseData = useMemo(
    () =>
      pieByCategory
        .filter((x) => x.expense > 0)
        .map((x, i) => ({
          name: x.category,
          population: x.expense,
          color: PIE_COLORS[i % PIE_COLORS.length],
          legendFontColor: colors.text,
          legendFontSize: 12,
        })),
    [pieByCategory]
  );

  // For pie chart, show total income by category (optional, for toggling)
  const pieIncomeData = useMemo(
    () =>
      pieByCategory
        .filter((x) => x.income > 0)
        .map((x, i) => ({
          name: x.category,
          population: x.income,
          color: PIE_COLORS[i % PIE_COLORS.length],
          legendFontColor: colors.text,
          legendFontSize: 12,
        })),
    [pieByCategory]
  );

  // Bar chart: show both income and expense per day/week
  const weeklyBar = useMemo(() => {
    const now = new Date();
    const source = filteredByPeriod || [];

    if (period === 'week') {
      const labels: string[] = [];
      const orderKeys: string[] = [];
      const incomeMap: Record<string, number> = {};
      const expenseMap: Record<string, number> = {};

      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        const label = d.toLocaleDateString(undefined, { weekday: 'short' });
        labels.push(label);
        orderKeys.push(key);
        incomeMap[key] = 0;
        expenseMap[key] = 0;
      }

      source.forEach((entry) => {
        try {
          const key = new Date(entry.date || entry.created_at).toISOString().slice(0, 10);
          if (!(key in incomeMap)) return;
          const amount = Number(entry.amount || 0);
          if (entry.type === 'in') incomeMap[key] += amount;
          if (entry.type === 'out') expenseMap[key] += amount;
        } catch (err) {}
      });

      return {
        labels,
        income: orderKeys.map((key) => incomeMap[key]),
        expense: orderKeys.map((key) => expenseMap[key]),
      };
    }

    const bucketCount = 4;
    const weekLabels: string[] = [];
    const weekIncome: number[] = Array(bucketCount).fill(0);
    const weekExpense: number[] = Array(bucketCount).fill(0);

    for (let w = bucketCount - 1; w >= 0; w--) {
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - w * 7);
      const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 6);
      weekLabels.push(`${start.getDate()}-${end.getDate()}`);
    }

    source.forEach((entry) => {
      try {
        const d = new Date(entry.date || entry.created_at);
        if (isNaN(d.getTime())) return;
        const daysAgo = Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
        const bucket = Math.floor(daysAgo / 7);
        if (bucket < 0 || bucket >= bucketCount) return;
        const targetIndex = bucketCount - 1 - bucket;
        const amount = Number(entry.amount || 0);
        if (entry.type === 'in') weekIncome[targetIndex] += amount;
        if (entry.type === 'out') weekExpense[targetIndex] += amount;
      } catch (err) {}
    });

    return { labels: weekLabels, income: weekIncome, expense: weekExpense };
  }, [filteredByPeriod, period]);

  const recent = (entries || []).slice(0, 5);

  // Use pieExpenseData for pie chart (can toggle to pieIncomeData if needed)
  const pieData = pieExpenseData;

  const chartPrimaryRgb = hexToRgb(colors.primary);
  const chartLabelRgb = hexToRgb(colors.muted);

  const chartConfig = {
    backgroundColor: colors.card,
    backgroundGradientFrom: colors.card,
    backgroundGradientTo: colors.card,
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(${chartPrimaryRgb}, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(${chartLabelRgb}, ${opacity})`,
  };

  const heroTrendDetails = useMemo(() => {
    if (!entries.length) {
      return {
        label: 'Start logging to see insights',
        color: colors.secondary,
        icon: 'auto-graph' as const,
      };
    }
    if (netTrend.delta === null) {
      return {
        label: 'New activity this week',
        color: colors.secondary,
        icon: 'auto-graph' as const,
      };
    }
    const isUp = netTrend.delta >= 0;
    return {
      label: `${isUp ? 'Up' : 'Down'} ${Math.abs(netTrend.delta).toFixed(1)}% vs last week`,
      color: isUp ? colors.accentGreen : colors.accentRed,
      icon: isUp ? ('trending-up' as const) : ('trending-down' as const),
    };
  }, [entries.length, netTrend]);

  const highlightCards = useMemo(
    () => [
      { label: 'Avg ticket', value: `₹${periodAverageTicket.toFixed(0)}`, icon: 'receipt-long' },
      { label: 'Active days', value: `${periodActiveDays || 0}`, icon: 'calendar-today' },
      { label: 'Entries (period)', value: `${periodEntries.length}`, icon: 'fact-check' },
    ],
    [periodAverageTicket, periodActiveDays, periodEntries.length]
  );

  const topExpenseCategory = useMemo(() => {
    if (!pieExpenseData.length) return 'General';
    const sorted = [...pieExpenseData].sort((a, b) => b.population - a.population);
    return sorted[0]?.name || 'General';
  }, [pieExpenseData]);

  const insightRows = useMemo(
    () => [
      { label: 'Top category', value: topExpenseCategory, icon: 'category' },
      { label: 'Net (7d)', value: `₹${netTrend.current.toFixed(0)}`, icon: 'timeline' },
      { label: 'Balance', value: `₹${balance.toFixed(0)}`, icon: 'account-balance-wallet' },
      {
        label: 'Cash flow',
        value: `${period === 'week' ? 'Weekly' : 'Monthly'}`,
        icon: 'insights',
      },
    ],
    [topExpenseCategory, netTrend.current, balance, period]
  );

  const homeActions = useMemo(
    () => [
      {
        label: 'Add entry',
        icon: 'flash-on',
        accent: colors.primary,
        onPress: () => navigation.navigate('AddEntry'),
      },
      {
        label: 'History',
        icon: 'history',
        accent: colors.secondary,
        onPress: () => navigation.navigate('History'),
      },
      {
        label: 'Stats',
        icon: 'insights',
        accent: colors.accentGreen,
        onPress: () => navigation.navigate('Stats'),
      },
    ],
    [navigation]
  );

  /* --- ANIMATIONS --- */
  const shimmer = useSharedValue(0);
  useEffect(() => {
    shimmer.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
  }, []);
  const shimmerStyle = useAnimatedStyle(() => ({ opacity: 0.3 + 0.7 * shimmer.value }));

  return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <SafeAreaView style={styles.safeArea}>
        <FullScreenSpinner visible={showLoading} />
        <FlatList
          data={recent}
          keyExtractor={(item) => item.local_id}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <Animated.View
              entering={FadeInDown.delay(520 + index * 40)
                .springify()
                .damping(16)}
            >
              <TransactionCard item={item} />
            </Animated.View>
          )}
          initialNumToRender={5}
          maxToRenderPerBatch={5}
          windowSize={6}
          removeClippedSubviews={true}
          contentContainerStyle={{
            ...styles.scrollContent,
            paddingBottom: spacing(10),
          }}
          ListHeaderComponentStyle={styles.listHeaderSpacing}
          ListHeaderComponent={
            <Animated.View entering={FadeInDown.delay(100).duration(500)}>
              <View style={styles.heroCard}>
                <View style={styles.heroTopRow}>
                  <View>
                    <Text style={styles.heroSubtle}>Welcome back</Text>
                    <Text style={styles.heroGreeting}>{user?.name ? user.name : 'Guest'} 👋</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.heroSettings}
                    onPress={() => navigation.navigate('Settings')}
                  >
                    <MaterialIcon name="settings" size={20} color={colors.muted} />
                  </TouchableOpacity>
                </View>
                <View style={styles.heroLabelRow}>
                  <Text style={styles.heroLabel}>Period net</Text>
                  <Text style={styles.heroPeriod}>{periodLabel}</Text>
                </View>
                <Text style={styles.heroBalance}>₹{periodNet.toFixed(2)}</Text>
                <View
                  style={[styles.trendBadge, { backgroundColor: `${heroTrendDetails.color}22` }]}
                >
                  <MaterialIcon
                    name={heroTrendDetails.icon}
                    size={18}
                    color={heroTrendDetails.color}
                  />
                  <Text style={[styles.trendText, { color: heroTrendDetails.color }]}>
                    {heroTrendDetails.label}
                  </Text>
                </View>
                <View style={styles.heroStatsRow}>
                  <View style={[styles.heroStatCard, styles.heroStatSpacing]}>
                    <Text style={styles.heroStatLabel}>Income</Text>
                    <Text style={[styles.heroStatValue, { color: colors.accentGreen }]}>
                      ₹{periodIncome.toFixed(2)}
                    </Text>
                  </View>
                  <View style={[styles.heroStatCard, styles.heroStatSpacing]}>
                    <Text style={styles.heroStatLabel}>Expense</Text>
                    <Text style={[styles.heroStatValue, { color: colors.accentRed }]}>
                      ₹{periodExpense.toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.heroStatCard}>
                    <Text style={styles.heroStatLabel}>Entries</Text>
                    <Text style={[styles.heroStatValue, { color: colors.secondary }]}>
                      {periodEntries.length}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.highlightRow}>
                {highlightCards.map((card, idx) => (
                  <Animated.View
                    key={card.label}
                    entering={FadeInDown.delay(160 + idx * 60)
                      .springify()
                      .damping(16)}
                    style={[
                      styles.highlightCard,
                      idx !== highlightCards.length - 1 && styles.horizontalSpacer,
                    ]}
                  >
                    <MaterialIcon name={card.icon as any} size={18} color={colors.muted} />
                    <Text style={styles.highlightLabel}>{card.label}</Text>
                    <Text style={styles.highlightValue}>{card.value}</Text>
                  </Animated.View>
                ))}
              </View>

              <View style={styles.actionGrid}>
                {homeActions.map((action, idx) => (
                  <Animated.View
                    key={action.label}
                    entering={FadeInDown.delay(260 + idx * 60)
                      .springify()
                      .damping(15)}
                    style={[
                      styles.actionWrapper,
                      idx !== homeActions.length - 1 && styles.horizontalSpacer,
                    ]}
                  >
                    <TouchableOpacity
                      style={[styles.actionCard, { backgroundColor: `${action.accent}15` }]}
                      onPress={action.onPress}
                    >
                      <View style={[styles.actionIconWrap, { backgroundColor: action.accent }]}>
                        <MaterialIcon name={action.icon as any} size={20} color={colors.white} />
                      </View>
                      <Text style={styles.actionLabel}>{action.label}</Text>
                    </TouchableOpacity>
                  </Animated.View>
                ))}
              </View>

              <View style={styles.analyticsCard}>
                <View style={styles.cardHeaderRow}>
                  <View>
                    <Text style={styles.cardTitle}>Cash flow</Text>
                    <Text style={styles.cardSubtitle}>Visualize income vs expense</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setChartType(chartType === 'pie' ? 'bar' : 'pie')}
                  >
                    <MaterialIcon
                      name={chartType === 'pie' ? 'bar-chart' : 'pie-chart'}
                      size={22}
                      color={colors.primary}
                    />
                  </TouchableOpacity>
                </View>

                <View style={styles.controlsRow}>
                  <SimpleButtonGroup
                    buttons={['Week', 'Month']}
                    selectedIndex={period === 'week' ? 0 : 1}
                    onPress={(i) => setPeriod(i === 0 ? 'week' : 'month')}
                    containerStyle={{ flex: 1, marginRight: 8 }}
                  />
                  <SimpleButtonGroup
                    buttons={['Pie', 'Bar']}
                    selectedIndex={chartType === 'pie' ? 0 : 1}
                    onPress={(i) => setChartType(i === 0 ? 'pie' : 'bar')}
                    containerStyle={{ flex: 1, marginLeft: 8 }}
                  />
                </View>

                {isLoading ? (
                  <Animated.View style={[styles.skeletonBox, shimmerStyle]} />
                ) : pieData.length > 0 ||
                  weeklyBar.income?.some(Boolean) ||
                  weeklyBar.expense?.some(Boolean) ? (
                  <View style={styles.chartWrapper}>
                    {chartType === 'pie' && PieChart ? (
                      <PieChart
                        data={pieData}
                        width={CHART_WIDTH}
                        height={220}
                        chartConfig={chartConfig}
                        accessor="population"
                        backgroundColor="transparent"
                        paddingLeft="18"
                        absolute
                        hasLegend
                      />
                    ) : chartType === 'bar' && BarChart ? (
                      <BarChart
                        data={{
                          labels: weeklyBar.labels,
                          datasets: [
                            {
                              data: weeklyBar.income,
                              color: () => colors.accentGreen,
                              label: 'Income',
                            },
                            {
                              data: weeklyBar.expense,
                              color: () => colors.accentRed,
                              label: 'Expense',
                            },
                          ],
                        }}
                        width={CHART_WIDTH}
                        height={220}
                        yAxisLabel="₹"
                        chartConfig={chartConfig}
                        showValuesOnTopOfBars
                        fromZero
                        style={{ borderRadius: 18, marginTop: 6, paddingRight: 0 }}
                      />
                    ) : (
                      <Text style={styles.unavailable}>Chart library missing</Text>
                    )}
                  </View>
                ) : (
                  <View style={styles.emptyState}>
                    <Text style={styles.unavailable}>No data in this period.</Text>
                  </View>
                )}
              </View>

              <View style={styles.insightsCard}>
                <View style={styles.cardHeaderRow}>
                  <View>
                    <Text style={styles.cardTitle}>Insights</Text>
                    <Text style={styles.cardSubtitle}>Auto-curated from your activity</Text>
                  </View>
                  <MaterialIcon name="lightbulb" size={22} color={colors.accentOrange} />
                </View>
                <View style={styles.insightGrid}>
                  {insightRows.map((row) => (
                    <View key={row.label} style={styles.insightItem}>
                      <View style={styles.insightIconWrap}>
                        <MaterialIcon name={row.icon as any} size={18} color={colors.primary} />
                      </View>
                      <View style={styles.insightTextWrap}>
                        <Text style={styles.insightLabel}>{row.label}</Text>
                        <Text style={styles.insightValue}>{row.value}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Recent transactions</Text>
                <TouchableOpacity onPress={() => navigation.navigate('History')}>
                  <Text style={styles.seeAll}>See all</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          }
          ListEmptyComponent={
            <View style={styles.emptyTransactions}>
              <MaterialIcon name="hourglass-empty" size={36} color={colors.muted} />
              <Text style={styles.unavailable}>No recent activity</Text>
              <TouchableOpacity
                style={styles.emptyCta}
                onPress={() => navigation.navigate('AddEntry')}
              >
                <Text style={styles.emptyCtaText}>Log your first entry</Text>
              </TouchableOpacity>
            </View>
          }
        />
      </SafeAreaView>
    </View>
  );
};

export default HomeScreen;

/* =======================================================
   MODERN STYLES
========================================================= */

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing(2),
    paddingTop: spacing(3),
    paddingBottom: spacing(16),
  },
  listHeaderSpacing: {
    paddingBottom: spacing(3),
  },
  heroCard: {
    backgroundColor: colors.softCard,
    borderRadius: 28,
    padding: spacing(3),
    marginBottom: spacing(3),
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 6,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing(2),
  },
  heroSubtle: {
    color: colors.muted,
    fontSize: 14,
    marginBottom: 4,
  },
  heroGreeting: {
    fontSize: 22,
    color: colors.text,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  heroSettings: {
    backgroundColor: colors.card,
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroLabel: {
    color: colors.muted,
    fontSize: 13,
    marginBottom: 4,
  },
  heroLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing(1),
  },
  heroPeriod: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  heroBalance: {
    color: colors.text,
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -1,
  },
  trendBadge: {
    marginTop: spacing(2),
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
  },
  trendText: {
    fontWeight: '600',
    fontSize: 12,
    marginLeft: 6,
  },
  heroStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing(3),
  },
  heroStatCard: {
    flex: 1,
    backgroundColor: colors.card,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroStatSpacing: {
    marginRight: 12,
  },
  heroStatLabel: {
    color: colors.muted,
    fontSize: 12,
    marginBottom: 6,
  },
  heroStatValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  highlightRow: {
    flexDirection: 'row',
    marginBottom: spacing(3),
  },
  highlightCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  highlightLabel: {
    marginTop: 8,
    color: colors.muted,
    fontSize: 12,
  },
  highlightValue: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 16,
    marginTop: 2,
  },
  actionGrid: {
    flexDirection: 'row',
    marginBottom: spacing(3),
  },
  actionWrapper: {
    flex: 1,
  },
  actionCard: {
    borderRadius: 20,
    padding: 16,
    alignItems: 'flex-start',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  actionLabel: {
    color: colors.text,
    fontWeight: '700',
  },
  analyticsCard: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: spacing(3),
    marginBottom: spacing(3),
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 3,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing(2),
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  cardSubtitle: {
    color: colors.muted,
    fontSize: 13,
  },
  controlsRow: {
    flexDirection: 'row',
    marginBottom: spacing(2),
  },
  chartWrapper: {
    alignItems: 'center',
  },
  emptyState: {
    paddingVertical: spacing(4),
    alignItems: 'center',
  },
  unavailable: {
    color: colors.muted,
    fontSize: 13,
  },
  skeletonBox: {
    height: 200,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 18,
  },
  insightsCard: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: spacing(3),
    marginBottom: spacing(3),
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 18,
    elevation: 4,
  },
  insightGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing(2),
  },
  insightItem: {
    width: '50%',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  insightIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  insightTextWrap: {
    flex: 1,
  },
  insightLabel: {
    color: colors.muted,
    fontSize: 12,
  },
  insightValue: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 15,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing(2),
    paddingTop: spacing(1),
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  seeAll: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 13,
  },
  emptyTransactions: {
    alignItems: 'center',
    padding: spacing(4),
    backgroundColor: colors.card,
    borderRadius: 20,
    marginHorizontal: spacing(2),
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyCta: {
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  emptyCtaText: {
    color: colors.white,
    fontWeight: '600',
  },
  horizontalSpacer: {
    marginRight: 12,
  },
});

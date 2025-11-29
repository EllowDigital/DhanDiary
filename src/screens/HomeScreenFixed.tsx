import React, { useMemo, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  Platform,
  StatusBar,
  useWindowDimensions,
  FlatList,
} from 'react-native';
import { Text } from '@rneui/themed';
import SimpleButtonGroup from '../components/SimpleButtonGroup';
import TransactionCard from '../components/TransactionCard';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../hooks/useAuth';
import { useEntries } from '../hooks/useEntries';

import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  Easing,
  FadeInDown,
} from 'react-native-reanimated';

import { spacing, colors, shadows } from '../utils/design';

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
  '#4F46E5', // Indigo
  '#06B6D4', // Cyan
  '#22C55E', // Green
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#A855F7', // Purple
];

const HomeScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { entries = [], isLoading = false } = useEntries(user?.id);
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
    if (period === 'week') {
      const labels: string[] = [];
      const incomeMap: Record<string, number> = {};
      const expenseMap: Record<string, number> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        labels.push(d.toLocaleDateString(undefined, { weekday: 'short' }));
        const key = d.toISOString().slice(0, 10);
        incomeMap[key] = 0;
        expenseMap[key] = 0;
      }
      (entries || []).forEach((e: any) => {
        try {
          const k = new Date(e.date || e.created_at).toISOString().slice(0, 10);
          if (k in incomeMap && e.type === 'in') incomeMap[k] += Number(e.amount || 0);
          if (k in expenseMap && e.type === 'out') expenseMap[k] += Number(e.amount || 0);
        } catch (err) {}
      });
      const income = Object.keys(incomeMap).map((k) => incomeMap[k]);
      const expense = Object.keys(expenseMap).map((k) => expenseMap[k]);
      return { labels, income, expense };
    }

    // month -> aggregate into last 4 weekly buckets
    const weekLabels: string[] = [];
    const weekIncome: number[] = [0, 0, 0, 0];
    const weekExpense: number[] = [0, 0, 0, 0];
    for (let w = 3; w >= 0; w--) {
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - w * 7);
      const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 6);
      weekLabels.push(`${start.getDate()}-${end.getDate()}`);
    }
    (entries || []).forEach((e: any) => {
      try {
        const d = new Date(e.date || e.created_at);
        if (isNaN(d.getTime())) return;
        const daysAgo = Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
        const bucket = Math.floor(daysAgo / 7);
        if (bucket >= 0 && bucket < 4) {
          if (e.type === 'in') weekIncome[3 - bucket] += Number(e.amount || 0);
          if (e.type === 'out') weekExpense[3 - bucket] += Number(e.amount || 0);
        }
      } catch (err) {}
    });
    return { labels: weekLabels, income: weekIncome, expense: weekExpense };
  }, [entries, period]);

  const recent = (entries || []).slice(0, 5);

  // Use pieExpenseData for pie chart (can toggle to pieIncomeData if needed)
  const pieData = pieExpenseData;

  const chartConfig = {
    backgroundColor: '#ffffff',
    backgroundGradientFrom: '#ffffff',
    backgroundGradientTo: '#ffffff',
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(79, 70, 229, ${opacity})`, // Primary Brand Color
    labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
  };

  /* --- ANIMATIONS --- */
  const shimmer = useSharedValue(0);
  useEffect(() => {
    shimmer.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
  }, []);
  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: 0.3 + 0.7 * shimmer.value,
  }));

  /* --- ACTIONS --- */
  const quickAdd = () => {
    Alert.alert('Quick Add', 'Add Cash (IN) or Cash (OUT)?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Cash (IN)',
        onPress: () => navigation.navigate('AddEntry', { defaultType: 'in' }),
      },
      {
        text: 'Cash (OUT)',
        onPress: () => navigation.navigate('AddEntry', { defaultType: 'out' }),
      },
    ]);
  };

  return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <SafeAreaView style={styles.safeArea}>
        <FlatList
          data={recent}
          keyExtractor={(item) => item.local_id}
          renderItem={({ item }) => <TransactionCard item={item} />}
          initialNumToRender={5}
          maxToRenderPerBatch={5}
          windowSize={6}
          removeClippedSubviews={true}
          contentContainerStyle={{
            ...styles.scrollContent,
            paddingBottom: spacing(10),
          }}
          ListHeaderComponent={
            <Animated.View entering={FadeInDown.delay(100).duration(500)}>
              {/* HEADER */}
              <View style={styles.header}>
                <View>
                  <Text style={styles.greeting}>
                    Hi, {user?.name ? user.name.toUpperCase() : 'USER'} 👋
                  </Text>
                  <Text style={styles.subGreeting}>Track & manage your finances</Text>
                </View>
                {/* Optional: Add a profile pic or settings icon here */}
              </View>

              {/* BALANCE CARD */}
              <View style={styles.balanceCard}>
                <Text style={styles.balanceLabel}>Total Balance</Text>
                <Text style={styles.balanceAmount}>₹{balance.toFixed(2)}</Text>

                <View style={styles.statsRow}>
                  <View style={styles.statBlock}>
                    <View style={[styles.iconCircle, { backgroundColor: '#dcfce7' }]}>
                      <MaterialIcon name="arrow-downward" size={20} color={colors.accentGreen} />
                    </View>
                    <View style={styles.statTextWrap}>
                      <Text style={styles.statLabel}>Income</Text>
                      <Text style={styles.income}>₹{totalIn.toFixed(2)}</Text>
                    </View>
                  </View>

                  <View style={styles.separator} />

                  <View style={styles.statBlock}>
                    <View style={[styles.iconCircle, { backgroundColor: '#fee2e2' }]}>
                      <MaterialIcon name="arrow-upward" size={20} color={colors.accentRed} />
                    </View>
                    <View style={styles.statTextWrap}>
                      <Text style={styles.statLabel}>Expense</Text>
                      <Text style={styles.expense}>₹{totalOut.toFixed(2)}</Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* QUICK ACTIONS ROW: single Add button + Logs */}
              <View style={styles.actionsContainer}>
                <TouchableOpacity
                  style={styles.addActionBtn}
                  onPress={() => navigation.navigate('AddEntry')}
                >
                  <MaterialIcon name="add" size={22} color="#fff" />
                  <Text style={styles.addActionText}>Add</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.miniActionBtn}
                  onPress={() => navigation.navigate('History')}
                >
                  <MaterialIcon name="list" size={24} color={colors.primary} />
                  <Text style={styles.miniActionText}>Logs</Text>
                </TouchableOpacity>
              </View>

              {/* ANALYTICS SECTION */}
              <View style={styles.card}>
                <View style={styles.chartHeader}>
                  <Text style={styles.cardTitle}>Cash Flow</Text>
                </View>

                {/* Controls moved to own row to prevent overlapping */}
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
                  (weeklyBar.income && weeklyBar.income.length > 0) ||
                  (weeklyBar.expense && weeklyBar.expense.length > 0) ? (
                  <View style={styles.chartWrapper}>
                    {chartType === 'pie' && PieChart ? (
                      <PieChart
                        data={pieData}
                        width={CHART_WIDTH}
                        height={220}
                        chartConfig={chartConfig}
                        accessor="population"
                        backgroundColor="transparent"
                        paddingLeft="15"
                        center={[CHART_WIDTH / 4, 0]}
                        absolute
                        hasLegend={true}
                      />
                    ) : chartType === 'bar' && BarChart ? (
                      <BarChart
                        data={{
                          labels: weeklyBar.labels,
                          datasets: [
                            { data: weeklyBar.income, color: () => '#22C55E', label: 'Income' },
                            { data: weeklyBar.expense, color: () => '#EF4444', label: 'Expense' },
                          ],
                        }}
                        width={CHART_WIDTH}
                        height={220}
                        yAxisLabel="₹"
                        chartConfig={chartConfig}
                        verticalLabelRotation={0}
                        showValuesOnTopOfBars
                        fromZero
                        style={{
                          borderRadius: 16,
                          marginVertical: 8,
                          paddingRight: 0,
                        }}
                      />
                    ) : (
                      <Text style={styles.unavailable}>Chart Library Missing</Text>
                    )}
                  </View>
                ) : (
                  <View style={styles.emptyState}>
                    <Text style={styles.unavailable}>No data in this period.</Text>
                  </View>
                )}
              </View>

              {/* RECENT TRANSACTIONS HEADER */}
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Recent Transactions</Text>
                <TouchableOpacity onPress={() => navigation.navigate('History')}>
                  <Text style={styles.seeAll}>See All</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          }
          ListEmptyComponent={
            <View style={styles.card}>
              <Text style={styles.unavailable}>No recent activity</Text>
            </View>
          }
        />
        {/* FAB removed from Home screen (Add is available in action row) */}
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
    backgroundColor: colors.background || '#F9FAFB',
  },
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing(2),
    paddingTop: Platform.OS === 'android' ? spacing(4) : spacing(1), // FIX: Status bar overlap
    paddingBottom: spacing(16), // FIX: Bottom nav overlap
  },

  /* HEADER */
  header: {
    marginBottom: spacing(3),
    marginTop: spacing(1),
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greeting: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1F2937',
    letterSpacing: -0.5,
  },
  subGreeting: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
    fontWeight: '500',
  },

  /* BALANCE CARD - Modernized */
  balanceCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: spacing(3),
    marginBottom: spacing(3),
    // Modern soft shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.02)',
  },
  balanceLabel: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    fontWeight: '600',
    marginBottom: 4,
  },
  balanceAmount: {
    textAlign: 'center',
    fontSize: 32,
    fontWeight: '800',
    color: '#111827',
    marginBottom: spacing(3),
    letterSpacing: -1,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statBlock: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  statTextWrap: {
    justifyContent: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  separator: {
    width: 1,
    height: 30,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 10,
  },
  income: {
    color: '#166534', // Darker green for contrast
    fontWeight: '700',
    fontSize: 15,
  },
  expense: {
    color: '#991B1B', // Darker red for contrast
    fontWeight: '700',
    fontSize: 15,
  },

  /* ACTIONS ROW */
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: spacing(3),
  },
  miniActionBtn: {
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    gap: 6,
  },
  miniActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },

  addActionBtn: {
    backgroundColor: '#4F46E5',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    gap: 8,
  },
  addActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 6,
  },

  /* GENERAL CARD */
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: spacing(3),
    marginBottom: spacing(3),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  chartHeader: {
    marginBottom: spacing(2),
    alignItems: 'center',
  },
  controlsRow: {
    flexDirection: 'row',
    marginBottom: spacing(2),
    justifyContent: 'space-between',
  },
  chartWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible', // Prevents clipping
  },
  emptyState: {
    padding: 20,
    alignItems: 'center',
  },
  unavailable: {
    color: '#9CA3AF',
    textAlign: 'center',
    fontSize: 14,
  },
  skeletonBox: {
    height: 180,
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
  },

  /* TRANSACTIONS */
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing(2),
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  seeAll: {
    color: '#4F46E5',
    fontWeight: '600',
    fontSize: 13,
  },

  /* FAB */
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 30, // FIX: Moved up slightly
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#4F46E5',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
});

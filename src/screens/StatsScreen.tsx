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

// --- ANIMATION CONFIG ---
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// --- COLOR UTILS ---
const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
    : '0, 0, 0';
};

const FILTERS = ['7D', '30D', 'Month', 'Year'];

// Chart Colors
const PIE_COLORS = ['#FF6B6B', '#4ECDC4', '#FFD93D', '#6C5CE7', '#A8E6CF', '#FD79A8'];

const chartConfig = {
  backgroundColor: 'transparent',
  backgroundGradientFrom: '#ffffff',
  backgroundGradientTo: '#ffffff',
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(${hexToRgb(colors.primary || '#6200ee')}, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(0,0,0, ${opacity})`,
};

// --- TYPES ---
interface PieDataPoint {
  name: string;
  population: number;
  color: string;
  legendFontColor: string;
  legendFontSize: number;
}

interface TrendDataPoint {
  label: string;
  value: number;
}

const StatsScreen = () => {
  const { width, height } = useWindowDimensions();
  const { user, loading: authLoading } = useAuth();
  const { entries = [], isLoading, refetch } = useEntries(user?.id);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  const [filter, setFilter] = useState('7D');

  // --- DATA LOADING ---
  useEffect(() => {
    const unsub = subscribeEntries(() => {
      try {
        refetch();
      } catch (e) {}
    });
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 20 }),
    ]).start();
    return () => unsub();
  }, [refetch]);

  // --- RESPONSIVE LAYOUT CALCS ---
  const isTablet = width > 700;
  const isSmallPhone = width < 380;

  const containerWidth = Math.min(760, width - 32);
  const donutSize = isTablet ? 280 : Math.min(width * 0.55, 220);
  const innerSize = Math.round(donutSize * 0.6);

  // --- STATS LOGIC ---
  const filteredEntries = useMemo(() => {
    const startDate = getStartDateForFilter(filter);
    return entries.filter((e: any) => {
      const d = dayjs(e.date || e.created_at);
      return !d.isBefore(startDate);
    });
  }, [entries, filter]);

  // Totals
  const stats = useMemo(() => {
    return filteredEntries.reduce(
      (acc: { totalIn: number; totalOut: number; net: number }, entry: any) => {
        const amount = Number(entry.amount) || 0;
        if (entry.type === 'in') acc.totalIn += amount;
        else acc.totalOut += amount;
        return acc;
      },
      { totalIn: 0, totalOut: 0, net: 0 }
    );
  }, [filteredEntries]);
  stats.net = stats.totalIn - stats.totalOut;

  // Ratios
  const savingsRate = stats.totalIn > 0 ? Math.max(0, (stats.net / stats.totalIn) * 100) : 0;

  const maxExpense = useMemo(() => {
    const expenses = filteredEntries
      .filter((e: any) => e.type === 'out')
      .map((e: any) => Number(e.amount));
    return expenses.length ? Math.max(...expenses) : 0;
  }, [filteredEntries]);

  const maxIncome = useMemo(() => {
    const incomes = filteredEntries
      .filter((e: any) => e.type === 'in')
      .map((e: any) => Number(e.amount));
    return incomes.length ? Math.max(...incomes) : 0;
  }, [filteredEntries]);

  // Chart Data
  const dailyTrend = useMemo(() => {
    const labels: string[] = [];
    const values: number[] = []; // Explicitly typed as number[]
    const indexByKey = new Map<string, number>();
    const now = dayjs();
    const startDate = getStartDateForFilter(filter, now);
    const days = getDaysCountForFilter(filter, now);

    for (let i = 0; i < days; i++) {
      const d = startDate.add(i, 'day');
      const key = d.format('YYYY-MM-DD');
      labels.push(d.format(days > 15 ? 'DD' : 'ddd'));
      values.push(0);
      indexByKey.set(key, i);
    }

    filteredEntries.forEach((e: any) => {
      if (e.type === 'out') {
        const key = dayjs(e.date).format('YYYY-MM-DD');
        const idx = indexByKey.get(key);
        if (idx !== undefined) values[idx] += Number(e.amount);
      }
    });

    return labels.map((l, i) => ({ label: l, value: values[i] }));
  }, [filteredEntries, filter]);

  // Donut Data
  const pieData = useMemo<PieDataPoint[]>(() => {
    // Added Record<string, number> to handle the accumulator index type error
    const cats = filteredEntries
      .filter((e: any) => e.type === 'out')
      .reduce<Record<string, number>>((acc, e: any) => {
        const c = ensureCategory(e.category);
        acc[c] = (acc[c] || 0) + Number(e.amount);
        return acc;
      }, {});

    return Object.entries(cats)
      .map(([name, val], i) => ({
        name,
        population: val,
        color: PIE_COLORS[i % PIE_COLORS.length],
        legendFontColor: '#333',
        legendFontSize: 12,
      }))
      .sort((a, b) => b.population - a.population);
  }, [filteredEntries]);

  const hasTrendData = dailyTrend.some((d) => d.value > 0);
  const trendTotal = dailyTrend.reduce((a, b) => a + b.value, 0);
  const activeDays = dailyTrend.filter((d) => d.value > 0).length;
  const avgDaily = activeDays ? Math.round(trendTotal / activeDays) : 0;

  // Explicitly typed reduction to handle the null initial value
  const peakDay = dailyTrend.reduce<TrendDataPoint | null>(
    (a, b) => (!a || b.value > a.value ? b : a),
    null
  );

  const handleFilterPress = (f: string) => {
    if (f !== filter) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setFilter(f);
    }
  };

  if (isLoading || authLoading)
    return <ActivityIndicator style={styles.centered} size="large" color={colors.primary} />;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F9FC" />

      {/* HEADER */}
      <View style={[styles.headerContainer, { width: containerWidth }]}>
        <ScreenHeader
          title="Analytics"
          subtitle="Financial health overview"
          showScrollHint={false}
          useSafeAreaPadding={false}
        />
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(120, height * 0.15) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={{
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
            width: containerWidth,
            alignSelf: 'center',
          }}
        >
          {/* 1. FILTER TABS */}
          <View style={styles.segmentControl}>
            {FILTERS.map((f) => {
              const isActive = filter === f;
              return (
                <Pressable
                  key={f}
                  style={[styles.segmentBtn, isActive && styles.segmentBtnActive]}
                  onPress={() => handleFilterPress(f)}
                >
                  <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>
                    {f}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* 2. NET BALANCE CARD */}
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.labelMuted}>NET BALANCE</Text>
              <View
                style={[styles.badge, { backgroundColor: stats.net >= 0 ? '#E8F5E9' : '#FFEBEE' }]}
              >
                <MaterialIcon
                  name={stats.net >= 0 ? 'trending-up' : 'trending-down'}
                  size={16}
                  color={stats.net >= 0 ? '#2E7D32' : '#C62828'}
                />
                <Text style={[styles.badgeText, { color: stats.net >= 0 ? '#2E7D32' : '#C62828' }]}>
                  {stats.net >= 0 ? 'Surplus' : 'Deficit'}
                </Text>
              </View>
            </View>

            <Text
              style={[styles.bigValue, { color: stats.net >= 0 ? '#2E7D32' : '#C62828' }]}
              adjustsFontSizeToFit
              numberOfLines={1}
            >
              {stats.net >= 0 ? '+' : ''}₹{Math.abs(stats.net).toLocaleString()}
            </Text>

            <View style={styles.divider} />

            <View style={styles.rowBetween}>
              <View>
                <Text style={styles.labelMutedSmall}>Income</Text>
                <Text style={styles.subValueGreen}>₹{stats.totalIn.toLocaleString()}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.labelMutedSmall}>Expense</Text>
                <Text style={styles.subValueRed}>₹{stats.totalOut.toLocaleString()}</Text>
              </View>
            </View>
          </View>

          {/* 3. RESPONSIVE GRID */}
          <View style={styles.gridContainer}>
            <View style={[styles.gridCard, isSmallPhone && styles.gridCardFull]}>
              <View style={[styles.iconBox, { backgroundColor: '#E3F2FD' }]}>
                <MaterialIcon name="savings" size={24} color="#1976D2" />
              </View>
              <View style={styles.gridContent}>
                <Text style={styles.gridValue}>{savingsRate.toFixed(0)}%</Text>
                <Text style={styles.gridLabel} numberOfLines={1}>
                  Savings Rate
                </Text>
              </View>
            </View>

            <View style={[styles.gridCard, isSmallPhone && styles.gridCardFull]}>
              <View style={[styles.iconBox, { backgroundColor: '#E8F5E9' }]}>
                <MaterialIcon name="arrow-upward" size={24} color="#2E7D32" />
              </View>
              <View style={styles.gridContent}>
                <Text style={styles.gridValue} adjustsFontSizeToFit numberOfLines={1}>
                  ₹{maxIncome > 10000 ? (maxIncome / 1000).toFixed(1) + 'k' : maxIncome}
                </Text>
                <Text style={styles.gridLabel} numberOfLines={1}>
                  Max Income
                </Text>
              </View>
            </View>

            <View style={[styles.gridCard, isSmallPhone && styles.gridCardFull]}>
              <View style={[styles.iconBox, { backgroundColor: '#FFEBEE' }]}>
                <MaterialIcon name="arrow-downward" size={24} color="#C62828" />
              </View>
              <View style={styles.gridContent}>
                <Text style={styles.gridValue} adjustsFontSizeToFit numberOfLines={1}>
                  ₹{maxExpense > 10000 ? (maxExpense / 1000).toFixed(1) + 'k' : maxExpense}
                </Text>
                <Text style={styles.gridLabel} numberOfLines={1}>
                  Max Expense
                </Text>
              </View>
            </View>
          </View>

          {/* 4. TREND CHART */}
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <View>
                <Text style={styles.cardTitle}>Daily Trend</Text>
                <Text style={styles.cardSubtitle}>7 Dec - 13 Dec 2025</Text>
              </View>
              <MaterialIcon name="bar-chart" size={24} color="#90A4AE" />
            </View>

            <View style={[styles.rowBetween, { marginTop: 20, marginBottom: 10 }]}>
              <View>
                <Text style={styles.labelMutedSmall}>DAILY AVG</Text>
                <Text style={styles.chartStatValue}>₹{avgDaily}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.labelMutedSmall}>PEAK DAY</Text>
                <Text style={styles.chartStatValue}>₹{peakDay ? peakDay.value : 0}</Text>
              </View>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingRight: 20 }}
            >
              {hasTrendData ? (
                <DailyTrendChart
                  data={dailyTrend}
                  width={Math.max(containerWidth - 40, dailyTrend.length * 50)}
                />
              ) : (
                <View style={styles.emptyChart}>
                  <Text style={styles.emptyText}>No spending data for this period</Text>
                </View>
              )}
            </ScrollView>
          </View>

          {/* 5. DONUT */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Expense Breakdown</Text>
            {pieData.length > 0 ? (
              <View style={{ alignItems: 'center', marginTop: 20 }}>
                <View style={{ width: donutSize, height: donutSize }}>
                  <PieChart
                    data={pieData}
                    width={donutSize}
                    height={donutSize}
                    chartConfig={chartConfig}
                    accessor="population"
                    backgroundColor="transparent"
                    // FIX: paddingLeft requires string
                    paddingLeft={String(donutSize / 4)}
                    hasLegend={false}
                    absolute={false}
                  />
                  <View
                    style={[
                      styles.donutHole,
                      {
                        width: innerSize,
                        height: innerSize,
                        borderRadius: innerSize / 2,
                        top: (donutSize - innerSize) / 2,
                        left: (donutSize - innerSize) / 2,
                      },
                    ]}
                  >
                    <Text style={styles.holeValue} adjustsFontSizeToFit numberOfLines={1}>
                      ₹
                      {stats.totalOut > 999
                        ? (stats.totalOut / 1000).toFixed(1) + 'k'
                        : stats.totalOut}
                    </Text>
                  </View>
                </View>

                <View style={styles.legendContainer}>
                  {pieData.slice(0, 4).map((item, i) => (
                    <View key={i} style={styles.legendItem}>
                      <View style={[styles.dot, { backgroundColor: item.color }]} />
                      <Text style={styles.legendText}>{item.name}</Text>
                      {/* FIX: Explicitly typed 'item' now has population */}
                      <Text style={styles.legendNum}>
                        {Math.round((item.population / stats.totalOut) * 100)}%
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : (
              <Text style={[styles.emptyText, { textAlign: 'center', padding: 20 }]}>
                No expenses
              </Text>
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
    backgroundColor: '#F7F9FC',
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerContainer: { alignSelf: 'center', marginBottom: 10, paddingHorizontal: 4 },
  container: { flex: 1 },
  scrollContent: { paddingTop: 10, paddingHorizontal: 16 },

  // --- FILTER ---
  segmentControl: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    elevation: 1,
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
  },
  segmentBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  segmentBtnActive: { backgroundColor: colors.primary },
  segmentText: { color: '#90A4AE', fontWeight: '600', fontSize: 13 },
  segmentTextActive: { color: '#fff' },

  // --- CARDS ---
  card: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 2,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  divider: { height: 1, backgroundColor: '#F0F0F0', marginVertical: 16 },

  // --- TYPOGRAPHY ---
  labelMuted: {
    fontSize: 12,
    fontWeight: '700',
    color: '#90A4AE',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  labelMutedSmall: {
    fontSize: 11,
    fontWeight: '700',
    color: '#90A4AE',
    textTransform: 'uppercase',
    marginBottom: 4,
  },

  badge: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignItems: 'center',
    gap: 4,
  },
  badgeText: { fontSize: 12, fontWeight: '700' },

  bigValue: { fontSize: 32, fontWeight: '800', marginTop: 8 },
  subValueGreen: { fontSize: 18, fontWeight: '700', color: '#2E7D32' },
  subValueRed: { fontSize: 18, fontWeight: '700', color: '#C62828' },

  cardTitle: { fontSize: 18, fontWeight: '700', color: '#263238' },
  cardSubtitle: { fontSize: 12, color: '#90A4AE', marginTop: 2 },
  chartStatValue: { fontSize: 16, fontWeight: '700', color: '#263238' },

  // --- SMART GRID ---
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
    justifyContent: 'space-between',
  },
  gridCard: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 2,
  },
  gridCardFull: { minWidth: '48%' },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridContent: { flex: 1 },
  gridValue: { fontSize: 16, fontWeight: '700', color: '#263238' },
  gridLabel: { fontSize: 11, color: '#90A4AE', marginTop: 2 },

  // --- CHART HELPERS ---
  emptyChart: { height: 150, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#B0BEC5', fontStyle: 'italic' },

  donutHole: {
    position: 'absolute',
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
  },
  holeValue: { fontSize: 20, fontWeight: '800', color: '#263238' },

  legendContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16,
    marginTop: 16,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, color: '#546E7A', fontWeight: '500' },
  legendNum: { fontSize: 12, color: '#263238', fontWeight: '700' },
});

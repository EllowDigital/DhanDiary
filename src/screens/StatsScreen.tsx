import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Animated,
  LayoutAnimation,
  Pressable,
  StatusBar,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@rneui/themed';
import { useEntries } from '../hooks/useEntries';
import { useAuth } from '../hooks/useAuth';
import dayjs from 'dayjs';
import { colors } from '../utils/design';
import { ensureCategory } from '../constants/categories';
import ScreenHeader from '../components/ScreenHeader';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import DailyTrendChart from '../components/charts/DailyTrendChart';
import { LocalEntry } from '../types/entries';
import asyncAggregator, { aggregateFromPages } from '../utils/asyncAggregator';
import { fetchEntriesGenerator } from '../services/firestoreEntries';
// Standard import for stability on Android
import { PieChart } from 'react-native-chart-kit';

// --- UTILITIES & HELPERS ---

const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
    : '0, 0, 0';
};

const calcStats = (entries: LocalEntry[] = []) => {
  const amounts = (entries || [])
    .map((e) => Number(e.amount) || 0)
    .filter((a) => Number.isFinite(a));

  const count = amounts.length;
  if (count === 0) return { count: 0, mean: 0, median: 0, stddev: 0 };

  const mean = amounts.reduce((s, v) => s + v, 0) / count;
  const sorted = [...amounts].sort((a, b) => a - b);
  const median =
    count % 2 === 1 ? sorted[(count - 1) / 2] : (sorted[count / 2 - 1] + sorted[count / 2]) / 2;

  const variance = amounts.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / count;
  const stddev = Math.sqrt(variance);

  return { count, mean, median, stddev };
};

const FILTERS = ['Day', 'Week', '7 Days', '30 Days', 'This Month', 'This Year', 'All'];
const PIE_COLORS = ['#FF6B6B', '#4ECDC4', '#FFD93D', '#6C5CE7', '#A8E6CF', '#FD79A8'];

const CHART_CONFIG = {
  backgroundColor: 'transparent',
  backgroundGradientFrom: '#ffffff',
  backgroundGradientTo: '#ffffff',
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(${hexToRgb(colors.primary || '#6200ee')}, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(0,0,0, ${opacity})`,
};

// --- TYPES ---
interface PieDataPoint {
  key?: string;
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
  const { entries: entriesRaw = [], isLoading } = useEntries(user?.uid);
  const entries = entriesRaw as LocalEntry[];

  // --- ANIMATIONS ---
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  // --- STATE ---
  const [filter, setFilter] = useState('7 Days');
  const [activeMonthKey, setActiveMonthKey] = useState<string | null>(null);
  const [activeYear, setActiveYear] = useState<number | null>(null);

  // --- INITIALIZATION ---
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 20 }),
    ]).start();
  }, []);

  // --- RESPONSIVE LAYOUT CALCS ---
  const isTablet = width > 700;
  const isSmallPhone = width < 380;

  // Constrain width for large screens (tablets/foldables)
  const containerWidth = Math.min(760, width - 32);

  // Chart sizing logic
  const donutSize = isTablet ? 280 : Math.min(width * 0.55, 220);
  const innerSize = Math.round(donutSize * 0.6); // 60% of chart size
  const holeOffset = (donutSize - innerSize) / 2; // Center position

  // --- DATE & RANGE LOGIC ---
  const availableMonths = useMemo(() => {
    const uniques = new Map<string, dayjs.Dayjs>();
    entries.forEach((entry) => {
      const date = dayjs(entry.date || entry.created_at);
      if (!date.isValid()) return;
      const monthStart = date.startOf('month');
      const key = monthStart.format('YYYY-MM');
      if (!uniques.has(key)) {
        uniques.set(key, monthStart);
      }
    });
    return Array.from(uniques.entries())
      .sort((a, b) => b[1].valueOf() - a[1].valueOf())
      .map(([key, date]) => ({ key, label: date.format('MMM YYYY'), date }));
  }, [entries]);

  const availableYears = useMemo(() => {
    const uniqueYears = new Set<number>();
    availableMonths.forEach((month) => uniqueYears.add(month.date.year()));
    return Array.from(uniqueYears).sort((a, b) => b - a);
  }, [availableMonths]);

  const monthsByYear = useMemo(() => {
    const map = new Map<number, { key: string; label: string; date: dayjs.Dayjs }[]>();
    availableMonths.forEach((month) =>
      map.set(month.date.year(), [...(map.get(month.date.year()) || []), month])
    );
    // Sort months within years descending
    map.forEach((list, year) => {
      map.set(
        year,
        [...list].sort((a, b) => b.date.valueOf() - a.date.valueOf())
      );
    });
    return map;
  }, [availableMonths]);

  // Sync active month/year defaults
  useEffect(() => {
    if (
      availableMonths.length &&
      (!activeMonthKey || !availableMonths.some((m) => m.key === activeMonthKey))
    ) {
      setActiveMonthKey(availableMonths[0].key);
    }
  }, [availableMonths, activeMonthKey]);

  useEffect(() => {
    if (availableYears.length) {
      if (activeYear === null || !availableYears.includes(activeYear)) {
        setActiveYear(availableYears[0]);
      }
    } else if (activeYear === null) {
      setActiveYear(dayjs().year());
    }
  }, [availableYears, activeYear]);

  const monthsForActiveYear = useMemo(() => {
    if (activeYear === null) return [];
    return monthsByYear.get(activeYear) || [];
  }, [monthsByYear, activeYear]);

  // --- FILTER & DATA CALCULATION ---
  const { rangeStart, rangeEnd } = useMemo(() => {
    const current = dayjs();
    let start = current;
    let end = current.endOf('day');

    switch (filter) {
      case 'Day':
        start = current.startOf('day');
        break;
      case 'Week':
        start = current.startOf('week');
        end = current.endOf('week');
        break;
      case '7 Days':
        start = current.subtract(6, 'day').startOf('day');
        break;
      case '30 Days':
        start = current.subtract(29, 'day').startOf('day');
        break;
      case 'This Month': {
        const key = activeMonthKey || current.format('YYYY-MM');
        const base = dayjs(`${key}-01`);
        start = base.isValid() ? base.startOf('month') : current.startOf('month');
        end = base.isValid() ? base.endOf('month') : current.endOf('month');
        break;
      }
      case 'This Year': {
        const year = activeYear ?? current.year();
        start = dayjs().year(year).startOf('year');
        end = start.endOf('year');
        break;
      }
      case 'All': {
        if (availableMonths.length > 0) {
          // Start from the earliest recorded month
          start = availableMonths[availableMonths.length - 1].date.startOf('month');
        } else {
          start = dayjs(0);
        }
        end = dayjs();
        break;
      }
    }
    return { rangeStart: start, rangeEnd: end };
  }, [filter, activeMonthKey, activeYear, availableMonths]);

  const rangeDescription = useMemo(() => {
    return `${rangeStart.format('DD MMM')} - ${rangeEnd.format('DD MMM YYYY')}`;
  }, [rangeStart, rangeEnd]);

  const filteredEntries = useMemo<LocalEntry[]>(() => {
    return entries.filter((entry) => {
      const d = dayjs(entry.date || entry.created_at);
      // Inclusive comparison
      return (
        (d.isSame(rangeStart) || d.isAfter(rangeStart)) &&
        (d.isSame(rangeEnd) || d.isBefore(rangeEnd))
      );
    });
  }, [entries, rangeStart, rangeEnd]);

  // Currency handled by async aggregator when available

  // Basic Stats (Totals) - baseline (fast path for small datasets)
  const baseStats = useMemo(() => {
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
  
  // Advanced Stats - baseline
  const baseAdvanced = useMemo(() => {
    const overall = calcStats(filteredEntries);
    const days = Math.max(1, rangeEnd.diff(rangeStart, 'day') + 1);
    const totalAmount = filteredEntries.reduce((s, e) => s + Number(e.amount || 0), 0);
    const avgPerDay = Math.round(totalAmount / days);
    return { overall, avgPerDay };
  }, [filteredEntries, rangeStart, rangeEnd]);

  const baseTopExpenseCategories = useMemo(() => {
    const map: Record<string, number> = {};
    filteredEntries
      .filter((e) => e.type === 'out')
      .forEach((e) => {
        const c = ensureCategory(e.category || 'General');
        map[c] = (map[c] || 0) + (Number(e.amount) || 0);
      });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, value]) => ({ name, value }));
  }, [filteredEntries]);

  // Max/Min for Grid
  const baseMaxes = useMemo(() => {
    let maxIn = 0,
      maxOut = 0;
    filteredEntries.forEach((e) => {
      const val = Number(e.amount) || 0;
      if (e.type === 'in') maxIn = Math.max(maxIn, val);
      else maxOut = Math.max(maxOut, val);
    });
    return { maxIncome: maxIn, maxExpense: maxOut };
  }, [filteredEntries]);

  // --- CHART DATA PREP ---
  const baseDailyTrend = useMemo(() => {
    const diffDays = rangeEnd.diff(rangeStart, 'day');
    const totalDays = Math.max(1, diffDays + 1);

    // Create map of Date -> Value
    const dayMap = new Map<string, number>();
    for (let i = 0; i < totalDays; i++) {
      dayMap.set(rangeStart.add(i, 'day').format('YYYY-MM-DD'), 0);
    }

    filteredEntries.forEach((entry) => {
      if (entry.type === 'out') {
        const key = dayjs(entry.date || entry.created_at).format('YYYY-MM-DD');
        if (dayMap.has(key)) {
          dayMap.set(key, (dayMap.get(key) || 0) + Number(entry.amount));
        }
      }
    });

    const labels: string[] = [];
    const values: number[] = [];
    let counter = 0;

    dayMap.forEach((val, keyStr) => {
      values.push(val);
      // Only show label every few days if range is large to prevent clutter
      const dateObj = dayjs(keyStr);
      if (totalDays > 20) {
        labels.push(counter % 4 === 0 ? dateObj.format('DD') : '');
      } else {
        labels.push(dateObj.format('ddd'));
      }
      counter++;
    });

    return labels.map((label, i) => ({ label, value: values[i] }));
  }, [filteredEntries, rangeStart, rangeEnd]);

  const basePieData = useMemo<PieDataPoint[]>(() => {
    const cats = filteredEntries
      .filter((entry) => entry.type === 'out')
      .reduce<Record<string, number>>((acc, entry) => {
        const c = ensureCategory(entry.category);
        acc[c] = (acc[c] || 0) + Number(entry.amount);
        return acc;
      }, {});

    return Object.entries(cats)
      .map(([name, val], i) => ({
        key: `${name}-${i}`,
        name,
        population: val,
        color: PIE_COLORS[i % PIE_COLORS.length],
        legendFontColor: '#333',
        legendFontSize: 12,
      }))
      .sort((a, b) => b.population - a.population);
  }, [filteredEntries]);

  // Computation state & async aggregation to avoid blocking UI on large datasets
  const [computing, setComputing] = useState(false);
  const EMPTY_COMPUTED: any = {
    isReady: false,
    totalIn: 0n,
    totalOut: 0n,
    net: 0n,
    count: 0,
    mean: 0,
    median: 0,
    stddev: 0,
    dailyTrend: [],
    pieData: [],
    topCategories: [],
    maxIncome: 0,
    maxExpense: 0,
    currency: 'INR',
  };
  const [computed, setComputed] = useState<any>(EMPTY_COMPUTED);

  useEffect(() => {
    let cancelled = false;
    let timedOut = false;
    // If there are no entries in range, short-circuit to avoid work
    if (!filteredEntries || filteredEntries.length === 0) {
      setComputed(EMPTY_COMPUTED);
      setComputing(false);
      return;
    }
    setComputing(true);
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    (async () => {
      try {
        const TIMEOUT_MS = 12000;
        // If the filter is 'All' or the filtered set is large, stream pages from Firestore
        let aggPromise: Promise<any>;
        const LARGE_LOCAL_THRESHOLD = 200000;
        if (filter === 'All' || (filteredEntries && filteredEntries.length > LARGE_LOCAL_THRESHOLD)) {
          const pages = fetchEntriesGenerator(user?.uid || '', 500);
          aggPromise = aggregateFromPages(pages, rangeStart, rangeEnd, { signal: controller?.signal ?? null });
        } else {
          aggPromise = asyncAggregator.aggregateForRange(filteredEntries, rangeStart, rangeEnd, { signal: controller?.signal ?? null });
        }
        const timeoutPromise = new Promise<null>((res) => setTimeout(() => res(null), TIMEOUT_MS));
        const res: any = await Promise.race([aggPromise, timeoutPromise]);
        if (cancelled) return;
        if (res === null) {
          // timed out — fall back to base values
          timedOut = true;
          console.warn('Aggregation timed out; using fallback stats');
          setComputed(EMPTY_COMPUTED);
          // Abort the running aggregator so it stops consuming CPU
          try {
            controller?.abort();
          } catch (e) {
            /* ignore */
          }
        } else {
          if (!timedOut) setComputed({ ...res, isReady: true });
        }
      } catch (err) {
        console.error('Aggregation error', err);
        // keep base values if aggregation fails
        if (!cancelled) setComputed(EMPTY_COMPUTED);
      } finally {
        if (!cancelled) setComputing(false);
      }
    })();
    return () => {
      cancelled = true;
      try {
        controller?.abort();
      } catch (e) {
        /* ignore */
      }
    };
  }, [filteredEntries, rangeStart, rangeEnd]);

  // Prefer computed results when available (fast fallback for small data)
  const stats = computed && computed.isReady
    ? {
        totalIn: Number(computed.totalIn ?? 0n) / 100,
        totalOut: Number(computed.totalOut ?? 0n) / 100,
        net: Number(computed.net ?? 0n) / 100,
      }
    : baseStats || { totalIn: 0, totalOut: 0, net: 0 };

  const advancedStats = computed && computed.isReady
    ? {
        overall: {
          count: computed.count ?? 0,
          mean: computed.mean ?? 0,
          median: computed.median ?? 0,
          stddev: computed.stddev ?? 0,
        },
        avgPerDay: Math.round((Number((computed.totalIn ?? 0n) - (computed.totalOut ?? 0n)) / 100) / Math.max(1, rangeEnd.diff(rangeStart, 'day') + 1)),
      }
    : baseAdvanced || { overall: { count: 0, mean: 0, median: 0, stddev: 0 }, avgPerDay: 0 };

  const topExpenseCategories: { name: string; value: number }[] = computed && computed.isReady
    ? (computed.topCategories || []).map((c: any) => ({ name: String(c.name), value: Math.round(Number(c.value) || 0) }))
    : (baseTopExpenseCategories || []);
  const maxIncome = (computed && computed.isReady ? (computed.maxIncome ?? 0) : (baseMaxes?.maxIncome ?? 0));
  const maxExpense = (computed && computed.isReady ? (computed.maxExpense ?? 0) : (baseMaxes?.maxExpense ?? 0));

  const dailyTrend = (computed && computed.isReady ? (computed.dailyTrend || []) : (baseDailyTrend || [])) as TrendDataPoint[];
  const pieData = (computed && computed.isReady && computed.pieData
    ? (computed.pieData as any[]).map((p: any, i: number) => ({
        key: `${p.name}-${i}`,
        name: p.name,
        population: p.value,
        color: PIE_COLORS[i % PIE_COLORS.length],
        legendFontColor: '#333',
        legendFontSize: 12,
      }))
    : (basePieData || [])) as PieDataPoint[];

  // Currency symbol from computed or fallback
  const currencySymbol = useMemo(() => {
    const symbolMap: Record<string, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };
    const currency = (computed && computed.isReady) ? computed.currency : (filteredEntries[0]?.currency || 'INR');
    return symbolMap[currency] || symbolMap.INR;
  }, [computed, filteredEntries]);

  baseStats.net = baseStats.totalIn - baseStats.totalOut;

  const savingsRate = stats && stats.totalIn > 0 ? Math.max(0, (stats.net / stats.totalIn) * 100) : 0;

  // Ensure numeric primitives for rendering to avoid undefined issues
  const totalInNum = Number(stats?.totalIn ?? 0);
  const totalOutNum = Number(stats?.totalOut ?? 0);
  const netNum = Number(stats?.net ?? (totalInNum - totalOutNum));
  const maxIncomeNum = Number(maxIncome ?? 0);
  const maxExpenseNum = Number(maxExpense ?? 0);

  const hasTrendData = dailyTrend.some((d: TrendDataPoint) => d.value > 0);
  const peakDay = dailyTrend.reduce<TrendDataPoint | null>(
    (a: TrendDataPoint | null, b: TrendDataPoint) => (!a || b.value > a.value ? b : a),
    null
  );

  // Trend averages
  const activeDaysCount = dailyTrend.filter((d: TrendDataPoint) => d.value > 0).length;
  const trendTotal = dailyTrend.reduce((a: number, b: TrendDataPoint) => a + b.value, 0);
  const avgDailySpending = activeDaysCount ? Math.round(trendTotal / activeDaysCount) : 0;

  // --- HANDLERS ---
  const handleFilterPress = (f: string) => {
    if (f !== filter) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setFilter(f);
    }
  };

  const handleMonthSelect = (key: string, jumpToMonthView = false) => {
    if (activeMonthKey !== key) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setActiveMonthKey(key);
    }
    if (jumpToMonthView && filter !== 'This Month') {
      setFilter('This Month');
    }
  };

  const handleYearSelect = (year: number) => {
    if (year === activeYear) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActiveYear(year);
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
          subtitle="Income and spending at a glance"
          showScrollHint={false}
          useSafeAreaPadding={false}
        />
        <Text style={styles.headerHint}>Use tabs to switch timeframe.</Text>
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
          <View>
            {computing && (
              <View style={{ alignItems: 'center', marginBottom: 8 }}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            )}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.segmentScroll}
            >
              <View style={styles.segmentControl}>
                {FILTERS.map((f) => {
                  const isActive = filter === f;
                  return (
                    <Pressable
                      key={f}
                      style={[styles.segmentBtnCompact, isActive && styles.segmentBtnActiveCompact]}
                      onPress={() => handleFilterPress(f)}
                    >
                      <Text
                        style={[styles.segmentTextCompact, isActive && styles.segmentTextActive]}
                      >
                        {f}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

            {/* SUB-FILTERS (Month/Year chips) */}
            {filter === 'This Month' && availableMonths.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.timeSlider}
              >
                {availableMonths.map((month) => {
                  const isActive = month.key === activeMonthKey;
                  return (
                    <Pressable
                      key={month.key}
                      style={[styles.timeChip, isActive && styles.timeChipActive]}
                      onPress={() => handleMonthSelect(month.key)}
                    >
                      <Text style={[styles.timeChipText, isActive && styles.timeChipTextActive]}>
                        {month.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            {filter === 'This Year' && (
              <View style={styles.yearSelectorContainer}>
                {availableYears.length > 0 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.timeSlider}
                  >
                    {availableYears.map((year) => {
                      const isActive = year === activeYear;
                      return (
                        <Pressable
                          key={year}
                          style={[styles.timeChip, isActive && styles.timeChipActive]}
                          onPress={() => handleYearSelect(year)}
                        >
                          <Text
                            style={[styles.timeChipText, isActive && styles.timeChipTextActive]}
                          >
                            {year}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}
                {monthsForActiveYear.length > 0 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={[styles.timeSlider, { marginTop: 6 }]}
                  >
                    {monthsForActiveYear.map((month) => (
                      <Pressable
                        key={`${month.key}-shortcut`}
                        style={styles.monthShortcutChip}
                        onPress={() => handleMonthSelect(month.key, true)}
                      >
                        <MaterialIcon name="chevron-right" size={14} color={colors.primary} />
                        <Text style={styles.monthShortcutText}>{month.date.format('MMM')}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                )}
              </View>
            )}
          </View>

          {/* 2. NET BALANCE CARD */}
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.labelMuted}>Net balance</Text>
              <View
                style={[styles.badge, { backgroundColor: netNum >= 0 ? '#E8F5E9' : '#FFEBEE' }]}
              >
                <MaterialIcon
                  name={netNum >= 0 ? 'trending-up' : 'trending-down'}
                  size={16}
                  color={netNum >= 0 ? '#2E7D32' : '#C62828'}
                />
                <Text style={[styles.badgeText, { color: netNum >= 0 ? '#2E7D32' : '#C62828' }]}> 
                  {netNum >= 0 ? 'Surplus' : 'Deficit'}
                </Text>
              </View>
            </View>

            <Text
              style={[styles.bigValue, { color: netNum >= 0 ? '#2E7D32' : '#C62828' }]}
              adjustsFontSizeToFit
              numberOfLines={1}
            >
              {netNum >= 0 ? '+' : ''}
              {currencySymbol}
              {Math.abs(netNum).toLocaleString()}
            </Text>

            <View style={styles.divider} />

            <View style={styles.rowBetween}>
              <View>
                <Text style={styles.labelMutedSmall}>Income</Text>
                <Text style={styles.subValueGreen}>
                  {currencySymbol}
                  {totalInNum.toLocaleString()}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.labelMutedSmall}>Expense</Text>
                <Text style={styles.subValueRed}>
                  {currencySymbol}
                  {totalOutNum.toLocaleString()}
                </Text>
              </View>
            </View>
          </View>

          {/* 3. ADVANCED STATS */}
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <View>
                <Text style={styles.cardTitle}>Statistics</Text>
                <Text style={styles.cardSubtitle}>Key metrics & averages</Text>
              </View>
              <MaterialIcon name="insights" size={22} color="#90A4AE" />
            </View>

            <View style={{ marginTop: 16 }}>
              {/* Row 1 */}
              <View style={[styles.rowBetween, { marginBottom: 12 }]}>
                <View style={styles.statCol}>
                  <Text style={styles.labelMutedSmall}>Transactions</Text>
                  <Text style={styles.chartStatValue}>{advancedStats.overall.count}</Text>
                </View>
                <View style={[styles.statCol, { alignItems: 'center' }]}>
                  <Text style={styles.labelMutedSmall}>Avg / Day</Text>
                  <Text style={styles.chartStatValue}>
                    {currencySymbol}
                    {advancedStats.avgPerDay}
                  </Text>
                </View>
                <View style={[styles.statCol, { alignItems: 'flex-end' }]}>
                  <Text style={styles.labelMutedSmall}>Net</Text>
                  <Text style={styles.chartStatValue}>
                    {currencySymbol}
                    {netNum.toLocaleString()}
                  </Text>
                </View>
              </View>

              {/* Row 2 */}
              <View style={[styles.rowBetween, { marginBottom: 16 }]}>
                <View style={styles.statCol}>
                  <Text style={styles.labelMutedSmall}>Mean</Text>
                  <Text style={styles.chartStatValue}>
                    {currencySymbol}
                    {Math.round(advancedStats.overall.mean)}
                  </Text>
                </View>
                <View style={[styles.statCol, { alignItems: 'center' }]}>
                  <Text style={styles.labelMutedSmall}>Median</Text>
                  <Text style={styles.chartStatValue}>
                    {currencySymbol}
                    {Math.round(advancedStats.overall.median)}
                  </Text>
                </View>
                <View style={[styles.statCol, { alignItems: 'flex-end' }]}>
                  <Text style={styles.labelMutedSmall}>Std Dev</Text>
                  <Text style={styles.chartStatValue}>
                    {currencySymbol}
                    {Math.round(advancedStats.overall.stddev)}
                  </Text>
                </View>
              </View>

              {/* Top Categories */}
              <View style={styles.topCatsContainer}>
                <Text style={[styles.labelMutedSmall, { marginBottom: 8 }]}>
                  Top Expense Categories
                </Text>
                {topExpenseCategories.length > 0 ? (
                  topExpenseCategories.map((c: { name: string; value: number }, i: number) => (
                    <View key={c.name} style={styles.catRow}>
                      <Text style={styles.catName}>
                        {i + 1}. {c.name}
                      </Text>
                      <Text style={styles.catValue}>
                        {currencySymbol}
                        {Math.round(c.value).toLocaleString()}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.emptyText}>No expense data yet</Text>
                )}
              </View>
            </View>
          </View>

          {/* 4. SMART RESPONSIVE GRID */}
          <View style={styles.gridContainer}>
            {/* Savings Rate */}
            <View
              style={[styles.gridCard, isSmallPhone ? styles.gridCardHalf : styles.gridCardThird]}
            >
              <View style={[styles.iconBox, { backgroundColor: '#E3F2FD' }]}>
                <MaterialIcon name="savings" size={20} color="#1976D2" />
              </View>
              <View style={styles.gridContent}>
                <Text style={styles.gridValue}>{savingsRate.toFixed(0)}%</Text>
                <Text style={styles.gridLabel} numberOfLines={1}>
                  Savings
                </Text>
              </View>
            </View>

            {/* Max Income */}
            <View
              style={[styles.gridCard, isSmallPhone ? styles.gridCardHalf : styles.gridCardThird]}
            >
              <View style={[styles.iconBox, { backgroundColor: '#E8F5E9' }]}>
                <MaterialIcon name="arrow-upward" size={20} color="#2E7D32" />
              </View>
              <View style={styles.gridContent}>
                <Text style={styles.gridValue} adjustsFontSizeToFit numberOfLines={1}>
                  {maxIncomeNum > 9999 ? (maxIncomeNum / 1000).toFixed(1) + 'k' : maxIncomeNum}
                </Text>
                <Text style={styles.gridLabel} numberOfLines={1}>
                  Max In
                </Text>
              </View>
            </View>

            {/* Max Expense */}
            <View
              style={[styles.gridCard, isSmallPhone ? styles.gridCardFull : styles.gridCardThird]}
            >
              <View style={[styles.iconBox, { backgroundColor: '#FFEBEE' }]}>
                <MaterialIcon name="arrow-downward" size={20} color="#C62828" />
              </View>
              <View style={styles.gridContent}>
                <Text style={styles.gridValue} adjustsFontSizeToFit numberOfLines={1}>
                  {maxExpenseNum > 9999 ? (maxExpenseNum / 1000).toFixed(1) + 'k' : maxExpenseNum}
                </Text>
                <Text style={styles.gridLabel} numberOfLines={1}>
                  Max Out
                </Text>
              </View>
            </View>
          </View>

          {/* 5. TREND CHART */}
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <View>
                <Text style={styles.cardTitle}>Daily Trend</Text>
                <Text style={styles.cardSubtitle}>{rangeDescription}</Text>
              </View>
              <MaterialIcon name="bar-chart" size={24} color="#90A4AE" />
            </View>

            <View style={[styles.rowBetween, { marginTop: 20, marginBottom: 10 }]}>
              <View>
                <Text style={styles.labelMutedSmall}>DAILY AVG</Text>
                <Text style={styles.chartStatValue}>
                  {currencySymbol}
                  {avgDailySpending}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.labelMutedSmall}>PEAK DAY</Text>
                <Text style={styles.chartStatValue}>
                  {currencySymbol}
                  {peakDay ? peakDay.value : 0}
                </Text>
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
                <View style={[styles.emptyChart, { width: containerWidth - 40 }]}>
                  <Text style={styles.emptyText}>No spending data for this period</Text>
                </View>
              )}
            </ScrollView>
          </View>

          {/* 6. DONUT CHART */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Expense Breakdown</Text>
            {pieData.length > 0 ? (
              <View style={{ alignItems: 'center', marginTop: 20 }}>
                <View style={{ width: donutSize, height: donutSize, position: 'relative' }}>
                  <PieChart
                    data={pieData}
                    width={donutSize}
                    height={donutSize}
                    chartConfig={CHART_CONFIG}
                    accessor="population"
                    backgroundColor="transparent"
                    paddingLeft={String(donutSize / 4)}
                    hasLegend={false}
                    absolute={false}
                  />
                  {/* The Donut Hole */}
                  <View
                    style={[
                      styles.donutHole,
                      {
                        width: innerSize,
                        height: innerSize,
                        borderRadius: innerSize / 2,
                        top: holeOffset,
                        left: holeOffset,
                      },
                    ]}
                  >
                    <Text style={styles.holeValue} adjustsFontSizeToFit numberOfLines={1}>
                      {currencySymbol}
                      {stats.totalOut > 999
                        ? (stats.totalOut / 1000).toFixed(1) + 'k'
                        : stats.totalOut}
                    </Text>
                    <Text style={styles.holeLabel}>Total</Text>
                  </View>
                </View>

                {/* Legend */}
                <View style={styles.legendContainer}>
                  {pieData.slice(0, 5).map((item: PieDataPoint, i: number) => (
                    <View key={i} style={styles.legendItem}>
                      <View style={[styles.dot, { backgroundColor: item.color }]} />
                      <Text style={styles.legendText}>{item.name}</Text>
                      <Text style={styles.legendNum}>
                        {Math.round((item.population / stats.totalOut) * 100)}%
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : (
              <View style={styles.emptyChart}>
                <Text style={styles.emptyText}>No expenses to display</Text>
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
    backgroundColor: '#F7F9FC',
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  headerContainer: {
    alignSelf: 'center',
    marginBottom: 10,
    paddingHorizontal: 8,
  },
  headerHint: {
    color: '#546E7A',
    marginTop: 6,
    fontSize: 13,
    paddingLeft: 4,
  },

  container: { flex: 1 },
  scrollContent: { paddingTop: 10, paddingHorizontal: 16 },

  // --- FILTERS ---
  segmentScroll: { paddingHorizontal: 0, paddingBottom: 8 },
  segmentControl: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 6,
    marginBottom: 8,
    // Soft shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  segmentBtnCompact: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    marginHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActiveCompact: { backgroundColor: colors.primary },
  segmentTextCompact: { color: '#90A4AE', fontWeight: '600', fontSize: 13 },
  segmentTextActive: { color: '#fff' },

  // --- TIME SLIDER ---
  timeSlider: { flexDirection: 'row', paddingVertical: 8 },
  timeChip: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 18,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginRight: 8,
    backgroundColor: '#fff',
  },
  timeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  timeChipText: { fontSize: 13, fontWeight: '600', color: '#546E7A' },
  timeChipTextActive: { color: '#fff' },

  yearSelectorContainer: { marginBottom: 12 },
  monthShortcutChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginRight: 8,
    backgroundColor: 'rgba(98, 0, 238, 0.05)',
  },
  monthShortcutText: { color: colors.primary, fontWeight: '600', marginLeft: 4, fontSize: 12 },

  // --- COMMON CARD STYLES ---
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 2,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statCol: { flex: 1 },
  divider: { height: 1, backgroundColor: '#F0F0F0', marginVertical: 16 },

  // --- TEXT ---
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

  // --- STATS LIST ---
  topCatsContainer: { marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F5F5F5' },
  catRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  catName: { fontWeight: '600', color: '#37474F', fontSize: 13, flex: 1 },
  catValue: { color: '#546E7A', fontWeight: '600', fontSize: 13 },

  // --- SMART GRID ---
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
    justifyContent: 'space-between',
  },
  gridCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  // Responsive Widths
  gridCardThird: { flexGrow: 1, minWidth: '30%' },
  gridCardHalf: { flexGrow: 1, minWidth: '47%' },
  gridCardFull: { width: '100%' },

  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridContent: { flex: 1 },
  gridValue: { fontSize: 15, fontWeight: '700', color: '#263238' },
  gridLabel: { fontSize: 11, color: '#90A4AE', marginTop: 1 },

  // --- CHARTS ---
  emptyChart: { height: 120, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#B0BEC5', fontStyle: 'italic', fontSize: 13 },

  donutHole: {
    position: 'absolute',
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4, // Android shadow for hole
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  holeValue: { fontSize: 18, fontWeight: '800', color: '#263238' },
  holeLabel: { fontSize: 10, color: '#90A4AE', textTransform: 'uppercase', marginTop: 2 },

  legendContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginTop: 16,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, color: '#546E7A', fontWeight: '500' },
  legendNum: { fontSize: 12, color: '#263238', fontWeight: '700' },
});

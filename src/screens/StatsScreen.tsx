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
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@rneui/themed';
import { useEntries } from '../hooks/useEntries';
import { useAuth } from '../hooks/useAuth';
import dayjs from 'dayjs';
import { PieChart } from 'react-native-chart-kit';
import { colors } from '../utils/design';
import { ensureCategory } from '../constants/categories';
import ScreenHeader from '../components/ScreenHeader';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import DailyTrendChart from '../components/charts/DailyTrendChart';
import { LocalEntry } from '../types/entries';
import { exportEntriesAsCsv, exportEntriesAsPdf } from '../utils/reportExporter';

// --- COLOR UTILS ---
const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
    : '0, 0, 0';
};

const FILTERS = ['7D', '30D', 'This Month', 'This Year'];

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
  const { entries: entriesRaw = [], isLoading } = useEntries(user?.uid);
  const entries = entriesRaw as LocalEntry[];

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  const [filter, setFilter] = useState('7D');
  const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null);
  const [activeMonthKey, setActiveMonthKey] = useState<string | null>(null);
  const [activeYear, setActiveYear] = useState<number | null>(null);

  // --- DATA LOADING ---
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 20 }),
    ]).start();
  }, []);

  // --- RESPONSIVE LAYOUT CALCS ---
  const isTablet = width > 700;
  const isSmallPhone = width < 380;

  const containerWidth = Math.min(760, width - 32);
  const donutSize = isTablet ? 280 : Math.min(width * 0.55, 220);
  const innerSize = Math.round(donutSize * 0.6);

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
    map.forEach((list, year) => {
      map.set(
        year,
        [...list].sort((a, b) => b.date.valueOf() - a.date.valueOf())
      );
    });
    return map;
  }, [availableMonths]);

  useEffect(() => {
    if (!availableMonths.length) {
      setActiveMonthKey(null);
      return;
    }
    if (!activeMonthKey || !availableMonths.some((m) => m.key === activeMonthKey)) {
      setActiveMonthKey(availableMonths[0].key);
    }
  }, [availableMonths, activeMonthKey]);

  useEffect(() => {
    if (!availableYears.length) {
      if (activeYear === null) {
        setActiveYear(dayjs().year());
      }
      return;
    }
    if (activeYear === null || !availableYears.includes(activeYear)) {
      setActiveYear(availableYears[0]);
    }
  }, [availableYears, activeYear]);

  const monthsForActiveYear = useMemo(() => {
    if (activeYear === null) return [] as { key: string; label: string; date: dayjs.Dayjs }[];
    return monthsByYear.get(activeYear) || [];
  }, [monthsByYear, activeYear]);

  // --- STATS LOGIC ---
  const { rangeStart, rangeEnd } = useMemo(() => {
    const current = dayjs();
    let start = current.subtract(6, 'day').startOf('day');
    let end = current.endOf('day');

    if (filter === '7D') {
      start = current.subtract(6, 'day').startOf('day');
      end = current.endOf('day');
    } else if (filter === '30D') {
      start = current.subtract(29, 'day').startOf('day');
      end = current.endOf('day');
    } else if (filter === 'This Month') {
      const key = activeMonthKey || current.format('YYYY-MM');
      const base = dayjs(`${key}-01`);
      if (base.isValid()) {
        start = base.startOf('month');
        end = base.endOf('month');
      }
    } else if (filter === 'This Year') {
      const year = activeYear ?? current.year();
      const yearStart = dayjs().year(year).startOf('year');
      start = yearStart;
      end = yearStart.endOf('year');
    }

    return { rangeStart: start, rangeEnd: end };
  }, [filter, activeMonthKey, activeYear]);

  const rangeDescription = useMemo(() => {
    return `${rangeStart.format('DD MMM')} - ${rangeEnd.format('DD MMM YYYY')}`;
  }, [rangeStart, rangeEnd]);

  const filteredEntries = useMemo<LocalEntry[]>(() => {
    return entries.filter((entry) => {
      const d = dayjs(entry.date || entry.created_at);
      return !d.isBefore(rangeStart) && !d.isAfter(rangeEnd);
    });
  }, [entries, rangeStart, rangeEnd]);

  const currencySymbol = useMemo(() => {
    const symbolMap: Record<string, string> = {
      INR: '₹',
      USD: '$',
      EUR: '€',
      GBP: '£',
    };
    const currency = filteredEntries[0]?.currency || 'INR';
    return symbolMap[currency] || symbolMap.INR;
  }, [filteredEntries]);

  // Totals
  const stats = useMemo(() => {
    return filteredEntries.reduce(
      (acc: { totalIn: number; totalOut: number; net: number }, entry: LocalEntry) => {
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
      .filter((entry) => entry.type === 'out')
      .map((entry) => Number(entry.amount));
    return expenses.length ? Math.max(...expenses) : 0;
  }, [filteredEntries]);

  const maxIncome = useMemo(() => {
    const incomes = filteredEntries
      .filter((entry) => entry.type === 'in')
      .map((entry) => Number(entry.amount));
    return incomes.length ? Math.max(...incomes) : 0;
  }, [filteredEntries]);

  // Chart Data
  const totalRangeDays = useMemo(() => {
    const diff = rangeEnd.diff(rangeStart, 'day');
    return Math.max(1, diff + 1);
  }, [rangeStart, rangeEnd]);

  const dailyTrend = useMemo(() => {
    const labels: string[] = [];
    const values: number[] = [];
    const indexByKey = new Map<string, number>();

    for (let i = 0; i < totalRangeDays; i++) {
      const d = rangeStart.add(i, 'day');
      const key = d.format('YYYY-MM-DD');
      labels.push(d.format(totalRangeDays > 15 ? 'DD' : 'ddd'));
      values.push(0);
      indexByKey.set(key, i);
    }

    filteredEntries.forEach((entry) => {
      if (entry.type === 'out') {
        const key = dayjs(entry.date || entry.created_at).format('YYYY-MM-DD');
        const idx = indexByKey.get(key);
        if (idx !== undefined) values[idx] += Number(entry.amount);
      }
    });

    return labels.map((label, i) => ({ label, value: values[i] }));
  }, [filteredEntries, rangeStart, totalRangeDays]);

  // Donut Data
  const pieData = useMemo<PieDataPoint[]>(() => {
    // Added Record<string, number> to handle the accumulator index type error
    const cats = filteredEntries
      .filter((entry) => entry.type === 'out')
      .reduce<Record<string, number>>((acc, entry) => {
        const c = ensureCategory(entry.category);
        acc[c] = (acc[c] || 0) + Number(entry.amount);
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

  const handleMonthSelect = (key: string, jumpToMonthView = false) => {
    if (activeMonthKey !== key) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setActiveMonthKey(key);
    }
    if (jumpToMonthView && filter !== 'This Month') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setFilter('This Month');
    }
  };

  const handleYearSelect = (year: number) => {
    if (year === activeYear) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActiveYear(year);
  };

  const handleExport = async (format: 'pdf' | 'excel') => {
    if (!filteredEntries.length) {
      Alert.alert('No data to export', 'Add at least one entry before exporting a report.');
      return;
    }

    const summary = {
      totalIn: stats.totalIn,
      totalOut: stats.totalOut,
      net: stats.net,
      currencySymbol,
      filterLabel: filter,
    };
    const metadata = {
      title: 'DhanDiary Analytics',
      rangeLabel: rangeDescription,
      generatedAt: dayjs().format('DD MMM YYYY, HH:mm'),
    };

    try {
      setExporting(format);
      if (format === 'pdf') {
        await exportEntriesAsPdf(filteredEntries, summary, metadata);
      } else {
        await exportEntriesAsCsv(filteredEntries, metadata);
      }
      Alert.alert(
        'Report ready',
        format === 'pdf'
          ? 'PDF report shared successfully.'
          : 'Excel-compatible report shared successfully.'
      );
    } catch (error: any) {
      Alert.alert('Export failed', error?.message || 'Unable to share report. Please try again.');
    } finally {
      setExporting(null);
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
                        <Text style={[styles.timeChipText, isActive && styles.timeChipTextActive]}>
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

          {/* 2. REPORT EXPORTS */}
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <View>
                <Text style={styles.cardTitle}>Reports</Text>
                <Text style={styles.cardSubtitle}>Share your data as PDF or Excel</Text>
              </View>
              {exporting ? <ActivityIndicator size="small" color={colors.primary} /> : null}
            </View>

            <View style={styles.reportActions}>
              <Pressable
                style={[
                  styles.reportButton,
                  styles.reportButtonPrimary,
                  exporting && styles.reportButtonDisabled,
                ]}
                onPress={() => handleExport('pdf')}
                disabled={!!exporting}
              >
                <MaterialIcon name="picture-as-pdf" size={18} color="#fff" />
                <Text style={[styles.reportButtonText, styles.reportButtonTextPrimary]}>
                  PDF Report
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.reportButton,
                  styles.reportButtonSecondary,
                  exporting && styles.reportButtonDisabled,
                ]}
                onPress={() => handleExport('excel')}
                disabled={!!exporting}
              >
                <MaterialIcon name="table-view" size={18} color={colors.primary} />
                <Text style={[styles.reportButtonText, styles.reportButtonTextSecondary]}>
                  Excel Report
                </Text>
              </Pressable>
            </View>
          </View>

          {/* 3. NET BALANCE CARD */}
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

          {/* 4. RESPONSIVE GRID */}
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

          {/* 6. DONUT */}
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
  reportActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    flexWrap: 'wrap',
  },
  reportButton: {
    flex: 1,
    minWidth: '45%',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  reportButtonPrimary: { backgroundColor: colors.primary },
  reportButtonSecondary: { backgroundColor: '#E8F0FF' },
  reportButtonText: { fontSize: 14, fontWeight: '700' },
  reportButtonTextPrimary: { color: '#fff' },
  reportButtonTextSecondary: { color: colors.primary },
  reportButtonDisabled: { opacity: 0.5 },
  timeSlider: { flexDirection: 'row', paddingVertical: 8 },
  timeChip: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 18,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginRight: 10,
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
    paddingHorizontal: 12,
    marginRight: 10,
    backgroundColor: 'rgba(98, 0, 238, 0.08)',
  },
  monthShortcutText: { color: colors.primary, fontWeight: '600', marginLeft: 4, fontSize: 13 },

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

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
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
  InteractionManager,
  PixelRatio,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@rneui/themed';
import { useEntries } from '../hooks/useEntries';
import { useAuth } from '../hooks/useAuth';
import dayjs from 'dayjs';
import { colors } from '../utils/design';
import ScreenHeader from '../components/ScreenHeader';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import DailyTrendChart from '../components/charts/DailyTrendChart';
import { LocalEntry } from '../types/entries';
import asyncAggregator from '../utils/asyncAggregator';
import { fetchEntriesGenerator } from '../services/firestoreEntries';
import { PieChart } from 'react-native-chart-kit';

const FILTERS = ['Day', 'Week', '7 Days', '30 Days', 'This Month', 'This Year', 'All'];
const PIE_COLORS = ['#FF6B6B', '#4ECDC4', '#FFD93D', '#6C5CE7', '#A8E6CF', '#FD79A8'];

// Responsive scaling helper
const fontScale = (size: number) => size / PixelRatio.getFontScale();

const StatsScreen = () => {
  const { width } = useWindowDimensions();
  const { user, loading: authLoading } = useAuth();
  const { entries: entriesRaw = [], isLoading } = useEntries(user?.uid);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const abortControllerRef = useRef<AbortController | null>(null);

  const [filter, setFilter] = useState('7 Days');
  const [computing, setComputing] = useState(false);
  const [stats, setStats] = useState<any>(null);

  // --- RESPONSIVE UI SETUP ---
  const isSmallPhone = width < 360;
  const containerWidth = width > 700 ? 650 : width - 32;
  const donutSize = Math.min(containerWidth * 0.75, 240);
  const innerSize = Math.round(donutSize * 0.68);
  const holeOffset = (donutSize - innerSize) / 2;

  // Formatting for Trillions (Industry Level)
  const formatCompact = (val: number) => {
    if (val >= 10000000) return (val / 10000000).toFixed(1) + 'Cr';
    if (val >= 100000) return (val / 100000).toFixed(1) + 'L';
    if (val >= 1000) return (val / 1000).toFixed(1) + 'k';
    return Math.round(val).toString();
  };

  const { rangeStart, rangeEnd } = useMemo(() => {
    const current = dayjs();
    switch (filter) {
      case 'Day':
        return { rangeStart: current.startOf('day'), rangeEnd: current.endOf('day') };
      case 'Week':
        return { rangeStart: current.startOf('week'), rangeEnd: current.endOf('week') };
      case '30 Days':
        return {
          rangeStart: current.subtract(29, 'day').startOf('day'),
          rangeEnd: current.endOf('day'),
        };
      case 'This Year':
        return { rangeStart: current.startOf('year'), rangeEnd: current.endOf('year') };
      case 'All':
        return { rangeStart: dayjs(0), rangeEnd: current.endOf('day') };
      default:
        return {
          rangeStart: current.subtract(6, 'day').startOf('day'),
          rangeEnd: current.endOf('day'),
        };
    }
  }, [filter]);

  const runAnalysis = useCallback(async () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setComputing(true);
    await new Promise((r) => InteractionManager.runAfterInteractions(() => r(null)));

    try {
      let result;
      if (filter === 'All' || entriesRaw.length > 40000) {
        const pages = fetchEntriesGenerator(user?.uid || '', 1000);
        result = await asyncAggregator.aggregateFromPages(pages, rangeStart, rangeEnd, {
          signal: controller.signal,
        });
      } else {
        result = await asyncAggregator.aggregateForRange(entriesRaw, rangeStart, rangeEnd, {
          signal: controller.signal,
        });
      }

      if (result && !controller.signal.aborted) {
        const totalIn = Number(result.totalIn) / 100;
        const totalOut = Number(result.totalOut) / 100;
        const savingsRate = totalIn > 0 ? ((totalIn - totalOut) / totalIn) * 100 : 0;

        setStats({
          ...result,
          totalIn,
          totalOut,
          net: totalIn - totalOut,
          savingsRate: Math.max(0, savingsRate),
          pieData: (result.pieData || []).map((p: any, i: number) => ({
            ...p,
            population: p.value,
            color: PIE_COLORS[i % PIE_COLORS.length],
            legendFontColor: '#64748B',
            legendFontSize: 11,
          })),
        });
        Animated.parallel([
          Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true }),
        ]).start();
      }
    } catch (e) {
      console.log('Interrupted');
    } finally {
      setComputing(false);
    }
  }, [filter, rangeStart, rangeEnd, entriesRaw]);

  useEffect(() => {
    runAnalysis();
  }, [runAnalysis]);

  const currency = stats?.currency === 'USD' ? '$' : '₹';

  if (isLoading || authLoading)
    return <ActivityIndicator style={styles.centered} size="large" color={colors.primary} />;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" />

      <View style={[styles.headerContainer, { width: containerWidth }]}>
        <ScreenHeader
          title="Analytics"
          subtitle="Real-time financial telemetry"
          useSafeAreaPadding={false}
        />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Animated.View
          style={{
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
            width: containerWidth,
            alignSelf: 'center',
          }}
        >
          {/* 1. FILTER TABS */}
          <View style={styles.filterBox}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.segmentScroll}
            >
              <View style={styles.segmentControl}>
                {FILTERS.map((f) => (
                  <Pressable
                    key={f}
                    style={[styles.segmentBtn, filter === f && styles.segmentBtnActive]}
                    onPress={() => {
                      LayoutAnimation.easeInEaseOut();
                      setFilter(f);
                    }}
                  >
                    <Text style={[styles.segmentText, filter === f && styles.segmentTextActive]}>
                      {f}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
            {computing && (
              <ActivityIndicator size="small" color={colors.primary} style={styles.loader} />
            )}
          </View>

          {/* 2. NET VOLUME CARD */}
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.labelMuted}>AVAILABLE SURPLUS</Text>
              <View
                style={[
                  styles.badge,
                  { backgroundColor: (stats?.net ?? 0) >= 0 ? '#DCFCE7' : '#FEE2E2' },
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    { color: (stats?.net ?? 0) >= 0 ? '#166534' : '#991B1B' },
                  ]}
                >
                  {(stats?.net ?? 0) >= 0 ? 'Surplus' : 'Deficit'}
                </Text>
              </View>
            </View>

            <Text
              style={[styles.bigValue, { color: (stats?.net ?? 0) >= 0 ? '#059669' : '#DC2626' }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {(stats?.net ?? 0) >= 0 ? '+' : ''}
              {currency}
              {(stats?.net ?? 0).toLocaleString()}
            </Text>

            <View style={styles.divider} />

            <View style={styles.rowBetween}>
              <View>
                <Text style={styles.labelMutedSmall}>TOTAL INFLOW</Text>
                <Text style={styles.subValueGreen}>
                  {currency}
                  {(stats?.totalIn ?? 0).toLocaleString()}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.labelMutedSmall}>TOTAL OUTFLOW</Text>
                <Text style={styles.subValueRed}>
                  {currency}
                  {(stats?.totalOut ?? 0).toLocaleString()}
                </Text>
              </View>
            </View>
          </View>

          {/* 3. MNC METRICS GRID (Max In, Max Out, Savings) */}
          <View style={styles.gridContainer}>
            <View style={styles.gridCard}>
              <View style={[styles.iconBox, { backgroundColor: '#DBEAFE' }]}>
                <MaterialIcon name="trending-up" size={18} color="#1E40AF" />
              </View>
              <Text style={styles.gridLabel}>MAX IN</Text>
              <Text style={styles.gridValue} numberOfLines={1}>
                {currency}
                {formatCompact(stats?.maxIncome || 0)}
              </Text>
            </View>

            <View style={styles.gridCard}>
              <View style={[styles.iconBox, { backgroundColor: '#FEE2E2' }]}>
                <MaterialIcon name="trending-down" size={18} color="#991B1B" />
              </View>
              <Text style={styles.gridLabel}>MAX OUT</Text>
              <Text style={styles.gridValue} numberOfLines={1}>
                {currency}
                {formatCompact(stats?.maxExpense || 0)}
              </Text>
            </View>

            <View style={styles.gridCard}>
              <View style={[styles.iconBox, { backgroundColor: '#F0FDF4' }]}>
                <MaterialIcon name="savings" size={18} color="#166534" />
              </View>
              <Text style={styles.gridLabel}>SAVINGS</Text>
              <Text style={styles.gridValue}>{Math.round(stats?.savingsRate || 0)}%</Text>
            </View>
          </View>

          {/* 4. TOP EXPENSE LIST */}
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>Top Expense Sectors</Text>
              <MaterialIcon name="pie-chart-outline" size={20} color="#94A3B8" />
            </View>
            {stats?.pieData?.length > 0 ? (
              <View style={styles.catContainer}>
                {stats.pieData.slice(0, 5).map((cat: any) => (
                  <View key={cat.name} style={styles.catRow}>
                    <View style={[styles.catIndicator, { backgroundColor: cat.color }]} />
                    <Text style={styles.catName} numberOfLines={1}>
                      {cat.name}
                    </Text>
                    <Text style={styles.catVal}>
                      {currency}
                      {formatCompact(cat.value)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.emptyText}>Insufficient category data</Text>
            )}
          </View>

          {/* 5. TIME-SERIES VISUALIZATION */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Spending Trajectory</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {stats?.dailyTrend?.length > 0 ? (
                <DailyTrendChart
                  data={stats.dailyTrend}
                  width={Math.max(containerWidth - 40, stats.dailyTrend.length * 48)}
                />
              ) : (
                <View style={styles.emptyChart}>
                  <Text style={styles.emptyText}>Waiting for transaction stream...</Text>
                </View>
              )}
            </ScrollView>
          </View>

          {/* 6. COMPOSITION DONUT */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Outflow Distribution</Text>
            {stats?.pieData?.length > 0 ? (
              <View style={styles.pieCenter}>
                <View style={styles.relative}>
                  <PieChart
                    data={stats.pieData}
                    width={donutSize}
                    height={donutSize}
                    chartConfig={{ color: (op = 1) => `rgba(0,0,0,${op})` }}
                    accessor="population"
                    backgroundColor="transparent"
                    paddingLeft={String(donutSize / 4)}
                    hasLegend={false}
                  />
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
                    <Text style={styles.holeValue} numberOfLines={1}>
                      {currency}
                      {formatCompact(stats.totalOut)}
                    </Text>
                    <Text style={styles.holeLabel}>TOTAL</Text>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.emptyChart}>
                <Text style={styles.emptyText}>No data to visualize</Text>
              </View>
            )}
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8FAFC' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerContainer: { alignSelf: 'center', marginBottom: 10, paddingHorizontal: 16 },
  container: { flex: 1 },
  scrollContent: { paddingTop: 10, paddingHorizontal: 16, paddingBottom: 120 },
  filterBox: { marginBottom: 12, alignItems: 'center' },
  loader: { marginTop: 8 },
  segmentScroll: { paddingBottom: 4 },
  segmentControl: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 5,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  segmentBtn: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 12 },
  segmentBtnActive: { backgroundColor: colors.primary },
  segmentText: { color: '#64748B', fontWeight: '700', fontSize: fontScale(12) },
  segmentTextActive: { color: '#FFF' },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 28,
    padding: 24,
    marginBottom: 16,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 6 },
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  divider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 20 },
  labelMuted: { fontSize: fontScale(10), fontWeight: '900', color: '#94A3B8', letterSpacing: 1.2 },
  labelMutedSmall: { fontSize: fontScale(9), fontWeight: '900', color: '#94A3B8', marginBottom: 5 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: fontScale(10), fontWeight: '900', textTransform: 'uppercase' },
  bigValue: { fontSize: fontScale(32), fontWeight: '900', marginTop: 12, letterSpacing: -0.5 },
  subValueGreen: { fontSize: fontScale(18), fontWeight: '800', color: '#10B981' },
  subValueRed: { fontSize: fontScale(18), fontWeight: '800', color: '#EF4444' },
  gridContainer: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  gridCard: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 16,
    alignItems: 'center',
    elevation: 3,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  gridValue: { fontSize: fontScale(13), fontWeight: '900', color: '#1E293B' },
  gridLabel: { fontSize: fontScale(8), color: '#94A3B8', fontWeight: '900', marginBottom: 2 },
  cardTitle: { fontSize: fontScale(16), fontWeight: '800', color: '#1E293B' },
  catContainer: { marginTop: 15 },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  catIndicator: { width: 6, height: 6, borderRadius: 3, marginRight: 12 },
  catName: { flex: 1, fontSize: fontScale(13), color: '#475569', fontWeight: '600' },
  catVal: { fontSize: fontScale(13), fontWeight: '800', color: '#1E293B' },
  pieCenter: { alignItems: 'center', marginTop: 15 },
  relative: { position: 'relative' },
  donutHole: {
    position: 'absolute',
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
  },
  holeValue: { fontSize: fontScale(18), fontWeight: '900', color: '#0F172A' },
  holeLabel: { fontSize: fontScale(8), color: '#94A3B8', fontWeight: '900', marginTop: 2 },
  emptyChart: { height: 140, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#CBD5E1', fontStyle: 'italic', fontSize: fontScale(13) },
});

export default StatsScreen;

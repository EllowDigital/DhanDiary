import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  View, StyleSheet, ScrollView, ActivityIndicator, Animated, 
  LayoutAnimation, Pressable, StatusBar, useWindowDimensions, 
  InteractionManager, PixelRatio, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
import { Text } from '@rneui/themed';

const FILTERS = ['Day', 'Week', '7 Days', '30 Days', 'This Month', 'This Year', 'All'];
const PIE_COLORS = ['#FF6B6B', '#4ECDC4', '#FFD93D', '#6C5CE7', '#A8E6CF', '#FD79A8'];

// --- UTILS ---

// 1. Responsive Font Scaling for Android
const fontScale = (size: number) => size / PixelRatio.getFontScale();

// 2. Trillion-Safe Number Formatter
const formatCompact = (val: number) => {
  const abs = Math.abs(val);
  if (abs >= 10000000) return (val / 10000000).toFixed(2) + 'Cr';
  if (abs >= 100000) return (val / 100000).toFixed(2) + 'L';
  if (abs >= 1000) return (val / 1000).toFixed(1) + 'k';
  return Math.round(val).toLocaleString();
};

const StatsScreen = () => {
  const { width } = useWindowDimensions();
  const { user, loading: authLoading } = useAuth();
  const { entries: entriesRaw = [], isLoading } = useEntries(user?.uid);
  
  // Animation & Refs
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const abortControllerRef = useRef<AbortController | null>(null);

  // State
  const [filter, setFilter] = useState('7 Days');
  const [activeMonthKey, setActiveMonthKey] = useState<string | null>(null);
  const [activeYear, setActiveYear] = useState<number | null>(null);
  const [computing, setComputing] = useState(false);
  const [stats, setStats] = useState<any>(null);

  // Layout Constants
  const isTablet = width > 600;
  const contentWidth = isTablet ? 600 : width - 32;
  const donutSize = Math.min(contentWidth * 0.65, 240);
  const innerSize = Math.round(donutSize * 0.65);
  const holeOffset = (donutSize - innerSize) / 2;

  // --- 1. SMART DATE RANGE ---
  const { rangeStart, rangeEnd } = useMemo(() => {
    const current = dayjs();
    switch (filter) {
      case 'Day': return { rangeStart: current.startOf('day'), rangeEnd: current.endOf('day') };
      case 'Week': return { rangeStart: current.startOf('week'), rangeEnd: current.endOf('week') };
      case '7 Days': return { rangeStart: current.subtract(6, 'day').startOf('day'), rangeEnd: current.endOf('day') };
      case '30 Days': return { rangeStart: current.subtract(29, 'day').startOf('day'), rangeEnd: current.endOf('day') };
      case 'This Month': 
        const m = dayjs(`${activeMonthKey || current.format('YYYY-MM')}-01`);
        return { rangeStart: m.startOf('month'), rangeEnd: m.endOf('month') };
      case 'This Year':
        const y = current.year(activeYear || current.year());
        return { rangeStart: y.startOf('year'), rangeEnd: y.endOf('year') };
      case 'All': return { rangeStart: dayjs(0), rangeEnd: current.endOf('day') };
      default: return { rangeStart: current.subtract(6, 'day').startOf('day'), rangeEnd: current.endOf('day') };
    }
  }, [filter, activeMonthKey, activeYear]);

  // --- 2. ROBUST ASYNC CALCULATION ---
  const runAnalysis = useCallback(async () => {
    // Kill any running calculation immediately when filter changes
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setComputing(true);
    
    // Ensure UI navigation animation finishes before starting heavy math
    await new Promise(r => InteractionManager.runAfterInteractions(() => r(null)));

    try {
      let result;
      // Use Generator for massive datasets to prevent OOM (Out Of Memory)
      if (filter === 'All' || entriesRaw.length > 50000) {
        const pages = fetchEntriesGenerator(user?.uid || '', 1000);
        result = await asyncAggregator.aggregateFromPages(pages, rangeStart, rangeEnd, { signal: controller.signal });
      } else {
        result = await asyncAggregator.aggregateForRange(entriesRaw, rangeStart, rangeEnd, { signal: controller.signal });
      }

      // Check if component is still mounted and task wasn't aborted
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
          // Map Pie Data for UI
          pieData: (result.pieData || []).map((p: any, i: number) => ({
            ...p, 
            population: p.value, 
            color: PIE_COLORS[i % PIE_COLORS.length],
            legendFontColor: '#64748B', 
            legendFontSize: 11,
          }))
        });

        // Trigger Entry Animation
        Animated.parallel([
          Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true })
        ]).start();
      }
    } catch (e) {
      // Ignore AbortErrors, only log real errors
      if (e instanceof Error && e.message !== 'Aborted') console.warn('Calc Error', e);
    } finally {
      if (abortControllerRef.current === controller) {
        setComputing(false);
      }
    }
  }, [filter, rangeStart, rangeEnd, entriesRaw]);

  useEffect(() => { runAnalysis(); }, [runAnalysis]);

  const currency = stats?.currency === 'USD' ? '$' : '₹';

  if (isLoading || authLoading) return <ActivityIndicator style={styles.centered} size="large" color={colors.primary} />;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F9FC" />
      
      <View style={[styles.headerContainer, { width: contentWidth, alignSelf: 'center' }]}>
        <ScreenHeader title="Analytics" subtitle="Financial health overview" useSafeAreaPadding={false} />
      </View>

      <ScrollView 
        style={styles.container} 
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 120 }]} 
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }], width: contentWidth, alignSelf: 'center' }}>
          
          {/* 1. FILTER TABS */}
          <View style={styles.filterBox}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.segmentScroll}>
              <View style={styles.segmentControl}>
                {FILTERS.map((f) => (
                  <Pressable 
                    key={f} 
                    style={[styles.segmentBtn, filter === f && styles.segmentBtnActive]} 
                    onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setFilter(f); }}
                  >
                    <Text style={[styles.segmentText, filter === f && styles.segmentTextActive]}>{f}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
            {computing && <ActivityIndicator size="small" color={colors.primary} style={styles.loader} />}
          </View>

          {/* 2. NET BALANCE CARD */}
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.labelMuted}>NET BALANCE</Text>
              <View style={[styles.badge, { backgroundColor: (stats?.net ?? 0) >= 0 ? '#DCFCE7' : '#FEE2E2' }]}>
                <Text style={[styles.badgeText, { color: (stats?.net ?? 0) >= 0 ? '#166534' : '#991B1B' }]}>
                   {(stats?.net ?? 0) >= 0 ? 'Surplus' : 'Deficit'}
                </Text>
              </View>
            </View>

            <Text style={[styles.bigValue, { color: (stats?.net ?? 0) >= 0 ? '#059669' : '#DC2626' }]} numberOfLines={1} adjustsFontSizeToFit>
              {(stats?.net ?? 0) >= 0 ? '+' : ''}{currency}{(stats?.net ?? 0).toLocaleString()}
            </Text>

            <View style={styles.divider} />

            <View style={styles.rowBetween}>
              <View>
                <Text style={styles.labelMutedSmall}>INCOME</Text>
                <Text style={styles.subValueGreen}>{currency}{(stats?.totalIn ?? 0).toLocaleString()}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.labelMutedSmall}>EXPENSE</Text>
                <Text style={styles.subValueRed}>{currency}{(stats?.totalOut ?? 0).toLocaleString()}</Text>
              </View>
            </View>
          </View>

          {/* 3. MNC METRICS GRID (MAX IN | MAX OUT | SAVINGS) */}
          <View style={styles.gridContainer}>
             {/* Card 1: Max Income */}
             <View style={styles.gridCard}>
                <View style={[styles.iconBox, { backgroundColor: '#DBEAFE' }]}>
                  <MaterialIcon name="trending-up" size={20} color="#1E40AF" />
                </View>
                <Text style={styles.gridLabel}>MAX IN</Text>
                <Text style={styles.gridValue} numberOfLines={1} adjustsFontSizeToFit>
                  {currency}{formatCompact(stats?.maxIncome || 0)}
                </Text>
             </View>
             
             {/* Card 2: Max Expense */}
             <View style={styles.gridCard}>
                <View style={[styles.iconBox, { backgroundColor: '#FEE2E2' }]}>
                  <MaterialIcon name="trending-down" size={20} color="#991B1B" />
                </View>
                <Text style={styles.gridLabel}>MAX OUT</Text>
                <Text style={styles.gridValue} numberOfLines={1} adjustsFontSizeToFit>
                  {currency}{formatCompact(stats?.maxExpense || 0)}
                </Text>
             </View>

             {/* Card 3: Savings */}
             <View style={styles.gridCard}>
                <View style={[styles.iconBox, { backgroundColor: '#F0FDF4' }]}>
                  <MaterialIcon name="savings" size={20} color="#166534" />
                </View>
                <Text style={styles.gridLabel}>SAVINGS</Text>
                <Text style={styles.gridValue}>{Math.round(stats?.savingsRate || 0)}%</Text>
             </View>
          </View>

          {/* 4. TOP EXPENSE LIST (Responsive) */}
          <View style={styles.card}>
            <View style={styles.rowBetween}>
               <Text style={styles.cardTitle}>Top Expenses</Text>
               <MaterialIcon name="pie-chart-outline" size={20} color="#94A3B8" />
            </View>
            {stats?.pieData?.length > 0 ? (
              <View style={styles.catContainer}>
                {stats.pieData.slice(0, 5).map((cat: any) => (
                  <View key={cat.name} style={styles.catRow}>
                    <View style={styles.catLeft}>
                      <View style={[styles.catIndicator, { backgroundColor: cat.color }]} />
                      <Text style={styles.catName} numberOfLines={1}>{cat.name}</Text>
                    </View>
                    <Text style={styles.catVal}>{currency}{formatCompact(cat.value)}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>No category data available</Text>
              </View>
            )}
          </View>

          {/* 5. TREND CHART */}
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>Spending Trend</Text>
              <Text style={styles.cardSubtitle}>{filter}</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingTop: 20 }}>
              {stats?.dailyTrend?.length > 0 ? (
                <DailyTrendChart 
                  data={stats.dailyTrend} 
                  width={Math.max(contentWidth - 40, stats.dailyTrend.length * 45)} 
                />
              ) : (
                <View style={[styles.emptyChart, { width: contentWidth - 60 }]}>
                  <Text style={styles.emptyText}>No transactions found in this period</Text>
                </View>
              )}
            </ScrollView>
          </View>

          {/* 6. DONUT CHART */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Distribution</Text>
            {stats?.pieData?.length > 0 ? (
              <View style={styles.pieCenter}>
                <View style={styles.relative}>
                  <PieChart
                    data={stats.pieData}
                    width={donutSize} height={donutSize}
                    chartConfig={{ color: (op = 1) => `rgba(0,0,0,${op})` }}
                    accessor="population" backgroundColor="transparent"
                    paddingLeft={String(donutSize / 4)} hasLegend={false}
                  />
                  <View style={[styles.donutHole, { width: innerSize, height: innerSize, borderRadius: innerSize/2, top: holeOffset, left: holeOffset }]}>
                    <Text style={styles.holeValue} numberOfLines={1} adjustsFontSizeToFit>
                      {currency}{formatCompact(stats.totalOut)}
                    </Text>
                    <Text style={styles.holeLabel}>TOTAL</Text>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.emptyChart}><Text style={styles.emptyText}>No distribution data</Text></View>
            )}
          </View>

        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
};

// --- STYLING (Pixel Perfect) ---
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8FAFC' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerContainer: { marginBottom: 10, paddingHorizontal: 16 },
  container: { flex: 1 },
  scrollContent: { paddingTop: 10, paddingHorizontal: 16 },
  
  // Filters
  filterBox: { marginBottom: 12, alignItems: 'center' },
  loader: { marginTop: 8 },
  segmentScroll: { paddingBottom: 4 },
  segmentControl: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 16, padding: 5, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 },
  segmentBtn: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 12 },
  segmentBtnActive: { backgroundColor: colors.primary },
  segmentText: { color: '#64748B', fontWeight: '700', fontSize: fontScale(12) },
  segmentTextActive: { color: '#FFF' },

  // Cards
  card: { backgroundColor: '#FFF', borderRadius: 24, padding: 20, marginBottom: 16, elevation: 3, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  divider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 16 },
  
  // Text Styles
  labelMuted: { fontSize: fontScale(10), fontWeight: '800', color: '#94A3B8', letterSpacing: 1 },
  labelMutedSmall: { fontSize: fontScale(9), fontWeight: '800', color: '#94A3B8', marginBottom: 4 },
  bigValue: { fontSize: fontScale(30), fontWeight: '900', marginTop: 8, letterSpacing: -0.5 },
  subValueGreen: { fontSize: fontScale(16), fontWeight: '800', color: '#10B981' },
  subValueRed: { fontSize: fontScale(16), fontWeight: '800', color: '#EF4444' },
  cardTitle: { fontSize: fontScale(15), fontWeight: '800', color: '#1E293B' },
  cardSubtitle: { fontSize: fontScale(11), color: '#94A3B8', marginTop: 2 },

  // 3-Column Grid
  gridContainer: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  gridCard: { flex: 1, backgroundColor: '#FFF', borderRadius: 20, padding: 12, alignItems: 'center', elevation: 2 },
  iconBox: { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  gridValue: { fontSize: fontScale(12), fontWeight: '900', color: '#1E293B' },
  gridLabel: { fontSize: fontScale(8), color: '#94A3B8', fontWeight: '900', marginTop: 2 },

  // List Items
  catContainer: { marginTop: 10 },
  catRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  catLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  catIndicator: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  catName: { fontSize: fontScale(13), color: '#475569', fontWeight: '600' },
  catVal: { fontSize: fontScale(13), fontWeight: '800', color: '#1E293B' },

  // Charts
  pieCenter: { alignItems: 'center', marginTop: 10 },
  relative: { position: 'relative' },
  donutHole: { position: 'absolute', backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center', elevation: 5, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10 },
  holeValue: { fontSize: fontScale(16), fontWeight: '900', color: '#0F172A' },
  holeLabel: { fontSize: fontScale(8), color: '#94A3B8', fontWeight: '900', marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: fontScale(10), fontWeight: '800', textTransform: 'uppercase' },
  emptyWrap: { padding: 20, alignItems: 'center' },
  emptyChart: { height: 120, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#CBD5E1', fontStyle: 'italic', fontSize: fontScale(12) }
});

export default StatsScreen;
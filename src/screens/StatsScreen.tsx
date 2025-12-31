import React, { useEffect, useMemo, useRef, useState, memo } from 'react';
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
  UIManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { subscribeBanner, isBannerVisible } from '../utils/bannerState';
import { Text } from '@rneui/themed';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import { PieChart } from 'react-native-chart-kit';
import dayjs from 'dayjs';

// --- CUSTOM IMPORTS (Assumed based on your context) ---
import { useEntries } from '../hooks/useEntries';
import { useAuth } from '../hooks/useAuth';
import { colors } from '../utils/design';
import ScreenHeader from '../components/ScreenHeader';
import DailyTrendChart from '../components/charts/DailyTrendChart';
import { LocalEntry } from '../db/entries';
import asyncAggregator from '../utils/asyncAggregator';
import { aggregateWithPreferSummary } from '../services/aggregates';
import { dayjsFrom } from '../utils/date';

// --- ANIMATION SETUP ---
if (Platform.OS === 'android') {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

// --- CONSTANTS ---
const FILTERS = ['Day', 'Week', '7 Days', '30 Days', 'This Month', 'This Year', 'All'];
const PIE_COLORS = ['#FF6B6B', '#4ECDC4', '#FFD93D', '#6C5CE7', '#A8E6CF', '#FD79A8'];
const CHART_CONFIG = {
  backgroundGradientFrom: '#ffffff',
  backgroundGradientFromOpacity: 0,
  backgroundGradientTo: '#ffffff',
  backgroundGradientToOpacity: 0,
  color: (opacity = 1) => `rgba(37, 99, 235, ${opacity})`, // Primary Blue color
  strokeWidth: 2,
};

// --- UTILS ---
const fontScale = (size: number) => size / PixelRatio.getFontScale();

const formatCompact = (val: number, currency: string = 'INR') => {
  const num = Number(val || 0);
  const abs = Math.abs(num);
  const prefix = currency === 'USD' ? '$' : '₹';

  // Explicitly handle zero
  if (abs === 0) return '0';

  // Small fractional values: show two decimals (useful for avg/day)
  if (abs > 0 && abs < 1) return prefix + num.toFixed(2);

  if (currency === 'INR' || currency === '₹') {
    if (abs >= 10000000) return prefix + (num / 10000000).toFixed(2) + 'Cr';
    if (abs >= 100000) return prefix + (num / 100000).toFixed(2) + 'L';
    return prefix + Math.round(num).toLocaleString('en-IN');
  } else {
    if (abs >= 1000000000) return prefix + (num / 1000000000).toFixed(2) + 'B';
    if (abs >= 1000000) return prefix + (num / 1000000).toFixed(2) + 'M';
    if (abs >= 1000) return prefix + (num / 1000).toFixed(1) + 'k';
    return prefix + Math.round(num).toLocaleString();
  }
};

// --- SUB-COMPONENTS (Memoized) ---

interface MetricCardProps {
  title: string;
  value: string;
  icon: any;
  colorBg: string;
  colorIcon: string;
  subTitle?: string;
  style?: any;
}

const MetricCard = memo(
  ({ title, value, icon, colorBg, colorIcon, subTitle, style }: MetricCardProps) => (
    <View style={[styles.gridCard, style]}>
      <View style={[styles.iconBox, { backgroundColor: colorBg }]}>
        <MaterialIcon name={icon} size={20} color={colorIcon} />
      </View>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text style={styles.gridLabel}>{title}</Text>
        <Text style={styles.gridValue} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
        {subTitle && <Text style={styles.gridSubLabel}>{subTitle}</Text>}
      </View>
    </View>
  )
);

const CategoryRow = memo(({ item, currency }: { item: any; currency: string }) => (
  <View style={styles.catRow}>
    <View style={styles.catLeft}>
      <View style={[styles.catIndicator, { backgroundColor: item.color }]} />
      <Text style={styles.catName} numberOfLines={1}>
        {item.name}
      </Text>
    </View>
    <Text style={styles.catVal}>{formatCompact(item.value, currency)}</Text>
  </View>
));

// --- MAIN SCREEN ---
const StatsScreen = () => {
  const { width } = useWindowDimensions();
  const { user, loading: authLoading } = useAuth();
  const { entries: entriesRaw = [], isLoading } = useEntries(user?.id);
  const entries = entriesRaw as LocalEntry[];

  // --- REFS & ANIMATION ---
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const abortControllerRef = useRef<AbortController | null>(null);

  // --- STATE ---
  const [filter, setFilter] = useState('7 Days');
  const [activeMonthKey, setActiveMonthKey] = useState<string | null>(null);
  const [activeYear, setActiveYear] = useState<number | null>(null);
  const [computing, setComputing] = useState(false);
  const [stats, setStats] = useState<any>(null);

  // --- RESPONSIVE LAYOUT ---
  const maxContentWidth = 600;
  const contentWidth = Math.min(width - 32, maxContentWidth);
  const containerStyle: any = { width: contentWidth, alignSelf: 'center' };

  // Chart Sizing
  const donutSize = Math.min(contentWidth * 0.55, 220);

  // --- 1. DATA PREPARATION (Memoized) ---
  const { availableMonths, availableYears } = useMemo(() => {
    const monthMap = new Map();
    const yearSet = new Set<number>();

    entries.forEach((e) => {
      const d = dayjsFrom(e.date || e.created_at);
      if (!d.isValid()) return;

      const mKey = d.format('YYYY-MM');
      if (!monthMap.has(mKey)) {
        monthMap.set(mKey, { key: mKey, label: d.format('MMM YYYY'), date: d.startOf('month') });
      }
      yearSet.add(d.year());
    });

    const months = Array.from(monthMap.values()).sort(
      (a, b) => b.date.valueOf() - a.date.valueOf()
    );
    const years = Array.from(yearSet).sort((a, b) => b - a);

    return { availableMonths: months, availableYears: years };
  }, [entries]);

  // Sync Defaults
  useEffect(() => {
    if (availableMonths.length && !activeMonthKey) setActiveMonthKey(availableMonths[0].key);
    if (availableYears.length && activeYear === null) setActiveYear(availableYears[0]);
  }, [availableMonths, availableYears]);

  // --- 2. DATE RANGE LOGIC ---
  const { rangeStart, rangeEnd } = useMemo(() => {
    const current = dayjs();
    let start, end;

    switch (filter) {
      case 'Day':
        start = current.startOf('day');
        end = current.endOf('day');
        break;
      case 'Week':
        start = current.startOf('week');
        end = current.endOf('week');
        break;
      case '7 Days':
        start = current.subtract(6, 'day').startOf('day');
        end = current.endOf('day');
        break;
      case '30 Days':
        start = current.subtract(29, 'day').startOf('day');
        end = current.endOf('day');
        break;
      case 'This Month': {
        const m = dayjs(`${activeMonthKey || current.format('YYYY-MM')}-01`);
        start = m.startOf('month');
        end = m.endOf('month');
        break;
      }
      case 'This Year': {
        const y = current.year(activeYear || current.year());
        start = y.startOf('year');
        end = y.endOf('year');
        break;
      }
      case 'All':
        start = dayjs(0);
        end = current.endOf('day');
        break;
      default:
        start = current.subtract(6, 'day').startOf('day');
        end = current.endOf('day');
    }
    return { rangeStart: start, rangeEnd: end };
  }, [filter, activeMonthKey, activeYear]);

  // --- 3. ANALYSIS ENGINE ---
  const runAnalysis = async () => {
    // 1. Cancel previous runs
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setComputing(true);
    // Note: We don't nullify stats immediately to prevent UI flashing, we let it be stale for a moment

    await new Promise((r) => InteractionManager.runAfterInteractions(() => r(null)));

    try {
      let result;
      // Prefer server-side summary if user is synced, otherwise calculate locally
      if (user?.id) {
        result = await aggregateWithPreferSummary(user.id, rangeStart, rangeEnd, {
          signal: controller.signal,
        });
      } else if (filter === 'All' || entries.length > 5000) {
        // Stream entries in pages for heavy loads (Offline mode)
        async function* pagesFromEntries(items: LocalEntry[], pageSize: number) {
          for (let i = 0; i < items.length; i += pageSize) {
            const slice = items.slice(i, i + pageSize);
            yield slice;
            await Promise.resolve(); // Yield to JS event loop
          }
        }
        const pages = pagesFromEntries(entries as LocalEntry[], 1000);
        result = await asyncAggregator.aggregateFromPages(pages, rangeStart, rangeEnd, {
          signal: controller.signal,
        });
      } else {
        // Standard in-memory calculation
        result = await asyncAggregator.aggregateForRange(entries, rangeStart, rangeEnd, {
          signal: controller.signal,
        });
      }

      if (result && !controller.signal.aborted) {
        const totalIn = Number(result.totalIn || 0);
        const totalOut = Number(result.totalOut || 0);
        const savingsRate = totalIn > 0 ? ((totalIn - totalOut) / totalIn) * 100 : 0;
        const daysDiff = Math.max(1, rangeEnd.diff(rangeStart, 'day') + 1);

        // --- Pie Chart Safe Data Construction ---
        let pieDataSafe = result.pieData || [];
        // Limit to Top 4 categories + "Others"
        if (pieDataSafe.length > 4) {
          const top4 = pieDataSafe.slice(0, 4);
          const othersValue = pieDataSafe
            .slice(4)
            .reduce((acc: number, curr: any) => acc + curr.value, 0);
          if (othersValue > 0) top4.push({ name: 'Others', value: othersValue, count: 0 });
          pieDataSafe = top4;
        }

        const pieDataColored = pieDataSafe.map((p: any, i: number) => ({
          ...p,
          population: p.value,
          color: p.name === 'Others' ? '#94A3B8' : PIE_COLORS[i % PIE_COLORS.length],
          legendFontColor: '#64748B',
          legendFontSize: 11,
        }));

        const finalStats = {
          ...result,
          totalIn,
          totalOut,
          net: totalIn - totalOut,
          avgPerDay: totalOut / daysDiff,
          savingsRate: Math.max(0, savingsRate),
          pieData: pieDataColored,
          currency: result.currency || 'INR',
        };

        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setStats(finalStats);

        Animated.parallel([
          Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.spring(slideAnim, { toValue: 0, damping: 12, useNativeDriver: true }),
        ]).start();
      }
    } catch (e: any) {
      if (e?.message !== 'Aborted') console.warn('Analysis Error:', e);
    } finally {
      if (abortControllerRef.current === controller) setComputing(false);
    }
  };

  useEffect(() => {
    runAnalysis();
    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [filter, rangeStart?.valueOf(), rangeEnd?.valueOf(), entries?.length, user?.id]);

  const [bannerVisible, setBannerVisible] = React.useState<boolean>(false);
  React.useEffect(() => {
    setBannerVisible(isBannerVisible());
    const unsub = subscribeBanner((v: boolean) => setBannerVisible(v));
    return () => unsub();
  }, []);

  // --- RENDER HELPERS ---
  const currencySymbol = stats?.currency === 'USD' ? '$' : '₹';

  if (isLoading || authLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading finances...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={bannerVisible ? (['left', 'right'] as any) : (['top', 'left', 'right'] as any)}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      <View style={[styles.headerWrapper, containerStyle]}>
        <ScreenHeader
          title="Analytics"
          subtitle="Financial health overview"
          showScrollHint={false}
          useSafeAreaPadding={false}
        />
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scrollContent]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={{
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
            ...containerStyle,
          }}
        >
          {/* --- 1. FILTERS --- */}
          <View style={styles.filterSection}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabScroll}
            >
              <View style={styles.tabContainer}>
                {FILTERS.map((f) => (
                  <Pressable
                    key={f}
                    style={[styles.tab, filter === f && styles.tabActive]}
                    onPress={() => setFilter(f)}
                  >
                    <Text style={[styles.tabText, filter === f && styles.tabTextActive]}>{f}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            {/* Sub-filters for Month/Year */}
            {(filter === 'This Month' || filter === 'This Year') && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.subFilterScroll}
              >
                {(filter === 'This Month' ? availableMonths : availableYears).map((item: any) => {
                  const isActive =
                    filter === 'This Month' ? activeMonthKey === item.key : activeYear === item;
                  return (
                    <Pressable
                      key={item.key || item}
                      style={[styles.chip, isActive && styles.chipActive]}
                      onPress={() =>
                        filter === 'This Month' ? setActiveMonthKey(item.key) : setActiveYear(item)
                      }
                    >
                      <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                        {filter === 'This Month' ? item.label : item}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            {computing && (
              <ActivityIndicator size="small" color={colors.primary} style={styles.loader} />
            )}
          </View>

          {/* --- 2. NET BALANCE CARD --- */}
          {!stats ? (
            <View style={[styles.card, { height: 200, justifyContent: 'center' }]}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardLabel}>NET BALANCE</Text>
                <View
                  style={[
                    styles.badge,
                    { backgroundColor: stats.net >= 0 ? '#DCFCE7' : '#FEE2E2' },
                  ]}
                >
                  <Text
                    style={[styles.badgeText, { color: stats.net >= 0 ? '#166534' : '#991B1B' }]}
                  >
                    {stats.net >= 0 ? 'Surplus' : 'Deficit'}
                  </Text>
                </View>
              </View>

              <Text style={[styles.mainBalance, { color: stats.net >= 0 ? '#059669' : '#DC2626' }]}>
                {stats.net >= 0 ? '+' : ''}
                {formatCompact(stats.net, stats.currency)}
              </Text>

              <View style={styles.balanceRow}>
                <View>
                  <Text style={styles.subLabel}>INCOME</Text>
                  <Text style={styles.incomeValue}>
                    {formatCompact(stats.totalIn, stats.currency)}
                  </Text>
                </View>
                <View style={styles.vertDivider} />
                <View>
                  <Text style={styles.subLabel}>EXPENSE</Text>
                  <Text style={styles.expenseValue}>
                    {formatCompact(stats.totalOut, stats.currency)}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* --- 3. KEY METRICS GRID --- */}
          {stats && (
            <View style={styles.gridContainer}>
              <MetricCard
                title="MAX IN"
                value={formatCompact(stats.maxIncome || 0, stats.currency)}
                icon="trending-up"
                colorBg="#DBEAFE"
                colorIcon="#1E40AF"
                style={{ flex: 1 }}
              />
              <MetricCard
                title="MAX OUT"
                value={formatCompact(stats.maxExpense || 0, stats.currency)}
                icon="trending-down"
                colorBg="#FEE2E2"
                colorIcon="#991B1B"
                style={{ flex: 1 }}
              />
              <MetricCard
                title="SAVINGS"
                value={`${Math.round(stats.savingsRate)}%`}
                icon="savings"
                colorBg="#F0FDF4"
                colorIcon="#166534"
                style={{ flex: 1 }}
              />
            </View>
          )}

          {/* --- 4. PERFORMANCE GRID --- */}
          {stats && (
            <View style={styles.gridContainer}>
              <MetricCard
                title="AVG / DAY"
                value={formatCompact(stats.avgPerDay || 0, stats.currency)}
                icon="speed"
                colorBg="#FFF7ED"
                colorIcon="#EA580C"
                style={{ flex: 1 }}
              />
              <MetricCard
                title="TXNS"
                value={stats.count || '0'}
                icon="receipt"
                colorBg="#F3F4F6"
                colorIcon="#4B5563"
                style={{ flex: 1 }}
              />
            </View>
          )}

          {/* --- 5. CHARTS --- */}
          {stats && (
            <>
              {/* Spending Trend */}
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Spending Trend</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {stats.dailyTrend?.length > 0 ? (
                    <DailyTrendChart
                      data={
                        stats.dailyTrend.length === 1
                          ? [stats.dailyTrend[0], { ...stats.dailyTrend[0], label: '' }]
                          : stats.dailyTrend
                      }
                      width={Math.max(contentWidth - 60, stats.dailyTrend.length * 40)}
                      currency={currencySymbol}
                    />
                  ) : (
                    <View style={styles.emptyState}>
                      <Text style={styles.emptyText}>No transactions in this period</Text>
                    </View>
                  )}
                </ScrollView>
              </View>

              {/* Distribution & Top Expenses */}
              <View style={styles.dualChartContainer}>
                {/* Donut Chart */}
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>Distribution</Text>
                  {stats.pieData?.length > 0 ? (
                    <View style={styles.chartWrapper}>
                      <PieChart
                        data={stats.pieData}
                        width={donutSize + 60} // Padding for labels
                        height={donutSize}
                        chartConfig={CHART_CONFIG}
                        accessor="population"
                        backgroundColor="transparent"
                        paddingLeft="15"
                        hasLegend={false}
                        center={[donutSize / 4, 0]} // Correct centering for library
                        absolute
                      />
                      {/* Hole Overlay */}
                      <View
                        style={[
                          styles.donutHole,
                          {
                            width: donutSize * 0.6,
                            height: donutSize * 0.6,
                            borderRadius: (donutSize * 0.6) / 2,
                            // Dynamic centering relative to the library's quirks
                            left: donutSize / 4 + donutSize * 0.2 + 15,
                          },
                        ]}
                      >
                        <Text style={styles.holeLabel}>TOTAL</Text>
                        <Text style={styles.holeValue} numberOfLines={1} adjustsFontSizeToFit>
                          {formatCompact(stats.totalOut, stats.currency)}
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.emptyState}>
                      <Text style={styles.emptyText}>No data</Text>
                    </View>
                  )}
                </View>

                {/* Categories List */}
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>Top Expenses</Text>
                  <View style={{ marginTop: 10 }}>
                    {stats.pieData?.length > 0 ? (
                      stats.pieData.map((cat: any) => (
                        <CategoryRow key={cat.name} item={cat} currency={stats.currency} />
                      ))
                    ) : (
                      <View style={styles.emptyState}>
                        <Text style={styles.emptyText}>No categories found</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            </>
          )}

          <View style={{ height: 40 }} />
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8FAFC' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, color: '#94A3B8', fontWeight: '600' },

  headerWrapper: { marginBottom: 10, paddingHorizontal: 4 },
  container: { flex: 1 },
  scrollContent: { paddingBottom: 100, paddingTop: 8 },

  // --- FILTERS ---
  filterSection: { marginBottom: 16 },
  tabScroll: { paddingHorizontal: 16, paddingBottom: 8 },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  tab: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 16 },
  tabActive: { backgroundColor: colors.primary },
  tabText: { color: '#64748B', fontWeight: '700', fontSize: fontScale(12) },
  tabTextActive: { color: '#FFF' },

  subFilterScroll: { paddingHorizontal: 16, marginTop: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginRight: 8,
    backgroundColor: '#FFF',
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: fontScale(12), fontWeight: '600', color: '#64748B' },
  chipTextActive: { color: '#FFF' },
  loader: { marginTop: 10, alignSelf: 'center' },

  // --- CARDS ---
  card: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    elevation: 3,
    shadowColor: '#64748B',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLabel: { fontSize: fontScale(11), fontWeight: '800', color: '#94A3B8', letterSpacing: 1 },
  mainBalance: {
    fontSize: fontScale(32),
    fontWeight: '900',
    marginVertical: 12,
    letterSpacing: -1,
  },

  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  vertDivider: { width: 1, backgroundColor: '#F1F5F9', height: '100%' },
  subLabel: { fontSize: fontScale(10), fontWeight: '700', color: '#94A3B8', marginBottom: 4 },
  incomeValue: { fontSize: fontScale(18), fontWeight: '800', color: '#10B981' },
  expenseValue: { fontSize: fontScale(18), fontWeight: '800', color: '#EF4444' },

  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontSize: fontScale(10), fontWeight: '800', textTransform: 'uppercase' },

  // --- GRIDS ---
  gridContainer: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  gridCard: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  gridLabel: {
    fontSize: fontScale(10),
    color: '#94A3B8',
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  gridValue: { fontSize: fontScale(14), fontWeight: '900', color: '#1E293B', marginTop: 2 },
  gridSubLabel: { fontSize: fontScale(9), color: '#64748B', marginTop: 2 },

  // --- CHARTS & CATS ---
  sectionTitle: { fontSize: fontScale(16), fontWeight: '800', color: '#1E293B', marginBottom: 12 },
  dualChartContainer: { gap: 16 },
  chartWrapper: { alignItems: 'center', justifyContent: 'center', position: 'relative' },
  donutHole: {
    position: 'absolute',
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 5,
  },
  holeLabel: { fontSize: fontScale(9), fontWeight: '800', color: '#94A3B8' },
  holeValue: { fontSize: fontScale(16), fontWeight: '900', color: '#1E293B' },

  catRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  catLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 10 },
  catIndicator: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  catName: { fontSize: fontScale(14), color: '#475569', fontWeight: '600' },
  catVal: { fontSize: fontScale(14), fontWeight: '800', color: '#1E293B' },

  emptyState: { padding: 30, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#CBD5E1', fontStyle: 'italic', fontSize: fontScale(13) },
});

export default StatsScreen;

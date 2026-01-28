import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  useWindowDimensions,
  FlatList,
  Animated,
  LayoutAnimation,
  Platform,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@rneui/themed';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';
import Svg, { Defs, LinearGradient, Stop, Rect, Circle } from 'react-native-svg';
import { LineChart, PieChart } from 'react-native-chart-kit';
import dayjs from 'dayjs';

// --- CUSTOM HOOKS & UTILS ---
import { useAuth } from '../hooks/useAuth';
import { getSession } from '../db/session';
import { subscribeSession } from '../utils/sessionEvents';
import { useEntries } from '../hooks/useEntries';
import useDelayedLoading from '../hooks/useDelayedLoading';
import UserAvatar from '../components/UserAvatar';
import { dayjsFrom, formatDate } from '../utils/date';
import { subscribeSyncStatus } from '../services/syncManager';
import { isExpense as isExpenseType, isIncome as isIncomeType } from '../utils/transactionType';
import { getIconForCategory } from '../constants/categories';
import { colors as themeColors } from '../utils/design';
import { enableLegacyLayoutAnimations } from '../utils/layoutAnimation';

enableLegacyLayoutAnimations();

// --- CONSTANTS ---
const COLORS = {
  primary: themeColors.primary,
  primaryDark: '#1E40AF', // Keep as variant not in design system
  background: themeColors.background,
  card: themeColors.card,
  textMain: themeColors.text,
  textSub: themeColors.muted,
  success: themeColors.accentGreen,
  successBg: themeColors.accentGreenSoft, // Approx match
  danger: themeColors.accentRed,
  dangerBg: themeColors.accentRedSoft, // Approx match
  border: themeColors.border,
};

const CHART_PALETTE = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

// --- TYPES ---
interface Transaction {
  local_id: string;
  amount: number | string;
  type: 'in' | 'out';
  category?: string;
  note?: string;
  date: string | Date;
}

// --- FORMATTING UTILS ---
const formatInrNumber = (value: number): string => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return Math.round(n).toLocaleString('en-IN');
};

const formatInrWithSymbol = (value: number): string => {
  return `₹${formatInrNumber(value)}`;
};

// --- SUB-COMPONENTS ---

// 1. WAVE CHART
const CleanWaveChart = React.memo(({ data, width }: { data: number[]; width: number }) => {
  // Ensure we have enough data points to draw a line, or fill with zeros
  const safeData = data.length > 0 ? data : [0, 0, 0, 0, 0, 0];
  const hasValues = safeData.some((v) => v !== 0);

  if (!hasValues) {
    return (
      <View style={styles.emptyChartBox}>
        <MaterialIcon name="show-chart" size={48} color={COLORS.border} />
        <Text style={styles.emptyText}>No spending trend yet</Text>
      </View>
    );
  }

  return (
    <View style={styles.chartContainer}>
      <LineChart
        data={{
          labels: [],
          datasets: [{ data: safeData }],
        }}
        width={width}
        height={180}
        withDots={false}
        withInnerLines={false}
        withOuterLines={false}
        withVerticalLines={false}
        withHorizontalLines={false}
        withVerticalLabels={false}
        withHorizontalLabels={false}
        chartConfig={{
          backgroundColor: COLORS.card,
          backgroundGradientFrom: COLORS.card,
          backgroundGradientTo: COLORS.card,
          decimalPlaces: 0,
          color: (opacity = 1) => `rgba(37, 99, 235, ${opacity})`,
          labelColor: () => 'transparent',
          propsForBackgroundLines: { strokeWidth: 0 },
          fillShadowGradientFrom: COLORS.primary,
          fillShadowGradientTo: COLORS.primary,
          fillShadowGradientFromOpacity: 0.25,
          fillShadowGradientToOpacity: 0.0,
        }}
        bezier
        style={{ paddingRight: 0, paddingLeft: 0 }}
      />
    </View>
  );
});

// 2. PIE CHART
const CleanPieChart = React.memo(({ data, width }: { data: any[]; width: number }) => {
  const hasData = data && data.length > 0 && data.some((d) => d.population > 0);

  if (!hasData) {
    return (
      <View style={styles.emptyChartBox}>
        <MaterialIcon name="donut-large" size={48} color={COLORS.border} />
        <Text style={styles.emptyText}>No expenses in this period</Text>
      </View>
    );
  }

  return (
    <View style={styles.pieContainer}>
      <PieChart
        data={data}
        width={width}
        height={180}
        chartConfig={{
          color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
        }}
        accessor="population"
        backgroundColor="transparent"
        paddingLeft="0"
        center={[width / 4, 0]}
        absolute={false}
        hasLegend={false}
      />
      <View style={styles.legendContainer}>
        {data.slice(0, 5).map((item, i) => (
          <View key={i} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: item.color }]} />
            <Text style={styles.legendText} numberOfLines={1}>
              {item.name}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
});

// 3. RANK LIST
const RankList = React.memo(({ data, total }: { data: any[]; total: number }) => (
  <View style={styles.rankContainer}>
    {data.length === 0 ? (
      <Text style={[styles.emptyText, { textAlign: 'center', marginVertical: 20 }]}>
        No expenses to analyze
      </Text>
    ) : (
      data.slice(0, 5).map((item, index) => {
        const percent = total > 0 ? (item.population / total) * 100 : 0;
        return (
          <View key={index} style={styles.rankRow}>
            <View style={styles.rankHeader}>
              <View style={styles.rankLabelRow}>
                <View style={[styles.rankDot, { backgroundColor: item.color }]} />
                <Text style={styles.rankName}>{item.name}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <Text style={styles.rankPercent}>{Math.round(percent)}%</Text>
                <Text style={styles.rankAmt}>
                  {' '}
                  (₹{Math.round(item.population).toLocaleString()})
                </Text>
              </View>
            </View>
            <View style={styles.progressBarBg}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${percent}%`, backgroundColor: item.color || COLORS.primary },
                ]}
              />
            </View>
          </View>
        );
      })
    )}
  </View>
));

// 4. TRANSACTION ITEM
const TransactionItem = React.memo(
  ({ item, onPress }: { item: Transaction; onPress: () => void }) => {
    const isInc = isIncomeType(item.type);
    const category = item.category || 'Uncategorized';
    const amount = Number(item.amount) || 0;

    let iconName = getIconForCategory(category);
    if (!iconName) iconName = isInc ? 'arrow-downward' : 'arrow-upward';

    return (
      <TouchableOpacity style={styles.txnCard} onPress={onPress} activeOpacity={0.7}>
        <View
          style={[
            styles.txnIconBox,
            { backgroundColor: isInc ? COLORS.successBg : COLORS.dangerBg },
          ]}
        >
          <MaterialIcon
            name={iconName as any}
            size={22}
            color={isInc ? COLORS.success : COLORS.danger}
          />
        </View>
        <View style={styles.txnContent}>
          <Text style={styles.txnTitle} numberOfLines={1}>
            {category}
          </Text>
          <Text style={styles.txnSubtitle} numberOfLines={1}>
            {item.note || formatDate(item.date)}
          </Text>
        </View>
        <View style={styles.txnRight}>
          <Text style={[styles.txnAmount, { color: isInc ? COLORS.success : COLORS.textMain }]}>
            {isInc ? '+' : '-'}₹{amount.toLocaleString()}
          </Text>
          <Text style={styles.txnDate}>{dayjsFrom(item.date).format('h:mm A')}</Text>
        </View>
      </TouchableOpacity>
    );
  }
);

// --- MAIN SCREEN ---
const HomeScreen = () => {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const [fallbackSession, setFallbackSession] = useState<any>(null);

  const { entries, isLoading, refetch } = useEntries(user?.id);
  const showLoading = useDelayedLoading(Boolean(isLoading), 300);

  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Responsive Caps
  const layoutWidth = Math.min(screenWidth, 720);
  const CHART_WIDTH = Math.max(240, layoutWidth - 72); // Screen padding accounted

  // State
  const [showBalance, setShowBalance] = useState(true);
  const [period, setPeriod] = useState<'week' | 'month'>('month');
  const [chartType, setChartType] = useState<'wave' | 'pie' | 'list'>('wave');
  const [isSyncing, setIsSyncing] = useState(false);

  const entriesCount = (entries as any[] | undefined)?.length ?? 0;
  const showBootstrapSyncHint = entriesCount === 0 && isSyncing;

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }).start();

    // Optimization: Only listen for sync status if we have no entries (bootstrap mode).
    // Once data exists, we don't need to trigger full screen re-renders for sync spinning.
    if (entriesCount > 0) return;

    const unsub = subscribeSyncStatus((s) => setIsSyncing(s === 'syncing'));
    return () => {
      try {
        unsub?.();
      } catch (e) {}
    };
  }, [fadeAnim, entriesCount]);

  // Session & User Info
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const s = await getSession();
        if (mounted) setFallbackSession(s);
      } catch (e) {}
    };
    load();
    const unsub = subscribeSession((s) => {
      if (mounted) setFallbackSession(s);
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  const animateLayout = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  };

  const handleToggleChart = useCallback((type: 'wave' | 'pie' | 'list') => {
    animateLayout();
    setChartType(type);
  }, []);

  const handleTogglePeriod = useCallback((p: 'week' | 'month') => {
    animateLayout();
    setPeriod(p);
  }, []);

  // --- DATA PROCESSING ---
  const { stats, chartData, recentEntries } = useMemo(() => {
    const rawEntries = (entries || []) as any[];
    const cutOffMs =
      period === 'week'
        ? dayjs().subtract(6, 'day').startOf('day').valueOf()
        : dayjs().startOf('month').startOf('day').valueOf();

    const wavePoints =
      period === 'week' ? new Array(7).fill(0) : new Array(dayjs().daysInMonth()).fill(0);
    const DAY_MS = 24 * 60 * 60 * 1000;
    const catMap: Record<string, number> = {};

    let totalInAll = 0;
    let totalOutAll = 0;
    let periodIn = 0;
    let periodOut = 0;

    const topRecent: Array<{ ts: number; e: any }> = [];
    const TOP_N = 7;

    for (const e of rawEntries) {
      const amount = Number(e?.amount) || 0;
      const isInc = isIncomeType(e?.type);
      const isExp = isExpenseType(e?.type);

      if (isInc) totalInAll += amount;
      if (isExp) totalOutAll += amount;

      const ts = dayjsFrom(e?.date ?? e?.created_at).valueOf();

      // Recent Transactions Logic (Insertion Sort for Top N)
      if (Number.isFinite(ts)) {
        if (topRecent.length < TOP_N || ts > topRecent[topRecent.length - 1].ts) {
          let inserted = false;
          for (let i = 0; i < topRecent.length; i++) {
            if (ts > topRecent[i].ts) {
              topRecent.splice(i, 0, { ts, e });
              inserted = true;
              break;
            }
          }
          if (!inserted) topRecent.push({ ts, e });
          if (topRecent.length > TOP_N) topRecent.length = TOP_N;
        }
      }

      // Chart Data Logic
      const dayStartMs = dayjs(ts).startOf('day').valueOf();
      if (dayStartMs < cutOffMs) continue;

      if (isInc) periodIn += amount;
      if (isExp) periodOut += amount;

      if (isExp) {
        const targetIdx =
          period === 'week'
            ? Math.round((dayStartMs - cutOffMs) / DAY_MS)
            : dayjs(dayStartMs).date() - 1;

        if (targetIdx >= 0 && targetIdx < wavePoints.length) {
          wavePoints[targetIdx] += amount;
        }

        const c = e?.category || 'Other';
        catMap[c] = (catMap[c] || 0) + amount;
      }
    }

    const piePoints = Object.keys(catMap)
      .map((name, i) => ({
        name,
        population: catMap[name],
        color: CHART_PALETTE[i % CHART_PALETTE.length],
        legendFontColor: '#333',
        legendFontSize: 12,
      }))
      .sort((a, b) => b.population - a.population);

    return {
      stats: { in: periodIn, out: periodOut, bal: totalInAll - totalOutAll },
      chartData: { wave: wavePoints, pie: piePoints },
      recentEntries: topRecent.map((x) => x.e),
    };
  }, [entries, period]);

  const header = useMemo(
    () => (
      <View style={styles.headerContainer}>
        {/* 1. Top Bar */}
        <View style={styles.topBar}>
          <View style={styles.userInfoRow}>
            <UserAvatar
              size={42}
              name={user?.name || fallbackSession?.name}
              imageUrl={
                user?.imageUrl || user?.image || fallbackSession?.imageUrl || fallbackSession?.image
              }
              onPress={() => navigation.navigate('Account')}
            />
            <View style={{ marginLeft: 12 }}>
              <Text style={styles.greetingText}>Welcome Back,</Text>
              <Text style={styles.userName}>
                {user?.name?.split(' ')[0] || fallbackSession?.name?.split(' ')[0] || 'User'}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => navigation.openDrawer()} style={styles.menuBtn}>
            <MaterialIcon name="menu" size={26} color={COLORS.textMain} />
          </TouchableOpacity>
        </View>

        {/* 2. Hero Card */}
        <Animated.View style={[styles.heroCardShadow, { opacity: fadeAnim }]}>
          <View style={styles.heroCardSurface}>
            <Svg style={StyleSheet.absoluteFill}>
              <Defs>
                <LinearGradient id="heroGrad" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor="#3B82F6" />
                  <Stop offset="1" stopColor="#1D4ED8" />
                </LinearGradient>
              </Defs>
              <Rect width="100%" height="100%" fill="url(#heroGrad)" />
              <Circle cx="85%" cy="15%" r="80" fill="white" fillOpacity="0.1" />
              <Circle cx="10%" cy="90%" r="50" fill="white" fillOpacity="0.08" />
            </Svg>

            <View style={styles.cardInner}>
              <View style={styles.cardHeader}>
                <Text style={styles.balanceLabel}>Total Balance</Text>
                <TouchableOpacity
                  onPress={() => setShowBalance(!showBalance)}
                  style={styles.eyeBtn}
                >
                  <MaterialIcon
                    name={showBalance ? 'visibility' : 'visibility-off'}
                    size={18}
                    color="rgba(255,255,255,0.7)"
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.balanceRow}>
                <Text style={styles.currencySymbol}>₹</Text>
                <Text style={styles.balanceAmount} numberOfLines={1} adjustsFontSizeToFit>
                  {showBalance ? formatInrNumber(stats.bal) : '••••••'}
                </Text>
              </View>

              {showBootstrapSyncHint && (
                <View style={styles.bootstrapSyncHint}>
                  <ActivityIndicator size="small" color="rgba(255,255,255,0.85)" />
                  <Text style={styles.bootstrapSyncHintText}>Syncing your data…</Text>
                </View>
              )}

              <View style={styles.statsContainer}>
                {/* Income */}
                <View style={styles.statItem}>
                  <View style={[styles.statIcon, { backgroundColor: 'rgba(16, 185, 129, 0.2)' }]}>
                    <MaterialIcon name="arrow-downward" size={16} color="#4ADE80" />
                  </View>
                  <View>
                    <Text style={styles.statLabel}>
                      Income {period === 'week' ? '(7d)' : '(Mo)'}
                    </Text>
                    <Text style={styles.statValue}>
                      {showBalance ? formatInrWithSymbol(stats.in) : '••••'}
                    </Text>
                  </View>
                </View>
                <View style={styles.statDivider} />
                {/* Expense */}
                <View style={styles.statItem}>
                  <View style={[styles.statIcon, { backgroundColor: 'rgba(239, 68, 68, 0.2)' }]}>
                    <MaterialIcon name="arrow-upward" size={16} color="#F87171" />
                  </View>
                  <View>
                    <Text style={styles.statLabel}>
                      Expense {period === 'week' ? '(7d)' : '(Mo)'}
                    </Text>
                    <Text style={styles.statValue}>
                      {showBalance ? formatInrWithSymbol(stats.out) : '••••'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* 3. Quick Actions */}
        <View style={styles.actionGrid}>
          {[
            { label: 'Add New', icon: 'add', nav: 'AddEntry', primary: true },
            { label: 'Analytics', icon: 'bar-chart', nav: 'Analytics', primary: false },
            { label: 'History', icon: 'history', nav: 'History', primary: false },
          ].map((item, idx) => (
            <TouchableOpacity
              key={idx}
              style={[styles.actionCard, item.primary && { backgroundColor: COLORS.primary }]}
              onPress={() => navigation.navigate(item.nav)}
              activeOpacity={0.8}
            >
              <MaterialIcon
                name={item.icon as any}
                size={24}
                color={item.primary ? '#fff' : COLORS.primary}
              />
              <Text style={[styles.actionLabel, item.primary && { color: '#fff' }]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 4. Chart Widget */}
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <View style={styles.chartToggles}>
              {[
                { id: 'wave', icon: 'show-chart' },
                { id: 'pie', icon: 'pie-chart' },
                { id: 'list', icon: 'list' },
              ].map((t) => (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.chartToggleBtn, chartType === t.id && styles.chartToggleBtnActive]}
                  onPress={() => handleToggleChart(t.id as any)}
                >
                  <MaterialIcon
                    name={t.icon as any}
                    size={20}
                    color={chartType === t.id ? COLORS.primary : COLORS.textSub}
                  />
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.periodSwitch}>
              {['week', 'month'].map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.periodBtn, period === p && styles.periodBtnActive]}
                  onPress={() => handleTogglePeriod(p as any)}
                >
                  <Text style={[styles.periodText, period === p && styles.periodTextActive]}>
                    {p === 'week' ? '7 Days' : 'Month'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={styles.chartBody}>
            {chartType === 'wave' && <CleanWaveChart data={chartData.wave} width={CHART_WIDTH} />}
            {chartType === 'pie' && <CleanPieChart data={chartData.pie} width={CHART_WIDTH} />}
            {chartType === 'list' && <RankList data={chartData.pie} total={stats.out} />}
          </View>
        </View>

        {/* 5. Recent Header */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Transactions</Text>
          <TouchableOpacity onPress={() => navigation.navigate('History')}>
            <Text style={styles.seeAllBtn}>View All</Text>
          </TouchableOpacity>
        </View>
      </View>
    ),
    [
      navigation,
      user,
      fallbackSession,
      fadeAnim,
      showBalance,
      stats,
      period,
      chartType,
      chartData,
      CHART_WIDTH,
      handleToggleChart,
      handleTogglePeriod,
      showBootstrapSyncHint,
    ]
  );

  const renderItem = useCallback(
    ({ item }: { item: Transaction }) => (
      <View style={styles.itemWrapper}>
        <TransactionItem
          item={item}
          onPress={() => navigation.navigate('AddEntry', { local_id: (item as any).local_id })}
        />
      </View>
    ),
    [navigation]
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        {showLoading && entriesCount === 0 && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        )}

        <FlatList
          data={recentEntries}
          keyExtractor={(item, index) => String(item?.local_id || index)}
          ListHeaderComponent={header}
          refreshControl={
            <RefreshControl
              refreshing={Boolean(isLoading)}
              onRefresh={refetch}
              tintColor={COLORS.primary}
            />
          }
          renderItem={renderItem as any}
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            !isLoading ? (
              <View style={styles.emptyList}>
                {showBootstrapSyncHint ? (
                  <Text style={styles.emptyText}>Syncing data...</Text>
                ) : (
                  <>
                    <Text style={styles.emptyText}>No recent transactions found.</Text>
                    <TouchableOpacity
                      style={styles.emptyBtn}
                      onPress={() => navigation.navigate('AddEntry')}
                    >
                      <Text style={styles.emptyBtnText}>Add your first entry</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            ) : null
          }
        />
      </SafeAreaView>
    </View>
  );
};

// --- STYLES ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  safeArea: { flex: 1 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99,
    alignItems: 'center',
    paddingTop: 200,
    backgroundColor: 'rgba(248, 250, 252, 0.7)',
  },

  bootstrapSyncHint: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 6,
    borderRadius: 8,
    marginTop: 8,
  },
  bootstrapSyncHintText: { color: '#fff', marginLeft: 8, fontSize: 12 },

  // Header
  headerContainer: { paddingHorizontal: 20, paddingTop: 12 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  userInfoRow: { flexDirection: 'row', alignItems: 'center' },
  greetingText: { fontSize: 12, color: COLORS.textSub, fontWeight: '500' },
  userName: { fontSize: 18, fontWeight: '700', color: COLORS.textMain },
  menuBtn: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  // Hero Card
  heroCardShadow: {
    width: '100%',
    minHeight: 200,
    borderRadius: 24,
    marginBottom: 24,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 8,
  },
  heroCardSurface: { flex: 1, borderRadius: 24, overflow: 'hidden' },
  cardInner: { flex: 1, padding: 20, justifyContent: 'space-between' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  balanceLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '500' },
  eyeBtn: { padding: 4 },
  balanceRow: { flexDirection: 'row', alignItems: 'flex-start' },
  currencySymbol: {
    fontSize: 24,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600',
    marginTop: 6,
    marginRight: 2,
  },
  balanceAmount: { fontSize: 40, color: '#fff', fontWeight: '800' },

  statsContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    marginTop: 'auto',
  },
  statItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  statIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: { color: 'rgba(255,255,255,0.78)', fontSize: 11, fontWeight: '600' },
  statValue: { color: '#fff', fontSize: 14, fontWeight: '700' },
  statDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: 12 },

  // Actions
  actionGrid: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 24 },
  actionCard: {
    flex: 1,
    height: 80,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.card,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  actionLabel: { fontSize: 12, fontWeight: '600', color: COLORS.textMain },

  // Charts
  chartCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    elevation: 1,
  },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  chartToggles: { flexDirection: 'row', gap: 8 },
  chartToggleBtn: { padding: 6, borderRadius: 8, backgroundColor: COLORS.background },
  chartToggleBtnActive: { backgroundColor: '#DBEAFE' },
  periodSwitch: {
    flexDirection: 'row',
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 3,
  },
  periodBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  periodBtnActive: { backgroundColor: COLORS.card, elevation: 1 },
  periodText: { fontSize: 11, fontWeight: '600', color: COLORS.textSub },
  periodTextActive: { color: COLORS.primary },
  chartBody: { alignItems: 'center', justifyContent: 'center', minHeight: 180 },
  chartContainer: { alignItems: 'center', justifyContent: 'center' },
  emptyChartBox: { alignItems: 'center', justifyContent: 'center', height: 180, gap: 10 },

  // Pie & Rank
  pieContainer: { alignItems: 'center', width: '100%' },
  legendContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginTop: 12,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, fontWeight: '500', color: COLORS.textSub },
  rankContainer: { width: '100%' },
  rankRow: { marginBottom: 16 },
  rankHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  rankLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rankDot: { width: 8, height: 8, borderRadius: 4 },
  rankName: { fontSize: 13, fontWeight: '600', color: COLORS.textMain },
  rankPercent: { fontSize: 12, fontWeight: '700', color: COLORS.textMain },
  rankAmt: { fontSize: 12, color: COLORS.textSub },
  progressBarBg: { height: 6, width: '100%', backgroundColor: COLORS.background, borderRadius: 3 },
  progressBarFill: { height: '100%', borderRadius: 3 },

  // Transactions
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: COLORS.textMain },
  seeAllBtn: { fontSize: 13, fontWeight: '600', color: COLORS.primary },
  itemWrapper: { paddingHorizontal: 20 },
  txnCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  txnIconBox: {
    width: 42,
    height: 42,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  txnContent: { flex: 1 },
  txnTitle: { fontSize: 15, fontWeight: '600', color: COLORS.textMain, marginBottom: 2 },
  txnSubtitle: { fontSize: 12, color: COLORS.textSub },
  txnRight: { alignItems: 'flex-end' },
  txnAmount: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  txnDate: { fontSize: 11, color: COLORS.textSub },

  // Empty
  emptyList: { alignItems: 'center', padding: 40, gap: 10 },
  emptyText: { color: COLORS.textSub, fontSize: 14 },
  emptyBtn: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: COLORS.primary,
    borderRadius: 20,
  },
  emptyBtnText: { color: '#fff', fontWeight: '600' },
});

export default HomeScreen;

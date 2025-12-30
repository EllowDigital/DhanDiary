import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  NativeModules,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@rneui/themed';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../hooks/useAuth';
import { useEntries } from '../hooks/useEntries';
import useDelayedLoading from '../hooks/useDelayedLoading';
import UserAvatar from '../components/UserAvatar';
import Svg, { Defs, LinearGradient, Stop, Rect, Circle } from 'react-native-svg';
import { LineChart, PieChart } from 'react-native-chart-kit';
import dayjs from 'dayjs';
import { subscribeSyncStatus } from '../services/syncManager';
import { isExpense as isExpenseType, isIncome as isIncomeType } from '../utils/transactionType';
import { getIconForCategory } from '../constants/categories';
import { colors as themeColors } from '../utils/design';

// --- CRASH PROOF ANIMATION SETUP ---
const setupLayoutAnimation = () => {
  if (Platform.OS === 'android') {
    try {
      const UIManager = NativeModules.UIManager;
      if (UIManager && UIManager.setLayoutAnimationEnabledExperimental) {
        UIManager.setLayoutAnimationEnabledExperimental(true);
      }
    } catch (e) {
      console.warn('LayoutAnimation setup skipped');
    }
  }
};

// Initialize
setupLayoutAnimation();

// --- THEME ---
const colors = {
  primary: '#2563EB',
  background: '#F8FAFC',
  text: '#1E293B',
  subText: '#64748B',
  success: '#10B981',
  danger: '#EF4444',
  white: '#FFFFFF',
};

const CATEGORY_COLORS: Record<string, string> = {
  Food: '#F59E0B',
  Shopping: '#3B82F6',
  Transport: '#EF4444',
  Bills: '#8B5CF6',
  Salary: '#10B981',
  Other: '#64748B',
};

const CHART_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

// --- SUB-COMPONENTS ---

// 1. CLEAN WAVE CHART
const CleanWaveChart = React.memo(({ data, width }: { data: number[]; width: number }) => {
  const chartData = data.length > 1 ? data : [0, 0, 0, 0, 0, 0];

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <LineChart
        data={{
          labels: [],
          datasets: [{ data: chartData }],
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
          backgroundColor: '#ffffff',
          backgroundGradientFrom: '#ffffff',
          backgroundGradientTo: '#ffffff',
          decimalPlaces: 0,
          color: (opacity = 1) => `rgba(37, 99, 235, ${opacity})`,
          labelColor: () => 'transparent',
          propsForBackgroundLines: { strokeWidth: 0 },
          fillShadowGradientFrom: '#3B82F6',
          fillShadowGradientTo: '#3B82F6',
          fillShadowGradientFromOpacity: 0.3,
          fillShadowGradientToOpacity: 0.05,
        }}
        bezier
        style={{ paddingRight: 0, paddingLeft: 0 }}
      />
    </View>
  );
});

// 2. PIE CHART (CENTERED FIX)
const CleanPieChart = React.memo(({ data, width }: { data: any[]; width: number }) => {
  if (!data || data.length === 0) {
    return (
      <View style={styles.emptyChartBox}>
        <Text style={styles.emptyText}>No expenses yet</Text>
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
        // This offset shifts the pie from the left (default) to the exact center
        center={[width / 4, 0]}
        absolute={false}
        hasLegend={false}
      />
      <View style={styles.legendContainer}>
        {data.slice(0, 5).map((item, i) => (
          <View key={i} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: item.color }]} />
            <Text style={styles.legendText}>{item.name}</Text>
          </View>
        ))}
      </View>
    </View>
  );
});

// 3. RANK LIST
const RankList = React.memo(({ data, total }: { data: any[]; total: number }) => (
  <View style={styles.rankContainer}>
    {data.slice(0, 5).map((item, index) => {
      const percent = total > 0 ? (item.population / total) * 100 : 0;
      return (
        <View key={index} style={styles.rankRow}>
          <View style={styles.rankHeader}>
            <View style={styles.rankLabelRow}>
              <View style={[styles.rankDot, { backgroundColor: item.color }]} />
              <Text style={styles.rankName}>{item.name}</Text>
            </View>
            <View style={{ flexDirection: 'row' }}>
              <Text style={styles.rankPercent}>{Math.round(percent)}% </Text>
              <Text style={styles.rankAmt}>(₹{Math.round(item.population).toLocaleString()})</Text>
            </View>
          </View>
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${percent}%`, backgroundColor: colors.primary },
              ]}
            />
          </View>
        </View>
      );
    })}
  </View>
));

// 4. TRANSACTION ITEM
const TransactionItem = React.memo(({ item, onPress }: { item: any; onPress: () => void }) => {
  const isExpense = isExpenseType(item.type);
  const category = item.category || 'Other';
  const isInc = isIncomeType(item.type);
  const color = isInc ? themeColors.accentGreen : themeColors.accentRed;
  const catIcon = getIconForCategory(item.category);
  const iconName = catIcon || (isInc ? 'arrow-downward' : 'arrow-upward');

  return (
    <TouchableOpacity style={styles.txnCard} onPress={onPress} activeOpacity={0.7}>
      <View
        style={[
          styles.txnIconBox,
          { backgroundColor: isInc ? themeColors.accentGreenSoft : themeColors.accentRedSoft },
        ]}
      >
        <MaterialIcon
          name={iconName as any}
          size={22}
          color={isInc ? themeColors.accentGreen : themeColors.accentRed}
        />
      </View>
      <View style={styles.txnContent}>
        <Text style={styles.txnTitle} numberOfLines={1}>
          {category}
        </Text>
        <Text style={styles.txnSubtitle} numberOfLines={1}>
          {item.note || 'No description'}
        </Text>
      </View>
      <View style={styles.txnRight}>
        <Text
          style={[
            styles.txnAmount,
            { color: isInc ? themeColors.accentGreen : themeColors.accentRed },
          ]}
        >
          {isInc ? '+' : '-'}₹{Number(item.amount).toLocaleString()}
        </Text>
        <Text style={styles.txnDate}>{dayjs(item.date).format('MMM D, h:mm A')}</Text>
      </View>
    </TouchableOpacity>
  );
});

// --- MAIN SCREEN ---
const HomeScreen = () => {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { entries = [], isLoading } = useEntries(user?.id);
  const showLoading = useDelayedLoading(Boolean(isLoading), 200);

  const { width: screenWidth } = useWindowDimensions();
  // CALCULATION: Screen - (20px * 2 outer pad) - (16px * 2 card pad) = Width - 72
  const CHART_WIDTH = screenWidth - 72;

  const [showBalance, setShowBalance] = useState(true);
  const [period, setPeriod] = useState<'week' | 'month'>('month');
  const [chartType, setChartType] = useState<'wave' | 'pie' | 'list'>('wave');
  const [isSyncing, setIsSyncing] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
  }, []);

  useEffect(() => {
    const unsub = subscribeSyncStatus(setIsSyncing);
    return () => {
      try {
        unsub();
      } catch (e) {}
    };
  }, []);

  const safeLayoutAnim = () => {
    try {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    } catch (e) {}
  };

  const handleToggleChart = (type: any) => {
    safeLayoutAnim();
    setChartType(type);
  };
  const handleTogglePeriod = (p: any) => {
    safeLayoutAnim();
    setPeriod(p);
  };

  const { stats, chartData, recentEntries } = useMemo(() => {
    if (!entries)
      return {
        stats: { in: 0, out: 0, bal: 0 },
        chartData: { wave: [], pie: [] },
        recentEntries: [],
      };

    const inVal = entries
      .filter((e) => isIncomeType(e.type))
      .reduce((acc, c) => acc + Number(c.amount), 0);
    const outVal = entries
      .filter((e) => isExpenseType(e.type))
      .reduce((acc, c) => acc + Number(c.amount), 0);
    const cutOff = period === 'week' ? dayjs().subtract(6, 'day') : dayjs().startOf('month');
    const filtered = entries.filter((e) => dayjs(e.date).isAfter(cutOff));

    // Wave
    const wavePoints =
      period === 'week' ? new Array(7).fill(0) : new Array(dayjs().daysInMonth()).fill(0);
    filtered
      .filter((e) => isExpenseType(e.type))
      .forEach((e) => {
        const idx =
          period === 'week' ? 6 - dayjs().diff(dayjs(e.date), 'day') : dayjs(e.date).date() - 1;
        if (idx >= 0 && idx < wavePoints.length) wavePoints[idx] += Number(e.amount);
      });

    // Pie
    const catMap: Record<string, number> = {};
    filtered
      .filter((e) => isExpenseType(e.type))
      .forEach((e) => {
        const c = e.category || 'Other';
        catMap[c] = (catMap[c] || 0) + Number(e.amount);
      });

    const piePoints = Object.keys(catMap)
      .sort((a, b) => catMap[b] - catMap[a])
      .map((name, i) => ({
        name,
        population: catMap[name],
        color: i === 0 ? colors.primary : CHART_COLORS[i % CHART_COLORS.length],
        legendFontColor: '#333',
        legendFontSize: 12,
      }));

    return {
      stats: { in: inVal, out: outVal, bal: inVal - outVal },
      chartData: { wave: wavePoints, pie: piePoints },
      recentEntries: entries
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 5),
    };
  }, [entries, period]);

  const renderHeader = () => (
    <View style={styles.headerContainer}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.openDrawer()} style={styles.menuBtn}>
          <MaterialIcon name="menu" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.userInfo}>
          <Text style={styles.greetingText}>GOOD AFTERNOON</Text>
          <Text style={styles.userName}>{user?.name || 'User'}</Text>
        </View>
        <UserAvatar
          size={40}
          name={user?.name}
          imageUrl={user?.image}
          onPress={() => navigation.navigate('Account')}
        />
      </View>

      {/* Hero Card */}
      <Animated.View style={[styles.heroCard, { opacity: fadeAnim }]}>
        <Svg style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#3B82F6" />
              <Stop offset="1" stopColor="#2563EB" />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#grad)" />
          <Circle cx="90%" cy="10%" r="90" fill="white" fillOpacity="0.1" />
          <Circle cx="5%" cy="90%" r="60" fill="white" fillOpacity="0.05" />
        </Svg>
        <View style={styles.cardInner}>
          <View style={styles.cardHeader}>
            <View style={styles.balanceBadge}>
              <Text style={styles.balanceLabel}>Total Balance</Text>
            </View>
            <TouchableOpacity onPress={() => setShowBalance(!showBalance)}>
              <MaterialIcon
                name={showBalance ? 'visibility' : 'visibility-off'}
                size={20}
                color="rgba(255,255,255,0.8)"
              />
            </TouchableOpacity>
          </View>
          <View style={styles.balanceRow}>
            <Text style={styles.currencySymbol}>₹</Text>
            <Text style={styles.balanceAmount}>
              {showBalance ? stats.bal.toLocaleString('en-IN') : '••••••'}
            </Text>
          </View>
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <View style={[styles.statIcon, { backgroundColor: 'rgba(16, 185, 129, 0.2)' }]}>
                <MaterialIcon name="arrow-downward" size={16} color="#4ADE80" />
              </View>
              <View>
                <Text style={styles.statLabel}>Income</Text>
                <Text style={styles.statValue}>
                  ₹{showBalance ? stats.in.toLocaleString() : '•••'}
                </Text>
              </View>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <View style={[styles.statIcon, { backgroundColor: 'rgba(239, 68, 68, 0.2)' }]}>
                <MaterialIcon name="arrow-upward" size={16} color="#F87171" />
              </View>
              <View>
                <Text style={styles.statLabel}>Expense</Text>
                <Text style={styles.statValue}>
                  ₹{showBalance ? stats.out.toLocaleString() : '•••'}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </Animated.View>

      {/* Actions */}
      <View style={styles.actionGrid}>
        {[
          { label: 'Add', icon: 'add', nav: 'AddEntry', primary: true },
          { label: 'Stats', icon: 'bar-chart', nav: 'Analytics', primary: false },
          { label: 'Export', icon: 'file-download', nav: 'Export', primary: false },
        ].map((item, idx) => (
          <View key={idx} style={styles.actionWrapper}>
            <TouchableOpacity
              style={[
                styles.actionBtn,
                item.primary ? { backgroundColor: colors.primary } : { backgroundColor: '#fff' },
              ]}
              onPress={() => navigation.navigate(item.nav)}
            >
              <MaterialIcon
                name={item.icon as any}
                size={28}
                color={item.primary ? '#fff' : colors.primary}
              />
            </TouchableOpacity>
            <Text style={styles.actionLabel}>{item.label}</Text>
          </View>
        ))}
      </View>

      {/* Chart Widget */}
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
                onPress={() => handleToggleChart(t.id)}
              >
                <MaterialIcon
                  name={t.icon as any}
                  size={20}
                  color={chartType === t.id ? colors.primary : '#94A3B8'}
                />
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.periodSwitch}>
            {['week', 'month'].map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.periodBtn, period === p ? styles.periodBtnActive : null]}
                onPress={() => handleTogglePeriod(p)}
              >
                <Text style={[styles.periodText, period === p ? styles.periodTextActive : null]}>
                  {p === 'week' ? '7D' : 'Month'}
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

        {/* Context Caption */}
        {chartType !== 'list' && (
          <View style={styles.chartCaption}>
            <Text style={styles.captionText}>
              {chartType === 'wave'
                ? 'This chart shows your spending trend. The blue area represents your daily expenses.'
                : 'This chart shows your spending breakdown. Switch to the list view for more details.'}
            </Text>
            {chartType === 'wave' && (
              <View style={styles.captionLegend}>
                <View style={styles.legendDotSmall} />
                <Text style={styles.legendTextSmall}>Daily expenses</Text>
                <View
                  style={[styles.legendDotSmall, { backgroundColor: '#10B981', marginLeft: 12 }]}
                />
                <Text style={styles.legendTextSmall}>Income (visible)</Text>
              </View>
            )}
          </View>
        )}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent Transactions</Text>
        <TouchableOpacity onPress={() => navigation.navigate('History')}>
          <Text style={styles.seeAllBtn}>See All</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        {showLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}
        <FlatList
          data={recentEntries}
          keyExtractor={(item) => item.local_id || Math.random().toString()}
          ListHeaderComponent={renderHeader()}
          renderItem={({ item }) => (
            <View style={styles.itemWrapper}>
              <TransactionItem
                item={item}
                onPress={() => navigation.navigate('AddEntry', { local_id: item.local_id })}
              />
            </View>
          )}
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyList}>
              <Text style={styles.emptyText}>No recent transactions</Text>
            </View>
          }
        />
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  safeArea: { flex: 1 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99,
    alignItems: 'center',
    paddingTop: 100,
  },
  headerContainer: { paddingHorizontal: 20, paddingTop: 10 },
  itemWrapper: { paddingHorizontal: 20 },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    justifyContent: 'space-between',
  },
  menuBtn: { padding: 8, borderRadius: 12, backgroundColor: '#fff', elevation: 1 },
  userInfo: { flex: 1, alignItems: 'center' },
  greetingText: { fontSize: 11, color: colors.subText, fontWeight: '600', letterSpacing: 0.5 },
  userName: { fontSize: 16, fontWeight: '800', color: colors.text },

  heroCard: {
    width: '100%',
    borderRadius: 24,
    marginBottom: 24,
    overflow: 'hidden',
    elevation: 8,
    height: 210,
  },
  cardInner: { flex: 1, padding: 20, justifyContent: 'space-between' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  balanceBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  balanceLabel: { color: '#fff', fontSize: 12, fontWeight: '600' },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginTop: 8,
  },
  currencySymbol: {
    fontSize: 24,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600',
    marginTop: 8,
    marginRight: 4,
  },
  balanceAmount: { fontSize: 44, color: '#fff', fontWeight: '800' },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 18,
    padding: 12,
  },
  statItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  statIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '500' },
  statValue: { color: '#fff', fontSize: 14, fontWeight: '700' },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    height: '80%',
    alignSelf: 'center',
  },

  actionGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    marginBottom: 24,
  },
  actionWrapper: { alignItems: 'center', gap: 8 },
  actionBtn: {
    width: 60,
    height: 60,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },
  actionLabel: { fontSize: 12, color: colors.subText, fontWeight: '500' },

  chartCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 16,
    marginBottom: 24,
    elevation: 2,
  },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  chartToggles: { flexDirection: 'row', gap: 6 },
  chartToggleBtn: { padding: 8, borderRadius: 10, backgroundColor: colors.background },
  chartToggleBtnActive: { backgroundColor: '#DBEAFE' },
  periodSwitch: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 4,
  },
  periodBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  periodBtnActive: { backgroundColor: colors.primary, elevation: 2 },
  periodText: { fontSize: 12, fontWeight: '600', color: colors.subText },
  periodTextActive: { color: '#fff' },
  chartBody: { minHeight: 180, alignItems: 'center', justifyContent: 'center' },
  chartCaption: { marginTop: 12, paddingHorizontal: 8 },
  captionText: { fontSize: 12, color: colors.subText, lineHeight: 18 },
  captionLegend: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  legendDotSmall: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginRight: 6,
  },
  legendTextSmall: { fontSize: 12, color: colors.subText },

  rankContainer: { width: '100%', paddingVertical: 10 },
  rankRow: { marginBottom: 16 },
  rankHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  rankLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rankDot: { width: 8, height: 8, borderRadius: 4 },
  rankName: { fontSize: 13, fontWeight: '600', color: colors.text },
  rankPercent: { fontSize: 12, fontWeight: '700', color: colors.text },
  rankAmt: { fontSize: 12, color: colors.subText },
  progressBarBg: { height: 6, width: '100%', backgroundColor: colors.background, borderRadius: 3 },
  progressBarFill: { height: '100%', borderRadius: 3 },

  pieContainer: { alignItems: 'center' },
  emptyChartBox: { height: 180, justifyContent: 'center', alignItems: 'center' },
  legendContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16,
    marginTop: 10,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, fontWeight: '600', color: colors.text },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 20,
  },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  seeAllBtn: { fontSize: 14, fontWeight: '700', color: colors.primary },

  txnCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginBottom: 10,
    elevation: 1,
  },
  txnIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  txnContent: { flex: 1 },
  txnTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 3 },
  txnSubtitle: { fontSize: 12, color: colors.subText, fontWeight: '500' },
  txnRight: { alignItems: 'flex-end' },
  txnAmount: { fontSize: 15, fontWeight: '800', marginBottom: 3 },
  txnDate: { fontSize: 11, color: colors.subText },
  emptyList: { alignItems: 'center', padding: 20 },
  emptyText: { color: colors.subText, fontStyle: 'italic' },
});

export default HomeScreen;

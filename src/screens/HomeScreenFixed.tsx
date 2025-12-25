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
  UIManager,
  PixelRatio,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@rneui/themed';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../hooks/useAuth';
import { useEntries } from '../hooks/useEntries';
import FullScreenSpinner from '../components/FullScreenSpinner';
import useDelayedLoading from '../hooks/useDelayedLoading';
import { Image } from 'react-native';
import dayjs from 'dayjs';
import UserAvatar from '../components/UserAvatar';
import Svg, { Defs, LinearGradient, Stop, Rect, Circle } from 'react-native-svg';
import { LineChart, PieChart } from 'react-native-chart-kit';
import { LocalEntry } from '../db/entries';
import { getIconForCategory } from '../constants/categories';
import { subscribeSyncStatus } from '../services/syncManager';

// --- CRASH FIX: Safe LayoutAnimation Setup ---
try {
  // layout animations are enabled centrally in App initialization
} catch (e) {
  console.warn('LayoutAnimation config skipped');
}

// --- CONFIGURATION ---
const colors = {
  primary: '#3B82F6',
  background: '#F8FAFC',
  text: '#1E293B',
  subText: '#64748B',
  success: '#10B981',
  danger: '#EF4444',
  white: '#FFFFFF',
};

const CHART_COLORS = [
  '#F59E0B',
  '#10B981',
  '#3B82F6',
  '#EC4899',
  '#8B5CF6',
  '#EF4444',
  '#06B6D4',
  '#6366F1',
  '#84CC16',
  '#F43F5E',
];

// --- UTILS ---
const fontScale = (size: number) => size / PixelRatio.getFontScale();

const getGreeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good Morning' : h < 18 ? 'Good Afternoon' : 'Good Evening';
};

// --- SUB-COMPONENTS ---

// 1. WAVE CHART
const WaveChart = React.memo(({ data, width }: { data: number[]; width: number }) => {
  const safeData = data.length >= 2 ? data : [0, 0, 0, 0, 0, 50, 100];
  const chartWidth = width + 40;

  return (
    <View style={{ marginLeft: -25, marginRight: -10, marginBottom: -10, overflow: 'hidden' }}>
      <LineChart
        data={{
          labels: safeData.map(() => ''),
          datasets: [{ data: safeData }],
        }}
        width={chartWidth}
        height={200}
        withDots={false}
        withInnerLines={false}
        withOuterLines={false}
        withVerticalLines={false}
        withHorizontalLines={false}
        withShadow={false}
        chartConfig={{
          backgroundColor: '#fff',
          backgroundGradientFrom: '#fff',
          backgroundGradientTo: '#fff',
          decimalPlaces: 0,
          color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
          labelColor: () => 'transparent',
          propsForDots: { r: '0' },
          propsForBackgroundLines: { strokeWidth: 0 },
          fillShadowGradientFrom: colors.primary,
          fillShadowGradientTo: colors.primary,
          fillShadowGradientFromOpacity: 0.5,
          fillShadowGradientToOpacity: 0.05,
          backgroundGradientFromOpacity: 0,
          backgroundGradientToOpacity: 0,
        }}
        bezier
        style={{ paddingRight: 0, paddingLeft: 0 }}
      />
    </View>
  );
});

// 2. PIE CHART
const CustomPieChart = React.memo(({ data, width }: { data: any[]; width: number }) => {
  if (data.length === 0)
    return (
      <View style={styles.centerBox}>
        <Text style={styles.emptyText}>No expenses yet</Text>
      </View>
    );

  return (
    <View style={styles.pieContainer}>
      <PieChart
        data={data}
        width={width}
        height={220}
        chartConfig={{
          color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
          decimalPlaces: 0,
        }}
        accessor="population"
        backgroundColor="transparent"
        paddingLeft={String(width / 4)}
        center={[0, 0]}
        absolute={false}
        hasLegend={false}
      />
      <View style={styles.legendContainer}>
        {data.slice(0, 6).map((item, i) => (
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
            <Text style={styles.rankValue}>
              {Math.round(percent)}%{' '}
              <Text style={styles.rankAmt}>(₹{Math.round(item.population).toLocaleString()})</Text>
            </Text>
          </View>
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${percent}%`, backgroundColor: item.color },
              ]}
            />
          </View>
        </View>
      );
    })}
  </View>
));

// 4. TRANSACTION ITEM (UPDATED: COMPACT VERSION)
const TransactionItem = React.memo(
  ({ item, onPress }: { item: LocalEntry; onPress: () => void }) => {
    const isExpense = item.type === 'out';
    const color = isExpense ? colors.danger : colors.success;
    const iconBg = isExpense ? '#FEF2F2' : '#F0FDF4';
    const icon = getIconForCategory(item.category);

    return (
      <TouchableOpacity style={styles.txnCard} onPress={onPress} activeOpacity={0.7}>
        {/* Left: Icon Box (Smaller) */}
        <View style={[styles.txnIconBox, { backgroundColor: iconBg }]}>
          <MaterialIcon name={icon as any} size={20} color={color} />
        </View>

        {/* Middle: Info */}
        <View style={styles.txnContent}>
          <Text style={styles.txnTitle} numberOfLines={1}>
            {item.category || 'General'}
          </Text>
          <Text style={styles.txnSubtitle} numberOfLines={1}>
            {item.note || 'No description'}
          </Text>
        </View>

        {/* Right: Amount & Date */}
        <View style={styles.txnRight}>
          <Text style={[styles.txnAmount, { color }]}>
            {isExpense ? '-' : '+'}₹{Math.abs(Number(item.amount)).toLocaleString()}
          </Text>
          <Text style={styles.txnDate}>{dayjs(item.date).format('MMM D, h:mm A')}</Text>
        </View>
      </TouchableOpacity>
    );
  }
);

// --- MAIN SCREEN ---
const HomeScreen = () => {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { entries = [], isLoading } = useEntries(user?.id);
  const showLoading = useDelayedLoading(Boolean(isLoading), 200);
  const { width } = useWindowDimensions();

  const PADDING = 20;
  const CHART_WIDTH = Math.min(600, width - PADDING * 2 - 32);

  const [showBalance, setShowBalance] = useState(true);
  const [period, setPeriod] = useState<'week' | 'month'>('month');
  const [chartType, setChartType] = useState<'wave' | 'pie' | 'list'>('wave');
  const [isSyncing, setIsSyncing] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 20 }),
    ]).start();
  }, []);

  useEffect(() => {
    const unsub = subscribeSyncStatus((running) => {
      setIsSyncing(running);
    });
    return () => {
      unsub();
    };
  }, []);

  const triggerLayoutAnimation = () => {
    try {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    } catch (e) {}
  };

  const handleToggleChart = (type: any) => {
    triggerLayoutAnimation();
    setChartType(type);
  };

  const handleTogglePeriod = (p: any) => {
    triggerLayoutAnimation();
    setPeriod(p);
  };

  // --- DATA ENGINE ---
  const { stats, chartData, recentEntries } = useMemo(() => {
    if (!entries)
      return {
        stats: { in: 0, out: 0, bal: 0 },
        chartData: { wave: [], pie: [] },
        recentEntries: [],
      };

    const inVal = entries
      .filter((e) => e.type === 'in')
      .reduce((acc, c) => acc + Math.abs(Number(c.amount)), 0);
    const outVal = entries
      .filter((e) => e.type === 'out')
      .reduce((acc, c) => acc + Math.abs(Number(c.amount)), 0);

    const cutOff =
      period === 'week' ? dayjs().subtract(6, 'day').startOf('day') : dayjs().startOf('month');
    const filtered = entries.filter((e) => dayjs(e.date || e.created_at).isAfter(cutOff));

    // Wave
    const wavePoints =
      period === 'week' ? new Array(7).fill(0) : new Array(dayjs().daysInMonth()).fill(0);
    filtered
      .filter((e) => e.type === 'out')
      .forEach((e) => {
        const d = dayjs(e.date);
        const idx = period === 'week' ? 6 - dayjs().diff(d, 'day') : d.date() - 1;
        if (idx >= 0 && idx < wavePoints.length) wavePoints[idx] += Math.abs(Number(e.amount));
      });
    const displayWave = wavePoints.some((v) => v > 0) ? wavePoints : [0, 0, 0, 0, 0, 10, 50];

    // Pie
    const catMap: Record<string, number> = {};
    filtered
      .filter((e) => e.type === 'out')
      .forEach((e) => {
        const c = e.category || 'Other';
        catMap[c] = (catMap[c] || 0) + Math.abs(Number(e.amount));
      });

    const piePoints = Object.entries(catMap)
      .map(([name, val], i) => ({
        name,
        population: val,
        color: CHART_COLORS[i % CHART_COLORS.length],
        legendFontColor: '#333',
        legendFontSize: 12,
      }))
      .sort((a, b) => b.population - a.population);

    return {
      stats: { in: inVal, out: outVal, bal: inVal - outVal },
      chartData: { wave: displayWave, pie: piePoints },
      recentEntries: entries.slice(0, 10),
    };
  }, [entries, period]);

  const renderHeader = () => (
    <View style={styles.headerContainer}>
      {isSyncing && (
        <View style={styles.syncBanner}>
          <ActivityIndicator size="small" color="#fff" />
          <Text style={styles.syncBannerText}>Syncing…</Text>
        </View>
      )}
      {/* 1. TOP BAR */}
      <View style={styles.topBar}>
        <View style={styles.userInfo}>
          <TouchableOpacity onPress={() => navigation.openDrawer()} style={styles.menuBtn}>
            <MaterialIcon name="menu" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={{ marginLeft: 12 }}>
            <Text style={styles.greetingText}>{getGreeting()}</Text>
            {/* Show avatar image if available, otherwise show first name */}
            {user?.image ? (
              <Image source={{ uri: user.image }} style={styles.headerAvatarImage} />
            ) : (
              <Text style={styles.userName}>{user?.name?.split(' ')[0] || 'Sotu'}</Text>
            )}
          </View>
        </View>
        <UserAvatar
          size={36}
          name={user?.name}
          imageUrl={user?.image || (user as any)?.imageUrl}
          onPress={() => navigation.navigate('Account')}
          style={{ marginRight: 0 }}
        />
      </View>

      {/* 2. HERO CARD */}
      <Animated.View
        style={[styles.heroCard, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
      >
        <Svg style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#4F8EF7" />
              <Stop offset="1" stopColor="#2563EB" />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" rx={26} fill="url(#grad)" />
          <Circle cx="85%" cy="15%" r="80" fill="white" fillOpacity="0.08" />
          <Circle cx="10%" cy="90%" r="50" fill="white" fillOpacity="0.05" />
        </Svg>

        <View style={styles.cardContent}>
          <View style={styles.cardTopRow}>
            <View style={styles.balanceLabelContainer}>
              <Text style={styles.balanceLabel}>Total Balance</Text>
            </View>
            <TouchableOpacity onPress={() => setShowBalance(!showBalance)} style={styles.eyeButton}>
              <MaterialIcon
                name={showBalance ? 'visibility' : 'visibility-off'}
                size={18}
                color="rgba(255,255,255,0.9)"
              />
            </TouchableOpacity>
          </View>

          <View style={styles.balanceWrapper}>
            <Text style={styles.currency}>₹</Text>
            <Text style={styles.balanceText}>
              {showBalance ? stats.bal.toLocaleString('en-IN') : '••••••'}
            </Text>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <View style={styles.iconCircleIn}>
                <MaterialIcon name="arrow-downward" size={16} color="#10B981" />
              </View>
              <View>
                <Text style={styles.statLabel}>Income</Text>
                <Text style={styles.statValue}>
                  {showBalance ? `₹${stats.in.toLocaleString()}` : '•••'}
                </Text>
              </View>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <View style={styles.iconCircleOut}>
                <MaterialIcon name="arrow-upward" size={16} color="#EF4444" />
              </View>
              <View>
                <Text style={styles.statLabel}>Expense</Text>
                <Text style={styles.statValue}>
                  {showBalance ? `₹${stats.out.toLocaleString()}` : '•••'}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </Animated.View>

      {/* 3. QUICK ACTIONS */}
      <View style={styles.actionsRow}>
        {[
          { label: 'Add', icon: 'add', nav: 'AddEntry', bg: colors.primary, iconColor: '#FFF' },
          {
            label: 'Stats',
            icon: 'bar-chart',
            nav: 'Stats',
            bg: '#FFF',
            iconColor: colors.primary,
          },
          {
            label: 'Export',
            icon: 'file-download',
            nav: 'Export',
            bg: '#FFF',
            iconColor: colors.primary,
          },
        ].map((a, i) => (
          <View key={i} style={styles.actionCol}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: a.bg }]}
              onPress={() => navigation.navigate(a.nav)}
              activeOpacity={0.8}
            >
              <MaterialIcon name={a.icon as any} size={28} color={a.iconColor} />
            </TouchableOpacity>
            <Text style={styles.actionText}>{a.label}</Text>
          </View>
        ))}
      </View>

      {/* 4. CHART WIDGET */}
      <View style={styles.chartWidget}>
        <View style={styles.widgetHeader}>
          <View style={styles.toggleGroup}>
            {[
              { id: 'wave', icon: 'show-chart' },
              { id: 'pie', icon: 'pie-chart' },
              { id: 'list', icon: 'list' },
            ].map((t) => (
              <TouchableOpacity
                key={t.id}
                onPress={() => handleToggleChart(t.id)}
                style={[styles.toggleBtn, chartType === t.id && styles.toggleBtnActive]}
              >
                <MaterialIcon
                  name={t.icon as any}
                  size={20}
                  color={chartType === t.id ? colors.primary : '#94A3B8'}
                />
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.periodPill}>
            <TouchableOpacity
              onPress={() => handleTogglePeriod('week')}
              style={[styles.pillBtn, period === 'week' && styles.pillBtnActive]}
            >
              <Text style={[styles.pillText, period === 'week' && styles.pillTextActive]}>7D</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleTogglePeriod('month')}
              style={[styles.pillBtn, period === 'month' && styles.pillBtnActive]}
            >
              <Text style={[styles.pillText, period === 'month' && styles.pillTextActive]}>
                Month
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.chartContent}>
          {chartType === 'wave' && <WaveChart data={chartData.wave} width={CHART_WIDTH} />}
          {chartType === 'pie' && <CustomPieChart data={chartData.pie} width={CHART_WIDTH} />}
          {chartType === 'list' && <RankList data={chartData.pie} total={stats.out} />}
        </View>
      </View>

      {/* 5. RECENT HEADER */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent Transactions</Text>
        <TouchableOpacity onPress={() => navigation.navigate('History')}>
          <Text style={styles.seeAllText}>See All</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.main}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        {/* Non-blocking loader (delayed to avoid flicker) */}
        {showLoading && (
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <View style={{ flex: 1, alignItems: 'center', paddingTop: 100 }}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          </View>
        )}

        <FlatList
          data={recentEntries}
          keyExtractor={(item) => item.local_id || Math.random().toString()}
          renderItem={({ item }) => (
            <View style={{ paddingHorizontal: 20 }}>
              <TransactionItem
                item={item}
                onPress={() => navigation.navigate('AddEntry', { local_id: item.local_id })}
              />
            </View>
          )}
          ListHeaderComponent={renderHeader()}
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            !isLoading ? (
              <View style={styles.centerBox}>
                <Text style={styles.emptyText}>No recent transactions</Text>
              </View>
            ) : undefined
          }
        />
      </SafeAreaView>
    </View>
  );
};

// --- STYLES ---
const styles = StyleSheet.create({
  main: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1 },
  headerContainer: { paddingHorizontal: 20, paddingTop: 10 },
  centerBox: { alignItems: 'center', justifyContent: 'center', padding: 20 },
  emptyText: { color: colors.subText, fontStyle: 'italic' },

  // Header
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  syncBanner: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  syncBannerText: { color: '#fff', marginLeft: 8, fontWeight: '600' },
  userInfo: { flexDirection: 'row', alignItems: 'center' },
  menuBtn: {
    padding: 8,
    borderRadius: 14,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 1,
  },
  greetingText: {
    fontSize: fontScale(10),
    textTransform: 'uppercase',
    color: colors.subText,
    fontWeight: '700',
    marginBottom: 2,
  },
  userName: { fontSize: fontScale(18), color: colors.text, fontWeight: '800' },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E2E8F0',
    marginRight: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  headerAvatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    marginRight: 12,
  },
  avatarInitial: { fontSize: fontScale(18), fontWeight: '700', color: colors.primary },

  // Hero Card
  heroCard: {
    height: 210,
    borderRadius: 28,
    marginBottom: 24,
    overflow: 'hidden',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  cardContent: { flex: 1, padding: 24, justifyContent: 'space-between' },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  balanceLabelContainer: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  balanceLabel: { color: '#FFF', fontSize: fontScale(11), fontWeight: '600' },
  eyeButton: { padding: 4 },
  balanceWrapper: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    marginTop: 4,
  },
  currency: {
    fontSize: fontScale(24),
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '600',
    marginTop: 6,
    marginRight: 4,
  },
  balanceText: { fontSize: fontScale(42), color: '#FFF', fontWeight: '800' },

  // Stats Row
  statsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 20,
    padding: 12,
  },
  statBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  iconCircleIn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconCircleOut: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statLabel: { color: 'rgba(255,255,255,0.8)', fontSize: fontScale(10), fontWeight: '600' },
  statValue: { color: '#FFF', fontSize: fontScale(14), fontWeight: '700' },
  statDivider: {
    width: 1,
    height: '70%',
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
  },

  // Actions
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    marginBottom: 24,
  },
  actionCol: { alignItems: 'center', gap: 10 },
  actionBtn: {
    width: 64,
    height: 64,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 4,
  },
  actionText: { fontSize: fontScale(12), fontWeight: '600', color: colors.subText },

  // Chart Widget
  chartWidget: {
    backgroundColor: '#FFF',
    borderRadius: 26,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#64748B',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  widgetHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  toggleGroup: { flexDirection: 'row', gap: 4 },
  toggleBtn: { padding: 8, borderRadius: 10, backgroundColor: '#F8FAFC' },
  toggleBtnActive: { backgroundColor: '#EFF6FF' },
  periodPill: { flexDirection: 'row', backgroundColor: '#EFF6FF', borderRadius: 12, padding: 4 },
  pillBtn: { paddingVertical: 6, paddingHorizontal: 16, borderRadius: 8 },
  pillBtnActive: {
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.2,
    elevation: 2,
  },
  pillText: { fontSize: fontScale(11), fontWeight: '600', color: colors.subText },
  pillTextActive: { color: '#FFF' },
  chartContent: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 180,
    overflow: 'hidden',
  },

  // Pie
  pieContainer: { alignItems: 'center' },
  legendContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginTop: 12,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: fontScale(11), color: colors.text, fontWeight: '600' },

  // Rank List
  rankContainer: { width: '100%', paddingVertical: 4 },
  rankRow: { marginBottom: 14 },
  rankHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  rankLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rankDot: { width: 8, height: 8, borderRadius: 4 },
  rankName: { fontSize: fontScale(13), fontWeight: '600', color: colors.text },
  rankValue: { fontSize: fontScale(12), fontWeight: '700', color: colors.text },
  rankAmt: { fontWeight: '400', color: colors.subText },
  progressBarBg: { height: 6, width: '100%', backgroundColor: '#F1F5F9', borderRadius: 3 },
  progressBarFill: { height: '100%', borderRadius: 3 },

  // Transactions Section
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  sectionTitle: { fontSize: fontScale(17), fontWeight: '800', color: colors.text },
  seeAllText: { fontSize: fontScale(13), fontWeight: '700', color: colors.primary },

  // --- UPDATED COMPACT TRANSACTION STYLES ---
  txnCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    paddingVertical: 12, // Reduced padding
    paddingHorizontal: 16,
    borderRadius: 16, // Reduced corner radius
    marginBottom: 8, // Reduced spacing
    elevation: 2,
    shadowColor: '#64748B',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  txnIconBox: {
    width: 40, // Smaller icon box (was 44)
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  txnContent: { flex: 1 },
  txnTitle: {
    fontSize: fontScale(14), // Slightly smaller font
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  txnSubtitle: {
    fontSize: fontScale(11), // Compact text
    color: colors.subText,
    fontWeight: '500',
  },
  txnRight: { alignItems: 'flex-end' },
  txnAmount: {
    fontSize: fontScale(14),
    fontWeight: '800',
    marginBottom: 2,
  },
  txnDate: {
    fontSize: fontScale(10),
    color: colors.subText,
  },
});

export default HomeScreen;

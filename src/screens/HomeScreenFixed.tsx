import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Constants from 'expo-constants';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  useWindowDimensions,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@rneui/themed';
import SimpleButtonGroup from '../components/SimpleButtonGroup';
import TransactionCard from '../components/TransactionCard';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../hooks/useAuth';
import { useEntries } from '../hooks/useEntries';
import useDelayedLoading from '../hooks/useDelayedLoading';
import FullScreenSpinner from '../components/FullScreenSpinner';
import UpdateBanner from '../components/UpdateBanner';
import { useInternetStatus } from '../hooks/useInternetStatus';
import * as Updates from 'expo-updates';
import dayjs from 'dayjs';

import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  Easing,
  FadeInDown,
  interpolate,
} from 'react-native-reanimated';

import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
import { spacing, colors } from '../utils/design';
import { ensureCategory, FALLBACK_CATEGORY } from '../constants/categories';

const pkg = require('../../package.json');

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
  colors.primary,
  colors.accentBlue,
  colors.accentGreen,
  colors.accentOrange,
  colors.accentRed,
  colors.secondary,
];

const hexToRgb = (hex: string) => {
  const normalized = hex.replace('#', '');
  const bigint = parseInt(normalized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `${r}, ${g}, ${b}`;
};

const HomeScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { entries = [], isLoading = false } = useEntries(user?.id);
  const showLoading = useDelayedLoading(Boolean(isLoading), 200);
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const isOnline = useInternetStatus();
  const autoCheckRef = useRef(false);
  const [updateBannerVisible, setUpdateBannerVisible] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | undefined>();
  const [applyingUpdate, setApplyingUpdate] = useState(false);
  const isExpoGo = Constants?.appOwnership === 'expo';

  useLayoutEffect(() => {
    if (typeof navigation?.setOptions === 'function') {
      navigation.setOptions({ headerShown: false });
    }
  }, [navigation]);

  // Dynamic sizing for responsiveness
  const CHART_WIDTH = SCREEN_WIDTH - spacing(4) * 2 - spacing(4);

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

  const netTrend = useMemo(() => {
    if (!entries.length) return { current: 0, previous: 0, delta: null as number | null };
    const now = Date.now();
    const week = 7 * 24 * 60 * 60 * 1000;
    let current = 0;
    let previous = 0;
    entries.forEach((entry) => {
      const stamp = new Date(entry.date || entry.created_at).getTime();
      if (Number.isNaN(stamp)) return;
      const value = entry.type === 'in' ? Number(entry.amount || 0) : -Number(entry.amount || 0);
      if (stamp >= now - week) current += value;
      else if (stamp >= now - week * 2) previous += value;
    });
    const delta = previous === 0 ? null : ((current - previous) / Math.abs(previous)) * 100;
    return { current, previous, delta };
  }, [entries]);

  const periodStart = useMemo(() => {
    if (period === 'week') {
      return dayjs().startOf('day').subtract(6, 'day');
    }
    return dayjs().startOf('month');
  }, [period]);

  const periodEntries = useMemo(() => {
    const startValue = periodStart.valueOf();
    return (entries || [])
      .filter((entry: any) => {
        const entryDate = dayjs(entry.date || entry.created_at).startOf('day');
        if (!entryDate.isValid()) {
          return false;
        }
        return entryDate.valueOf() >= startValue;
      })
      .sort((a, b) => {
        const aTime = dayjs(a.date || a.created_at).valueOf();
        const bTime = dayjs(b.date || b.created_at).valueOf();
        return bTime - aTime;
      });
  }, [entries, periodStart]);

  const periodLabel = period === 'week' ? 'This week' : 'This month';

  const periodIncome = useMemo(
    () =>
      periodEntries.filter((e) => e.type === 'in').reduce((s, x) => s + Number(x.amount || 0), 0),
    [periodEntries]
  );

  const periodExpense = useMemo(
    () =>
      periodEntries.filter((e) => e.type === 'out').reduce((s, x) => s + Number(x.amount || 0), 0),
    [periodEntries]
  );

  const periodAverageTicket = useMemo(() => {
    if (!periodEntries.length) return 0;
    const sum = periodEntries.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
    return sum / periodEntries.length;
  }, [periodEntries]);

  const periodActiveDays = useMemo(() => {
    const set = new Set<string>();
    periodEntries.forEach((entry) => {
      try {
        const key = new Date(entry.date || entry.created_at).toISOString().slice(0, 10);
        if (key) set.add(key);
      } catch (err) {}
    });
    return set.size;
  }, [periodEntries]);

  const periodNet = periodIncome - periodExpense;

  // Pie chart: show both income and expense by category
  const pieByCategory = useMemo(() => {
    const map: Record<string, { in: number; out: number }> = {};
    periodEntries.forEach((e) => {
      const cat = ensureCategory(e.category);
      if (!map[cat]) map[cat] = { in: 0, out: 0 };
      if (e.type === 'in') map[cat].in += Number(e.amount || 0);
      if (e.type === 'out') map[cat].out += Number(e.amount || 0);
    });
    return Object.entries(map).map(([category, vals]) => ({
      category,
      income: vals.in,
      expense: vals.out,
    }));
  }, [periodEntries]);

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
    const source = periodEntries || [];

    if (period === 'week') {
      const labels: string[] = [];
      const orderKeys: string[] = [];
      const incomeMap: Record<string, number> = {};
      const expenseMap: Record<string, number> = {};
      for (let i = 6; i >= 0; i--) {
        const day = dayjs().startOf('day').subtract(i, 'day');
        const key = day.format('YYYY-MM-DD');
        labels.push(day.format('ddd'));
        orderKeys.push(key);
        incomeMap[key] = 0;
        expenseMap[key] = 0;
      }
      source.forEach((entry) => {
        const entryKey = dayjs(entry.date || entry.created_at).startOf('day').format('YYYY-MM-DD');
        if (!(entryKey in incomeMap)) {
          return;
        }
        const amount = Number(entry.amount || 0);
        if (entry.type === 'in') {
          incomeMap[entryKey] += amount;
        } else if (entry.type === 'out') {
          expenseMap[entryKey] += amount;
        }
      });
      return {
        labels,
        income: orderKeys.map((key) => incomeMap[key]),
        expense: orderKeys.map((key) => expenseMap[key]),
      };
    }

    const buckets = 4;
    const labels: string[] = [];
    const incomeTotals: number[] = Array(buckets).fill(0);
    const expenseTotals: number[] = Array(buckets).fill(0);
    const now = dayjs().endOf('day');
    for (let idx = buckets - 1; idx >= 0; idx--) {
      const bucketEnd = now.subtract(idx * 7, 'day');
      const bucketStart = bucketEnd.subtract(6, 'day');
      labels.push(`${bucketStart.format('DD')} - ${bucketEnd.format('DD')}`);
      source.forEach((entry) => {
        const entryDate = dayjs(entry.date || entry.created_at);
        if (!entryDate.isValid()) {
          return;
        }
        if (entryDate.isBefore(bucketStart) || entryDate.isAfter(bucketEnd)) {
          return;
        }
        const amount = Number(entry.amount || 0);
        const targetIndex = buckets - 1 - idx;
        if (entry.type === 'in') {
          incomeTotals[targetIndex] += amount;
        } else if (entry.type === 'out') {
          expenseTotals[targetIndex] += amount;
        }
      });
    }
    return {
      labels,
      income: incomeTotals,
      expense: expenseTotals,
    };
  }, [periodEntries, period]);

  const recent = (entries || []).slice(0, 5);

  // Use pieExpenseData for pie chart (can toggle to pieIncomeData if needed)
  const pieData = pieExpenseData;

  const chartPrimaryRgb = hexToRgb(colors.primary);
  const chartLabelRgb = hexToRgb(colors.muted);

  const chartConfig = {
    backgroundColor: colors.card,
    backgroundGradientFrom: colors.card,
    backgroundGradientTo: colors.card,
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(${chartPrimaryRgb}, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(${chartLabelRgb}, ${opacity})`,
  };

  const userInitial = (() => {
    if (typeof user?.name === 'string') {
      const trimmed = user.name.trim();
      if (trimmed.length) return trimmed.charAt(0).toUpperCase();
    }
    return 'D';
  })();

  const heroTrendDetails = useMemo(() => {
    if (!entries.length) {
      return {
        label: 'Start logging to see insights',
        color: colors.secondary,
        icon: 'auto-graph' as const,
      };
    }
    if (netTrend.delta === null) {
      return {
        label: 'New activity this week',
        color: colors.secondary,
        icon: 'auto-graph' as const,
      };
    }
    const isUp = netTrend.delta >= 0;
    return {
      label: `${isUp ? 'Up' : 'Down'} ${Math.abs(netTrend.delta).toFixed(1)}% vs last week`,
      color: isUp ? colors.accentGreen : colors.accentRed,
      icon: isUp ? ('trending-up' as const) : ('trending-down' as const),
    };
  }, [entries.length, netTrend]);

  const highlightCards = useMemo(
    () => [
      {
        label: 'Avg ticket',
        value: `₹${periodAverageTicket.toFixed(0)}`,
        icon: 'receipt-long',
        tint: colors.accentBlue,
      },
      {
        label: 'Active days',
        value: `${periodActiveDays || 0}`,
        icon: 'calendar-today',
        tint: colors.accentGreen,
      },
      {
        label: 'Entries (period)',
        value: `${periodEntries.length}`,
        icon: 'fact-check',
        tint: colors.secondary,
      },
    ],
    [periodAverageTicket, periodActiveDays, periodEntries.length]
  );

  const topExpenseCategory = useMemo(() => {
    if (!pieExpenseData.length) return FALLBACK_CATEGORY;
    const sorted = [...pieExpenseData].sort((a, b) => b.population - a.population);
    return sorted[0]?.name || FALLBACK_CATEGORY;
  }, [pieExpenseData]);

  const heroMetrics = useMemo(
    () => [
      {
        label: 'Cash in',
        value: `₹${Math.round(periodIncome).toLocaleString('en-IN')}`,
        accent: colors.accentGreen,
      },
      {
        label: 'Cash out',
        value: `₹${Math.round(periodExpense).toLocaleString('en-IN')}`,
        accent: colors.accentRed,
      },
      {
        label: 'Top category',
        value: topExpenseCategory,
        accent: colors.accentOrange,
      },
    ],
    [periodIncome, periodExpense, topExpenseCategory]
  );

  const insightRows = useMemo(
    () => [
      { label: 'Top category', value: topExpenseCategory, icon: 'category' },
      { label: 'Net (7d)', value: `₹${netTrend.current.toFixed(0)}`, icon: 'timeline' },
      { label: 'Balance', value: `₹${balance.toFixed(0)}`, icon: 'account-balance-wallet' },
      {
        label: 'Cash flow',
        value: `${period === 'week' ? 'Weekly' : 'Monthly'}`,
        icon: 'insights',
      },
    ],
    [topExpenseCategory, netTrend.current, balance, period]
  );

  const homeActions = useMemo(
    () => [
      {
        label: 'Add entry',
        icon: 'flash-on',
        accent: colors.primary,
        onPress: () => navigation.navigate('AddEntry'),
      },
      {
        label: 'History',
        icon: 'history',
        accent: colors.secondary,
        onPress: () => navigation.navigate('History'),
      },
      {
        label: 'Stats',
        icon: 'insights',
        accent: colors.accentGreen,
        onPress: () => navigation.navigate('Stats'),
      },
    ],
    [navigation]
  );

  const heroPulse = useSharedValue(0);
  useEffect(() => {
    heroPulse.value = withRepeat(
      withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, [heroPulse]);

  const heroBlobLeftStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(heroPulse.value, [0, 1], [0, -12]) },
      { translateX: interpolate(heroPulse.value, [0, 1], [0, 10]) },
      { scale: 0.95 + heroPulse.value * 0.08 },
    ],
    opacity: 0.45,
  }));

  const heroBlobRightStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(heroPulse.value, [0, 1], [-6, 8]) },
      { translateX: interpolate(heroPulse.value, [0, 1], [12, -8]) },
      { scale: 0.9 + heroPulse.value * 0.1 },
    ],
    opacity: 0.35,
  }));

  /* --- ANIMATIONS --- */
  const shimmer = useSharedValue(0);
  useEffect(() => {
    shimmer.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
  }, []);
  const shimmerStyle = useAnimatedStyle(() => ({ opacity: 0.3 + 0.7 * shimmer.value }));

  // Auto-check for OTA updates once per session when we're online
  useEffect(() => {
    if (!isOnline || isExpoGo || autoCheckRef.current) return;
    autoCheckRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        const result = await Updates.checkForUpdateAsync();
        if (!cancelled && result.isAvailable) {
          const manifest: any = (result as any)?.manifest || {};
          const version =
            manifest.version ||
            manifest.runtimeVersion ||
            manifest?.extra?.expoGo?.runtimeVersion ||
            pkg.version;
          setUpdateMessage(version ? `Version ${version}` : undefined);
          setUpdateBannerVisible(true);
        }
      } catch (err) {
        // Fail silently per requirement — no UI noise when checks fail
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOnline]);

  const handleBannerPress = useCallback(async () => {
    setUpdateBannerVisible(false);
    try {
      setApplyingUpdate(true);
      const fetched = await Updates.fetchUpdateAsync();
      if (fetched.isNew) {
        await Updates.reloadAsync();
      }
    } catch (err) {
      // Silent failure keeps UI clean; logs still aid debugging
      console.log('Home auto-update apply failed', err);
    } finally {
      setApplyingUpdate(false);
    }
  }, []);

  const handleOpenDrawer = useCallback(() => {
    const anyNav: any = navigation;
    if (typeof anyNav?.openDrawer === 'function') {
      anyNav.openDrawer();
    } else if (typeof anyNav?.toggleDrawer === 'function') {
      anyNav.toggleDrawer();
    }
  }, [navigation]);

  return (
    <View style={styles.mainContainer}>
      <UpdateBanner
        visible={updateBannerVisible}
        message={updateMessage}
        duration={4500}
        onPress={handleBannerPress}
        onClose={() => setUpdateBannerVisible(false)}
      />
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <SafeAreaView style={styles.safeArea}>
        <FullScreenSpinner visible={showLoading || applyingUpdate} />
        <FlatList
          data={recent}
          keyExtractor={(item) => item.local_id}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <Animated.View
              entering={FadeInDown.delay(520 + index * 40)
                .springify()
                .damping(16)}
            >
              <TransactionCard item={item} />
            </Animated.View>
          )}
          initialNumToRender={5}
          maxToRenderPerBatch={5}
          windowSize={6}
          removeClippedSubviews={true}
          contentContainerStyle={{
            ...styles.scrollContent,
            paddingBottom: spacing(10),
          }}
          ListHeaderComponentStyle={styles.listHeaderSpacing}
          ListHeaderComponent={
            <Animated.View entering={FadeInDown.delay(100).duration(500)}>
              <View style={styles.topNavRow}>
                <TouchableOpacity style={styles.navIconButton} onPress={handleOpenDrawer}>
                  <MaterialIcon name="menu" size={22} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.topNavTitle}>Dashboard</Text>
                <View style={styles.topNavAvatar}>
                  <Text style={styles.topNavAvatarText}>{userInitial}</Text>
                </View>
              </View>

              <View style={styles.heroCard}>
                <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
                  <Defs>
                    <SvgLinearGradient id="heroGradient" x1="0" y1="0" x2="1" y2="1">
                      <Stop offset="0%" stopColor={colors.primary} stopOpacity={0.9} />
                      <Stop offset="90%" stopColor={colors.secondary} stopOpacity={0.85} />
                    </SvgLinearGradient>
                  </Defs>
                  <Rect width="100%" height="100%" rx={28} fill="url(#heroGradient)" />
                </Svg>

                <Animated.View style={[styles.heroBlob, styles.heroBlobLeft, heroBlobLeftStyle]} />
                <Animated.View
                  style={[styles.heroBlob, styles.heroBlobRight, heroBlobRightStyle]}
                />

                <View style={styles.heroChipRow}>
                  <View style={styles.heroChip}>
                    <MaterialIcon
                      name={isOnline ? 'wifi' : 'wifi-off'}
                      size={16}
                      color={colors.white}
                    />
                    <Text style={styles.heroChipText}>
                      {isOnline ? 'Live sync on' : 'Offline mode'}
                    </Text>
                  </View>
                  <View style={[styles.heroChip, styles.heroChipLight]}>
                    <MaterialIcon name="schedule" size={16} color={colors.primary} />
                    <Text style={[styles.heroChipText, styles.heroChipTextDark]}>
                      {periodLabel}
                    </Text>
                  </View>
                </View>

                <View style={styles.heroTopRow}>
                  <View>
                    <Text style={styles.heroSubtle}>Welcome back</Text>
                    <Text style={styles.heroGreeting}>{user?.name ? user.name : 'Guest'} 👋</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.heroSettings}
                    onPress={() => navigation.navigate('Settings')}
                  >
                    <MaterialIcon name="settings" size={20} color={colors.primary} />
                  </TouchableOpacity>
                </View>

                <View style={styles.heroBalanceRow}>
                  <View>
                    <Text style={styles.heroOverline}>Net this period</Text>
                    <Text style={styles.heroBalance}>₹{periodNet.toFixed(2)}</Text>
                  </View>
                  <View style={[styles.trendBadge, { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
                    <MaterialIcon name={heroTrendDetails.icon} size={18} color={colors.white} />
                    <Text style={[styles.trendText, { color: colors.white }]}>
                      {heroTrendDetails.label}
                    </Text>
                  </View>
                </View>

                <View style={styles.heroMetricRow}>
                  {heroMetrics.map((metric) => (
                    <View key={metric.label} style={styles.heroMetric}>
                      <View style={[styles.heroMetricDot, { backgroundColor: metric.accent }]} />
                      <Text style={styles.heroMetricLabel}>{metric.label}</Text>
                      <Text style={styles.heroMetricValue}>{metric.value}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.heroPrimaryActionRow}>
                  <TouchableOpacity
                    style={styles.heroPrimaryCta}
                    onPress={() => navigation.navigate('AddEntry')}
                  >
                    <MaterialIcon name="flash-on" size={18} color={colors.white} />
                    <Text style={styles.heroPrimaryCtaText}>Log entry</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.heroSecondaryCta}
                    onPress={() => navigation.navigate('Stats')}
                  >
                    <MaterialIcon name="insights" size={18} color={colors.primary} />
                    <Text style={styles.heroSecondaryCtaText}>Open stats</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.quickStatsCard}>
                {highlightCards.map((card, idx) => (
                  <Animated.View
                    key={card.label}
                    entering={FadeInDown.delay(140 + idx * 40)
                      .springify()
                      .damping(18)}
                    style={[
                      styles.quickStatRow,
                      idx !== highlightCards.length - 1 && styles.quickStatDivider,
                    ]}
                  >
                    <View style={[styles.quickStatIcon, { backgroundColor: `${card.tint}1A` }]}>
                      <MaterialIcon name={card.icon as any} size={18} color={card.tint} />
                    </View>
                    <View style={styles.quickStatTextWrap}>
                      <Text style={styles.quickStatLabel}>{card.label}</Text>
                      <Text style={styles.quickStatValue}>{card.value}</Text>
                    </View>
                  </Animated.View>
                ))}
              </View>

              <View style={styles.quickActionsCard}>
                <View style={styles.actionGrid}>
                  {homeActions.map((action, idx) => (
                    <Animated.View
                      key={action.label}
                      entering={FadeInDown.delay(260 + idx * 60)
                        .springify()
                        .damping(15)}
                      style={styles.actionWrapper}
                    >
                      <TouchableOpacity style={styles.actionCard} onPress={action.onPress}>
                        <View style={styles.actionInner}>
                          <View
                            style={[
                              styles.actionIconWrap,
                              { backgroundColor: `${action.accent}22` },
                            ]}
                          >
                            <MaterialIcon
                              name={action.icon as any}
                              size={20}
                              color={action.accent}
                            />
                          </View>
                          <Text style={styles.actionLabel}>{action.label}</Text>
                        </View>
                      </TouchableOpacity>
                    </Animated.View>
                  ))}
                </View>
              </View>

              <View style={styles.analyticsCard}>
                <View style={styles.cardHeaderRow}>
                  <View>
                    <Text style={styles.cardTitle}>Cash intelligence</Text>
                    <Text style={styles.cardSubtitle}>Visualize income vs expense</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setChartType(chartType === 'pie' ? 'bar' : 'pie')}
                  >
                    <MaterialIcon
                      name={chartType === 'pie' ? 'bar-chart' : 'pie-chart'}
                      size={22}
                      color={colors.primary}
                    />
                  </TouchableOpacity>
                </View>

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
                  weeklyBar.income?.some(Boolean) ||
                  weeklyBar.expense?.some(Boolean) ? (
                  <View style={styles.chartWrapper}>
                    {chartType === 'pie' && PieChart ? (
                      <PieChart
                        data={pieData}
                        width={CHART_WIDTH}
                        height={220}
                        chartConfig={chartConfig}
                        accessor="population"
                        backgroundColor="transparent"
                        paddingLeft="18"
                        absolute
                        hasLegend
                      />
                    ) : chartType === 'bar' && BarChart ? (
                      <BarChart
                        data={{
                          labels: weeklyBar.labels,
                          datasets: [
                            {
                              data: weeklyBar.income,
                              color: () => colors.accentGreen,
                              label: 'Income',
                            },
                            {
                              data: weeklyBar.expense,
                              color: () => colors.accentRed,
                              label: 'Expense',
                            },
                          ],
                        }}
                        width={CHART_WIDTH}
                        height={220}
                        yAxisLabel="₹"
                        chartConfig={chartConfig}
                        showValuesOnTopOfBars
                        fromZero
                        style={{ borderRadius: 18, marginTop: 6, paddingRight: 0 }}
                      />
                    ) : (
                      <Text style={styles.unavailable}>Chart library missing</Text>
                    )}
                  </View>
                ) : (
                  <View style={styles.emptyState}>
                    <Text style={styles.unavailable}>No data in this period.</Text>
                  </View>
                )}
              </View>

              <View style={styles.insightsCard}>
                <View style={styles.cardHeaderRow}>
                  <View>
                    <Text style={styles.cardTitle}>Insights</Text>
                    <Text style={styles.cardSubtitle}>Auto-curated from your activity</Text>
                  </View>
                  <MaterialIcon name="lightbulb" size={22} color={colors.accentOrange} />
                </View>
                <View style={styles.insightGrid}>
                  {insightRows.map((row) => (
                    <View key={row.label} style={styles.insightItem}>
                      <View style={styles.insightIconWrap}>
                        <MaterialIcon name={row.icon as any} size={18} color={colors.primary} />
                      </View>
                      <View style={styles.insightTextWrap}>
                        <Text style={styles.insightLabel}>{row.label}</Text>
                        <Text style={styles.insightValue}>{row.value}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Recent transactions</Text>
                <TouchableOpacity onPress={() => navigation.navigate('History')}>
                  <Text style={styles.seeAll}>See all</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          }
          ListEmptyComponent={
            <View style={styles.emptyTransactions}>
              <MaterialIcon name="hourglass-empty" size={36} color={colors.muted} />
              <Text style={styles.unavailable}>No recent activity</Text>
              <TouchableOpacity
                style={styles.emptyCta}
                onPress={() => navigation.navigate('AddEntry')}
              >
                <Text style={styles.emptyCtaText}>Log your first entry</Text>
              </TouchableOpacity>
            </View>
          }
        />
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
    backgroundColor: colors.background,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing(2),
    paddingTop: spacing(3),
    paddingBottom: spacing(16),
  },
  listHeaderSpacing: {
    paddingBottom: spacing(3),
  },
  topNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing(3),
    position: 'relative',
    zIndex: 2,
  },
  navIconButton: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  topNavTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  topNavAvatar: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topNavAvatarText: {
    fontWeight: '700',
    color: colors.primary,
  },
  heroCard: {
    borderRadius: 28,
    padding: spacing(3),
    marginTop: spacing(0.5),
    marginBottom: spacing(3),
    overflow: 'hidden',
    position: 'relative',
    zIndex: 1,
  },
  heroBlob: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 160,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  heroBlobLeft: {
    top: -30,
    left: -30,
  },
  heroBlobRight: {
    bottom: -20,
    right: -10,
  },
  heroChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: spacing(1.25),
    rowGap: spacing(1),
    marginBottom: spacing(2),
  },
  heroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    gap: 8,
    flexShrink: 1,
  },
  heroChipLight: {
    backgroundColor: colors.white,
    marginLeft: 'auto',
  },
  heroChipText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '600',
  },
  heroChipTextDark: {
    color: colors.primary,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing(2),
  },
  heroSubtle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    marginBottom: 4,
  },
  heroGreeting: {
    fontSize: 22,
    color: colors.white,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  heroSettings: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroBalanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing(2),
  },
  heroOverline: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 13,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  heroBalance: {
    color: colors.white,
    fontSize: 38,
    fontWeight: '800',
    letterSpacing: -1,
  },
  trendBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
  },
  trendText: {
    fontWeight: '600',
    fontSize: 12,
    marginLeft: 6,
  },
  heroMetricRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: spacing(2),
  },
  heroMetric: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.14)',
    borderRadius: 16,
    padding: 12,
  },
  heroMetricDot: {
    width: 6,
    height: 6,
    borderRadius: 6,
    marginBottom: 8,
  },
  heroMetricLabel: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    marginBottom: 6,
  },
  heroMetricValue: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  heroPrimaryActionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  heroPrimaryCta: {
    flex: 1,
    backgroundColor: colors.secondary,
    paddingVertical: 12,
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  heroPrimaryCtaText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.white,
  },
  heroSecondaryCta: {
    flex: 1,
    backgroundColor: colors.white,
    paddingVertical: 12,
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  heroSecondaryCtaText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
  },
  quickStatsCard: {
    backgroundColor: colors.card,
    borderRadius: 24,
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1),
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing(3),
  },
  quickStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing(1.5),
  },
  quickStatDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  quickStatIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing(1.5),
  },
  quickStatTextWrap: {
    flex: 1,
  },
  quickStatLabel: {
    color: colors.muted,
    fontSize: 12,
    marginBottom: 2,
  },
  quickStatValue: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 16,
  },
  quickActionsCard: {
    backgroundColor: colors.card,
    borderRadius: 28,
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(2.5),
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing(3),
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  actionGrid: {
    flexDirection: 'row',
    gap: spacing(1.5),
  },
  actionWrapper: {
    flex: 1,
  },
  actionCard: {
    borderRadius: 22,
    padding: spacing(0.75),
    backgroundColor: colors.surfaceMuted,
  },
  actionInner: {
    borderRadius: 20,
    paddingVertical: spacing(2),
    paddingHorizontal: spacing(1),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionIconWrap: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  actionLabel: {
    color: colors.text,
    fontWeight: '700',
  },
  analyticsCard: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: spacing(3),
    marginBottom: spacing(3),
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 3,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing(2),
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  cardSubtitle: {
    color: colors.muted,
    fontSize: 13,
  },
  controlsRow: {
    flexDirection: 'row',
    marginBottom: spacing(2),
  },
  chartWrapper: {
    alignItems: 'center',
  },
  emptyState: {
    paddingVertical: spacing(4),
    alignItems: 'center',
  },
  unavailable: {
    color: colors.muted,
    fontSize: 13,
  },
  skeletonBox: {
    height: 200,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 18,
  },
  insightsCard: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: spacing(3),
    marginBottom: spacing(3),
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 18,
    elevation: 4,
  },
  insightGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing(2),
  },
  insightItem: {
    width: '50%',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  insightIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  insightTextWrap: {
    flex: 1,
  },
  insightLabel: {
    color: colors.muted,
    fontSize: 12,
  },
  insightValue: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 15,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing(2),
    paddingTop: spacing(1),
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  seeAll: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 13,
  },
  emptyTransactions: {
    alignItems: 'center',
    padding: spacing(4),
    backgroundColor: colors.card,
    borderRadius: 20,
    marginHorizontal: spacing(2),
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyCta: {
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  emptyCtaText: {
    color: colors.white,
    fontWeight: '600',
  },
});

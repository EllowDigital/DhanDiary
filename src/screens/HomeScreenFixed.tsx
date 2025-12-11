import React, { useEffect, useMemo, useRef, useState } from 'react';
import Constants from 'expo-constants';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  useWindowDimensions,
  FlatList,
  ScrollView,
  Animated,
  Easing,
  LayoutChangeEvent,
} from 'react-native';
import type { ViewStyle } from 'react-native';
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

// SVG & Design
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Rect,
  Circle,
  Path,
} from 'react-native-svg';
import { spacing, colors } from '../utils/design';
import { ensureCategory, FALLBACK_CATEGORY } from '../constants/categories';

// --- CONFIG ---
/* CHART KIT SAFE LOAD */
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

  // --- RESPONSIVE LOGIC ---
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const isTablet = SCREEN_WIDTH >= 768;
  const isSmallPhone = SCREEN_WIDTH < 380;

  // Dynamic padding calculation
  const horizontalPadding = isTablet ? spacing(6) : spacing(2.5);
  const maxContentWidth = 900;

  // Chart width calculation state (Calculated on Layout for precision)
  const [containerWidth, setContainerWidth] = useState(SCREEN_WIDTH - spacing(5));

  const isOnline = useInternetStatus();
  const autoCheckRef = useRef(false);
  const [updateBannerVisible, setUpdateBannerVisible] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | undefined>();
  const [applyingUpdate, setApplyingUpdate] = useState(false);
  const isExpoGo = Constants?.appOwnership === 'expo';

  // --- ANIMATIONS ---
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
        easing: Easing.out(Easing.poly(4)),
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 700,
        useNativeDriver: true,
        easing: Easing.out(Easing.back(1.5)),
      }),
    ]).start();
  }, []);

  // Filters
  const [period, setPeriod] = useState<'week' | 'month'>('month');
  const [chartType, setChartType] = useState<'pie' | 'bar'>('pie');

  // --- DATA PROCESSING ---
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
    if (!entries.length) return { current: 0, previous: 0, delta: null };
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

  const periodStart = useMemo(
    () =>
      period === 'week' ? dayjs().startOf('day').subtract(6, 'day') : dayjs().startOf('month'),
    [period]
  );

  const periodEntries = useMemo(() => {
    const startValue = periodStart.valueOf();
    return (entries || [])
      .filter((entry: any) => {
        const entryDate = dayjs(entry.date || entry.created_at).startOf('day');
        return entryDate.isValid() && entryDate.valueOf() >= startValue;
      })
      .sort(
        (a, b) => dayjs(b.date || b.created_at).valueOf() - dayjs(a.date || a.created_at).valueOf()
      );
  }, [entries, periodStart]);

  const periodLabel = period === 'week' ? 'Last 7 Days' : 'This Month';
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
    return (
      periodEntries.reduce((acc, curr) => acc + Number(curr.amount || 0), 0) / periodEntries.length
    );
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

  // Charts Data
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

  const weeklyBar = useMemo(() => {
    const source = periodEntries || [];
    const labels: string[] = [];
    const incomeData: number[] = [];
    const expenseData: number[] = [];

    if (period === 'week') {
      for (let i = 6; i >= 0; i--) {
        const d = dayjs().subtract(i, 'day');
        labels.push(d.format('ddd'));
        const dayStr = d.format('YYYY-MM-DD');
        const dayEntries = source.filter(
          (e) => dayjs(e.date || e.created_at).format('YYYY-MM-DD') === dayStr
        );
        incomeData.push(
          dayEntries.filter((e) => e.type === 'in').reduce((s, x) => s + Number(x.amount), 0)
        );
        expenseData.push(
          dayEntries.filter((e) => e.type === 'out').reduce((s, x) => s + Number(x.amount), 0)
        );
      }
    } else {
      // Month View: 4 buckets
      const buckets = 4;
      for (let i = 0; i < buckets; i++) labels.push(`W${i + 1}`);
      for (let i = 0; i < buckets; i++) {
        incomeData.push(0);
        expenseData.push(0);
      }
      source.forEach((e) => {
        const day = dayjs(e.date).date();
        const idx = Math.min(Math.floor((day - 1) / 7), 3);
        if (e.type === 'in') incomeData[idx] += Number(e.amount);
        else expenseData[idx] += Number(e.amount);
      });
    }
    return { labels, income: incomeData, expense: expenseData };
  }, [periodEntries, period]);

  const recent = (entries || []).slice(0, 5);
  const userInitial = user?.name?.trim().charAt(0).toUpperCase() || 'U';

  const heroTrendDetails = useMemo(() => {
    if (!entries.length)
      return {
        label: 'No data',
        icon: 'insights',
        color: colors.white,
      };
    if (netTrend.delta === null)
      return {
        label: 'New',
        icon: 'auto-graph',
        color: colors.white,
      };
    const isUp = netTrend.delta >= 0;
    return {
      label: `${Math.abs(netTrend.delta).toFixed(1)}%`,
      icon: isUp ? 'trending-up' : 'trending-down',
      color: isUp ? '#4ade80' : '#f87171', // Lighter green/red for dark bg
    };
  }, [entries.length, netTrend]);

  const topExpenseCategory = useMemo(() => {
    if (!pieExpenseData.length) return 'None';
    return (
      [...pieExpenseData].sort((a, b) => b.population - a.population)[0]?.name || FALLBACK_CATEGORY
    );
  }, [pieExpenseData]);

  // Actions
  const quickActions = useMemo(
    () => [
      {
        label: 'Add Entry',
        icon: 'add',
        onPress: () => navigation.navigate('AddEntry'),
        primary: true,
      },
      {
        label: 'Stats',
        icon: 'bar-chart',
        onPress: () => navigation.navigate('Stats'),
      },
      {
        label: 'History',
        icon: 'history',
        onPress: () => navigation.navigate('History'),
      },
      {
        label: 'Settings',
        icon: 'settings',
        onPress: () => navigation.navigate('Settings'),
      },
    ],
    [navigation]
  );

  const highlightCards = useMemo(
    () => [
      {
        label: 'Avg Ticket',
        value: `₹${periodAverageTicket.toFixed(0)}`,
        icon: 'receipt',
        color: colors.accentBlue,
      },
      {
        label: 'Active Days',
        value: `${periodActiveDays}`,
        icon: 'calendar-today',
        color: colors.accentGreen,
      },
      {
        label: 'Top Spend',
        value: topExpenseCategory,
        icon: 'pie-chart',
        color: colors.accentOrange,
      },
    ],
    [periodAverageTicket, periodActiveDays, topExpenseCategory]
  );

  const chartConfig = {
    backgroundColor: 'transparent',
    backgroundGradientFrom: colors.card,
    backgroundGradientTo: colors.card,
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(${hexToRgb(colors.primary)}, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(${hexToRgb(colors.subtleText)}, ${opacity})`,
    propsForBackgroundLines: { strokeDasharray: '4', stroke: colors.border },
  };

  const responsiveContainerStyle = useMemo<ViewStyle>(
    () => ({
      width: '100%' as const,
      maxWidth: maxContentWidth,
      alignSelf: 'center',
      paddingHorizontal: horizontalPadding,
    }),
    [maxContentWidth, horizontalPadding]
  );

  // --- HANDLERS ---
  const handleOpenDrawer = () => navigation.openDrawer();
  const handleBannerPress = async () => {
    setUpdateBannerVisible(false);
    try {
      setApplyingUpdate(true);
      const fetched = await Updates.fetchUpdateAsync();
      if (fetched.isNew) await Updates.reloadAsync();
    } catch (e) {
    } finally {
      setApplyingUpdate(false);
    }
  };
  const onLayoutContainer = (e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  };

  // Update Checker
  useEffect(() => {
    if (!isOnline || isExpoGo || autoCheckRef.current) return;
    autoCheckRef.current = true;
    (async () => {
      try {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) {
          setUpdateMessage('New version available');
          setUpdateBannerVisible(true);
        }
      } catch (e) {}
    })();
  }, [isOnline]);

  return (
    <View style={styles.mainContainer}>
      <UpdateBanner
        visible={updateBannerVisible}
        message={updateMessage}
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
          contentContainerStyle={{ paddingBottom: spacing(12) }}
          ListHeaderComponent={
            <View style={responsiveContainerStyle}>
              {/* --- HEADER --- */}
              <Animated.View style={[styles.headerRow, { opacity: fadeAnim }]}>
                <View style={styles.headerLeft}>
                  <TouchableOpacity style={styles.menuButton} onPress={handleOpenDrawer}>
                    <MaterialIcon name="menu" size={24} color={colors.text} />
                  </TouchableOpacity>
                  <View>
                    <Text style={styles.greetingSub}>Welcome,</Text>
                    <Text style={styles.greetingName}>
                      {user?.name?.split(' ')[0] || 'Guest'} 👋
                    </Text>
                  </View>
                </View>

                <View style={styles.profileBtn}>
                  <Text style={styles.profileInitial}>{userInitial}</Text>
                </View>
              </Animated.View>

              {/* --- HERO CARD (GRADIENT) --- */}
              <Animated.View
                style={[
                  styles.heroContainer,
                  { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
                ]}
              >
                <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
                  <Defs>
                    <SvgLinearGradient id="heroGrad" x1="0" y1="0" x2="1" y2="1">
                      <Stop offset="0" stopColor={colors.primary} stopOpacity="1" />
                      <Stop offset="1" stopColor={colors.secondary} stopOpacity="1" />
                    </SvgLinearGradient>
                  </Defs>
                  <Rect width="100%" height="100%" rx={28} fill="url(#heroGrad)" />
                  <Circle cx="90%" cy="15%" r="80" fill="white" fillOpacity="0.1" />
                  <Path
                    d="M0 200 Q 150 150 350 240 T 400 240"
                    fill="none"
                    stroke="white"
                    strokeWidth="40"
                    strokeOpacity="0.05"
                  />
                </Svg>

                <View style={styles.heroContent}>
                  <View style={styles.heroTopRow}>
                    <View style={styles.glassBadge}>
                      <MaterialIcon name="date-range" size={12} color="rgba(255,255,255,0.9)" />
                      <Text style={styles.glassBadgeText}>{periodLabel}</Text>
                    </View>
                    <View style={styles.glassBadge}>
                      <MaterialIcon
                        name={heroTrendDetails.icon as any}
                        size={14}
                        color={heroTrendDetails.color}
                      />
                      <Text style={[styles.glassBadgeText, { color: heroTrendDetails.color }]}>
                        {heroTrendDetails.label}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.balanceContainer}>
                    <Text style={styles.balanceLabel}>TOTAL BALANCE</Text>
                    <Text style={styles.balanceAmount} numberOfLines={1} adjustsFontSizeToFit>
                      ₹{balance.toLocaleString('en-IN')}
                    </Text>
                  </View>

                  <View style={styles.heroStatsContainer}>
                    <View style={styles.heroStatItem}>
                      <View style={[styles.statIcon, { backgroundColor: 'rgba(34,197,94,0.2)' }]}>
                        <MaterialIcon name="arrow-downward" size={16} color="#86efac" />
                      </View>
                      <View>
                        <Text style={styles.statLabel}>Income</Text>
                        <Text style={styles.statValue}>
                          ₹{Math.round(periodIncome).toLocaleString()}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.heroStatItem}>
                      <View style={[styles.statIcon, { backgroundColor: 'rgba(239,68,68,0.2)' }]}>
                        <MaterialIcon name="arrow-upward" size={16} color="#fca5a5" />
                      </View>
                      <View>
                        <Text style={styles.statLabel}>Expenses</Text>
                        <Text style={styles.statValue}>
                          ₹{Math.round(periodExpense).toLocaleString()}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              </Animated.View>

              {/* --- QUICK ACTIONS --- */}
              <View style={styles.actionGrid}>
                {quickActions.map((action, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.actionButton,
                      action.primary && styles.actionButtonPrimary,
                      { width: isSmallPhone ? '48%' : '23%' }, // Responsive Wrapping
                    ]}
                    onPress={action.onPress}
                    activeOpacity={0.8}
                  >
                    <MaterialIcon
                      name={action.icon as any}
                      size={24}
                      color={action.primary ? '#fff' : colors.primary}
                    />
                    <Text
                      style={[
                        styles.actionText,
                        action.primary && { color: '#fff', fontWeight: '700' },
                      ]}
                    >
                      {action.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* --- HIGHLIGHTS SCROLL --- */}
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Highlights</Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.highlightScrollContent}
              >
                {highlightCards.map((card, idx) => (
                  <View key={idx} style={styles.highlightCard}>
                    <View style={[styles.highlightIconBox, { backgroundColor: `${card.color}15` }]}>
                      <MaterialIcon name={card.icon as any} size={22} color={card.color} />
                    </View>
                    <View>
                      <Text style={styles.highlightValue}>{card.value}</Text>
                      <Text style={styles.highlightLabel}>{card.label}</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>

              {/* --- ANALYTICS --- */}
              <View style={styles.chartCard} onLayout={onLayoutContainer}>
                <View style={styles.chartHeaderRow}>
                  <Text style={styles.sectionTitle}>Overview</Text>
                  <View style={styles.toggleRow}>
                    <SimpleButtonGroup
                      buttons={['Pie', 'Bar']}
                      selectedIndex={chartType === 'pie' ? 0 : 1}
                      onPress={(i) => setChartType(i === 0 ? 'pie' : 'bar')}
                      containerStyle={{ height: 32 }}
                    />
                    <SimpleButtonGroup
                      buttons={['7D', '30D']}
                      selectedIndex={period === 'week' ? 0 : 1}
                      onPress={(i) => setPeriod(i === 0 ? 'week' : 'month')}
                      containerStyle={{ height: 32 }}
                    />
                  </View>
                </View>

                {isLoading ? (
                  <View style={styles.loadingChart} />
                ) : (
                  <View style={styles.chartWrapper}>
                    {/* Render Charts conditionally based on DATA availability */}
                    {pieExpenseData.length === 0 && weeklyBar.income.every((v) => v === 0) ? (
                      <View style={styles.noDataContainer}>
                        <MaterialIcon name="donut-large" size={48} color={colors.border} />
                        <Text style={styles.noDataText}>No data for this period</Text>
                      </View>
                    ) : (
                      <>
                        {chartType === 'pie' && PieChart && (
                          <PieChart
                            data={pieExpenseData}
                            width={containerWidth} // Dynamic Width
                            height={220}
                            chartConfig={chartConfig}
                            accessor="population"
                            backgroundColor="transparent"
                            paddingLeft="15"
                            absolute={false}
                            hasLegend={!isSmallPhone} // Hide legend on very small screens
                            center={[isSmallPhone ? 0 : 10, 0]}
                          />
                        )}
                        {chartType === 'bar' && BarChart && (
                          <BarChart
                            data={{
                              labels: weeklyBar.labels,
                              datasets: [{ data: weeklyBar.income }, { data: weeklyBar.expense }],
                            }}
                            width={containerWidth - 10}
                            height={220}
                            yAxisLabel="₹"
                            chartConfig={chartConfig}
                            showValuesOnTopOfBars={!isSmallPhone}
                            fromZero
                            style={{
                              paddingRight: 40, // Prevent label cutoff
                              borderRadius: 16,
                            }}
                          />
                        )}
                      </>
                    )}
                  </View>
                )}
              </View>

              {/* --- RECENT LIST HEADER --- */}
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Recent Transactions</Text>
                <TouchableOpacity onPress={() => navigation.navigate('History')}>
                  <Text style={styles.seeAllText}>See All</Text>
                </TouchableOpacity>
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[responsiveContainerStyle, { marginBottom: spacing(1.5) }]}>
              <TransactionCard item={item} enableSwipe={false} compact />
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyList}>
              <MaterialIcon name="receipt-long" size={48} color={colors.border} />
              <Text style={styles.emptyText}>No recent transactions.</Text>
            </View>
          }
        />
      </SafeAreaView>
    </View>
  );
};

export default HomeScreen;

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  safeArea: {
    flex: 1,
  },
  // --- HEADER ---
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: spacing(2),
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  greetingSub: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  greetingName: {
    fontSize: 18,
    color: colors.text,
    fontWeight: '800',
  },
  profileBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surfaceMuted,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  profileInitial: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
  },

  // --- HERO CARD ---
  heroContainer: {
    height: 220,
    borderRadius: 28,
    overflow: 'hidden',
    marginBottom: spacing(3),
    // Shadows
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  heroContent: {
    flex: 1,
    padding: spacing(2.5),
    justifyContent: 'space-between',
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  glassBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  glassBadgeText: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 11,
    fontWeight: '600',
  },
  balanceContainer: {
    alignItems: 'center',
  },
  balanceLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: 4,
  },
  balanceAmount: {
    color: colors.white,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  heroStatsContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 18,
    padding: 10,
    alignItems: 'center',
  },
  heroStatItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  divider: {
    width: 1,
    height: '60%',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  statIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
  },
  statValue: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },

  // --- QUICK ACTIONS ---
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
    marginBottom: spacing(3),
  },
  actionButton: {
    backgroundColor: colors.card,
    paddingVertical: 14,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    // Soft shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  actionButtonPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },

  // --- HIGHLIGHTS ---
  sectionHeader: {
    marginBottom: spacing(1.5),
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  highlightScrollContent: {
    gap: 12,
    paddingRight: 20,
    marginBottom: spacing(3),
  },
  highlightCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 16,
    minWidth: 140,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'column',
    justifyContent: 'space-between',
    gap: 12,
  },
  highlightIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  highlightValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  highlightLabel: {
    fontSize: 12,
    color: colors.muted,
  },

  // --- CHARTS ---
  chartCard: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: spacing(2),
    marginBottom: spacing(3),
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  chartHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing(2),
    flexWrap: 'wrap',
    gap: 10,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chartWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 220,
  },
  loadingChart: {
    height: 220,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 16,
    width: '100%',
  },
  noDataContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 200,
  },
  noDataText: {
    color: colors.muted,
    fontSize: 14,
  },

  // --- LIST ---
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing(2),
  },
  seeAllText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
  emptyList: {
    alignItems: 'center',
    marginTop: 30,
    gap: 10,
  },
  emptyText: {
    color: colors.muted,
    fontSize: 14,
  },
});

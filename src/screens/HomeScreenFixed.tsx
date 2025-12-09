import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Constants from 'expo-constants';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  useWindowDimensions,
  FlatList,
  ScrollView, // Fixed import
  Platform,
  Animated,   // Fixed import
  Easing,
  Image,
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

// SVG & Design
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
import { spacing, colors } from '../utils/design';
import { ensureCategory, FALLBACK_CATEGORY } from '../constants/categories';

const pkg = require('../../package.json');

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

// --- COLORS & HELPERS ---
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
  
  // --- RESPONSIVE LAYOUT LOGIC ---
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const isCompact = SCREEN_WIDTH < 380;
  const isTablet = SCREEN_WIDTH >= 768;
  const horizontalPadding = isTablet ? spacing(5) : spacing(2.5);
  const maxContentWidth = 800; 
  const containerWidth = Math.min(SCREEN_WIDTH, maxContentWidth);
  // Calculate chart width dynamically inside the component
  const chartWidth = Math.min(containerWidth - (horizontalPadding * 2) - spacing(2), 600);
  const chartHeight = 220;

  const isOnline = useInternetStatus();
  const autoCheckRef = useRef(false);
  const [updateBannerVisible, setUpdateBannerVisible] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | undefined>();
  const [applyingUpdate, setApplyingUpdate] = useState(false);
  const isExpoGo = Constants?.appOwnership === 'expo';

  // --- ANIMATION ---
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
    ]).start();
  }, []);

  // Filters
  const [period, setPeriod] = useState<'week' | 'month'>('month');
  const [chartType, setChartType] = useState<'pie' | 'bar'>('pie');

  // --- DATA LOGIC ---
  const totalIn = useMemo(() => entries.filter((e) => e.type === 'in').reduce((s, x) => s + Number(x.amount || 0), 0), [entries]);
  const totalOut = useMemo(() => entries.filter((e) => e.type === 'out').reduce((s, x) => s + Number(x.amount || 0), 0), [entries]);
  const balance = totalIn - totalOut;

  const netTrend = useMemo(() => {
    if (!entries.length) return { current: 0, previous: 0, delta: null };
    const now = Date.now();
    const week = 7 * 24 * 60 * 60 * 1000;
    let current = 0; let previous = 0;
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

  const periodStart = useMemo(() => period === 'week' ? dayjs().startOf('day').subtract(6, 'day') : dayjs().startOf('month'), [period]);

  const periodEntries = useMemo(() => {
    const startValue = periodStart.valueOf();
    return (entries || []).filter((entry: any) => {
        const entryDate = dayjs(entry.date || entry.created_at).startOf('day');
        return entryDate.isValid() && entryDate.valueOf() >= startValue;
      }).sort((a, b) => dayjs(b.date || b.created_at).valueOf() - dayjs(a.date || a.created_at).valueOf());
  }, [entries, periodStart]);

  const periodLabel = period === 'week' ? 'Last 7 Days' : 'This Month';
  const periodIncome = useMemo(() => periodEntries.filter((e) => e.type === 'in').reduce((s, x) => s + Number(x.amount || 0), 0), [periodEntries]);
  const periodExpense = useMemo(() => periodEntries.filter((e) => e.type === 'out').reduce((s, x) => s + Number(x.amount || 0), 0), [periodEntries]);
  
  const periodAverageTicket = useMemo(() => {
    if (!periodEntries.length) return 0;
    return periodEntries.reduce((acc, curr) => acc + Number(curr.amount || 0), 0) / periodEntries.length;
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
    return Object.entries(map).map(([category, vals]) => ({ category, income: vals.in, expense: vals.out }));
  }, [periodEntries]);

  const pieExpenseData = useMemo(() => pieByCategory.filter((x) => x.expense > 0).map((x, i) => ({
      name: x.category, population: x.expense, color: PIE_COLORS[i % PIE_COLORS.length], legendFontColor: colors.text, legendFontSize: 12,
    })), [pieByCategory]);

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
        const dayEntries = source.filter(e => dayjs(e.date || e.created_at).format('YYYY-MM-DD') === dayStr);
        incomeData.push(dayEntries.filter(e => e.type === 'in').reduce((s, x) => s + Number(x.amount), 0));
        expenseData.push(dayEntries.filter(e => e.type === 'out').reduce((s, x) => s + Number(x.amount), 0));
      }
    } else {
        const buckets = 4;
        for(let i=0; i<buckets; i++) labels.push(`W${i+1}`);
        for(let i=0; i<buckets; i++) { incomeData.push(0); expenseData.push(0); }
        source.forEach(e => {
            const day = dayjs(e.date).date();
            const idx = Math.min(Math.floor((day-1)/7), 3);
            if(e.type === 'in') incomeData[idx] += Number(e.amount);
            else expenseData[idx] += Number(e.amount);
        });
    }
    return { labels, income: incomeData, expense: expenseData };
  }, [periodEntries, period]);

  const recent = (entries || []).slice(0, 5);
  const userInitial = user?.name?.trim().charAt(0).toUpperCase() || 'U';

  const heroTrendDetails = useMemo(() => {
    if (!entries.length) return { label: 'No data', color: colors.muted, icon: 'auto-graph' };
    if (netTrend.delta === null) return { label: 'New', color: colors.secondary, icon: 'auto-graph' };
    const isUp = netTrend.delta >= 0;
    return {
      label: `${Math.abs(netTrend.delta).toFixed(1)}%`,
      color: isUp ? colors.accentGreen : colors.accentRed,
      icon: isUp ? 'trending-up' : 'trending-down',
    };
  }, [entries.length, netTrend]);

  const topExpenseCategory = useMemo(() => {
    if (!pieExpenseData.length) return FALLBACK_CATEGORY;
    return [...pieExpenseData].sort((a, b) => b.population - a.population)[0]?.name || FALLBACK_CATEGORY;
  }, [pieExpenseData]);

  const quickActions = useMemo(() => [
    { label: 'Add Entry', icon: 'add-circle-outline', onPress: () => navigation.navigate('AddEntry'), primary: true },
    { label: 'Stats', icon: 'bar-chart', onPress: () => navigation.navigate('Stats'), primary: false },
    { label: 'History', icon: 'history', onPress: () => navigation.navigate('History'), primary: false },
    { label: 'Settings', icon: 'settings', onPress: () => navigation.navigate('Settings'), primary: false },
  ], [navigation]);

  const highlightCards = useMemo(() => [
    { label: 'Avg Ticket', value: `₹${periodAverageTicket.toFixed(0)}`, icon: 'receipt', color: colors.accentBlue },
    { label: 'Active Days', value: `${periodActiveDays}`, icon: 'event-available', color: colors.accentGreen },
    { label: 'Top Spend', value: topExpenseCategory, icon: 'category', color: colors.accentOrange },
  ], [periodAverageTicket, periodActiveDays, topExpenseCategory]);

  const chartConfig = {
    backgroundColor: 'transparent',
    backgroundGradientFrom: colors.card,
    backgroundGradientTo: colors.card,
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(${hexToRgb(colors.primary)}, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(${hexToRgb(colors.muted)}, ${opacity})`,
    propsForBackgroundLines: { strokeDasharray: '' },
  };

  const responsiveContainerStyle = {
    width: '100%',
    maxWidth: maxContentWidth,
    alignSelf: 'center' as const,
    paddingHorizontal: horizontalPadding,
  };

  const handleOpenDrawer = () => {
    navigation.openDrawer();
  };

  const handleBannerPress = async () => {
    setUpdateBannerVisible(false);
    try {
      setApplyingUpdate(true);
      const fetched = await Updates.fetchUpdateAsync();
      if (fetched.isNew) await Updates.reloadAsync();
    } catch (e) { } finally { setApplyingUpdate(false); }
  };

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
          contentContainerStyle={{ paddingBottom: spacing(16) }} 
          ListHeaderComponent={
            <View style={responsiveContainerStyle}>
              
              {/* --- HEADER --- */}
              <Animated.View style={[styles.headerRow, { opacity: fadeAnim, transform: [{translateY: slideAnim}] }]}>
                <View style={styles.headerLeft}>
                    <TouchableOpacity style={styles.menuButton} onPress={handleOpenDrawer}>
                        <MaterialIcon name="menu" size={24} color={colors.text} />
                    </TouchableOpacity>
                    <View>
                        <Text style={styles.greetingSub}>Welcome back,</Text>
                        <Text style={styles.greetingName}>{user?.name?.split(' ')[0] || 'Guest'}</Text>
                    </View>
                </View>
                <View style={styles.profileBtn}>
                  <Text style={styles.profileInitial}>{userInitial}</Text>
                </View>
              </Animated.View>

              {/* --- HERO --- */}
              <Animated.View style={[styles.heroContainer, { opacity: fadeAnim, transform: [{translateY: slideAnim}] }]}>
                <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
                  <Defs>
                    <SvgLinearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
                      <Stop offset="0" stopColor={colors.primary} stopOpacity="1" />
                      <Stop offset="1" stopColor={colors.secondary} stopOpacity="1" />
                    </SvgLinearGradient>
                  </Defs>
                  <Rect width="100%" height="100%" rx={26} fill="url(#grad)" />
                </Svg>
                
                <View style={styles.heroContent}>
                   <View style={styles.heroHeader}>
                      <View style={styles.periodBadge}>
                        <MaterialIcon name="calendar-today" size={12} color={colors.white} />
                        <Text style={styles.periodText}>{periodLabel}</Text>
                      </View>
                      <View style={[styles.trendPill, { backgroundColor: 'rgba(0,0,0,0.2)' }]}>
                        <MaterialIcon name={heroTrendDetails.icon as any} size={14} color={heroTrendDetails.color} />
                        <Text style={[styles.trendText, { color: heroTrendDetails.color }]}>{heroTrendDetails.label}</Text>
                      </View>
                   </View>

                   <View style={styles.balanceBlock}>
                      <Text style={styles.balanceLabel}>Total Balance</Text>
                      <Text style={styles.balanceAmount}>₹{balance.toLocaleString('en-IN')}</Text>
                   </View>

                   <View style={styles.heroStatsRow}>
                      <View style={styles.heroStatItem}>
                         <View style={[styles.arrowCircle, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                           <MaterialIcon name="arrow-downward" size={16} color={colors.accentGreen} />
                         </View>
                         <View>
                           <Text style={styles.statLabelLight}>Income</Text>
                           <Text style={styles.statValueLight}>₹{Math.round(periodIncome).toLocaleString()}</Text>
                         </View>
                      </View>
                      <View style={styles.dividerVertical} />
                      <View style={styles.heroStatItem}>
                         <View style={[styles.arrowCircle, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                           <MaterialIcon name="arrow-upward" size={16} color={colors.accentRed} />
                         </View>
                         <View>
                           <Text style={styles.statLabelLight}>Expenses</Text>
                           <Text style={styles.statValueLight}>₹{Math.round(periodExpense).toLocaleString()}</Text>
                         </View>
                      </View>
                   </View>
                </View>
              </Animated.View>

              {/* --- ACTION GRID --- */}
              <Animated.View style={[styles.actionRow, { opacity: fadeAnim, transform: [{translateY: slideAnim}] }]}>
                {quickActions.map((action, idx) => (
                  <TouchableOpacity 
                    key={idx} 
                    style={[styles.actionBtn, action.primary ? styles.actionBtnPrimary : styles.actionBtnSecondary]}
                    onPress={action.onPress}
                    activeOpacity={0.7}
                  >
                    <MaterialIcon name={action.icon as any} size={24} color={action.primary ? colors.white : colors.primary} />
                    <Text style={[styles.actionLabel, { color: action.primary ? colors.white : colors.text }]}>
                      {action.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </Animated.View>

              {/* --- HIGHLIGHTS --- */}
              <Animated.View style={{ opacity: fadeAnim, transform: [{translateY: slideAnim}] }}>
                <Text style={styles.sectionTitle}>Highlights</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.highlightScroll}>
                  {highlightCards.map((card, idx) => (
                    <View key={idx} style={[styles.highlightCard, { minWidth: isCompact ? 130 : 150 }]}>
                       <View style={[styles.highlightIcon, { backgroundColor: `${card.color}15` }]}>
                          <MaterialIcon name={card.icon as any} size={20} color={card.color} />
                       </View>
                       <Text style={styles.highlightValue} numberOfLines={1}>{card.value}</Text>
                       <Text style={styles.highlightLabel}>{card.label}</Text>
                    </View>
                  ))}
                </ScrollView>
              </Animated.View>

              {/* --- ANALYTICS --- */}
              <Animated.View style={[styles.chartSection, { opacity: fadeAnim, transform: [{translateY: slideAnim}] }]}>
                 <View style={styles.chartHeader}>
                    <Text style={styles.sectionTitle}>Overview</Text>
                    <View style={styles.chartToggle}>
                       <SimpleButtonGroup 
                         buttons={['Pie', 'Bar']} 
                         selectedIndex={chartType === 'pie' ? 0 : 1}
                         onPress={(i) => setChartType(i === 0 ? 'pie' : 'bar')}
                         containerStyle={{ height: 32 }}
                       />
                       <View style={{ width: 8 }} />
                       <SimpleButtonGroup 
                         buttons={['7D', '30D']} 
                         selectedIndex={period === 'week' ? 0 : 1}
                         onPress={(i) => setPeriod(i === 0 ? 'week' : 'month')}
                         containerStyle={{ height: 32 }}
                       />
                    </View>
                 </View>

                 <View style={styles.chartContainer}>
                    {isLoading ? (
                      <View style={[styles.skeleton, { height: chartHeight }]} />
                    ) : (
                      <>
                        {chartType === 'pie' && PieChart && pieExpenseData.length > 0 && (
                          <PieChart
                            data={pieExpenseData}
                            width={chartWidth}
                            height={chartHeight}
                            chartConfig={chartConfig}
                            accessor="population"
                            backgroundColor="transparent"
                            paddingLeft="0"
                            absolute={false}
                            center={[isTablet ? chartWidth / 4 : 10, 0]}
                            hasLegend={true}
                          />
                        )}
                        {chartType === 'bar' && BarChart && (
                          <BarChart
                            data={{
                              labels: weeklyBar.labels,
                              datasets: [{ data: weeklyBar.income }, { data: weeklyBar.expense }],
                            }}
                            width={chartWidth}
                            height={chartHeight}
                            yAxisLabel="₹"
                            chartConfig={chartConfig}
                            // Safe check for isCompact usage
                            showValuesOnTopOfBars={!isCompact}
                            fromZero
                            style={{ borderRadius: 16, paddingRight: 32 }}
                          />
                        )}
                        {pieExpenseData.length === 0 && weeklyBar.income.every(x => x === 0) && (
                          <View style={styles.emptyChart}>
                             <MaterialIcon name="donut-large" size={40} color={colors.border} />
                             <Text style={styles.emptyText}>No data for this period</Text>
                          </View>
                        )}
                      </>
                    )}
                 </View>
              </Animated.View>

              <View style={styles.listHeaderRow}>
                 <Text style={styles.sectionTitle}>Recent Transactions</Text>
                 <TouchableOpacity onPress={() => navigation.navigate('History')}>
                    <Text style={styles.seeAll}>See All</Text>
                 </TouchableOpacity>
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[responsiveContainerStyle, { marginBottom: spacing(1.5) }]}>
              <TransactionCard item={item} />
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyList}>
              <MaterialIcon name="receipt-long" size={48} color={colors.border} />
              <Text style={styles.emptyText}>No transactions found.</Text>
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
    fontSize: 20,
    color: colors.text,
    fontWeight: '800',
  },
  profileBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
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
  /* HERO CARD */
  heroContainer: {
    height: 240,
    borderRadius: 30,
    overflow: 'hidden',
    marginBottom: spacing(3),
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 6,
  },
  heroContent: {
    flex: 1,
    padding: spacing(3),
    justifyContent: 'space-between',
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  periodBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 6,
  },
  periodText: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 12,
    fontWeight: '600',
  },
  trendPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 4,
  },
  trendText: {
    fontSize: 12,
    fontWeight: '700',
  },
  balanceBlock: {
    alignItems: 'center',
    marginVertical: spacing(1),
  },
  balanceLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  balanceAmount: {
    color: colors.white,
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -1,
  },
  heroStatsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 20,
    padding: 12,
    alignItems: 'center',
  },
  heroStatItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    justifyContent: 'center',
  },
  dividerVertical: {
    width: 1,
    height: '80%',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  arrowCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statLabelLight: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
  },
  statValueLight: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  /* ACTIONS */
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: spacing(3),
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 24,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  actionBtnPrimary: {
    backgroundColor: colors.primary,
    flexGrow: 1.5,
  },
  actionBtnSecondary: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  /* SCROLL */
  highlightScroll: {
    gap: 12,
    paddingVertical: 10,
    marginBottom: spacing(3),
  },
  highlightCard: {
    backgroundColor: colors.card,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  highlightIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  highlightValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  highlightLabel: {
    fontSize: 12,
    color: colors.muted,
  },
  /* ANALYTICS */
  chartSection: {
    backgroundColor: colors.card,
    borderRadius: 28,
    padding: spacing(2.5),
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing(3),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing(2),
    flexWrap: 'wrap',
    gap: 10,
  },
  chartToggle: {
    flexDirection: 'row',
  },
  chartContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 220,
  },
  skeleton: {
    width: '100%',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 16,
  },
  emptyChart: {
    alignItems: 'center',
    gap: 8,
  },
  /* LIST */
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 5,
  },
  listHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing(2),
  },
  seeAll: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
  emptyList: {
    alignItems: 'center',
    marginTop: 40,
    gap: 10,
  },
  emptyText: {
    color: colors.muted,
    fontSize: 14,
  },
});
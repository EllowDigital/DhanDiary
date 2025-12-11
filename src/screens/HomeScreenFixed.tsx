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

// --- CATEGORY CONFIGURATION ---
export const ALLOWED_CATEGORIES = [
  'Food',
  'Transport',
  'Bills',
  'Salary',
  'Shopping',
  'Health',
  'Other',
] as const;

// 1. Icon Mapping - Expanded for safety
const getIconForCategory = (cat?: string | null) => {
  const normalized = (cat || 'other').trim().toLowerCase();
  switch (normalized) {
    case 'food': return 'restaurant';
    case 'transport': return 'directions-car';
    case 'bills': return 'receipt-long';
    case 'salary': return 'attach-money';
    case 'shopping': return 'shopping-bag';
    case 'health': return 'medical-services';
    case 'entertainment': return 'celebration'; // Added
    case 'party': return 'celebration';        // Added
    case 'education': return 'school';
    case 'other': return 'category';
    default: return 'category';
  }
};

// 2. Ensure Category Logic
const ensureCategory = (value?: string | null) => {
  if (!value) return 'Other';
  const match = ALLOWED_CATEGORIES.find(c => c.toLowerCase() === value.toLowerCase());
  return match || 'Other';
};

// --- CHART KIT SAFE LOAD ---
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

// --- COMPONENT: COMPACT TRANSACTION ROW ---
const CompactTransactionRow = ({ item, onPress }: { item: any; onPress: () => void }) => {
  const isExpense = item.type === 'out';
  const color = isExpense ? colors.accentRed : colors.accentGreen;
  const iconName = getIconForCategory(item.category);

  return (
    <TouchableOpacity style={styles.compactRow} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.compactIcon, { backgroundColor: `${color}15` }]}>
        <MaterialIcon name={iconName as any} size={20} color={color} />
      </View>
      <View style={styles.compactContent}>
        <Text style={styles.compactTitle} numberOfLines={1}>
          {item.note || item.category || 'Untitled'}
        </Text>
        {/* FIX: Showing Category Name here solves the "mismatch" confusion */}
        <Text style={styles.compactDate}>
          {item.category || 'Other'} • {dayjs(item.date || item.created_at).format('MMM D, h:mm A')}
        </Text>
      </View>
      <Text style={[styles.compactAmount, { color: isExpense ? colors.text : colors.accentGreen }]}>
        {isExpense ? '-' : '+'}₹{Number(item.amount).toLocaleString()}
      </Text>
    </TouchableOpacity>
  );
};

// --- MAIN SCREEN ---
const HomeScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { entries = [], isLoading = false } = useEntries(user?.id);
  const showLoading = useDelayedLoading(Boolean(isLoading), 200);

  // --- RESPONSIVE LOGIC ---
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const isTablet = SCREEN_WIDTH >= 768;
  const isSmallPhone = SCREEN_WIDTH < 380;
  
  const maxContentWidth = 800; 
  const horizontalPadding = isTablet ? spacing(6) : spacing(3);
  const [containerWidth, setContainerWidth] = useState(SCREEN_WIDTH - spacing(6));

  const isOnline = useInternetStatus();
  const autoCheckRef = useRef(false);
  const [updateBannerVisible, setUpdateBannerVisible] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | undefined>();
  const [applyingUpdate, setApplyingUpdate] = useState(false);
  const isExpoGo = Constants?.appOwnership === 'expo';

  // --- ANIMATIONS ---
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current; 

  useEffect(() => {
    // Intro
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
        easing: Easing.out(Easing.back(1.2)),
      }),
    ]).start();

    // Pulse Loop
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 3000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 3000, useNativeDriver: true }),
      ])
    ).start();
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

  // Net Trend
  const netTrend = useMemo(() => {
    if (!entries.length) return { delta: null };
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
    return { delta };
  }, [entries]);

  // Filter Period Entries
  const periodStart = useMemo(
    () => period === 'week' ? dayjs().startOf('day').subtract(6, 'day') : dayjs().startOf('month'),
    [period]
  );

  const periodEntries = useMemo(() => {
    const startValue = periodStart.valueOf();
    return (entries || [])
      .filter((entry: any) => {
        const entryDate = dayjs(entry.date || entry.created_at).startOf('day');
        return entryDate.isValid() && entryDate.valueOf() >= startValue;
      })
      .sort((a, b) => dayjs(b.date || b.created_at).valueOf() - dayjs(a.date || a.created_at).valueOf());
  }, [entries, periodStart]);

  const periodLabel = period === 'week' ? 'Last 7 Days' : 'This Month';
  const periodIncome = periodEntries.filter((e) => e.type === 'in').reduce((s, x) => s + Number(x.amount), 0);
  const periodExpense = periodEntries.filter((e) => e.type === 'out').reduce((s, x) => s + Number(x.amount), 0);

  // Pie Chart Data
  const pieExpenseData = useMemo(() => {
    const map: Record<string, number> = {};
    periodEntries.filter(e => e.type === 'out').forEach(e => {
      const cat = ensureCategory(e.category);
      map[cat] = (map[cat] || 0) + Number(e.amount);
    });
    
    if (!map || Object.keys(map).length === 0) return [];

    return Object.entries(map)
      .map(([name, population], i) => ({
        name,
        population,
        color: PIE_COLORS[i % PIE_COLORS.length],
        legendFontColor: colors.text,
        legendFontSize: 12,
      }))
      .sort((a, b) => b.population - a.population);
  }, [periodEntries]);

  // Bar Chart Data
  const weeklyBar = useMemo(() => {
    const labels: string[] = []; 
    const incomeData: number[] = []; 
    const expenseData: number[] = [];

    if (period === 'week') {
      for (let i = 6; i >= 0; i--) {
        const d = dayjs().subtract(i, 'day');
        labels.push(d.format('dd'));
        const dayStr = d.format('YYYY-MM-DD');
        const dayEntries = periodEntries.filter(e => dayjs(e.date).format('YYYY-MM-DD') === dayStr);
        incomeData.push(dayEntries.filter(e => e.type === 'in').reduce((s, e) => s + Number(e.amount), 0));
        expenseData.push(dayEntries.filter(e => e.type === 'out').reduce((s, e) => s + Number(e.amount), 0));
      }
    } else {
      for (let i = 0; i < 4; i++) {
        labels.push(`W${i + 1}`);
        incomeData.push(0); expenseData.push(0);
      }
      periodEntries.forEach(e => {
        const idx = Math.min(Math.floor((dayjs(e.date).date() - 1) / 7), 3);
        if (e.type === 'in') incomeData[idx] += Number(e.amount);
        else expenseData[idx] += Number(e.amount);
      });
    }
    return { labels, income: incomeData, expense: expenseData };
  }, [periodEntries, period]);

  // Highlights
  const periodActiveDays = new Set(periodEntries.map(e => dayjs(e.date).format('YYYY-MM-DD'))).size;
  const periodAvgTicket = periodEntries.length ? periodEntries.reduce((s, x) => s + Number(x.amount), 0) / periodEntries.length : 0;
  const topExpense = (pieExpenseData && pieExpenseData.length > 0) ? pieExpenseData[0].name : 'None';
  
  // FIX: Explicitly limit to 6 recent items
  const recent = (entries || []).slice(0, 6); 

  // --- ACTIONS ---
  const quickActions = [
    { 
      label: 'Add', 
      icon: 'add-circle-outline', 
      onPress: () => navigation.navigate('AddEntry'), 
      primary: true 
    },
    { 
      label: 'Stats', 
      icon: 'bar-chart', 
      onPress: () => navigation.navigate('Stats') 
    },
    { 
      label: 'Settings', 
      icon: 'settings', 
      onPress: () => navigation.navigate('Settings') 
    },
  ];

  const highlights = [
    { label: 'Avg Ticket', value: `₹${periodAvgTicket.toFixed(0)}`, icon: 'receipt', color: colors.accentBlue },
    { label: 'Active Days', value: `${periodActiveDays}`, icon: 'calendar-today', color: colors.accentGreen },
    { label: 'Top Spend', value: topExpense, icon: 'pie-chart', color: colors.accentOrange },
  ];

  const handleBannerPress = async () => {
    setUpdateBannerVisible(false);
    try {
      setApplyingUpdate(true);
      const fetched = await Updates.fetchUpdateAsync();
      if (fetched.isNew) await Updates.reloadAsync();
    } catch (e) {} finally { setApplyingUpdate(false); }
  };

  const onLayoutContainer = (e: LayoutChangeEvent) => setContainerWidth(e.nativeEvent.layout.width);

  // Auto Update Check
  useEffect(() => {
    if (!isOnline || isExpoGo || autoCheckRef.current) return;
    autoCheckRef.current = true;
    (async () => {
      try {
        const res = await Updates.checkForUpdateAsync();
        if (res.isAvailable) {
          setUpdateMessage('New version available');
          setUpdateBannerVisible(true);
        }
      } catch (e) {}
    })();
  }, [isOnline]);

  const responsiveContainerStyle = useMemo<ViewStyle>(() => ({
    width: '100%',
    maxWidth: maxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: horizontalPadding,
  }), [maxContentWidth, horizontalPadding]);

  return (
    <View style={styles.mainContainer}>
      <UpdateBanner
        visible={updateBannerVisible}
        message={updateMessage}
        onPress={handleBannerPress}
        onClose={() => setUpdateBannerVisible(false)}
      />
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <FullScreenSpinner visible={showLoading || applyingUpdate} />

        <FlatList
          data={recent}
          keyExtractor={(item) => item.local_id || Math.random().toString()}
          showsVerticalScrollIndicator={false}
          // FIX: Heavily increased padding to clear bottom nav
          contentContainerStyle={{ paddingBottom: 130 }} 
          ListHeaderComponent={
            <View style={responsiveContainerStyle}>
              
              {/* --- HEADER --- */}
              <Animated.View style={[styles.headerRow, { opacity: fadeAnim }]}>
                <View style={styles.headerLeft}>
                  <TouchableOpacity style={styles.menuButton} onPress={() => navigation.openDrawer()}>
                    <MaterialIcon name="menu" size={24} color={colors.text} />
                  </TouchableOpacity>
                  <View>
                    <Text style={styles.greetingSub}>Overview</Text>
                    <Text style={styles.greetingName}>
                      Hello, {user?.name?.split(' ')[0] || 'User'}
                    </Text>
                  </View>
                </View>
                <View style={styles.profileBtn}>
                  <Text style={styles.profileInitial}>{user?.name?.[0]?.toUpperCase() || 'U'}</Text>
                </View>
              </Animated.View>

              {/* --- HERO CARD (Gradient + Pulse) --- */}
              <Animated.View style={[styles.heroContainer, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
                <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
                  <Defs>
                    <SvgLinearGradient id="heroGrad" x1="0" y1="0" x2="1" y2="1">
                      <Stop offset="0" stopColor={colors.primary} stopOpacity="1" />
                      <Stop offset="1" stopColor={colors.secondary} stopOpacity="1" />
                    </SvgLinearGradient>
                  </Defs>
                  <Rect width="100%" height="100%" rx={24} fill="url(#heroGrad)" />
                  <Circle cx="90%" cy="10%" r="90" fill="white" fillOpacity="0.1" />
                  <Path d="M0 180 Q 100 120 400 220" fill="none" stroke="white" strokeWidth="30" strokeOpacity="0.05" />
                </Svg>

                {/* Pulse */}
                <Animated.View style={[styles.heroGlow, { transform: [{ scale: pulseAnim }] }]} />

                <View style={styles.heroContent}>
                  <View style={styles.heroTopRow}>
                    <View style={styles.glassPill}>
                       <Text style={styles.glassPillText}>{periodLabel}</Text>
                    </View>
                    {netTrend.delta !== null && (
                      <View style={[styles.glassPill, { backgroundColor: netTrend.delta >= 0 ? 'rgba(74, 222, 128, 0.2)' : 'rgba(248, 113, 113, 0.2)' }]}>
                        <MaterialIcon name={netTrend.delta >= 0 ? 'trending-up' : 'trending-down'} size={14} color="white" />
                        <Text style={styles.glassPillText}>{Math.abs(netTrend.delta).toFixed(1)}%</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.balanceBlock}>
                    <Text style={styles.balanceLabel}>Total Balance</Text>
                    <Text style={styles.balanceAmount} numberOfLines={1} adjustsFontSizeToFit>
                      ₹{balance.toLocaleString('en-IN')}
                    </Text>
                  </View>

                  <View style={styles.heroStatsRow}>
                    <View style={styles.heroStat}>
                      <View style={[styles.heroStatIcon, { backgroundColor: 'rgba(34,197,94,0.2)' }]}>
                         <MaterialIcon name="arrow-downward" size={14} color="#86efac" />
                      </View>
                      <View>
                        <Text style={styles.statLabel}>Income</Text>
                        <Text style={styles.statValue}>₹{Math.round(periodIncome).toLocaleString()}</Text>
                      </View>
                    </View>
                    <View style={styles.verticalDivider} />
                    <View style={styles.heroStat}>
                      <View style={[styles.heroStatIcon, { backgroundColor: 'rgba(239,68,68,0.2)' }]}>
                         <MaterialIcon name="arrow-upward" size={14} color="#fca5a5" />
                      </View>
                      <View>
                        <Text style={styles.statLabel}>Expense</Text>
                        <Text style={styles.statValue}>₹{Math.round(periodExpense).toLocaleString()}</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </Animated.View>

              {/* --- QUICK ACTIONS (3 Items) --- */}
              <View style={styles.actionsGrid}>
                {quickActions.map((action, i) => (
                  <TouchableOpacity 
                    key={i} 
                    style={[styles.actionBtn, { width: '31%' }]} 
                    onPress={action.onPress}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.actionIconBox, action.primary && styles.actionIconBoxPrimary]}>
                      <MaterialIcon name={action.icon as any} size={24} color={action.primary ? 'white' : colors.primary} />
                    </View>
                    <Text style={styles.actionLabel}>{action.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* --- HIGHLIGHTS --- */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.highlightScroll}>
                {highlights.map((h, i) => (
                   <View key={i} style={styles.highlightCard}>
                      <View style={[styles.highlightIcon, { backgroundColor: `${h.color}15` }]}>
                         <MaterialIcon name={h.icon as any} size={20} color={h.color} />
                      </View>
                      <View>
                         <Text style={styles.highlightValue}>{h.value}</Text>
                         <Text style={styles.highlightLabel}>{h.label}</Text>
                      </View>
                   </View>
                ))}
              </ScrollView>

              {/* --- MODERN STATS WIDGET --- */}
              <View style={styles.statsWidget} onLayout={onLayoutContainer}>
                <View style={styles.widgetHeader}>
                  <Text style={styles.sectionTitle}>Analysis</Text>
                  <View style={styles.widgetControls}>
                     <SimpleButtonGroup buttons={['Pie', 'Bar']} selectedIndex={chartType === 'pie' ? 0 : 1} onPress={i => setChartType(i===0?'pie':'bar')} containerStyle={{ height: 28 }} />
                     <SimpleButtonGroup buttons={['7D', '30D']} selectedIndex={period === 'week' ? 0 : 1} onPress={i => setPeriod(i===0?'week':'month')} containerStyle={{ height: 28 }} />
                  </View>
                </View>

                {pieExpenseData.length > 0 || weeklyBar.income.some(v => v > 0) ? (
                   <View style={styles.chartContainer}>
                      {chartType === 'pie' && PieChart && (
                         <View style={styles.rowCentered}>
                            
                            <PieChart
                               data={pieExpenseData}
                               width={isTablet ? containerWidth * 0.5 : containerWidth}
                               height={180}
                               chartConfig={{ color: () => colors.primary }}
                               accessor="population"
                               backgroundColor="transparent"
                               paddingLeft={isTablet ? "0" : "80"}
                               center={[0, 0]}
                               hasLegend={false}
                            />
                            <View style={[styles.customLegend, isTablet && { width: '50%' }]}>
                               {pieExpenseData.slice(0, 4).map((item: any, i: number) => (
                                  <View key={i} style={styles.legendItem}>
                                     <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                                     <Text style={styles.legendText} numberOfLines={1}>{item.name}</Text>
                                     <Text style={styles.legendValue}>{Math.round((item.population / periodExpense) * 100)}%</Text>
                                  </View>
                               ))}
                            </View>
                         </View>
                      )}
                      {chartType === 'bar' && BarChart && (
                         <BarChart
                            data={{ labels: weeklyBar.labels, datasets: [{ data: weeklyBar.income }, { data: weeklyBar.expense }] }}
                            width={containerWidth - 32}
                            height={180}
                            yAxisLabel="₹"
                            chartConfig={{
                               backgroundGradientFrom: colors.card,
                               backgroundGradientTo: colors.card,
                               color: (opacity = 1) => `rgba(${60}, 60, 70, ${opacity})`,
                               barPercentage: 0.6,
                               decimalPlaces: 0,
                            }}
                            showValuesOnTopOfBars={!isSmallPhone}
                            fromZero
                            style={{ borderRadius: 16, paddingRight: 30 }}
                         />
                      )}
                   </View>
                ) : (
                  <View style={styles.noDataBox}>
                     <MaterialIcon name="bar-chart" size={40} color={colors.border} />
                     <Text style={styles.noDataText}>No data to analyze</Text>
                  </View>
                )}
              </View>

              {/* --- RECENT LIST HEADER --- */}
              <View style={styles.listHeader}>
                 <Text style={styles.sectionTitle}>Recent Transactions</Text>
                 <TouchableOpacity onPress={() => navigation.navigate('History')}>
                    <Text style={styles.linkText}>See All</Text>
                 </TouchableOpacity>
              </View>
            </View>
          }
          // --- COMPACT LIST ITEMS ---
          renderItem={({ item }) => (
             <View style={responsiveContainerStyle}>
                <CompactTransactionRow 
                   item={item} 
                   onPress={() => navigation.navigate('EditEntry', { entry: item })} 
                />
             </View>
          )}
          ListEmptyComponent={
             <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No recent activity</Text>
             </View>
          }
        />
      </SafeAreaView>
    </View>
  );
};

export default HomeScreen;

// --- STYLES ---
const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  safeArea: { flex: 1 },
  
  // Header
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing(3),
    marginTop: spacing(2),
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  menuButton: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  greetingSub: { fontSize: 12, color: colors.muted, fontWeight: '600', textTransform: 'uppercase' },
  greetingName: { fontSize: 18, color: colors.text, fontWeight: '800' },
  profileBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surfaceMuted,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border,
  },
  profileInitial: { fontSize: 18, fontWeight: '700', color: colors.primary },

  // Hero
  heroContainer: {
    height: 200, borderRadius: 24, overflow: 'hidden', marginBottom: spacing(3),
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 16, elevation: 8,
    position: 'relative',
  },
  heroGlow: {
    position: 'absolute', top: -50, right: -50, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.15)',
  },
  heroContent: { flex: 1, padding: 20, justifyContent: 'space-between' },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between' },
  glassPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  glassPillText: { color: 'white', fontSize: 11, fontWeight: '700' },
  balanceBlock: { alignItems: 'center', marginTop: 10 },
  balanceLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600', letterSpacing: 0.5, marginBottom: 4 },
  balanceAmount: { color: 'white', fontSize: 32, fontWeight: '800' },
  heroStatsRow: {
    flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 16, padding: 8, alignItems: 'center',
  },
  heroStat: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  heroStatIcon: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  verticalDivider: { width: 1, height: '60%', backgroundColor: 'rgba(255,255,255,0.2)' },
  statLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 10 },
  statValue: { color: 'white', fontSize: 14, fontWeight: '700' },

  // Actions
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10, marginBottom: spacing(3) },
  actionBtn: { alignItems: 'center', gap: 6 },
  actionIconBox: {
    width: 54, height: 54, borderRadius: 18, backgroundColor: colors.card,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 2,
  },
  actionIconBoxPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  actionLabel: { fontSize: 12, fontWeight: '600', color: colors.text },

  // Highlights
  highlightScroll: { paddingRight: 20, marginBottom: spacing(3), gap: 12 },
  highlightCard: {
    backgroundColor: colors.card, borderRadius: 18, padding: 12, minWidth: 130,
    borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  highlightIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  highlightValue: { fontSize: 15, fontWeight: '700', color: colors.text },
  highlightLabel: { fontSize: 11, color: colors.muted },

  // Stats Widget
  statsWidget: {
    backgroundColor: colors.card, borderRadius: 24, padding: 16, marginBottom: spacing(3),
    borderWidth: 1, borderColor: colors.border,
  },
  widgetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 },
  widgetControls: { flexDirection: 'row', gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  chartContainer: { alignItems: 'center' },
  rowCentered: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' },
  customLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, color: colors.text, maxWidth: 80 },
  legendValue: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  noDataBox: { height: 150, alignItems: 'center', justifyContent: 'center', gap: 8 },
  noDataText: { color: colors.muted, fontSize: 13 },

  // Recent List
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  linkText: { color: colors.primary, fontWeight: '600', fontSize: 13 },
  
  // Compact Row
  compactRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card,
    borderRadius: 16, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  compactIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  compactContent: { flex: 1 },
  compactTitle: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 2 },
  compactDate: { fontSize: 11, color: colors.muted },
  compactAmount: { fontSize: 14, fontWeight: '700' },
  
  emptyState: { alignItems: 'center', marginTop: 20 },
  emptyText: { color: colors.muted },
});
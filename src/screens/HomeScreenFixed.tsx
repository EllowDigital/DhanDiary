import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import Constants from 'expo-constants';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  useWindowDimensions,
  FlatList,
  Animated,
  Easing,
  LayoutChangeEvent,
  Platform,
} from 'react-native';
import type { ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@rneui/themed';
import { useToast } from '../context/ToastContext';
import SimpleButtonGroup from '../components/SimpleButtonGroup';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../hooks/useAuth';
import { useEntries } from '../hooks/useEntries';
import FullScreenSpinner from '../components/FullScreenSpinner';
import UpdateBanner from '../components/UpdateBanner';
import { useInternetStatus } from '../hooks/useInternetStatus';
import * as Updates from 'expo-updates';
import dayjs from 'dayjs';

// SVG & Design
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect, Circle, Path } from 'react-native-svg';
import { spacing, colors } from '../utils/design';

// --- DYNAMIC IMPORTS FOR CHARTS ---
let LineChart: any = null;
let PieChart: any = null;
try {
  const ck = require('react-native-chart-kit');
  LineChart = ck.LineChart;
  PieChart = ck.PieChart;
} catch (e) {
  console.warn('react-native-chart-kit not installed');
}

// --- TYPES ---
interface LocalEntry {
  local_id?: string;
  id?: string;
  amount: string | number;
  type: 'in' | 'out';
  category?: string;
  note?: string;
  date?: string | Date;
  created_at?: string | Date;
}

// --- CONFIG ---
const ALLOWED_CATEGORIES = [
  'Food', 'Transport', 'Bills', 'Salary', 'Shopping',
  'Health', 'Education', 'Entertainment', 'Other'
] as const;

const PIE_COLORS = [
  colors.primary, colors.accentBlue, colors.accentGreen,
  colors.accentOrange, colors.accentRed, colors.secondary, '#FFD700', '#FF69B4'
];

// --- UTILS ---
const getIconForCategory = (cat?: string | null): keyof typeof MaterialIcon.glyphMap => {
  const normalized = (cat || 'other').trim().toLowerCase();
  const map: Record<string, string> = {
    food: 'restaurant', transport: 'directions-car', bills: 'receipt-long',
    salary: 'attach-money', shopping: 'shopping-bag', health: 'medical-services',
    education: 'school', entertainment: 'movie', other: 'category',
  };
  return (map[normalized] || 'category') as any;
};

const ensureCategory = (val?: string | null) => {
  if (!val) return 'Other';
  const match = ALLOWED_CATEGORIES.find(c => c.toLowerCase() === val.toLowerCase());
  return match || 'Other';
};

const getSmartGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 18) return 'Good Afternoon';
  return 'Good Evening';
};

// --- SUB-COMPONENTS: CHARTS ---

// 1. FINANCIAL WAVE (Trend)
const FinancialWaveChart = ({ data, width, color }: { data: number[], width: number, color: string }) => {
  if (!LineChart || !data.length || data.every(v => v === 0)) 
    return <EmptyChartPlaceholder text="No trend data available" />;

  return (
    <LineChart
      data={{ labels: [], datasets: [{ data }] }} // Labels handled externally or hidden for clean look
      width={width}
      height={180}
      withDots={false}
      withInnerLines={false}
      withOuterLines={false}
      withVerticalLines={false}
      withHorizontalLines={true}
      yAxisLabel="₹"
      chartConfig={{
        backgroundColor: "transparent",
        backgroundGradientFrom: "#fff",
        backgroundGradientTo: "#fff",
        decimalPlaces: 0,
        color: (opacity = 1) => color,
        labelColor: (opacity = 1) => `rgba(0,0,0, ${opacity})`,
        propsForBackgroundLines: { strokeDasharray: "4", stroke: "#f0f0f0" },
        fillShadowGradientFrom: color,
        fillShadowGradientTo: "#ffffff",
        fillShadowGradientFromOpacity: 0.3,
        fillShadowGradientToOpacity: 0.0,
      }}
      bezier
      style={{ paddingRight: 0, marginLeft: -16 }}
    />
  );
};

// 2. CATEGORY RANK LIST (Better Bar Chart)
const CategoryRankList = ({ data, total }: { data: any[], total: number }) => {
  if (!data.length) return <EmptyChartPlaceholder text="No expenses yet" />;
  
  return (
    <View style={{ width: '100%', paddingVertical: 10 }}>
      {data.slice(0, 5).map((item, index) => {
        const percentage = total > 0 ? (item.population / total) * 100 : 0;
        return (
          <View key={index} style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: item.color }} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>{item.name}</Text>
              </View>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>
                {percentage.toFixed(0)}%
              </Text>
            </View>
            <View style={{ height: 6, width: '100%', backgroundColor: '#f0f0f0', borderRadius: 3, overflow: 'hidden' }}>
              <View style={{ height: '100%', width: `${percentage}%`, backgroundColor: item.color, borderRadius: 3 }} />
            </View>
          </View>
        );
      })}
    </View>
  );
};

// 3. MINIMALIST DONUT
const MinimalistDonut = ({ data, width, total }: { data: any[], width: number, total: number }) => {
  if (!PieChart || !data.length) return <EmptyChartPlaceholder text="No data" />;
  const size = 180;
  
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', height: size, position: 'relative' }}>
       <PieChart
          data={data}
          width={width}
          height={size}
          chartConfig={{ color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})` }}
          accessor="population"
          backgroundColor="transparent"
          paddingLeft={String(width / 4)} // Center alignment hack for chart-kit
          hasLegend={false}
          center={[0, 0]}
          absolute={false}
        />
        {/* The Hole */}
        <View style={styles.donutHole}>
            <Text style={styles.donutLabel}>Total Out</Text>
            <Text style={styles.donutValue} numberOfLines={1} adjustsFontSizeToFit>
              ₹{total > 9999 ? (total / 1000).toFixed(1) + 'k' : total}
            </Text>
        </View>
    </View>
  );
};

const EmptyChartPlaceholder = ({ text }: { text: string }) => (
  <View style={styles.noDataBox}>
    <MaterialIcon name="bar-chart" size={40} color={colors.border} />
    <Text style={styles.noDataText}>{text}</Text>
  </View>
);

// --- COMPACT ROW ---
const CompactTransactionRow = React.memo(({ item, onPress }: { item: LocalEntry; onPress: () => void }) => {
  const isExpense = item.type === 'out';
  const color = isExpense ? colors.accentRed : colors.accentGreen;
  const categoryName = item.category || 'Other';
  const iconName = getIconForCategory(item.category);

  return (
    <TouchableOpacity style={styles.compactRow} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.compactIcon, { backgroundColor: `${color}15` }]}>
        <MaterialIcon name={iconName} size={20} color={color} />
      </View>
      <View style={styles.compactContent}>
        <Text style={styles.compactTitle} numberOfLines={1}>{categoryName}</Text>
        <Text style={styles.compactDate} numberOfLines={1}>
          {item.note ? `${item.note} • ` : ''}{dayjs(item.date || item.created_at).format('MMM D')}
        </Text>
      </View>
      <Text style={[styles.compactAmount, { color: isExpense ? colors.text : colors.accentGreen }]}>
        {isExpense ? '-' : '+'}₹{Number(item.amount).toLocaleString()}
      </Text>
    </TouchableOpacity>
  );
});

// --- MAIN SCREEN ---
const HomeScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { entries = [], isLoading = false } = useEntries(user?.uid);
  const { showToast } = useToast();
  
  // Dimensions & State
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const isTablet = SCREEN_WIDTH >= 768;
  const [containerWidth, setContainerWidth] = useState(SCREEN_WIDTH - 32);
  
  const [showBalance, setShowBalance] = useState(true);
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [chartType, setChartType] = useState<'wave' | 'list' | 'donut'>('wave');
  
  // Updates
  const isOnline = useInternetStatus();
  const [updateVisible, setUpdateVisible] = useState(false);
  const autoCheckRef = useRef(false);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 15 }),
    ]).start();
  }, []);

  useEffect(() => {
    if (!isOnline || Constants.appOwnership === 'expo' || autoCheckRef.current) return;
    autoCheckRef.current = true;
    Updates.checkForUpdateAsync().then(res => { if(res.isAvailable) setUpdateVisible(true); }).catch(()=>{});
  }, [isOnline]);

  // --- DATA LOGIC ---
  const { totalIn, totalOut, balance, periodEntries, netTrend, pieData, trendData } = useMemo(() => {
    // 1. Totals
    const tIn = entries.filter(e => e.type === 'in').reduce((s, x) => s + Number(x.amount||0), 0);
    const tOut = entries.filter(e => e.type === 'out').reduce((s, x) => s + Number(x.amount||0), 0);
    
    // 2. Filter Period
    const pStart = period === 'week' ? dayjs().subtract(6, 'day').startOf('day') : dayjs().startOf('month');
    const pEntries = entries.filter(e => dayjs(e.date||e.created_at).isAfter(pStart));

    // 3. Trend (Last 7 days strictly for Wave Chart)
    const dailyMap = new Array(7).fill(0);
    if (period === 'week') {
      for(let i=0; i<7; i++) {
        const dStr = dayjs().subtract(6-i, 'day').format('YYYY-MM-DD');
        dailyMap[i] = pEntries.filter(e => e.type === 'out' && dayjs(e.date).format('YYYY-MM-DD') === dStr)
                              .reduce((s, e) => s + Number(e.amount), 0);
      }
    } else {
        // Simple smoothing for month view (last 7 chunks)
        const total = pEntries.filter(e => e.type === 'out').reduce((s,e) => s+Number(e.amount), 0);
        dailyMap.fill(total/7); // Placeholder for monthly wave if needed, or implement full month array
    }

    // 4. Pie Data
    const catMap: Record<string, number> = {};
    pEntries.filter(e => e.type === 'out').forEach(e => {
       const c = ensureCategory(e.category);
       catMap[c] = (catMap[c] || 0) + Number(e.amount);
    });
    const pData = Object.entries(catMap).map(([name, pop], i) => ({
        name, population: pop, color: PIE_COLORS[i % PIE_COLORS.length], legendFontColor: '#333', legendFontSize: 12
    })).sort((a,b) => b.population - a.population);

    // 5. Net Trend % (vs previous week)
    const now = Date.now();
    const week = 604800000;
    let curr=0, prev=0;
    entries.forEach(e => {
        const t = new Date(e.date||e.created_at||'').getTime();
        const v = e.type==='in'?Number(e.amount):-Number(e.amount);
        if(t >= now-week) curr+=v; else if(t >= now-week*2) prev+=v;
    });
    const trend = prev===0 ? null : ((curr-prev)/Math.abs(prev))*100;

    return { totalIn: tIn, totalOut: tOut, balance: tIn-tOut, periodEntries: pEntries, netTrend: trend, pieData: pData, trendData: dailyMap };
  }, [entries, period]);

  const recent = useMemo(() => entries.slice(0, 6), [entries]);

  // --- RENDER HELPERS ---
  const renderBalance = (amt: number) => showBalance ? `₹${amt.toLocaleString('en-IN')}` : '••••••';
  const responsiveStyle = useMemo<ViewStyle>(() => ({
    width: '100%', maxWidth: 800, alignSelf: 'center', paddingHorizontal: isTablet ? spacing(6) : spacing(3)
  }), [isTablet]);

  return (
    <View style={styles.mainContainer}>
      <UpdateBanner visible={updateVisible} onPress={() => {Updates.fetchUpdateAsync().then(() => Updates.reloadAsync())}} onClose={() => setUpdateVisible(false)} />
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <FullScreenSpinner visible={isLoading} />

        <FlatList
          data={recent}
          keyExtractor={item => item.local_id || Math.random().toString()}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 120 }}
          ListHeaderComponent={
            <View style={responsiveStyle}>
              {/* HEADER */}
              <Animated.View style={[styles.headerRow, { opacity: fadeAnim }]}>
                <View style={styles.headerLeft}>
                  <TouchableOpacity style={styles.menuButton} onPress={() => navigation.openDrawer()}>
                    <MaterialIcon name="menu" size={24} color={colors.text} />
                  </TouchableOpacity>
                  <View>
                    <Text style={styles.greetingSub}>{getSmartGreeting()}</Text>
                    <Text style={styles.greetingName}>{user?.name?.split(' ')[0] || 'User'}</Text>
                  </View>
                </View>
                <TouchableOpacity style={styles.profileBtn} onPress={() => navigation.navigate('Settings')}>
                  <Text style={styles.profileInitial}>{user?.name?.[0]?.toUpperCase() || 'U'}</Text>
                </TouchableOpacity>
              </Animated.View>

              {/* HERO CARD */}
              <Animated.View style={[styles.heroContainer, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
                <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
                  <Defs>
                    <SvgLinearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
                      <Stop offset="0" stopColor={colors.primary} />
                      <Stop offset="1" stopColor={colors.secondary} />
                    </SvgLinearGradient>
                  </Defs>
                  <Rect width="100%" height="100%" rx={24} fill="url(#grad)" />
                  <Circle cx="90%" cy="10%" r="90" fill="white" fillOpacity="0.1" />
                </Svg>

                <View style={styles.heroContent}>
                    <View style={styles.heroTop}>
                        <View style={styles.glassPill}><Text style={styles.glassPillText}>Total Balance</Text></View>
                        <TouchableOpacity onPress={() => setShowBalance(!showBalance)} style={styles.glassPill}>
                             <MaterialIcon name={showBalance ? "visibility" : "visibility-off"} size={16} color="white" />
                        </TouchableOpacity>
                    </View>
                    
                    <View style={styles.balanceBlock}>
                        <Text style={styles.balanceAmount} adjustsFontSizeToFit numberOfLines={1}>{renderBalance(balance)}</Text>
                        {netTrend !== null && (
                            <View style={[styles.trendPill, { backgroundColor: netTrend >= 0 ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)' }]}>
                                <MaterialIcon name={netTrend >= 0 ? "trending-up" : "trending-down"} size={14} color="white" />
                                <Text style={styles.glassPillText}>{Math.abs(netTrend).toFixed(1)}% vs last week</Text>
                            </View>
                        )}
                    </View>

                    <View style={styles.heroStatsRow}>
                        <View style={styles.heroStatItem}>
                             <MaterialIcon name="arrow-downward" size={16} color="#86efac" style={{marginBottom:2}}/>
                             <Text style={styles.statLabel}>In</Text>
                             <Text style={styles.statValue}>{renderBalance(totalIn)}</Text>
                        </View>
                        <View style={styles.verticalDivider} />
                        <View style={styles.heroStatItem}>
                             <MaterialIcon name="arrow-upward" size={16} color="#fca5a5" style={{marginBottom:2}}/>
                             <Text style={styles.statLabel}>Out</Text>
                             <Text style={styles.statValue}>{renderBalance(totalOut)}</Text>
                        </View>
                    </View>
                </View>
              </Animated.View>

              {/* ACTION GRID */}
              <View style={styles.actionsGrid}>
                {[
                  { label: 'Add', icon: 'add', nav: 'AddEntry', primary: true },
                  { label: 'Stats', icon: 'bar-chart', nav: 'Stats' },
                  { label: 'Export', icon: 'file-download', nav: 'Export' }
                ].map((act, i) => (
                    <TouchableOpacity key={i} style={styles.actionBtn} onPress={() => navigation.navigate(act.nav)} activeOpacity={0.8}>
                        <View style={[styles.actionIcon, act.primary && styles.actionIconPrimary]}>
                            <MaterialIcon name={act.icon as any} size={24} color={act.primary ? 'white' : colors.primary} />
                        </View>
                        <Text style={styles.actionLabel}>{act.label}</Text>
                    </TouchableOpacity>
                ))}
              </View>

              {/* SMART WIDGET */}
              <View style={styles.statsWidget} onLayout={e => setContainerWidth(e.nativeEvent.layout.width)}>
                <View style={styles.widgetHeader}>
                    <View style={styles.widgetTabsBg}>
                        {['wave', 'list', 'donut'].map((t) => (
                            <TouchableOpacity key={t} onPress={() => setChartType(t as any)} style={[styles.widgetTab, chartType === t && styles.widgetTabActive]}>
                                <MaterialIcon name={t==='wave'?'show-chart':t==='list'?'list':'pie-chart'} size={20} color={chartType===t?colors.primary:colors.muted}/>
                            </TouchableOpacity>
                        ))}
                    </View>
                    <SimpleButtonGroup buttons={['7D', 'Month']} selectedIndex={period==='week'?0:1} onPress={i=>setPeriod(i===0?'week':'month')} containerStyle={{height:32, width: 120}} />
                </View>

                <View style={styles.chartArea}>
                    {chartType === 'wave' && <FinancialWaveChart data={trendData} width={containerWidth} color={colors.primary} />}
                    {chartType === 'list' && <CategoryRankList data={pieData} total={totalOut} />}
                    {chartType === 'donut' && <MinimalistDonut data={pieData} width={containerWidth} total={totalOut} />}
                </View>
              </View>

              {/* RECENT HEADER */}
              <View style={styles.listHeader}>
                <Text style={styles.sectionTitle}>Recent</Text>
                <TouchableOpacity onPress={() => navigation.navigate('History')}><Text style={styles.linkText}>See All</Text></TouchableOpacity>
              </View>
            </View>
          }
          renderItem={({ item }) => <View style={responsiveStyle}><CompactTransactionRow item={item} onPress={() => navigation.navigate('EditEntry', { entry: item })} /></View>}
          ListEmptyComponent={<View style={styles.emptyState}><Text style={styles.emptyText}>No recent activity</Text></View>}
        />
      </SafeAreaView>
    </View>
  );
};

export default HomeScreen;

// --- STYLES ---
const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: colors.background },
  safeArea: { flex: 1 },
  
  // Header
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(3), marginTop: spacing(2) },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  menuButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  greetingSub: { fontSize: 12, color: colors.muted, fontWeight: '600', textTransform: 'uppercase' },
  greetingName: { fontSize: 18, color: colors.text, fontWeight: '800' },
  profileBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  profileInitial: { fontSize: 16, fontWeight: '700', color: colors.primary },

  // Hero
  heroContainer: { height: 210, borderRadius: 24, overflow: 'hidden', marginBottom: spacing(3), elevation: 8, shadowColor: colors.primary, shadowOffset: {width:0,height:8}, shadowOpacity:0.2, shadowRadius:16 },
  heroContent: { flex: 1, padding: 20, justifyContent: 'space-between' },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between' },
  glassPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  glassPillText: { color: 'white', fontSize: 11, fontWeight: '700' },
  
  balanceBlock: { alignItems: 'center' },
  balanceAmount: { color: 'white', fontSize: 34, fontWeight: '800' },
  trendPill: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },

  heroStatsRow: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 16, padding: 8, marginTop: 10 },
  heroStatItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  verticalDivider: { width: 1, height: '80%', backgroundColor: 'rgba(255,255,255,0.2)', alignSelf:'center' },
  statLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 10 },
  statValue: { color: 'white', fontSize: 14, fontWeight: '700' },

  // Actions
  actionsGrid: { flexDirection: 'row', justifyContent: 'space-around', gap: 10, marginBottom: spacing(3) },
  actionBtn: { flex: 1, alignItems: 'center', gap: 6 },
  actionIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, elevation: 2, shadowColor:'#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.05 },
  actionIconPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  actionLabel: { fontSize: 12, fontWeight: '600', color: colors.text },

  // Widget
  statsWidget: { backgroundColor: colors.card, borderRadius: 24, padding: 16, marginBottom: spacing(3), borderWidth: 1, borderColor: colors.border },
  widgetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  widgetTabsBg: { flexDirection: 'row', backgroundColor: colors.surfaceMuted, borderRadius: 12, padding: 4 },
  widgetTab: { padding: 6, borderRadius: 8 },
  widgetTabActive: { backgroundColor: colors.card, elevation: 1 },
  chartArea: { minHeight: 180, alignItems: 'center', justifyContent: 'center' },

  // Donut Specific
  donutHole: { position: 'absolute', width: 100, height: 100, borderRadius: 50, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', elevation: 2, shadowColor:'#000', shadowOpacity:0.05, shadowOffset:{width:0,height:2} },
  donutLabel: { fontSize: 10, color: colors.muted, textTransform: 'uppercase', fontWeight: '700' },
  donutValue: { fontSize: 16, color: colors.text, fontWeight: '800' },

  // Empty States
  noDataBox: { alignItems: 'center', gap: 8, padding: 20 },
  noDataText: { color: colors.muted, fontSize: 13 },
  emptyState: { alignItems: 'center', marginTop: 20 },
  emptyText: { color: colors.muted },

  // List
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  linkText: { color: colors.primary, fontWeight: '600', fontSize: 13 },
  compactRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 16, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  compactIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  compactContent: { flex: 1 },
  compactTitle: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 2 },
  compactDate: { fontSize: 11, color: colors.muted },
  compactAmount: { fontSize: 14, fontWeight: '700' },
});
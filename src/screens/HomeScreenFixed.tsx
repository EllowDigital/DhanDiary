import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  LayoutAnimation,
  Platform,
  UIManager,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@rneui/themed';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../hooks/useAuth';
import { useEntries } from '../hooks/useEntries';
import FullScreenSpinner from '../components/FullScreenSpinner';
import dayjs from 'dayjs';

// SVG & Design
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Rect,
  Circle,
} from 'react-native-svg';
import { spacing, colors } from '../utils/design';

// Chart Kit
let LineChart: any = null;
let PieChart: any = null;
try {
  const ck = require('react-native-chart-kit');
  LineChart = ck.LineChart;
  PieChart = ck.PieChart;
} catch (e) {
  console.warn('react-native-chart-kit not installed');
}

// Enable LayoutAnimation
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
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

// --- UTILS ---
const getSmartGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 18) return 'Good Afternoon';
  return 'Good Evening';
};

const getIconForCategory = (cat?: string | null): keyof typeof MaterialIcon.glyphMap => {
  const normalized = (cat || 'other').trim().toLowerCase();
  const map: Record<string, string> = {
    food: 'restaurant',
    transport: 'directions-car',
    bills: 'receipt-long',
    salary: 'attach-money',
    shopping: 'shopping-bag',
    health: 'medical-services',
    education: 'school',
    entertainment: 'movie',
    groceries: 'shopping-cart',
    fuel: 'local-gas-station',
    rent: 'home',
    utilities: 'lightbulb',
    other: 'category',
  };
  return (map[normalized] || 'category') as any;
};

// --- CHART 1: AREA WAVE (Trend) ---
const FinancialWaveChart = ({
  data,
  width,
  color,
}: {
  data: number[];
  width: number;
  color: string;
}) => {
  if (!LineChart) return null;
  const safeData = data.length > 0 ? data : [0, 0, 0, 0, 0, 0];

  return (
    <View style={{ marginLeft: -16 }}>
      <LineChart
        data={{ labels: ['', '', '', '', '', ''], datasets: [{ data: safeData }] }}
        width={width + 16}
        height={180}
        withDots={false}
        withInnerLines={false}
        withOuterLines={false}
        withVerticalLines={false}
        withHorizontalLines={false}
        chartConfig={{
          backgroundColor: 'transparent',
          backgroundGradientFrom: '#fff',
          backgroundGradientTo: '#fff',
          decimalPlaces: 0,
          color: (opacity = 1) => color,
          labelColor: () => `transparent`,
          propsForBackgroundLines: { strokeWidth: 0 },
          fillShadowGradientFrom: color,
          fillShadowGradientTo: color,
          fillShadowGradientFromOpacity: 0.2,
          fillShadowGradientToOpacity: 0.0,
        }}
        bezier
        style={{ paddingRight: 0 }}
      />
    </View>
  );
};

// --- CHART 2: PIE CHART (Proportions) ---
const CategoryPieChart = ({ data, width }: { data: any[]; width: number }) => {
  if (!PieChart || data.length === 0)
    return <Text style={{ textAlign: 'center', color: '#999', margin: 20 }}>No data</Text>;

  return (
    <View style={{ alignItems: 'center' }}>
      <PieChart
        data={data}
        width={width}
        height={200}
        chartConfig={{
          color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
        }}
        accessor="population"
        backgroundColor="transparent"
        paddingLeft={String(width / 4)} // Center alignment
        center={[0, 0]}
        absolute={false} // Shows percentages
        hasLegend={false} // We use a custom legend below
      />
      {/* Custom Legend for better readability */}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'center',
          marginTop: 10,
          gap: 12,
        }}
      >
        {data.slice(0, 5).map((item, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: item.color }} />
            <Text style={{ fontSize: 12, color: '#333', fontWeight: '600' }}>{item.name}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

// --- CHART 3: RANK LIST (Detailed) ---
const CategoryRankList = ({ data, total }: { data: any[]; total: number }) => {
  return (
    <View style={{ width: '100%', paddingVertical: 10 }}>
      {data.slice(0, 5).map((item, index) => {
        const percentage = total > 0 ? (item.population / total) * 100 : 0;
        return (
          <View key={index} style={{ marginBottom: 14 }}>
            <View
              style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View
                  style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.color }}
                />
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>
                  {item.name}
                </Text>
              </View>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text }}>
                {percentage.toFixed(0)}%{' '}
                <Text style={{ fontWeight: '400', color: '#999' }}>
                  (₹{Math.round(item.population)})
                </Text>
              </Text>
            </View>
            <View style={{ height: 6, width: '100%', backgroundColor: '#f5f5f5', borderRadius: 3 }}>
              <View
                style={{
                  height: '100%',
                  width: `${percentage}%`,
                  backgroundColor: item.color,
                  borderRadius: 3,
                }}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
};

// --- COMPONENT: TRANSACTION ROW ---
const CompactTransactionRow = ({ item, onPress }: { item: LocalEntry; onPress: () => void }) => {
  const isExpense = item.type === 'out';
  const color = isExpense ? '#ef4444' : '#22c55e';
  const iconName = getIconForCategory(item.category);

  return (
    <TouchableOpacity style={styles.compactRow} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.compactIcon, { backgroundColor: `${color}15` }]}>
        <MaterialIcon name={iconName} size={20} color={color} />
      </View>
      <View style={styles.compactContent}>
        <Text style={styles.compactTitle} numberOfLines={1}>
          {item.category || 'General'}
        </Text>
        <Text style={styles.compactDate}>
          {item.note ? `${item.note} • ` : ''}
          {dayjs(item.date).format('MMM D, h:mm A')}
        </Text>
      </View>
      <Text style={[styles.compactAmount, { color: isExpense ? colors.text : '#22c55e' }]}>
        {isExpense ? '-' : '+'}₹{Number(item.amount).toLocaleString()}
      </Text>
    </TouchableOpacity>
  );
};

// --- MAIN SCREEN ---
const HomeScreen = () => {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { entries = [], isLoading } = useEntries(user?.uid);

  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const paddingHorizontal = 20;
  const availableChartWidth = Math.min(800, SCREEN_WIDTH) - paddingHorizontal * 2 - 32;

  // State
  const [showBalance, setShowBalance] = useState(true);
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [chartType, setChartType] = useState<'wave' | 'pie' | 'list'>('wave');

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 18 }),
    ]).start();
  }, []);

  const toggleChart = (type: any) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setChartType(type);
  };

  const togglePeriod = (p: any) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPeriod(p);
  };

  // Data Calculations
  const { totalIn, totalOut, balance, chartData, pieData } = useMemo(() => {
    const tIn = entries
      .filter((e) => e.type === 'in')
      .reduce((s, x) => s + Number(x.amount || 0), 0);
    const tOut = entries
      .filter((e) => e.type === 'out')
      .reduce((s, x) => s + Number(x.amount || 0), 0);

    // Filter Period
    const start = period === 'week' ? dayjs().subtract(6, 'day') : dayjs().startOf('month');
    const pEntries = entries.filter((e) => dayjs(e.date || e.created_at).isAfter(start));

    // Wave Data
    const wavePoints = new Array(7).fill(0);
    pEntries
      .filter((e) => e.type === 'out')
      .forEach((e) => {
        const idx = dayjs(e.date).day();
        wavePoints[idx] += Number(e.amount);
      });
    const finalWave = wavePoints.map((v) => v || 0);

    // Pie Data
    const catMap: Record<string, number> = {};
    pEntries
      .filter((e) => e.type === 'out')
      .forEach((e) => {
        const c = e.category || 'Other';
        catMap[c] = (catMap[c] || 0) + Number(e.amount);
      });

    // Define a palette of nice colors
    const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#10b981', '#f59e0b', '#3b82f6'];

    const pData = Object.entries(catMap)
      .map(([name, val], i) => ({
        name,
        population: val,
        color: colors[i % colors.length],
        legendFontColor: '#333',
        legendFontSize: 12,
      }))
      .sort((a, b) => b.population - a.population);

    return {
      totalIn: tIn,
      totalOut: tOut,
      balance: tIn - tOut,
      chartData: finalWave,
      pieData: pData,
    };
  }, [entries, period]);

  const recent = entries.slice(0, 5);

  return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <FullScreenSpinner visible={isLoading} />

        <FlatList
          data={recent}
          keyExtractor={(item) => item.local_id || Math.random().toString()}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 120 }}
          ListHeaderComponent={
            <View style={[styles.contentContainer, { paddingHorizontal }]}>
              {/* HEADER */}
              <Animated.View style={[styles.headerRow, { opacity: fadeAnim }]}>
                <View style={styles.headerLeft}>
                  <TouchableOpacity
                    style={styles.menuButton}
                    onPress={() => navigation.openDrawer()}
                  >
                    <MaterialIcon name="menu" size={24} color={colors.text} />
                  </TouchableOpacity>
                  <View style={{ marginLeft: 12 }}>
                    <Text style={styles.greetingSub}>{getSmartGreeting()}</Text>
                    <Text style={styles.greetingName}>{user?.name?.split(' ')[0] || 'User'}</Text>
                  </View>
                </View>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{user?.name?.[0]?.toUpperCase() || 'S'}</Text>
                </View>
              </Animated.View>

              {/* HERO CARD */}
              <Animated.View
                style={[
                  styles.heroCard,
                  { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
                ]}
              >
                <Svg style={StyleSheet.absoluteFill}>
                  <Defs>
                    <SvgLinearGradient id="heroGrad" x1="0" y1="0" x2="1" y2="1">
                      <Stop offset="0" stopColor="#3b82f6" />
                      <Stop offset="1" stopColor="#2563eb" />
                    </SvgLinearGradient>
                  </Defs>
                  <Rect width="100%" height="100%" rx={24} fill="url(#heroGrad)" />
                  <Circle cx="90%" cy="10%" r="100" fill="white" fillOpacity="0.08" />
                </Svg>

                <View style={styles.heroContent}>
                  <View style={styles.heroTop}>
                    <View style={styles.balanceTag}>
                      <Text style={styles.balanceTagText}>Total Balance</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => setShowBalance(!showBalance)}
                      style={styles.eyeBtn}
                    >
                      <MaterialIcon
                        name={showBalance ? 'visibility' : 'visibility-off'}
                        size={18}
                        color="rgba(255,255,255,0.8)"
                      />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.balanceRow}>
                    <Text style={styles.currencySymbol}>₹</Text>
                    <Text style={styles.balanceValue}>
                      {showBalance ? balance.toLocaleString('en-IN') : '••••••'}
                    </Text>
                  </View>

                  <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                      <MaterialIcon name="arrow-downward" size={16} color="#86efac" />
                      <Text style={styles.statLabel}>In</Text>
                      <Text style={styles.statNum}>
                        {showBalance ? totalIn.toLocaleString() : '•••'}
                      </Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                      <MaterialIcon name="arrow-upward" size={16} color="#fca5a5" />
                      <Text style={styles.statLabel}>Out</Text>
                      <Text style={styles.statNum}>
                        {showBalance ? totalOut.toLocaleString() : '•••'}
                      </Text>
                    </View>
                  </View>
                </View>
              </Animated.View>

              {/* ACTION BUTTONS */}
              <View style={styles.actionsContainer}>
                {[
                  { label: 'Add', icon: 'add', nav: 'AddEntry', color: '#3b82f6' },
                  { label: 'Stats', icon: 'bar-chart', nav: 'Stats', color: '#fff' },
                  { label: 'Export', icon: 'file-download', nav: 'Export', color: '#fff' },
                ].map((action, i) => (
                  <View key={i} style={styles.actionItem}>
                    <TouchableOpacity
                      style={[
                        styles.actionBtn,
                        { backgroundColor: action.color === '#fff' ? '#fff' : action.color },
                      ]}
                      onPress={() => navigation.navigate(action.nav)}
                    >
                      <MaterialIcon
                        name={action.icon as any}
                        size={28}
                        color={action.color === '#fff' ? '#3b82f6' : '#fff'}
                      />
                    </TouchableOpacity>
                    <Text style={styles.actionLabel}>{action.label}</Text>
                  </View>
                ))}
              </View>

              {/* ANALYTICS WIDGET */}
              <View style={styles.chartCard}>
                <View style={styles.chartHeader}>
                  {/* 3 Toggle Buttons: Wave, Pie, List */}
                  <View style={styles.chartToggle}>
                    <TouchableOpacity
                      onPress={() => toggleChart('wave')}
                      style={[styles.toggleIcon, chartType === 'wave' && styles.toggleIconActive]}
                    >
                      <MaterialIcon
                        name="show-chart"
                        size={20}
                        color={chartType === 'wave' ? '#3b82f6' : '#94a3b8'}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => toggleChart('pie')}
                      style={[styles.toggleIcon, chartType === 'pie' && styles.toggleIconActive]}
                    >
                      <MaterialIcon
                        name="pie-chart"
                        size={20}
                        color={chartType === 'pie' ? '#3b82f6' : '#94a3b8'}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => toggleChart('list')}
                      style={[styles.toggleIcon, chartType === 'list' && styles.toggleIconActive]}
                    >
                      <MaterialIcon
                        name="list"
                        size={20}
                        color={chartType === 'list' ? '#3b82f6' : '#94a3b8'}
                      />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.periodToggle}>
                    <TouchableOpacity
                      style={[styles.periodBtn, period === 'week' && styles.periodBtnActive]}
                      onPress={() => togglePeriod('week')}
                    >
                      <Text
                        style={[styles.periodText, period === 'week' && styles.periodTextActive]}
                      >
                        7D
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.periodBtn, period === 'month' && styles.periodBtnActive]}
                      onPress={() => togglePeriod('month')}
                    >
                      <Text
                        style={[styles.periodText, period === 'month' && styles.periodTextActive]}
                      >
                        Month
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Chart Content Area */}
                <View style={styles.chartBody}>
                  {chartType === 'wave' && (
                    <FinancialWaveChart
                      data={chartData}
                      width={availableChartWidth}
                      color={colors.primary}
                    />
                  )}
                  {chartType === 'pie' && (
                    <CategoryPieChart data={pieData} width={availableChartWidth} />
                  )}
                  {chartType === 'list' && <CategoryRankList data={pieData} total={totalOut} />}
                </View>
              </View>

              {/* RECENT HEADER */}
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Recent</Text>
                <TouchableOpacity onPress={() => navigation.navigate('History')}>
                  <Text style={styles.seeAll}>See All</Text>
                </TouchableOpacity>
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <View style={{ paddingHorizontal }}>
              <CompactTransactionRow
                item={item}
                onPress={() => navigation.navigate('EditEntry', { entry: item })}
              />
            </View>
          )}
        />
      </SafeAreaView>
    </View>
  );
};

export default HomeScreen;

// --- STYLES ---
const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#f8fafc' },
  safeArea: { flex: 1 },
  contentContainer: { maxWidth: 800, alignSelf: 'center', width: '100%', paddingTop: 10 },

  // Header
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  menuButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  greetingSub: { fontSize: 11, color: '#64748b', fontWeight: '600', textTransform: 'uppercase' },
  greetingName: { fontSize: 18, color: '#1e293b', fontWeight: '800' },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  avatarText: { fontSize: 18, fontWeight: '700', color: '#3b82f6' },

  // Hero Card
  heroCard: {
    height: 210,
    borderRadius: 28,
    marginBottom: 24,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
    overflow: 'hidden',
  },
  heroContent: { flex: 1, padding: 24, justifyContent: 'space-between' },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  balanceTag: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  balanceTagText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  eyeBtn: { padding: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20 },

  balanceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 10,
  },
  currencySymbol: {
    fontSize: 24,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
    marginRight: 4,
    marginTop: 8,
  },
  balanceValue: { fontSize: 40, color: '#fff', fontWeight: '800' },

  statsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 18,
    padding: 12,
    marginTop: 16,
  },
  statItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  statLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '500' },
  statNum: { color: '#fff', fontSize: 15, fontWeight: '700' },
  statDivider: {
    width: 1,
    height: '80%',
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
  },

  // Actions
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    marginBottom: 24,
  },
  actionItem: { alignItems: 'center', gap: 8 },
  actionBtn: {
    width: 64,
    height: 64,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  actionLabel: { fontSize: 13, fontWeight: '600', color: '#475569' },

  // Chart Widget
  chartCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  chartToggle: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 12, padding: 4 },
  toggleIcon: { padding: 8, borderRadius: 8 },
  toggleIconActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    elevation: 1,
  },

  periodToggle: {
    flexDirection: 'row',
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 4,
    flex: 1,
    marginLeft: 16,
    maxWidth: 140,
  },
  periodBtn: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 8 },
  periodBtnActive: { backgroundColor: '#3b82f6', elevation: 1 },
  periodText: { fontSize: 12, fontWeight: '600', color: '#64748b' },
  periodTextActive: { color: '#fff' },
  chartBody: { alignItems: 'center', justifyContent: 'center', minHeight: 180 },

  // List
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#1e293b' },
  seeAll: { fontSize: 13, fontWeight: '600', color: '#3b82f6' },

  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 18,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.02,
    elevation: 1,
  },
  compactIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  compactContent: { flex: 1 },
  compactTitle: { fontSize: 15, fontWeight: '600', color: '#1e293b', marginBottom: 2 },
  compactDate: { fontSize: 12, color: '#94a3b8' },
  compactAmount: { fontSize: 15, fontWeight: '700' },
});

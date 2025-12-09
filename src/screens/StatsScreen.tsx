import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  ScrollView,
  ActivityIndicator,
  PixelRatio,
  Animated,
  LayoutAnimation,
  Platform,
  Pressable,
  StatusBar,
  UIManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@rneui/themed';
import { useEntries } from '../hooks/useEntries';
import { useAuth } from '../hooks/useAuth';
import { subscribeEntries } from '../utils/dbEvents';
import dayjs from 'dayjs';
import { getStartDateForFilter, getDaysCountForFilter } from '../utils/stats';
import { LineChart, PieChart } from 'react-native-chart-kit';
import { colors, spacing, shadows } from '../utils/design';
import { ensureCategory, FALLBACK_CATEGORY } from '../constants/categories';
import ScreenHeader from '../components/ScreenHeader';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';

// --- CONFIG ---
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const fontScale = PixelRatio.getFontScale();
const font = (size: number) => size / fontScale;

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
    : '0, 0, 0';
};

const FILTERS = ['7D', '30D', 'Month', 'Year'];
const CHART_COLORS = [
  colors.primary,
  colors.accentGreen,
  colors.accentOrange,
  colors.accentBlue,
  colors.accentRed,
  colors.secondary,
];

const chartTextColor = hexToRgb(colors.text);

const chartConfig = {
  backgroundColor: 'transparent',
  backgroundGradientFrom: colors.card,
  backgroundGradientTo: colors.card,
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(${hexToRgb(colors.primary)}, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(${hexToRgb(colors.muted)}, ${opacity})`,
  propsForDots: {
    r: "4",
    strokeWidth: "2",
    stroke: colors.primary
  },
  propsForBackgroundLines: {
    strokeDasharray: "", // solid lines
    stroke: colors.border,
    strokeOpacity: 0.4,
  },
};

const StatsScreen = () => {
  const { user, loading: authLoading } = useAuth();
  const { entries = [], isLoading, refetch } = useEntries(user?.id);
  
  // Animation Refs
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  const [filter, setFilter] = useState('7D');

  // Load Data & Animate
  useEffect(() => {
    const unsub = subscribeEntries(() => {
      try { refetch(); } catch (e) {}
    });
    
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 15,
      }),
    ]).start();

    return () => unsub();
  }, [refetch]);

  // --- DATA PROCESSING ---
  const filteredEntries = useMemo(() => {
    const startDate = getStartDateForFilter(filter);
    return entries.filter((e: any) => {
      const d = dayjs(e.date || e.created_at);
      return !d.isBefore(startDate);
    });
  }, [entries, filter]);

  const stats = useMemo(() => {
    return filteredEntries.reduce(
      (acc, entry) => {
        const amount = Number(entry.amount) || 0;
        if (entry.type === 'in') {
          acc.totalIn += amount;
        } else {
          acc.totalOut += amount;
        }
        return acc;
      },
      { totalIn: 0, totalOut: 0, net: 0 }
    );
  }, [filteredEntries]);
  stats.net = stats.totalIn - stats.totalOut;

  const pieData = useMemo(() => {
    const expenseCategories = filteredEntries
      .filter((e) => e.type === 'out')
      .reduce((acc, e) => {
        const category = ensureCategory(e.category);
        const amount = Number(e.amount) || 0;
        acc[category] = (acc[category] || 0) + amount;
        return acc;
      }, {} as { [key: string]: number });

    return Object.entries(expenseCategories)
      .map(([name, population], index) => ({
        name,
        population,
        color: CHART_COLORS[index % CHART_COLORS.length],
        legendFontColor: colors.text,
        legendFontSize: 12,
      }))
      .sort((a, b) => b.population - a.population);
  }, [filteredEntries]);

  const seriesData = useMemo(() => {
    const labels: string[] = [];
    const inData: number[] = [];
    const outData: number[] = [];
    const indexByKey = new Map<string, number>();
    const now = dayjs();

    if (filter === 'Year') {
      for (let i = 0; i < 12; i++) {
        const monthLabel = now.month(i).format('MMM');
        labels.push(monthLabel);
        inData.push(0); outData.push(0);
        indexByKey.set(monthLabel, i);
      }
    } else {
      const startDate = getStartDateForFilter(filter, now);
      const days = getDaysCountForFilter(filter, now);
      const maxLabels = 7; // Reduce labels for mobile
      const step = Math.max(1, Math.ceil(days / maxLabels));
      const displayFormat = days > 15 ? 'D MMM' : 'ddd';

      for (let i = 0; i < days; i++) {
        const date = startDate.add(i, 'day');
        const labelKey = date.format('YYYY-MM-DD');
        const labelText = i % step === 0 ? date.format(displayFormat) : '';
        labels.push(labelText);
        inData.push(0); outData.push(0);
        indexByKey.set(labelKey, i);
      }
    }

    filteredEntries.forEach((entry: any) => {
      const rawDate = dayjs(entry.date || entry.created_at);
      const amount = Number(entry.amount) || 0;
      const key = filter === 'Year' ? rawDate.format('MMM') : rawDate.format('YYYY-MM-DD');
      const targetIndex = indexByKey.get(key);
      if (targetIndex !== undefined) {
        if (entry.type === 'in') inData[targetIndex] += amount;
        else outData[targetIndex] += amount;
      }
    });

    return {
      labels,
      datasets: [
        {
          data: inData,
          color: (opacity = 1) => `rgba(${hexToRgb(colors.accentGreen)}, ${opacity})`,
          strokeWidth: 3,
        },
        {
          data: outData,
          color: (opacity = 1) => `rgba(${hexToRgb(colors.accentRed)}, ${opacity})`,
          strokeWidth: 3,
        },
      ],
      legend: ['Income', 'Expense'] 
    };
  }, [filteredEntries, filter]);

  // --- DERIVED METRICS ---
  const daysInView = getDaysCountForFilter(filter, dayjs());
  const averageSpend = stats.totalOut / Math.max(daysInView, 1);
  const topCategory = pieData[0]?.name || FALLBACK_CATEGORY;
  const netPositive = stats.net >= 0;

  const handleFilterPress = (nextFilter: string) => {
    if (nextFilter === filter) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setFilter(nextFilter);
  };

  if (isLoading || authLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <ScreenHeader
        title="Analytics"
        subtitle="Financial health overview"
        showScrollHint={false}
      />
      
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          
          {/* FILTER TABS */}
          <View style={styles.filterContainer}>
            {FILTERS.map((f) => {
              const isActive = filter === f;
              return (
                <Pressable
                  key={f}
                  style={[styles.filterPill, isActive && styles.filterPillActive]}
                  onPress={() => handleFilterPress(f)}
                >
                  <Text style={[styles.filterText, isActive && styles.filterTextActive]}>
                    {f}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* HERO STATS */}
          <View style={styles.heroCard}>
            <View style={styles.heroTop}>
              <View>
                <Text style={styles.heroLabel}>Net Balance</Text>
                <Text style={[
                  styles.heroValue, 
                  { color: netPositive ? colors.accentGreen : colors.accentRed }
                ]}>
                  {netPositive ? '+' : ''}₹{Math.abs(stats.net).toLocaleString()}
                </Text>
              </View>
              <View style={[styles.trendBadge, { backgroundColor: netPositive ? '#DCFCE7' : '#FEE2E2' }]}>
                <MaterialIcon 
                  name={netPositive ? 'trending-up' : 'trending-down'} 
                  size={18} 
                  color={netPositive ? colors.accentGreen : colors.accentRed} 
                />
                <Text style={[styles.trendText, { color: netPositive ? colors.accentGreen : colors.accentRed }]}>
                  {netPositive ? 'Surplus' : 'Deficit'}
                </Text>
              </View>
            </View>

            <View style={styles.heroDivider} />

            <View style={styles.heroRow}>
              <View style={styles.heroCol}>
                <Text style={styles.colLabel}>Income</Text>
                <Text style={styles.colValue}>₹{stats.totalIn.toLocaleString()}</Text>
              </View>
              <View style={[styles.heroCol, styles.heroColRight]}>
                <Text style={styles.colLabel}>Expense</Text>
                <Text style={styles.colValue}>₹{stats.totalOut.toLocaleString()}</Text>
              </View>
            </View>
          </View>

          {/* QUICK STATS ROW */}
          <View style={styles.quickStatsContainer}>
            <View style={styles.quickStatCard}>
              <MaterialIcon name="receipt-long" size={20} color={colors.primary} />
              <Text style={styles.quickStatValue}>{filteredEntries.length}</Text>
              <Text style={styles.quickStatLabel}>Entries</Text>
            </View>
            <View style={styles.quickStatCard}>
              <MaterialIcon name="speed" size={20} color={colors.accentOrange} />
              <Text style={styles.quickStatValue}>₹{averageSpend.toFixed(0)}</Text>
              <Text style={styles.quickStatLabel}>Daily Avg</Text>
            </View>
            <View style={styles.quickStatCard}>
              <MaterialIcon name="category" size={20} color={colors.secondary} />
              <Text style={styles.quickStatValue} numberOfLines={1}>{topCategory}</Text>
              <Text style={styles.quickStatLabel}>Top Category</Text>
            </View>
          </View>

          {/* LINE CHART */}
          <View style={styles.chartCard}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Cash Flow Trend</Text>
              <MaterialIcon name="show-chart" size={20} color={colors.muted} />
            </View>
            
            {seriesData.datasets[0].data.some(d => d > 0) || seriesData.datasets[1].data.some(d => d > 0) ? (
              <LineChart
                data={seriesData}
                width={SCREEN_WIDTH - 64} // Responsive width
                height={220}
                chartConfig={chartConfig}
                bezier
                style={styles.chartStyle}
                withDots={true}
                withShadow={false}
                yAxisLabel="₹"
                yAxisInterval={1000}
              />
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No data available for this period</Text>
              </View>
            )}
          </View>

          {/* PIE CHART */}
          <View style={styles.chartCard}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Spending Breakdown</Text>
              <MaterialIcon name="pie-chart" size={20} color={colors.muted} />
            </View>
            
            {pieData.length > 0 ? (
              <PieChart
                data={pieData}
                width={SCREEN_WIDTH - 64}
                height={220}
                chartConfig={chartConfig}
                accessor="population"
                backgroundColor="transparent"
                paddingLeft="0"
                absolute={false}
                center={[10, 0]}
              />
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No expenses recorded</Text>
              </View>
            )}
          </View>

        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default StatsScreen;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 10,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  /* FILTERS */
  filterContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 4,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterPill: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10,
  },
  filterPillActive: {
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
  },
  filterTextActive: {
    color: 'white',
  },

  /* HERO CARD */
  heroCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.text,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroLabel: {
    fontSize: 13,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
    marginBottom: 4,
  },
  heroValue: {
    fontSize: 28,
    fontWeight: '800',
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  trendText: {
    fontSize: 12,
    fontWeight: '700',
  },
  heroDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 16,
  },
  heroRow: {
    flexDirection: 'row',
  },
  heroCol: {
    flex: 1,
  },
  heroColRight: {
    alignItems: 'flex-end',
  },
  colLabel: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 2,
  },
  colValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },

  /* QUICK STATS */
  quickStatsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  quickStatCard: {
    flex: 1,
    backgroundColor: colors.card,
    padding: 12,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickStatValue: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginTop: 6,
    marginBottom: 2,
  },
  quickStatLabel: {
    fontSize: 11,
    color: colors.muted,
  },

  /* CHARTS */
  chartCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  cardHeader: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  chartStyle: {
    borderRadius: 16,
    paddingRight: 0,
    paddingLeft: 0,
  },
  emptyState: {
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: colors.muted,
    fontStyle: 'italic',
  },
});
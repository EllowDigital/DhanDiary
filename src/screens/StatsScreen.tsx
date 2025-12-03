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
} from 'react-native';
import { Text } from '@rneui/themed';
import { useEntries } from '../hooks/useEntries';
import { useAuth } from '../hooks/useAuth';
import { subscribeEntries } from '../utils/dbEvents';
import dayjs from 'dayjs';
import { getStartDateForFilter, getDaysCountForFilter } from '../utils/stats';
import { LineChart, PieChart } from 'react-native-chart-kit';
import { colors, shadows } from '../utils/design';
import { ensureCategory, FALLBACK_CATEGORY } from '../constants/categories';
import { enableLegacyLayoutAnimations } from '../utils/layoutAnimation';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const fontScale = PixelRatio.getFontScale();
const font = (size: number) => size / fontScale;

const hexToRgb = (hex: string) => {
  const normalized = hex.replace('#', '');
  const bigint = parseInt(normalized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `${r}, ${g}, ${b}`;
};

const FILTERS = ['7D', '30D', 'This Month', 'This Year'];
const CHART_COLORS = [
  colors.primary,
  colors.accentGreen,
  colors.accentOrange,
  colors.accentBlue,
  colors.accentRed,
  colors.secondary,
];

if (Platform.OS === 'android') {
  enableLegacyLayoutAnimations();
}

const chartTextColor = hexToRgb(colors.text);

const chartConfig = {
  backgroundColor: colors.card,
  backgroundGradientFrom: colors.card,
  backgroundGradientTo: colors.card,
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(${chartTextColor}, ${opacity})`,
  style: {
    borderRadius: 16,
  },
};

const StatsScreen = () => {
  const { user, loading: authLoading } = useAuth();
  const { entries = [], isLoading, refetch } = useEntries(user?.id);
  const heroOpacity = useRef(new Animated.Value(0)).current;
  const heroTranslate = useRef(new Animated.Value(20)).current;
  const filterTranslate = useRef(new Animated.Value(30)).current;

  // Subscribe to DB changes (including background syncs) so stats refresh
  // when entries are inserted/updated by other parts of the app or sync.
  useEffect(() => {
    const unsub = subscribeEntries(() => {
      try {
        refetch();
      } catch (e) {}
    });
    return () => unsub();
  }, [refetch]);
  const [filter, setFilter] = useState('7D');

  useEffect(() => {
    Animated.parallel([
      Animated.timing(heroOpacity, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }),
      Animated.spring(heroTranslate, {
        toValue: 0,
        useNativeDriver: true,
      }),
      Animated.spring(filterTranslate, {
        toValue: 0,
        useNativeDriver: true,
      }),
    ]).start();
  }, [filterTranslate, heroOpacity, heroTranslate]);

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
      .reduce(
        (acc, e) => {
          const category = ensureCategory(e.category);
          const amount = Number(e.amount) || 0;
          acc[category] = (acc[category] || 0) + amount;
          return acc;
        },
        {} as { [key: string]: number }
      );

    const sortedData = Object.entries(expenseCategories)
      .map(([name, population], index) => ({
        name,
        population,
        color: CHART_COLORS[index % CHART_COLORS.length],
        legendFontColor: colors.muted,
        legendFontSize: font(15),
      }))
      .sort((a, b) => b.population - a.population);

    return sortedData.length > 0 ? sortedData : [];
  }, [filteredEntries]);

  const seriesData = useMemo(() => {
    const format = filter === 'This Year' ? 'MMM' : 'DD MMM';
    const shortFormat = filter === 'This Year' ? 'MMM' : 'DD';
    const labels: string[] = [];
    const inData: number[] = [];
    const outData: number[] = [];

    if (filter !== 'This Year') {
      const now = dayjs();
      const startDate = getStartDateForFilter(filter, now);
      const days = getDaysCountForFilter(filter, now);

      // Determine label density to avoid overlap (max ~10 labels shown)
      const maxLabels = 10;
      const step = Math.max(1, Math.ceil(days / maxLabels));

      for (let i = 0; i < days; i++) {
        const date = startDate.add(i, 'day');
        // show abbreviated label (day number) and hide some labels based on step
        const labelText = i % step === 0 ? date.format(shortFormat) : '';
        labels.push(labelText);
        inData.push(0);
        outData.push(0);
      }
    } else {
      for (let i = 0; i < 12; i++) {
        labels.push(dayjs().month(i).format('MMM'));
        inData.push(0);
        outData.push(0);
      }
    }

    filteredEntries.forEach((e: any) => {
      const rawDate = dayjs(e.date || e.created_at);
      const dateKey = filter === 'This Year' ? rawDate.format('MMM') : rawDate.format(format);
      const amount = Number(e.amount) || 0;
      const index = labels.indexOf(dateKey);
      if (index !== -1) {
        if (e.type === 'in') {
          inData[index] += amount;
        } else {
          outData[index] += amount;
        }
      }
    });

    return {
      labels,
      datasets: [
        {
          data: inData,
          color: (opacity = 1) => `rgba(${hexToRgb(colors.accentGreen)}, ${opacity})`,
          strokeWidth: 2,
        },
        {
          data: outData,
          color: (opacity = 1) => `rgba(${hexToRgb(colors.accentRed)}, ${opacity})`,
          strokeWidth: 2,
        },
      ],
    };
  }, [filteredEntries, filter]);

  const daysInView = useMemo(() => {
    return getDaysCountForFilter(filter, dayjs());
  }, [filter]);

  const averageSpend = useMemo(() => {
    const safeDays = Math.max(daysInView, 1);
    return stats.totalOut / safeDays;
  }, [stats.totalOut, daysInView]);

  const topCategory = pieData[0]?.name || FALLBACK_CATEGORY;
  const periodLabel = useMemo(() => {
    switch (filter) {
      case '7D':
        return 'Last 7 days';
      case '30D':
        return 'Last 30 days';
      default:
        return filter;
    }
  }, [filter]);

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

  const StatCard = ({
    title,
    value,
    color,
    hint,
    isLast,
  }: {
    title: string;
    value: number;
    color: string;
    hint: string;
    isLast?: boolean;
  }) => (
    <View style={[styles.statCard, isLast && styles.statCardLast]}>
      <View style={[styles.statBadge, { backgroundColor: `${color}20` }]}>
        <View style={[styles.dot, { backgroundColor: color }]} />
      </View>
      <Text style={styles.statTitle}>{title}</Text>
      <Text style={[styles.statValue, { color }]}>₹{value.toLocaleString('en-IN')}</Text>
      <Text style={styles.statHint}>{hint}</Text>
    </View>
  );

  const renderPieChart = () => {
    if (!pieData.length) {
      return <Text style={styles.noDataText}>No expense data for this period.</Text>;
    }
    try {
      return (
        <PieChart
          data={pieData}
          width={SCREEN_WIDTH - 64}
          height={220}
          chartConfig={chartConfig}
          accessor={'population'}
          backgroundColor={'transparent'}
          paddingLeft={'15'}
          absolute
        />
      );
    } catch (error) {
      return <Text style={styles.noDataText}>Error rendering chart.</Text>;
    }
  };

  const renderLineChart = () => {
    if (
      !seriesData.labels.length ||
      (!seriesData.datasets[0].data.some((d) => d > 0) &&
        !seriesData.datasets[1].data.some((d) => d > 0))
    ) {
      return <Text style={styles.noDataText}>No income or expense data for this period.</Text>;
    }
    try {
      return (
        <LineChart
          data={seriesData}
          width={SCREEN_WIDTH - 48}
          height={280}
          chartConfig={chartConfig}
          style={styles.chartStyle}
          // shorten x-axis labels and keep spacing predictable
          formatXLabel={(label) => (typeof label === 'string' ? label : String(label))}
          withInnerLines={false}
          withOuterLines={false}
        />
      );
    } catch (error) {
      return <Text style={styles.noDataText}>Error rendering chart.</Text>;
    }
  };

  const heroBadgeStyle = (positive: boolean) => ({
    backgroundColor: positive ? colors.accentGreen : colors.accentRed,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  });

  const quickStats = [
    { label: 'Avg daily spend', value: `₹${averageSpend.toFixed(0)}` },
    { label: 'Entries logged', value: filteredEntries.length.toString() },
    { label: 'Top category', value: topCategory },
  ];

  const statCards = [
    { title: 'Total Income', value: stats.totalIn, color: colors.accentGreen, hint: 'Cash in' },
    { title: 'Total Expenses', value: stats.totalOut, color: colors.accentRed, hint: 'Cash out' },
    {
      title: 'Net Savings',
      value: stats.net,
      color: netPositive ? colors.primary : colors.accentRed,
      hint: netPositive ? 'Positive flow' : 'Needs attention',
    },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View
        style={[
          styles.heroCard,
          styles.sectionBlock,
          { opacity: heroOpacity, transform: [{ translateY: heroTranslate }] },
        ]}
      >
        <Text style={styles.headerOverline}>Overview</Text>
        <Text style={styles.header}>Statistics</Text>
        <Text style={styles.period}>{periodLabel}</Text>
        <View style={styles.heroStatsRow}>
          <View>
            <Text style={styles.heroValue}>₹{stats.totalIn.toLocaleString('en-IN')}</Text>
            <Text style={styles.heroHint}>Total income</Text>
          </View>
          <View style={heroBadgeStyle(netPositive)}>
            <Text style={styles.heroBadgeText}>{netPositive ? 'Healthy flow' : 'Overspend'}</Text>
          </View>
        </View>
        <View style={styles.heroDivider} />
        <View style={styles.heroBottomRow}>
          <View>
            <Text style={styles.heroBottomLabel}>Net savings</Text>
            <Text
              style={[
                styles.heroBottomValue,
                { color: netPositive ? colors.accentGreen : colors.accentRed },
              ]}
            >
              ₹{stats.net.toLocaleString('en-IN')}
            </Text>
          </View>
          <View>
            <Text style={styles.heroBottomLabel}>Expenses</Text>
            <Text style={styles.heroBottomValue}>₹{stats.totalOut.toLocaleString('en-IN')}</Text>
          </View>
        </View>
      </Animated.View>

      <Animated.View
        style={[styles.sectionBlock, { transform: [{ translateY: filterTranslate }] }]}
      >
        <Text style={styles.sectionLabel}>Timeframe</Text>
        <View style={styles.filterRow}>
          {FILTERS.map((f) => {
            const isActive = filter === f;
            return (
              <Pressable
                key={f}
                style={[styles.filterPill, isActive && styles.filterPillActive]}
                onPress={() => handleFilterPress(f)}
              >
                <Text style={[styles.filterPillText, isActive && styles.filterPillTextActive]}>
                  {f}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Animated.View>

      <View style={[styles.statsGrid, styles.sectionBlock]}>
        {statCards.map((card, index) => (
          <StatCard key={card.title} {...card} isLast={index === statCards.length - 1} />
        ))}
      </View>

      <View style={[styles.quickStatsCard, styles.sectionBlock]}>
        {quickStats.map((item) => (
          <View key={item.label} style={styles.quickStatItem}>
            <Text style={styles.quickStatLabel}>{item.label}</Text>
            <Text style={styles.quickStatValue}>{item.value}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.chartCard, styles.sectionBlock]}>
        <Text style={styles.chartTitle}>Expense Breakdown</Text>
        {renderPieChart()}
      </View>

      <View style={[styles.chartCard, styles.sectionBlock]}>
        <Text style={styles.chartTitle}>Income vs. Expenses</Text>
        {renderLineChart()}
      </View>
    </ScrollView>
  );
};

export default StatsScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 60,
  },
  sectionBlock: {
    marginBottom: 20,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerOverline: {
    fontSize: font(12),
    textTransform: 'uppercase',
    color: colors.muted,
    letterSpacing: 1,
  },
  header: {
    fontSize: font(32),
    fontWeight: '700',
    color: colors.text,
  },
  period: {
    fontSize: font(16),
    color: colors.muted,
    marginTop: 4,
  },
  heroCard: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.large,
  },
  heroStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
  },
  heroValue: {
    fontSize: font(28),
    fontWeight: '700',
    color: colors.text,
  },
  heroHint: {
    fontSize: font(14),
    color: colors.muted,
    marginTop: 4,
  },
  heroBadgeText: {
    color: colors.white,
    fontWeight: '600',
  },
  heroDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 18,
  },
  heroBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heroBottomLabel: {
    fontSize: font(13),
    color: colors.muted,
  },
  heroBottomValue: {
    fontSize: font(20),
    fontWeight: '700',
    color: colors.text,
    marginTop: 2,
  },
  sectionLabel: {
    fontSize: font(14),
    color: colors.muted,
    marginBottom: 10,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  filterPill: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 10,
    marginBottom: 10,
  },
  filterPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterPillText: {
    color: colors.muted,
    fontWeight: '600',
    fontSize: font(13),
  },
  filterPillTextActive: {
    color: colors.white,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 12,
    ...shadows.small,
  },
  statCardLast: {
    marginRight: 0,
  },
  statBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statTitle: {
    fontSize: font(13),
    color: colors.muted,
    fontWeight: '600',
    marginBottom: 6,
  },
  statValue: {
    fontSize: font(20),
    fontWeight: '700',
    color: colors.text,
  },
  statHint: {
    fontSize: font(12),
    color: colors.muted,
    marginTop: 4,
  },
  quickStatsCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 18,
    paddingHorizontal: 16,
    ...shadows.small,
  },
  quickStatItem: {
    flex: 1,
    paddingHorizontal: 6,
  },
  quickStatLabel: {
    color: colors.muted,
    fontSize: font(12),
    marginBottom: 6,
  },
  quickStatValue: {
    color: colors.text,
    fontSize: font(16),
    fontWeight: '600',
  },
  chartCard: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.small,
  },
  chartTitle: {
    fontSize: font(16),
    fontWeight: '600',
    color: colors.text,
    alignSelf: 'flex-start',
    marginBottom: 14,
  },
  noDataText: {
    textAlign: 'center',
    paddingVertical: 40,
    color: colors.muted,
    fontSize: font(14),
  },
  chartStyle: {
    marginVertical: 8,
    borderRadius: 16,
  },
});

import React, { useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  ScrollView,
  ActivityIndicator,
  PixelRatio,
} from 'react-native';
import { Text, Button } from '@rneui/themed';
import { useEntries } from '../hooks/useEntries';
import { useAuth } from '../hooks/useAuth';
import { subscribeEntries } from '../utils/dbEvents';
import dayjs from 'dayjs';
import { LineChart, PieChart } from 'react-native-chart-kit';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const fontScale = PixelRatio.getFontScale();
const font = (size: number) => size / fontScale;

const FILTERS = ['7D', '30D', 'This Month', 'This Year'];
const CHART_COLORS = ['#3B82F6', '#10B981', '#F97316', '#8B5CF6', '#EC4899', '#F59E0B'];

const chartConfig = {
  backgroundColor: '#ffffff',
  backgroundGradientFrom: '#ffffff',
  backgroundGradientTo: '#ffffff',
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
  style: {
    borderRadius: 16,
  },
};

const StatsScreen = () => {
  const { user, loading: authLoading } = useAuth();
  const { entries = [], isLoading, refetch } = useEntries(user?.id);

  // Subscribe to DB changes (including background syncs) so stats refresh
  // when entries are inserted/updated by other parts of the app or sync.
  React.useEffect(() => {
    const unsub = subscribeEntries(() => {
      try {
        refetch();
      } catch (e) {}
    });
    return () => unsub();
  }, [refetch]);
  const [filter, setFilter] = useState('7D');

  const filteredEntries = useMemo(() => {
    const now = dayjs();
    let startDate;

    switch (filter) {
      case '7D':
        startDate = now.subtract(6, 'day').startOf('day');
        break;
      case '30D':
        startDate = now.subtract(29, 'day').startOf('day');
        break;
      case 'This Month':
        startDate = now.startOf('month');
        break;
      case 'This Year':
        startDate = now.startOf('year');
        break;
      default:
        startDate = now.subtract(6, 'day').startOf('day');
    }
    return entries.filter((e: any) => dayjs(e.date || e.created_at).isAfter(startDate));
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
          const category = e.category || 'General';
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
        legendFontColor: '#7F7F7F',
        legendFontSize: font(15),
      }))
      .sort((a, b) => b.population - a.population);

    return sortedData.length > 0 ? sortedData : [];
  }, [filteredEntries]);

  const seriesData = useMemo(() => {
    const format = filter === 'This Year' ? 'MMM' : 'DD MMM';
    const labels: string[] = [];
    const inData: number[] = [];
    const outData: number[] = [];

    if (filter !== 'This Year') {
      const now = dayjs();
      const days = filter === '7D' ? 7 : 30;
      const startDate = now.subtract(days - 1, 'day');
      for (let i = 0; i < days; i++) {
        const date = startDate.add(i, 'day');
        labels.push(date.format(format));
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
      const dateKey = dayjs(e.date || e.created_at).format(format);
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
          color: (opacity = 1) => `rgba(16, 185, 129, ${opacity})`,
          strokeWidth: 2,
        },
        {
          data: outData,
          color: (opacity = 1) => `rgba(239, 68, 68, ${opacity})`,
          strokeWidth: 2,
        },
      ],
    };
  }, [filteredEntries, filter]);

  if (isLoading || authLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  const StatCard = ({ title, value, color }: { title: string; value: number; color: string }) => (
    <View style={styles.statCard}>
      <Text style={styles.statTitle}>{title}</Text>
      <Text style={[styles.statValue, { color }]}>₹{value.toLocaleString('en-IN')}</Text>
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
        />
      );
    } catch (error) {
      return <Text style={styles.noDataText}>Error rendering chart.</Text>;
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.header}>Statistics</Text>

      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <Button
            key={f}
            title={f}
            type={filter === f ? 'solid' : 'outline'}
            onPress={() => setFilter(f)}
            buttonStyle={styles.filterButton}
            titleStyle={[styles.filterTitle, filter === f && styles.filterTitleActive]}
            containerStyle={styles.filterContainer}
          />
        ))}
      </View>

      <View style={styles.statsGrid}>
        <StatCard title="Total Income" value={stats.totalIn} color="#10B981" />
        <StatCard title="Total Expenses" value={stats.totalOut} color="#EF4444" />
        <StatCard
          title="Net Savings"
          value={stats.net}
          color={stats.net >= 0 ? '#2563EB' : '#EF4444'}
        />
      </View>

      <View style={styles.chartCard}>
        <Text style={styles.chartTitle}>Expense Breakdown</Text>
        {renderPieChart()}
      </View>

      <View style={styles.chartCard}>
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
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    fontSize: font(26),
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 16,
  },
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  filterContainer: {
    flex: 1,
    marginHorizontal: 4,
  },
  filterButton: {
    borderRadius: 10,
    borderColor: '#D1D5DB',
  },
  filterTitle: {
    fontSize: font(13),
    fontWeight: '600',
  },
  filterTitleActive: {
    color: '#FFFFFF',
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 12,
    marginHorizontal: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statTitle: {
    fontSize: font(13),
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 6,
  },
  statValue: {
    fontSize: font(18),
    fontWeight: 'bold',
  },
  chartCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chartTitle: {
    fontSize: font(17),
    fontWeight: 'bold',
    color: '#334155',
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  noDataText: {
    textAlign: 'center',
    paddingVertical: 40,
    color: '#64748B',
    fontSize: font(14),
  },
  chartStyle: {
    marginVertical: 8,
    borderRadius: 16,
  },
});

import React, { useMemo } from 'react';
import { View, StyleSheet, PixelRatio, Dimensions } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { Text } from '@rneui/themed';
import { colors } from '../../utils/design';

// --- PROPS ---
interface TrendPoint {
  label: string;
  value: number;
}

interface Props {
  data: TrendPoint[];
  height?: number;
  width?: number;
  currency?: string;
}

// --- UTILS ---
const fontScale = (size: number) => size / PixelRatio.getFontScale();

// Smart Formatter: Switches between Indian (L/Cr) and Int'l (K/M) based on currency
const formatValue = (val: number, currency: string = 'INR') => {
  const abs = Math.abs(val);
  if (abs === 0) return '0';

  if (currency === 'INR' || currency === '₹') {
    if (abs >= 10000000) return `${(val / 10000000).toFixed(1)}Cr`;
    if (abs >= 100000) return `${(val / 100000).toFixed(1)}L`;
  } else {
    // International Standard
    if (abs >= 1000000000) return `${(val / 1000000000).toFixed(1)}B`;
    if (abs >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
  }

  if (abs >= 1000) return `${(val / 1000).toFixed(0)}k`;
  return String(Math.round(val));
};

const DailyTrendChart = ({ data, height = 220, width, currency = 'INR' }: Props) => {
  const screenWidth = Dimensions.get('window').width;
  const chartWidth = width || screenWidth - 32;

  // 1. Prepare Data for Chart Kit
  const chartData = useMemo(() => {
    // Safety check for empty data
    if (!data || data.length === 0) return { labels: [], datasets: [{ data: [0] }] };

    // Smart X-axis label thinning: show up to 6 labels evenly spaced to avoid overlap
    const maxLabels = 6;
    const step = data.length <= maxLabels ? 1 : Math.ceil(data.length / (maxLabels - 1));
    const labels = data.map((d, i) => {
      // Derive a compact label: prefer day number to reduce width
      let raw = d.label || '';
      // If label looks like YYYY-MM-DD keep DD/MM
      const parts = String(raw).split('-');
      if (parts.length === 3) raw = `${parts[2]}/${parts[1]}`;
      // If label contains space (e.g., "01 Nov"), keep only the day part
      if (raw.includes(' ')) raw = String(raw).split(' ')[0];
      return i % step === 0 ? raw : '';
    });

    const values = data.map((d) => d.value);

    return {
      labels,
      datasets: [
        {
          data: values,
          color: (opacity = 1) => colors.primary || `rgba(99, 102, 241, ${opacity})`,
          strokeWidth: 2,
        },
      ],
    };
  }, [data]);

  // 2. Smart X-Axis filtering
  // Don't show every single date label if there are too many points.
  // Show max 6 labels evenly distributed.
  const hidePointsAtIndex = (index: number) => {
    if (data.length <= 6) return false; // Show all if few
    const step = Math.ceil(data.length / 5);
    return index % step !== 0;
  };

  if (!data || data.length === 0) {
    return (
      <View style={[styles.container, { height, width: chartWidth }]}>
        <Text style={styles.emptyText}>No trend data available</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <LineChart
        data={chartData}
        width={chartWidth}
        height={height}
        // 3. The Magic Prop for Short Values (1.2Cr, 50k)
        formatYLabel={(yValue) => formatValue(Number(yValue), currency)}
        // 4. Clean up X-Axis
        formatXLabel={(label) => {
          // If label is date (2024-01-01), show only DD or MMM
          const parts = label.split('-');
          if (parts.length === 3) return `${parts[2]}/${parts[1]}`; // DD/MM
          return label;
        }}
        chartConfig={{
          backgroundColor: '#ffffff',
          backgroundGradientFrom: '#ffffff',
          backgroundGradientTo: '#ffffff',
          decimalPlaces: 0,
          color: (opacity = 1) => `rgba(71, 85, 105, ${opacity})`, // Slate color
          labelColor: (opacity = 1) => `rgba(100, 116, 139, ${opacity})`,
          style: { borderRadius: 16 },
          propsForDots: { r: '0' }, // Hide dots for cleaner look on large datasets
          propsForBackgroundLines: { strokeDasharray: '4', stroke: '#E2E8F0' },
        }}
        bezier // Makes the line curved and smooth
        withVerticalLines={false}
        fromZero
        hidePointsAtIndex={
          data.length > 10
            ? Array.from({ length: data.length }, (_, i) => i).filter(
                (i) => i % Math.ceil(data.length / 5) !== 0
              )
            : []
        }
        style={{
          marginVertical: 8,
          borderRadius: 16,
          paddingRight: 40, // Add padding for Y-Axis text (e.g. "1.5Cr")
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
  },
  emptyText: {
    color: '#94A3B8',
    fontStyle: 'italic',
    fontSize: fontScale(12),
  },
});

export default DailyTrendChart;

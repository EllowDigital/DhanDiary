import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import { colors } from '../../utils/design';

type TrendPoint = {
  label: string;
  value: number;
};

type Props = {
  data: TrendPoint[];
  width: number;
  height?: number;
};

type ChartPoint = TrendPoint & {
  x: number;
  y: number;
};

const DailyTrendChart: React.FC<Props> = ({ data, width, height = 240 }) => {
  const { linePath, areaPath, baselinePath, gridLines, points, labelPoints, peakValue } =
    useMemo(() => {
      const topPadding = 16;
      const bottomPadding = 40;
      const horizontalPadding = 28;
      const drawableWidth = Math.max(1, width - horizontalPadding * 2);
      const drawableHeight = Math.max(1, height - (topPadding + bottomPadding));
      const values = (data || []).map((d) => d.value);
      const maxValue = Math.max(...values, 0);
      const safeMax = maxValue === 0 ? 1 : maxValue;
      const normalized = (data?.length || 0) - 1 || 1;

      const points: ChartPoint[] = (data || []).map((item, index) => {
        const x = horizontalPadding + (index / normalized) * drawableWidth;
        const ratio = item.value / safeMax;
        const y = topPadding + (1 - ratio) * drawableHeight;
        return { ...item, x, y };
      });

      const baselineY = topPadding + drawableHeight;
      let linePath = '';
      if (points.length > 0) {
        linePath = `M ${points[0].x} ${points[0].y}`;
        for (let i = 1; i < points.length; i++) {
          linePath += ` L ${points[i].x} ${points[i].y}`;
        }
      }

      const areaPath = points.length
        ? `${linePath} L ${points[points.length - 1].x} ${baselineY} L ${points[0].x} ${baselineY} Z`
        : '';

      const baselinePath = `M ${horizontalPadding} ${baselineY} H ${horizontalPadding + drawableWidth}`;

      const gridLines = [0.25, 0.5, 0.75].map((fraction) => ({
        d: `M ${horizontalPadding} ${topPadding + fraction * drawableHeight} H ${
          horizontalPadding + drawableWidth
        }`,
      }));

      const labelTargets = Math.min(6, points.length);
      const step = Math.max(1, Math.floor(points.length / labelTargets));
      const labelPoints = points.filter(
        (_, index) => index % step === 0 || index === points.length - 1
      );

      return {
        linePath,
        areaPath,
        baselinePath,
        gridLines,
        points,
        labelPoints,
        peakValue: maxValue,
      };
    }, [data, height, width]);

  if (!data || !data.length) return null;

  return (
    <View style={[styles.wrapper, { width, height }]}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={colors.accentRed} stopOpacity={0.4} />
            <Stop offset="100%" stopColor={colors.accentRed} stopOpacity={0.05} />
          </LinearGradient>
        </Defs>

        {gridLines.map((line, index) => (
          <Path
            key={`grid-${index}`}
            d={line.d}
            stroke={colors.border}
            strokeWidth={1}
            strokeDasharray="4 6"
          />
        ))}

        <Path d={baselinePath} stroke={colors.border} strokeWidth={1.5} />

        <Path d={areaPath} fill="url(#trendGradient)" />
        <Path
          d={linePath}
          stroke={colors.accentRed}
          strokeWidth={3}
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {points.map((point, index) => (
          <Circle
            key={`point-${index}`}
            cx={point.x}
            cy={point.y}
            r={point.value > 0 ? 4 : 3}
            fill={point.value === peakValue && peakValue > 0 ? colors.accentRed : '#fff'}
            stroke={colors.accentRed}
            strokeWidth={2}
          />
        ))}

        {labelPoints.map((point, index) => (
          <SvgText
            key={`label-${index}`}
            x={point.x}
            y={height - 12}
            fontSize={11}
            fill={colors.muted}
            textAnchor="middle"
          >
            {point.label}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    justifyContent: 'flex-end',
  },
});

export default DailyTrendChart;

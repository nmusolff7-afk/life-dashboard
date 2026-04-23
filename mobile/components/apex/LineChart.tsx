import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { useTokens } from '../../lib/theme';

export interface ChartPoint {
  x: number; // epoch ms or an ordinal index; we just use it for x-scaling
  y: number;
}

interface Props {
  data: ChartPoint[];
  /** Primary line color. */
  color: string;
  /** Height of the chart canvas in pixels. Width follows the container. */
  height?: number;
  /** Whether to overlay a simple linear-regression trend line. */
  showTrend?: boolean;
  /** Optional fixed y-axis min/max. Defaults to data range with 10% padding. */
  yMin?: number;
  yMax?: number;
  /** Short labels under the start / end of the x-axis (e.g. "7 days ago" / "today"). */
  startLabel?: string;
  endLabel?: string;
  /** Override the chart-area horizontal inset. */
  inset?: { left: number; right: number; top: number; bottom: number };
}

const DEFAULT_INSET = { left: 32, right: 12, top: 8, bottom: 18 };

/** Minimal SVG line chart. Keeps us off heavyweight chart libs for a handful
 *  of tiny trend cards. Renders x-axis by ordinal index of data points,
 *  assumes points are already sorted by date. */
export function LineChart({
  data,
  color,
  height = 140,
  showTrend = false,
  yMin,
  yMax,
  startLabel,
  endLabel,
  inset = DEFAULT_INSET,
}: Props) {
  const t = useTokens();
  // Measured by onLayout; default to 300 so it renders something on first tick.
  const width = 320;

  const { linePath, trendLine, pts, yScaleMin, yScaleMax } = useMemo(() => {
    if (data.length === 0) return { linePath: '', trendLine: null, pts: [], yScaleMin: 0, yScaleMax: 1 };

    const ys = data.map((d) => d.y);
    const minY = yMin ?? Math.min(...ys);
    const maxY = yMax ?? Math.max(...ys);
    const range = maxY - minY || 1;
    const padded = range * 0.1;
    const yLo = yMin ?? minY - padded;
    const yHi = yMax ?? maxY + padded;

    const plotW = width - inset.left - inset.right;
    const plotH = height - inset.top - inset.bottom;
    const xStep = data.length > 1 ? plotW / (data.length - 1) : 0;

    const pts = data.map((d, i) => {
      const x = inset.left + i * xStep;
      const y = inset.top + plotH - ((d.y - yLo) / (yHi - yLo)) * plotH;
      return { x, y };
    });

    const path = pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' ');

    // Linear regression for trend line.
    let trend = null;
    if (showTrend && data.length >= 2) {
      const n = data.length;
      const sumX = data.reduce((s, _, i) => s + i, 0);
      const sumY = ys.reduce((s, v) => s + v, 0);
      const sumXY = data.reduce((s, d, i) => s + i * d.y, 0);
      const sumX2 = data.reduce((s, _, i) => s + i * i, 0);
      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX || 1);
      const intercept = (sumY - slope * sumX) / n;
      const ySt = intercept;
      const yEnd = intercept + slope * (n - 1);
      const yStP = inset.top + plotH - ((ySt - yLo) / (yHi - yLo)) * plotH;
      const yEnP = inset.top + plotH - ((yEnd - yLo) / (yHi - yLo)) * plotH;
      trend = { x1: inset.left, y1: yStP, x2: inset.left + (n - 1) * xStep, y2: yEnP };
    }

    return { linePath: path, trendLine: trend, pts, yScaleMin: yLo, yScaleMax: yHi };
  }, [data, height, inset.bottom, inset.left, inset.right, inset.top, showTrend, yMax, yMin]);

  if (data.length === 0) {
    return (
      <View style={[styles.emptyWrap, { height }]}>
        <Text style={[styles.emptyText, { color: t.subtle }]}>No data yet.</Text>
      </View>
    );
  }

  // Y-axis ticks: min, mid, max.
  const ticks = [yScaleMax, (yScaleMax + yScaleMin) / 2, yScaleMin];

  return (
    <View>
      <Svg width={width} height={height}>
        {/* y-axis grid lines */}
        {ticks.map((tickVal, i) => {
          const plotH = height - inset.top - inset.bottom;
          const y = inset.top + (i * plotH) / 2;
          return (
            <Line
              key={i}
              x1={inset.left}
              y1={y}
              x2={width - inset.right}
              y2={y}
              stroke="rgba(255,255,255,0.05)"
              strokeWidth={1}
            />
          );
        })}

        {/* Line */}
        <Path d={linePath} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />

        {/* Trend */}
        {trendLine ? (
          <Line
            x1={trendLine.x1}
            y1={trendLine.y1}
            x2={trendLine.x2}
            y2={trendLine.y2}
            stroke={t.accent}
            strokeWidth={1.5}
            strokeDasharray="4 4"
            opacity={0.7}
          />
        ) : null}

        {/* Points (only if reasonably few, to avoid clutter) */}
        {data.length <= 30
          ? pts.map((p, i) => (
              <Circle key={i} cx={p.x} cy={p.y} r={2.5} fill={color} />
            ))
          : null}
      </Svg>

      {/* Y-axis value labels (absolute-positioned over the SVG) */}
      <View style={[styles.yLabels, { height: height - inset.top - inset.bottom, top: inset.top }]}>
        {ticks.map((v, i) => (
          <Text key={i} style={[styles.yLabel, { color: t.subtle }]}>
            {Math.round(v)}
          </Text>
        ))}
      </View>

      {(startLabel || endLabel) ? (
        <View style={styles.xLabels}>
          <Text style={[styles.xLabel, { color: t.subtle }]}>{startLabel}</Text>
          <Text style={[styles.xLabel, { color: t.subtle }]}>{endLabel}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  emptyWrap: { alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 13 },
  yLabels: {
    position: 'absolute',
    left: 0,
    width: 28,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  yLabel: { fontSize: 9, fontWeight: '500' },
  xLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
    paddingHorizontal: 4,
  },
  xLabel: { fontSize: 10, fontWeight: '500' },
});

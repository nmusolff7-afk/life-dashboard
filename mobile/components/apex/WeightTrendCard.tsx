import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useWeightHistory } from '../../lib/hooks/useHomeData';
import { useTokens } from '../../lib/theme';
import { LineChart, type ChartPoint } from './LineChart';
import { RangePills, type Range } from './RangePills';

export function WeightTrendCard() {
  const t = useTokens();
  const [range, setRange] = useState<Range>(30);
  const weight = useWeightHistory(range);

  const points: ChartPoint[] = useMemo(
    () => (weight.data ?? []).map((row, i) => ({ x: i, y: row.weight_lbs })),
    [weight.data],
  );

  const latest = points.length > 0 ? points[points.length - 1].y : null;
  const change = points.length >= 2 ? latest! - points[0].y : 0;
  const changeColor = change === 0 ? t.muted : change < 0 ? t.green : t.cal;

  return (
    <View style={[styles.card, { backgroundColor: t.surface, shadowColor: '#000' }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: t.muted }]}>Bodyweight</Text>
          <Text style={[styles.latest, { color: t.text }]}>
            {latest != null ? `${Math.round(latest)} ` : '— '}
            <Text style={[styles.unit, { color: t.muted }]}>lbs</Text>
          </Text>
          {points.length >= 2 ? (
            <Text style={[styles.change, { color: changeColor }]}>
              {change > 0 ? '+' : ''}
              {change.toFixed(1)} lbs over range
            </Text>
          ) : null}
        </View>
        <RangePills value={range} onChange={setRange} />
      </View>

      <LineChart
        data={points}
        color={t.accent}
        height={140}
        showTrend
        startLabel={weight.data?.[0]?.date}
        endLabel={weight.data?.[weight.data.length - 1]?.date}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 16,
    gap: 10,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 3,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  title: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.1 },
  latest: { fontSize: 22, fontWeight: '700', marginTop: 2 },
  unit: { fontSize: 11, fontWeight: '500' },
  change: { fontSize: 11, fontWeight: '600', marginTop: 2 },
});

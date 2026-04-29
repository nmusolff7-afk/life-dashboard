import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useWeightHistory } from '../../lib/hooks/useHomeData';
import { useTokens } from '../../lib/theme';
import { useUnits } from '../../lib/useUnits';
import { LineChart, type ChartPoint } from './LineChart';
import { RangePills, type Range } from './RangePills';

export function WeightTrendCard() {
  const t = useTokens();
  const units = useUnits();
  const [range, setRange] = useState<Range>(30);
  const weight = useWeightHistory(range);

  // Points are kept in canonical lbs (matches DB) so the chart's
  // y-scale is stable across unit toggles. The hero number + change
  // delta are formatted via useUnits for display.
  const points: ChartPoint[] = useMemo(
    () => (weight.data ?? []).map((row, i) => ({ x: i, y: row.weight_lbs })),
    [weight.data],
  );

  const latestLbs = points.length > 0 ? points[points.length - 1].y : null;
  const changeLbs = points.length >= 2 ? latestLbs! - points[0].y : 0;
  const changeColor = changeLbs === 0 ? t.muted : changeLbs < 0 ? t.green : t.cal;
  // Convert delta to display units. formatWeight handles lb↔kg.
  const changeDisplay = units.units === 'metric' ? changeLbs * 0.453592 : changeLbs;

  return (
    <View style={[styles.card, { backgroundColor: t.surface, shadowColor: '#000' }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: t.muted }]}>Bodyweight</Text>
          <Text style={[styles.latest, { color: t.text }]}>
            {latestLbs != null ? `${units.formatWeight(latestLbs, { round: true })} ` : '— '}
            <Text style={[styles.unit, { color: t.muted }]}>{units.weightUnit}</Text>
          </Text>
          {points.length >= 2 ? (
            <Text style={[styles.change, { color: changeColor }]}>
              {changeDisplay > 0 ? '+' : ''}
              {changeDisplay.toFixed(1)} {units.weightUnit} over range
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

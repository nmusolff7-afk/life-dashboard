import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useCalorieChart } from '../../lib/hooks/useHomeData';
import { useLiveCalorieBalance } from '../../lib/hooks/useLiveCalorieBalance';
import { useTokens } from '../../lib/theme';
import { LineChart, type ChartPoint } from './LineChart';
import { RangePills, type Range } from './RangePills';

/** Daily calories consumed, with the user's live goal intake drawn as a
 *  dashed overlay line. Goal intake = totalBurn + deficit; for historical
 *  comparison we draw today's live value as a reference, which is more
 *  honest than the stale stored user_goals.calorie_target. */
export function CaloriesConsumedChart() {
  const t = useTokens();
  const [range, setRange] = useState<Range>(30);
  const chart = useCalorieChart(range);
  const balance = useLiveCalorieBalance();

  const target = balance.goalIntake;

  const points: ChartPoint[] = useMemo(
    () => (chart.data ?? []).map((row, i) => ({ x: i, y: row.calories })),
    [chart.data],
  );

  const avg = points.length > 0 ? Math.round(points.reduce((s, p) => s + p.y, 0) / points.length) : 0;

  return (
    <View style={[styles.card, { backgroundColor: t.surface, shadowColor: '#000' }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: t.muted }]}>Calories consumed</Text>
          <Text style={[styles.value, { color: t.text }]}>
            {avg.toLocaleString()}{' '}
            <Text style={[styles.unit, { color: t.muted }]}>kcal/day avg</Text>
          </Text>
          {target ? (
            <Text style={[styles.targetLine, { color: t.accent }]}>
              Goal {Math.round(target).toLocaleString()} kcal
            </Text>
          ) : null}
        </View>
        <RangePills value={range} onChange={setRange} />
      </View>

      <LineChart
        data={points}
        color={t.cal}
        height={150}
        targetLine={target}
        targetColor={t.accent}
        startLabel={chart.data?.[0]?.date}
        endLabel={chart.data?.[chart.data.length - 1]?.date}
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
  value: { fontSize: 22, fontWeight: '700', marginTop: 2 },
  unit: { fontSize: 11, fontWeight: '500' },
  targetLine: { fontSize: 11, fontWeight: '600', marginTop: 2 },
});

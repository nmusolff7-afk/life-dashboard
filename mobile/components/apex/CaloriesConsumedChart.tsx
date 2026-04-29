import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useCalorieChart, useProfile } from '../../lib/hooks/useHomeData';
import { localToday } from '../../lib/localTime';
import { useTokens } from '../../lib/theme';
import { LineChart, type ChartPoint } from './LineChart';
import { RangePills, type Range } from './RangePills';

/** Daily calories consumed.
 *
 *  Target overlay (2026-04-28 fix): uses the user's STABLE
 *  `user_goals.calorie_target` from their profile, NOT the live
 *  `useLiveCalorieBalance.goalIntake`. The live goal drifts with
 *  today's workouts / yesterday's rollover / 7-day auto-adjust, which
 *  is correct for the live home tab but wrong for a historical chart
 *  where every past day had its own context.
 *
 *  Today's partial-day row is excluded from both the chart line and
 *  the average — including a half-day pulls the avg down and makes
 *  the chart's last point look anomalous. The label shows the actual
 *  count of logged days so the founder can read it accurately.
 */
export function CaloriesConsumedChart() {
  const t = useTokens();
  const [range, setRange] = useState<Range>(30);
  const chart = useCalorieChart(range);
  const profile = useProfile();

  const target = profile.data?.goal_targets?.calorie_target ?? null;

  // Drop today's partial-day row — a half-logged day skews the
  // historical view. The home / Today tab is where today's
  // partial intake is supposed to show.
  const today = localToday();
  const completedRows = useMemo(
    () => (chart.data ?? []).filter((row) => row.date !== today),
    [chart.data, today],
  );

  const points: ChartPoint[] = useMemo(
    () => completedRows.map((row, i) => ({ x: i, y: row.calories })),
    [completedRows],
  );

  const avg = points.length > 0
    ? Math.round(points.reduce((s, p) => s + p.y, 0) / points.length)
    : 0;
  const dayCount = completedRows.length;

  return (
    <View style={[styles.card, { backgroundColor: t.surface, shadowColor: '#000' }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: t.muted }]}>Calories consumed</Text>
          <Text style={[styles.value, { color: t.text }]}>
            {avg.toLocaleString()}{' '}
            <Text style={[styles.unit, { color: t.muted }]}>kcal/day avg</Text>
          </Text>
          <Text style={[styles.subline, { color: t.subtle }]}>
            {dayCount} logged day{dayCount === 1 ? '' : 's'}
            {target ? ` · target ${Math.round(target).toLocaleString()} kcal` : ''}
          </Text>
        </View>
        <RangePills value={range} onChange={setRange} />
      </View>

      <LineChart
        data={points}
        color={t.cal}
        height={150}
        targetLine={target}
        targetColor={t.accent}
        startLabel={completedRows[0]?.date}
        endLabel={completedRows[completedRows.length - 1]?.date}
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
  subline: { fontSize: 11, fontWeight: '500', marginTop: 2 },
});

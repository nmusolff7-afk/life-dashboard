import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { OCC_BASE, type Occupation } from '../../../shared/src/logic/neat';
import { computeTefFlat } from '../../../shared/src/logic/tef';
import { useBurnChart, useCalorieChart, useProfile } from '../../lib/hooks/useHomeData';
import { useTokens } from '../../lib/theme';
import { LineChart, type ChartPoint } from './LineChart';
import { RangePills, type Range } from './RangePills';

/** Net calories per day (intake − totalBurn). Zero-centered so actual-
 *  surplus days sit above the reference line and actual-deficit days sit
 *  below. TotalBurn is RMR + NEAT + EAT + TEF (historical approximation —
 *  see BurnTrendCard for the same reconstruction). Never just workout
 *  burn alone, which would make every day look like a massive surplus. */
export function CalorieBalanceChart() {
  const t = useTokens();
  const [range, setRange] = useState<Range>(30);
  const consumed = useCalorieChart(range);
  const burned = useBurnChart(range);
  const profile = useProfile();

  const { points, avgNet, dates } = useMemo(() => {
    const rmr = profile.data?.rmr_kcal ?? 0;
    const occ: Occupation = ((): Occupation => {
      const ws = profile.data?.work_style;
      return ws === 'standing' || ws === 'physical' ? ws : 'sedentary';
    })();
    const neatBase = OCC_BASE[occ];
    const byDate = new Map<string, { consumed: number; workout: number }>();
    (consumed.data ?? []).forEach((r) => {
      byDate.set(r.date, { consumed: r.calories, workout: 0 });
    });
    (burned.data ?? []).forEach((r) => {
      const existing = byDate.get(r.date);
      if (existing) existing.workout = r.total_burn;
      else byDate.set(r.date, { consumed: 0, workout: r.total_burn });
    });
    const sorted = [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const pts: ChartPoint[] = sorted.map(([, v], i) => {
      const tef = computeTefFlat(v.consumed);
      const totalBurn = rmr + neatBase + v.workout + tef;
      // Founder spec: net = intake − totalBurn (negative = actual deficit)
      return { x: i, y: v.consumed - totalBurn };
    });
    const sum = pts.reduce((s, p) => s + p.y, 0);
    const avg = pts.length > 0 ? sum / pts.length : 0;
    return { points: pts, avgNet: avg, dates: sorted.map(([d]) => d) };
  }, [consumed.data, burned.data, profile.data]);

  const avgColor = avgNet <= 0 ? t.green : t.danger;

  return (
    <View style={[styles.card, { backgroundColor: t.surface, shadowColor: '#000' }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: t.muted }]}>Daily calorie balance</Text>
          <Text style={[styles.value, { color: avgColor }]}>
            {avgNet >= 0 ? '+' : ''}{Math.round(avgNet).toLocaleString()}
            <Text style={[styles.unit, { color: t.muted }]}> avg net</Text>
          </Text>
        </View>
        <RangePills value={range} onChange={setRange} />
      </View>

      <LineChart
        data={points}
        color={avgColor}
        height={150}
        zeroLine
        startLabel={dates[0]}
        endLabel={dates[dates.length - 1]}
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
});

import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useBurnChart } from '../../lib/hooks/useHomeData';
import { useTokens } from '../../lib/theme';
import { LineChart, type ChartPoint } from './LineChart';
import { RangePills, type Range } from './RangePills';

/** Daily total calories burned over a range. */
export function BurnTrendCard() {
  const t = useTokens();
  const [range, setRange] = useState<Range>(30);
  const burn = useBurnChart(range);

  const points: ChartPoint[] = useMemo(
    () => (burn.data ?? []).map((row, i) => ({ x: i, y: row.total_burn })),
    [burn.data],
  );

  const totalOver = points.reduce((sum, p) => sum + p.y, 0);
  const avg = points.length > 0 ? Math.round(totalOver / points.length) : 0;

  return (
    <View style={[styles.card, { backgroundColor: t.surface, shadowColor: '#000' }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: t.muted }]}>Daily burn</Text>
          <Text style={[styles.avg, { color: t.text }]}>
            {avg.toLocaleString()} <Text style={[styles.avgUnit, { color: t.muted }]}>kcal/day avg</Text>
          </Text>
        </View>
        <RangePills value={range} onChange={setRange} />
      </View>

      <LineChart
        data={points}
        color={t.cal}
        height={140}
        startLabel={burn.data?.[0]?.date}
        endLabel={burn.data?.[burn.data.length - 1]?.date}
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
  avg: { fontSize: 22, fontWeight: '700', marginTop: 2 },
  avgUnit: { fontSize: 11, fontWeight: '500' },
});

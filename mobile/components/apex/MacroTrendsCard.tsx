import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { MacroChartPoint } from '../../../shared/src/types/home';
import { useMacroChart, useProfile } from '../../lib/hooks/useHomeData';
import { useTokens } from '../../lib/theme';
import { LineChart, type ChartPoint } from './LineChart';
import { RangePills, type Range } from './RangePills';

type MacroKey = 'protein_g' | 'carbs_g' | 'fat_g';

/** Three stacked micro-line-charts for daily macro trends. Share a single
 *  range picker at the top of the card. Each macro can show a dashed target
 *  overlay pulled from the user's profile goals. */
export function MacroTrendsCard() {
  const t = useTokens();
  const [range, setRange] = useState<Range>(30);
  const chart = useMacroChart(range);
  const profile = useProfile();

  const targets = profile.data?.goal_targets;
  const proteinTarget = targets?.protein_g ?? profile.data?.daily_protein_goal_g ?? null;
  const carbsTarget = targets?.carbs_g ?? null;
  const fatTarget = targets?.fat_g ?? null;

  const dates = chart.data?.map((r) => r.date) ?? [];
  const startLabel = dates[0];
  const endLabel = dates[dates.length - 1];

  return (
    <View style={[styles.card, { backgroundColor: t.surface, shadowColor: '#000' }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: t.muted }]}>Macro trends</Text>
        <RangePills value={range} onChange={setRange} />
      </View>

      <MacroSection
        label="Protein"
        color={t.protein}
        data={chart.data ?? []}
        field="protein_g"
        target={proteinTarget}
        startLabel={startLabel}
        endLabel={endLabel}
      />
      <View style={[styles.divider, { backgroundColor: 'rgba(255,255,255,0.04)' }]} />
      <MacroSection
        label="Carbs"
        color={t.carbs}
        data={chart.data ?? []}
        field="carbs_g"
        target={carbsTarget}
        startLabel={startLabel}
        endLabel={endLabel}
      />
      <View style={[styles.divider, { backgroundColor: 'rgba(255,255,255,0.04)' }]} />
      <MacroSection
        label="Fat"
        color={t.fat}
        data={chart.data ?? []}
        field="fat_g"
        target={fatTarget}
        startLabel={startLabel}
        endLabel={endLabel}
      />
    </View>
  );
}

function MacroSection({
  label,
  color,
  data,
  field,
  target,
  startLabel,
  endLabel,
}: {
  label: string;
  color: string;
  data: MacroChartPoint[];
  field: MacroKey;
  target: number | null;
  startLabel?: string;
  endLabel?: string;
}) {
  const t = useTokens();
  const points: ChartPoint[] = useMemo(
    () => data.map((row, i) => ({ x: i, y: row[field] })),
    [data, field],
  );
  const avg = points.length > 0
    ? Math.round(points.reduce((s, p) => s + p.y, 0) / points.length)
    : 0;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionLabel, { color }]}>{label}</Text>
        <Text style={[styles.avg, { color: t.text }]}>
          {avg}
          <Text style={[styles.avgUnit, { color: t.muted }]}>g/day avg</Text>
          {target ? (
            <Text style={[styles.target, { color: t.muted }]}>
              {'  '}· Target {Math.round(target)}g
            </Text>
          ) : null}
        </Text>
      </View>
      <LineChart
        data={points}
        color={color}
        height={90}
        targetLine={target}
        targetColor={color}
        startLabel={startLabel}
        endLabel={endLabel}
        inset={{ left: 30, right: 10, top: 4, bottom: 14 }}
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.1 },
  divider: { height: 1 },
  section: { gap: 4 },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sectionLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  avg: { fontSize: 13, fontWeight: '600' },
  avgUnit: { fontSize: 10, fontWeight: '500' },
  target: { fontSize: 10, fontWeight: '500' },
});

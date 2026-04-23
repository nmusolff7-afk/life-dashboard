import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useActivityCalendar } from '../../lib/hooks/useHomeData';
import { useTokens } from '../../lib/theme';
import { classifyWorkout, type WorkoutType } from '../../lib/workout';

type DayType = WorkoutType | 'rest';

function classifyDay(descriptions: string[]): DayType {
  if (descriptions.length === 0) return 'rest';
  const types = new Set(descriptions.map(classifyWorkout));
  if (types.has('strength') && types.has('cardio')) return 'mixed';
  if (types.size === 1) return [...types][0] as WorkoutType;
  return 'mixed';
}

function daysBackIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function monthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short' });
}

/** 90-day calendar grid. Each cell = one day, colored by workout type.
 *  strength = fitness green, cardio = blue, mixed = accent, rest = muted. */
export function ActivityCalendar() {
  const t = useTokens();
  const { data } = useActivityCalendar(90);

  const byDate = useMemo(() => {
    const map = new Map<string, string[]>();
    (data ?? []).forEach((row) => map.set(row.date, row.descriptions));
    return map;
  }, [data]);

  // Build 90 cells, oldest first. We bucket into columns of 7 (a week).
  const cells = useMemo(() => {
    const out: { date: string; type: DayType }[] = [];
    for (let i = 89; i >= 0; i--) {
      const date = daysBackIso(i);
      const descs = byDate.get(date) ?? [];
      out.push({ date, type: classifyDay(descs) });
    }
    return out;
  }, [byDate]);

  // Mark month boundaries for axis labels.
  const monthBreaks = useMemo(() => {
    const seen = new Set<string>();
    const out: { index: number; label: string }[] = [];
    cells.forEach((c, i) => {
      const key = c.date.slice(0, 7);
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ index: i, label: monthLabel(c.date) });
      }
    });
    return out;
  }, [cells]);

  // Use Flask's activity-calendar tokens verbatim (tokens.ts calStrength etc).
  const colorFor = (type: DayType) => {
    switch (type) {
      case 'strength': return t.calStrength;
      case 'cardio':   return t.calCardio;
      case 'mixed':    return t.calBoth;
      default:         return t.calRest;
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: t.surface, shadowColor: '#000' }]}>
      <Text style={[styles.title, { color: t.muted }]}>Activity calendar</Text>

      <View style={styles.months}>
        {monthBreaks.map((mb) => (
          <Text key={mb.index} style={[styles.monthLabel, { color: t.subtle, left: mb.index * (CELL + GAP) }]}>
            {mb.label}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((c) => (
          <View
            key={c.date}
            style={[
              styles.cell,
              { backgroundColor: colorFor(c.type) },
            ]}
          />
        ))}
      </View>

      <View style={styles.legend}>
        <LegendDot color={t.calStrength} label="Strength" />
        <LegendDot color={t.calCardio} label="Cardio" />
        <LegendDot color={t.calBoth} label="Mixed" />
        <LegendDot color={t.calRest} label="Rest" border={t.border} />
      </View>
    </View>
  );
}

function LegendDot({ color, label, border }: { color: string; label: string; border?: string }) {
  const t = useTokens();
  return (
    <View style={styles.legendItem}>
      <View
        style={[
          styles.legendSwatch,
          { backgroundColor: color, borderColor: border ?? 'transparent', borderWidth: border ? 1 : 0 },
        ]}
      />
      <Text style={[styles.legendLabel, { color: t.muted }]}>{label}</Text>
    </View>
  );
}

const CELL = 10;
const GAP = 3;
// 90 cells at 10+3 = 13 each → 1170 total, scrolls horizontally via parent if needed.

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
  title: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.1 },

  months: { position: 'relative', height: 12 },
  monthLabel: { position: 'absolute', fontSize: 9, fontWeight: '500' },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },
  cell: {
    width: CELL,
    height: CELL,
    borderRadius: 2,
  },

  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 10, height: 10, borderRadius: 2 },
  legendLabel: { fontSize: 10, fontWeight: '500' },
});

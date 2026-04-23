import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useActivityCalendar } from '../../lib/hooks/useHomeData';
import { useTokens } from '../../lib/theme';
import { classifyWorkout, type WorkoutType } from '../../lib/workout';

type DayType = WorkoutType | 'rest' | 'none';

const DOW = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function classifyDay(descriptions: string[]): DayType {
  if (descriptions.length === 0) return 'none';
  const types = new Set(descriptions.map(classifyWorkout));
  if (types.has('strength') && types.has('cardio')) return 'mixed';
  if (types.size === 1) return [...types][0] as WorkoutType;
  return 'mixed';
}

function dateToIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Days-since-Monday for a Date (Mon=0, Sun=6). */
function mondayOffset(d: Date): number {
  return (d.getDay() + 6) % 7;
}

/** Ports Flask's Progress-tab Activity Calendar (templates/index.html
 *  `buildActivityCalendar()`): 6-week × 7-column month grid ending on the
 *  week containing today, with Monday-first day-of-week headers and workout-
 *  type colored cells. Tap a cell to open that day's detail view. */
export function ActivityCalendar() {
  const t = useTokens();
  const router = useRouter();
  const { data } = useActivityCalendar(90);

  const byDate = useMemo(() => {
    const map = new Map<string, string[]>();
    (data ?? []).forEach((row) => map.set(row.date, row.descriptions));
    return map;
  }, [data]);

  const { weeks, todayIso } = useMemo(() => {
    // Find the Monday of the week 5 weeks before today's week — 6 total weeks.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfThisWeek = new Date(today);
    startOfThisWeek.setDate(today.getDate() - mondayOffset(today));
    const gridStart = new Date(startOfThisWeek);
    gridStart.setDate(startOfThisWeek.getDate() - 7 * 5);

    const rows: { iso: string; dayOfMonth: number; type: DayType; isFuture: boolean }[][] = [];
    for (let w = 0; w < 6; w++) {
      const row: typeof rows[number] = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(gridStart);
        date.setDate(gridStart.getDate() + w * 7 + d);
        const iso = dateToIso(date);
        const isFuture = date.getTime() > today.getTime();
        row.push({
          iso,
          dayOfMonth: date.getDate(),
          type: isFuture ? 'none' : classifyDay(byDate.get(iso) ?? (date.getTime() === today.getTime() ? [] : [])),
          isFuture,
        });
      }
      rows.push(row);
    }

    // Mark rest days: past days with no workout. "none" stays for future cells.
    rows.forEach((row) =>
      row.forEach((cell) => {
        if (cell.type === 'none' && !cell.isFuture) cell.type = 'rest';
      }),
    );

    return { weeks: rows, todayIso: dateToIso(today) };
  }, [byDate]);

  const colorFor = (type: DayType) => {
    switch (type) {
      case 'strength': return t.calStrength;
      case 'cardio':   return t.calCardio;
      case 'mixed':    return t.calBoth;
      case 'rest':     return t.calRest;
      default:         return 'transparent';
    }
  };
  const textColorFor = (type: DayType, isFuture: boolean) => {
    if (isFuture) return t.subtle;
    if (type === 'rest' || type === 'none') return t.muted;
    return '#FFFFFF';
  };

  return (
    <View style={[styles.card, { backgroundColor: t.surface, shadowColor: '#000' }]}>
      <Text style={[styles.title, { color: t.muted }]}>Activity calendar</Text>

      <View style={styles.dows}>
        {DOW.map((label) => (
          <Text key={label} style={[styles.dowLabel, { color: t.muted }]}>
            {label}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {weeks.map((row, wi) => (
          <View key={wi} style={styles.weekRow}>
            {row.map((cell) => (
              <Pressable
                key={cell.iso}
                onPress={() =>
                  cell.isFuture ? null : router.push({ pathname: '/day/[date]', params: { date: cell.iso } })
                }
                style={[
                  styles.cell,
                  {
                    backgroundColor: colorFor(cell.type),
                    borderColor: cell.iso === todayIso ? t.text : cell.type === 'none' ? t.border : 'transparent',
                    borderWidth: cell.iso === todayIso ? 1.5 : cell.type === 'none' ? 1 : 0,
                    opacity: cell.isFuture ? 0.5 : 1,
                  },
                ]}>
                <Text
                  style={[
                    styles.cellText,
                    { color: textColorFor(cell.type, cell.isFuture), fontWeight: cell.iso === todayIso ? '800' : '700' },
                  ]}>
                  {cell.dayOfMonth}
                </Text>
              </Pressable>
            ))}
          </View>
        ))}
      </View>

      <View style={styles.legend}>
        <LegendDot color={t.calStrength} label="Strength" />
        <LegendDot color={t.calCardio} label="Cardio" />
        <LegendDot color={t.calBoth} label="Mixed" />
        <LegendDot color={t.calRest} label="Rest" />
        <LegendDot color="transparent" label="No data" border={t.border} />
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

const CELL_GAP = 4;

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

  dows: { flexDirection: 'row', paddingHorizontal: 2, gap: CELL_GAP },
  dowLabel: { flex: 1, fontSize: 10, fontWeight: '600', textAlign: 'center' },

  grid: { gap: CELL_GAP },
  weekRow: { flexDirection: 'row', gap: CELL_GAP },
  cell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellText: { fontSize: 11 },

  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 10, height: 10, borderRadius: 3 },
  legendLabel: { fontSize: 10, fontWeight: '500' },
});

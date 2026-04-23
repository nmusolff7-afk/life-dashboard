import { useRouter } from 'expo-router';
import { useMemo, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useActivityCalendar } from '../../lib/hooks/useHomeData';
import { useTokens } from '../../lib/theme';
import { classifyWorkout, type WorkoutType } from '../../lib/workout';

type DayType = WorkoutType | 'rest';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

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

function dayFields(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return { dow: DOW[dt.getUTCDay()], date: d };
}

/** Mirrors Flask's #streak-bar exactly — 28px circles with day-of-week label
 *  above and the date number inside. Colored by workout type (strength /
 *  cardio / mixed) instead of Flask's binary logged/not, because the Fitness
 *  calendar is workout-specific. Horizontal scroll, auto-snaps to today on
 *  mount. Tap a day opens the day detail route. */
export function ActivityCalendar() {
  const t = useTokens();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const { data } = useActivityCalendar(90);

  const byDate = useMemo(() => {
    const map = new Map<string, string[]>();
    (data ?? []).forEach((row) => map.set(row.date, row.descriptions));
    return map;
  }, [data]);

  const days = useMemo(() => {
    const out: { iso: string; type: DayType; isToday: boolean }[] = [];
    const todayIso = daysBackIso(0);
    for (let i = 89; i >= 0; i--) {
      const iso = daysBackIso(i);
      out.push({ iso, type: classifyDay(byDate.get(iso) ?? []), isToday: iso === todayIso });
    }
    return out;
  }, [byDate]);

  const colorFor = (type: DayType) => {
    switch (type) {
      case 'strength': return t.calStrength;
      case 'cardio':   return t.calCardio;
      case 'mixed':    return t.calBoth;
      default:         return t.calRest;
    }
  };
  const textColorFor = (type: DayType) =>
    type === 'rest' ? t.muted : '#FFFFFF';

  return (
    <View style={[styles.card, { backgroundColor: t.surface, shadowColor: '#000' }]}>
      <Text style={[styles.title, { color: t.muted }]}>Activity calendar</Text>

      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onContentSizeChange={(w) => scrollRef.current?.scrollTo({ x: w, animated: false })}
        contentContainerStyle={styles.strip}>
        {days.map((d) => {
          const { dow, date } = dayFields(d.iso);
          return (
            <Pressable
              key={d.iso}
              onPress={() => router.push({ pathname: '/day/[date]', params: { date: d.iso } })}
              style={styles.dayCol}
              hitSlop={3}
              accessibilityRole="button"
              accessibilityLabel={`${d.iso}, ${d.type === 'rest' ? 'rest day' : d.type + ' workout'}`}>
              <Text style={[styles.dowLabel, { color: t.muted }]}>{dow}</Text>
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor: colorFor(d.type),
                    borderColor: d.isToday ? t.text : 'transparent',
                    borderWidth: d.isToday ? 2 : 0,
                  },
                ]}>
                <Text
                  style={[
                    styles.dotText,
                    { color: textColorFor(d.type), fontWeight: d.isToday ? '800' : '700' },
                  ]}>
                  {date}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

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

  strip: { gap: 6, paddingVertical: 4, alignItems: 'center' },
  dayCol: { alignItems: 'center', gap: 2, minWidth: 28 },
  dowLabel: { fontSize: 9, fontWeight: '500' },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotText: { fontSize: 11 },

  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { fontSize: 10, fontWeight: '500' },
});

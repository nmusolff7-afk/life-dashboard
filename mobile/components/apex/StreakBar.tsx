import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { computeStreak, type DailyEntry } from '../../../shared/src/logic/streak';
import { useTokens } from '../../lib/theme';

interface Props {
  /** Dates (YYYY-MM-DD) that count as "logged". */
  loggedDates: Set<string>;
  today: string;
  days?: number; // default 90
}

function subDaysIso(dateIso: string, n: number): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - n);
  return dt.toISOString().slice(0, 10);
}

export function StreakBar({ loggedDates, today, days = 90 }: Props) {
  const t = useTokens();
  const router = useRouter();

  // Oldest on the left, today on the right.
  const dates = useMemo(
    () => Array.from({ length: days }, (_, i) => subDaysIso(today, days - 1 - i)),
    [days, today],
  );

  // Build entries that satisfy streak.isLogged (we encode loggedness as calories: 1).
  const streak = useMemo(() => {
    const log: Record<string, DailyEntry> = {};
    loggedDates.forEach((d) => {
      log[d] = { calories: 1 };
    });
    return computeStreak({ dailyLog: log, today });
  }, [loggedDates, today]);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={[styles.label, { color: t.muted }]}>{days}-day streak</Text>
        <View style={styles.counter}>
          <Text style={styles.flame}>🔥</Text>
          <Text style={[styles.count, { color: streak > 0 ? t.cal : t.subtle }]}>{streak}</Text>
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}>
        {dates.map((d) => {
          const logged = loggedDates.has(d);
          const isToday = d === today;
          return (
            <Pressable
              key={d}
              onPress={() => router.push({ pathname: '/day/[date]', params: { date: d } })}
              hitSlop={6}
              style={[
                styles.dot,
                {
                  backgroundColor: logged ? t.green : t.surface2,
                  borderColor: isToday ? t.text : 'transparent',
                  borderWidth: isToday ? 2 : 0,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${d}${logged ? ', logged' : ''}${isToday ? ', today' : ''}`}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16 },
  label: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  counter: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  flame: { fontSize: 14 },
  count: { fontSize: 15, fontWeight: '700' },
  strip: { gap: 4, paddingHorizontal: 16, paddingVertical: 4 },
  dot: { width: 14, height: 28, borderRadius: 3 },
});

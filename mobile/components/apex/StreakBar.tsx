import { useRouter } from 'expo-router';
import { useMemo, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { computeStreak, type DailyEntry } from '../../../shared/src/logic/streak';
import { useTokens } from '../../lib/theme';

interface Props {
  /** Dates (YYYY-MM-DD) that count as "logged". */
  loggedDates: Set<string>;
  today: string;
  days?: number;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function subDaysIso(dateIso: string, n: number): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - n);
  return dt.toISOString().slice(0, 10);
}

function dayOfMonth(iso: string): string {
  return String(parseInt(iso.slice(8, 10), 10));
}

function dayOfWeek(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export function StreakBar({ loggedDates, today, days = 90 }: Props) {
  const t = useTokens();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);

  const dates = useMemo(
    () => Array.from({ length: days }, (_, i) => subDaysIso(today, days - 1 - i)),
    [days, today],
  );

  const streak = useMemo(() => {
    const log: Record<string, DailyEntry> = {};
    loggedDates.forEach((d) => {
      log[d] = { calories: 1 };
    });
    return computeStreak({ dailyLog: log, today });
  }, [loggedDates, today]);

  return (
    <View style={styles.wrap}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
        onContentSizeChange={(w) => scrollRef.current?.scrollTo({ x: w, animated: false })}>
        {dates.map((d) => {
          const logged = loggedDates.has(d);
          const isToday = d === today;
          return (
            <Pressable
              key={d}
              onPress={() => router.push({ pathname: '/day/[date]', params: { date: d } })}
              hitSlop={4}
              style={styles.dayCol}
              accessibilityRole="button"
              accessibilityLabel={`${d}${logged ? ', logged' : ''}${isToday ? ', today' : ''}`}>
              <Text style={[styles.dowLabel, { color: t.muted }]}>{dayOfWeek(d)}</Text>
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor: logged ? t.green : t.surface2,
                    borderColor: isToday ? t.text : 'transparent',
                    borderWidth: isToday ? 2 : 0,
                  },
                ]}>
                <Text
                  style={[
                    styles.dotText,
                    { color: logged ? '#FFFFFF' : t.muted, fontWeight: isToday ? '700' : '500' },
                  ]}>
                  {dayOfMonth(d)}
                </Text>
              </View>
            </Pressable>
          );
        })}
        <View style={styles.flameWrap}>
          <Text style={styles.flame}>🔥</Text>
          <Text style={[styles.flameCount, { color: streak > 0 ? t.text : t.muted }]}>
            {streak}d
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 4 },
  strip: { gap: 6, paddingHorizontal: 16, paddingVertical: 4, alignItems: 'center' },
  dayCol: { alignItems: 'center', gap: 2 },
  dowLabel: { fontSize: 9, fontWeight: '500' },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotText: { fontSize: 11 },
  flameWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 10,
    paddingRight: 4,
  },
  flame: { fontSize: 18 },
  flameCount: { fontSize: 14, fontWeight: '600' },
});

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
  /** Compact mode — just flame stacked over streak count; used when
   *  nested inside TabHeader's right slot. */
  compact?: boolean;
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

export function StreakBar({ loggedDates, today, days = 90, compact }: Props) {
  const t = useTokens();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);

  const streak = useMemo(() => {
    const log: Record<string, DailyEntry> = {};
    loggedDates.forEach((d) => {
      log[d] = { calories: 1 };
    });
    return computeStreak({ dailyLog: log, today });
  }, [loggedDates, today]);

  if (compact) {
    // Inline-in-TabHeader variant: flame icon with streak-day number
    // stacked immediately below per founder's spec. Tap opens today's
    // day detail.
    return (
      <Pressable
        onPress={() => router.push({ pathname: '/day/[date]', params: { date: today } })}
        accessibilityRole="button"
        accessibilityLabel={`Streak ${streak} days`}
        style={styles.compactWrap}>
        <Text style={styles.compactFlame}>🔥</Text>
        <Text style={[styles.compactCount, { color: streak > 0 ? t.text : t.muted }]}>
          {streak}
        </Text>
      </Pressable>
    );
  }

  const dates = Array.from({ length: days }, (_, i) => subDaysIso(today, days - 1 - i));

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
        {/* Flame with streak count stacked below — matches the compact
            variant's vertical layout so the 90-day strip and the header
            streak widget read the same. */}
        <View style={styles.flameWrap}>
          <Text style={styles.flame}>🔥</Text>
          <Text style={[styles.flameCount, { color: streak > 0 ? t.text : t.muted }]}>
            {streak}
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
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 10,
    paddingRight: 4,
    gap: 0,
  },
  flame: { fontSize: 18 },
  flameCount: { fontSize: 11, fontWeight: '700', lineHeight: 13 },

  compactWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
    paddingHorizontal: 4,
  },
  compactFlame: { fontSize: 24, lineHeight: 26 },
  compactCount: { fontSize: 13, fontWeight: '700', lineHeight: 15 },
});

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
  /** 'sm' is the header-inline variant — smaller dots, no day-of-week
   *  labels, tighter spacing so it fits next to the tab title. 'md' is
   *  the standalone body-width variant. */
  size?: 'sm' | 'md';
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

export function StreakBar({ loggedDates, today, days = 90, size = 'md' }: Props) {
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

  const dates = Array.from({ length: days }, (_, i) => subDaysIso(today, days - 1 - i));
  const dotSize = size === 'sm' ? 22 : 28;
  const dotRadius = dotSize / 2;
  const showDow = size === 'md';

  return (
    <View style={size === 'sm' ? styles.wrapSm : styles.wrapMd}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={size === 'sm' ? styles.stripSm : styles.stripMd}
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
              {showDow ? (
                <Text style={[styles.dowLabel, { color: t.muted }]}>{dayOfWeek(d)}</Text>
              ) : null}
              <View
                style={[
                  {
                    width: dotSize,
                    height: dotSize,
                    borderRadius: dotRadius,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: logged ? t.green : t.surface2,
                    borderColor: isToday ? t.text : 'transparent',
                    borderWidth: isToday ? 2 : 0,
                  },
                ]}>
                <Text
                  style={[
                    size === 'sm' ? styles.dotTextSm : styles.dotTextMd,
                    { color: logged ? '#FFFFFF' : t.muted, fontWeight: isToday ? '700' : '500' },
                  ]}>
                  {dayOfMonth(d)}
                </Text>
              </View>
            </Pressable>
          );
        })}
        <View style={size === 'sm' ? styles.flameWrapSm : styles.flameWrapMd}>
          <Text style={size === 'sm' ? styles.flameSm : styles.flameMd}>🔥</Text>
          <Text
            style={[
              size === 'sm' ? styles.flameCountSm : styles.flameCountMd,
              { color: streak > 0 ? t.text : t.muted },
            ]}>
            {streak}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapMd: { marginBottom: 4 },
  wrapSm: { flex: 1 },
  stripMd: { gap: 6, paddingHorizontal: 16, paddingVertical: 4, alignItems: 'center' },
  stripSm: { gap: 4, paddingLeft: 8, paddingVertical: 2, alignItems: 'center' },
  dayCol: { alignItems: 'center', gap: 2 },
  dowLabel: { fontSize: 9, fontWeight: '500' },
  dotTextMd: { fontSize: 11 },
  dotTextSm: { fontSize: 10 },

  flameWrapMd: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 10,
    paddingRight: 4,
  },
  flameWrapSm: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 6,
    paddingRight: 2,
  },
  flameMd: { fontSize: 18 },
  flameSm: { fontSize: 16 },
  flameCountMd: { fontSize: 11, fontWeight: '700', lineHeight: 13 },
  flameCountSm: { fontSize: 10, fontWeight: '700', lineHeight: 12 },
});

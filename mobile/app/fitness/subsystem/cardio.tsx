import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { WorkoutDetailModal } from '../../../components/apex';
import { useWorkoutHistory } from '../../../lib/hooks/useHomeData';
import { useWorkoutPlan } from '../../../lib/hooks/useWorkoutPlan';
import { useTokens } from '../../../lib/theme';

import { classifyAsCardio, estimateCardioDuration } from '../../../lib/cardioHelpers';

import type { Workout } from '../../../../shared/src/types/home';
import type { DayName } from '../../../../shared/src/types/plan';

const DAYS: DayName[] = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
];

/** Cardio subsystem — weekly cardio-minutes trend + recent activity list.
 *  HR-zone breakdown deferred until HealthKit wiring (Phase 6). */
export default function CardioDetail() {
  const t = useTokens();
  const history = useWorkoutHistory(90);
  const planState = useWorkoutPlan();
  const [detailWorkout, setDetailWorkout] = useState<Workout | null>(null);

  const cardioSessions = useMemo(
    () => (history.data ?? []).filter((w) => classifyAsCardio(w.description ?? '')),
    [history.data],
  );

  const weekly = useMemo(() => computeWeeklyMinutes(cardioSessions), [cardioSessions]);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen
        options={{
          title: 'Cardio',
          headerStyle: { backgroundColor: t.bg },
          headerTintColor: t.text,
          headerShadowVisible: false,
        }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Scheduled cardio days from the active plan. */}
        {planState.plan ? (
          <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={[styles.cardTitle, { color: t.muted }]}>Weekly schedule</Text>
            {DAYS.map((d) => {
              const cardio = planState.plan?.plan.weeklyPlan[d]?.cardio?.type?.trim();
              return (
                <View key={d} style={[styles.planRow, { borderBottomColor: t.border }]}>
                  <Text style={[styles.planDay, { color: t.accent }]}>{d.slice(0, 3)}</Text>
                  <Text style={[styles.planBody, { color: t.text }]} numberOfLines={1}>
                    {cardio || <Text style={{ color: t.subtle }}>Rest</Text>}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}

        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text style={[styles.cardTitle, { color: t.muted }]}>Weekly cardio</Text>
          <Text style={[styles.bigValue, { color: t.text }]}>
            {weekly.thisWeek}
            <Text style={[styles.bigUnit, { color: t.muted }]}> min this week</Text>
          </Text>
          <Text style={[styles.hint, { color: t.subtle }]}>
            8-week average: {weekly.avg} min/week
          </Text>
          <View style={styles.weeklyBars}>
            {weekly.buckets.map((b, i) => {
              const pct = weekly.max > 0 ? Math.min(1, b.minutes / weekly.max) : 0;
              return (
                <View key={i} style={styles.weeklyBarCol}>
                  <View style={styles.weeklyBarTrack}>
                    <View
                      style={[
                        styles.weeklyBarFill,
                        { backgroundColor: t.fitness, height: `${pct * 100}%` },
                      ]}
                    />
                  </View>
                  <Text style={[styles.weeklyBarLabel, { color: t.subtle }]}>{b.label}</Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text style={[styles.cardTitle, { color: t.muted }]}>Heart rate zones</Text>
          <Text style={[styles.empty, { color: t.muted }]}>
            Connect Apple Health to see zone breakdown from logged sessions.
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text style={[styles.cardTitle, { color: t.muted }]}>Recent cardio</Text>
          {cardioSessions.length === 0 ? (
            <Text style={[styles.empty, { color: t.muted }]}>
              No cardio in the last 90 days.
            </Text>
          ) : (
            cardioSessions.slice(0, 10).map((w, i) => {
              const mins = estimateCardioDuration(w.description ?? '');
              return (
                <Pressable
                  key={`${w.log_date}-${i}`}
                  onPress={() => {
                    if (w.strava_activity_id) {
                      router.push({
                        pathname: '/fitness/strava-activity/[id]',
                        params: { id: w.strava_activity_id, name: w.description },
                      });
                    } else {
                      setDetailWorkout(w);
                    }
                  }}
                  style={({ pressed }) => [
                    styles.session,
                    { borderBottomColor: t.border, opacity: pressed ? 0.6 : 1 },
                  ]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.sessionDesc, { color: t.text }]} numberOfLines={2}>
                      {w.description}
                      {w.strava_activity_id ? ' 🏃' : ''}
                    </Text>
                    <Text style={[styles.sessionMeta, { color: t.muted }]}>
                      {w.log_date}
                      {mins > 0 ? ` · ${mins} min` : ''}
                    </Text>
                  </View>
                  <Text style={[styles.sessionKcal, { color: t.fitness }]}>
                    {w.calories_burned ?? 0} kcal
                  </Text>
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>

      <WorkoutDetailModal
        workout={detailWorkout}
        onClose={() => setDetailWorkout(null)}
        onChanged={() => history.refetch()}
      />
    </View>
  );
}

function computeWeeklyMinutes(sessions: Array<{ log_date: string; description: string | null }>) {
  const now = new Date();
  const buckets: Array<{ label: string; start: string; end: string; minutes: number }> = [];
  for (let i = 7; i >= 0; i--) {
    const end = new Date(now);
    end.setDate(end.getDate() - i * 7);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    buckets.push({
      label: `W${8 - i}`,
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
      minutes: 0,
    });
  }
  sessions.forEach((s) => {
    const mins = estimateCardioDuration(s.description ?? '');
    const b = buckets.find((x) => s.log_date >= x.start && s.log_date <= x.end);
    if (b) b.minutes += mins;
  });
  const thisWeek = buckets[buckets.length - 1]?.minutes ?? 0;
  const avg = buckets.length > 0
    ? Math.round(buckets.reduce((s, b) => s + b.minutes, 0) / buckets.length)
    : 0;
  const max = Math.max(1, ...buckets.map((b) => b.minutes));
  return { buckets, thisWeek, avg, max };
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40, gap: 14 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  cardTitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  bigValue: { fontSize: 22, fontWeight: '700' },
  bigUnit: { fontSize: 12, fontWeight: '500' },
  hint: { fontSize: 12 },
  weeklyBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 100,
    gap: 8,
    marginTop: 6,
  },
  weeklyBarCol: { flex: 1, alignItems: 'center', gap: 4 },
  weeklyBarTrack: { width: '100%', height: 80, justifyContent: 'flex-end' },
  weeklyBarFill: { width: '100%', borderRadius: 4, minHeight: 2 },
  weeklyBarLabel: { fontSize: 10, fontWeight: '600' },
  session: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  sessionDesc: { fontSize: 13, lineHeight: 17 },
  sessionMeta: { fontSize: 11 },
  sessionKcal: { fontSize: 13, fontWeight: '700' },
  empty: { fontSize: 12, padding: 12, textAlign: 'center' },
  planRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  planDay: { fontSize: 12, fontWeight: '700', minWidth: 32 },
  planBody: { fontSize: 12, flex: 1, lineHeight: 17 },
});

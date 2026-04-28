import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { WorkoutDetailModal } from '../../../components/apex';
import { useWorkoutHistory } from '../../../lib/hooks/useHomeData';
import { useWorkoutPlan } from '../../../lib/hooks/useWorkoutPlan';
import { useTokens } from '../../../lib/theme';

import { classifyAsStrength, parseDescription, strength_weekly_volume_label } from '../../../lib/strengthHelpers';

import type { Workout } from '../../../../shared/src/types/home';
import type { DayName } from '../../../../shared/src/types/plan';

const DAYS: DayName[] = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
];

/** Strength subsystem detail — weekly volume trend + recent strength
 *  sessions. Per-lift PR charts require per-set data that lives server-
 *  side in strength_sets; this screen reads descriptions directly and
 *  classifies client-side to unblock the MVP. Phase 6/7 can swap in the
 *  real strength_sets fetch for deeper PR detection. */
export default function StrengthDetail() {
  const t = useTokens();
  const history = useWorkoutHistory(90);
  const planState = useWorkoutPlan();
  const [detailWorkout, setDetailWorkout] = useState<Workout | null>(null);

  const strengthSessions = useMemo(
    () => (history.data ?? []).filter((w) => classifyAsStrength(w.description ?? '')),
    [history.data],
  );

  // Weekly volume bar-chart data — sum by week for the last 8 weeks.
  const weeklyVolume = useMemo(() => computeWeeklyVolume(strengthSessions), [strengthSessions]);

  if (history.loading) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen
        options={{
          title: 'Strength',
          headerStyle: { backgroundColor: t.bg },
          headerTintColor: t.text,
          headerShadowVisible: false,
        }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Scheduled strength days from the active plan. Shown above
            the volume card so the user sees what's coming. */}
        {planState.plan ? (
          <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={[styles.cardTitle, { color: t.muted }]}>Weekly schedule</Text>
            {DAYS.map((d) => {
              const day = planState.plan?.plan.weeklyPlan[d];
              const exs = day?.exercises ?? [];
              return (
                <View key={d} style={[styles.planRow, { borderBottomColor: t.border }]}>
                  <Text style={[styles.planDay, { color: t.accent }]}>{d.slice(0, 3)}</Text>
                  <Text style={[styles.planBody, { color: t.text }]} numberOfLines={2}>
                    {exs.length === 0 ? (
                      <Text style={{ color: t.subtle }}>Rest / no strength</Text>
                    ) : exs.map((e) => `${e.name} ${e.sets}×${e.reps}`).join(', ')}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}

        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text style={[styles.cardTitle, { color: t.muted }]}>Weekly volume</Text>
          <Text style={[styles.bigValue, { color: t.text }]}>
            {weeklyVolume.thisWeek.toLocaleString()}
            <Text style={[styles.bigUnit, { color: t.muted }]}> lbs this week</Text>
          </Text>
          <Text style={[styles.hint, { color: t.subtle }]}>
            {strength_weekly_volume_label(weeklyVolume.thisWeek, weeklyVolume.avgWeekly)}
          </Text>

          <View style={styles.weeklyBars}>
            {weeklyVolume.buckets.map((b, i) => {
              const pct = weeklyVolume.max > 0 ? Math.min(1, b.volume / weeklyVolume.max) : 0;
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
          <Text style={[styles.cardTitle, { color: t.muted }]}>Recent strength sessions</Text>
          {strengthSessions.length === 0 ? (
            <Text style={[styles.empty, { color: t.muted }]}>
              No strength sessions in the last 90 days. Start a session from the Fitness tab.
            </Text>
          ) : (
            strengthSessions.slice(0, 10).map((w, i) => {
              const parsed = parseDescription(w.description ?? '');
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
                      {w.strava_activity_id ? ' · Strava' : ''}
                    </Text>
                    <Text style={[styles.sessionMeta, { color: t.muted }]}>
                      {w.log_date}
                      {parsed.totalSets > 0 ? ` · ${parsed.totalSets} sets` : ''}
                      {parsed.topWeight > 0 ? ` · top ${parsed.topWeight} lbs` : ''}
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

function computeWeeklyVolume(sessions: Array<{ log_date: string; description: string | null }>) {
  // 8 weeks, ending today
  const now = new Date();
  const buckets: Array<{ label: string; start: string; end: string; volume: number }> = [];
  for (let i = 7; i >= 0; i--) {
    const end = new Date(now);
    end.setDate(end.getDate() - i * 7);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    buckets.push({
      label: `W${8 - i}`,
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
      volume: 0,
    });
  }
  sessions.forEach((s) => {
    const parsed = parseDescription(s.description ?? '');
    const vol = parsed.estimatedVolume;
    const bucket = buckets.find((b) => s.log_date >= b.start && s.log_date <= b.end);
    if (bucket) bucket.volume += vol;
  });
  const thisWeek = buckets[buckets.length - 1]?.volume ?? 0;
  const avgWeekly =
    buckets.length > 0 ? Math.round(buckets.reduce((s, b) => s + b.volume, 0) / buckets.length) : 0;
  const max = Math.max(1, ...buckets.map((b) => b.volume));
  return { buckets, thisWeek, avgWeekly, max };
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 40, gap: 14 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
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
  weeklyBarTrack: {
    width: '100%',
    height: 80,
    justifyContent: 'flex-end',
  },
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
  empty: { fontSize: 12, padding: 16, textAlign: 'center' },
  planRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  planDay: { fontSize: 12, fontWeight: '700', minWidth: 32 },
  planBody: { fontSize: 12, flex: 1, lineHeight: 17 },
});

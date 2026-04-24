import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useHaptics } from '../../lib/useHaptics';
import { useTokens } from '../../lib/theme';

/** A scheduled day from the active workout plan. Shape will fill out in
 *  Phase 12 once the plan data model lands. For 11.5 we render empty /
 *  rest-day / no-plan variants only. */
export interface TodayScheduledWorkout {
  dayName?: string;            // e.g. "Push day"
  exercises?: { name: string; sets: number }[];
  isRestDay?: boolean;
}

interface Props {
  /** Active plan's entry for today. Null → no plan exists at all. */
  plan: TodayScheduledWorkout | null;
  /** True while the plan-fetch hook is still resolving. */
  loading?: boolean;
  /** Launch the strength tracker for today's plan session. */
  onStartPlanned: () => void;
  /** Launch the strength tracker with an empty session (no plan). */
  onStartAdhoc: () => void;
  /** Open a picker of this week's other days. Stub in 11.5, wired in
   *  Phase 12 once the plan data model exists. */
  onChooseDifferent?: () => void;
}

/** Today's Scheduled Workout — replaces the old "Start Strength Session"
 *  primary button on the Fitness tab per 11.5.5. States:
 *    1. No plan exists → "Build a workout plan" CTA + ad-hoc fallback.
 *    2. Plan exists, today is rest day → "Rest day" copy + ad-hoc fallback.
 *    3. Plan exists, today has a scheduled workout → workout name +
 *       exercises count + Start + Choose Different. */
export function TodayScheduledWorkoutCard({
  plan,
  loading,
  onStartPlanned,
  onStartAdhoc,
  onChooseDifferent,
}: Props) {
  const t = useTokens();
  const haptics = useHaptics();
  const router = useRouter();

  if (loading) {
    return (
      <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }

  // State 1: no plan at all → build-plan CTA
  if (!plan) {
    return (
      <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
        <View style={styles.header}>
          <Ionicons name="calendar-outline" size={16} color={t.muted} />
          <Text style={[styles.label, { color: t.muted }]}>Today's workout</Text>
        </View>
        <Text style={[styles.title, { color: t.text }]}>No workout plan yet</Text>
        <Text style={[styles.body, { color: t.muted }]}>
          Build a plan so each day has a scheduled session. Takes about a minute.
        </Text>
        <View style={styles.actions}>
          <Pressable
            onPress={() => {
              haptics.fire('tap');
              router.push('/fitness/plan/builder');
            }}
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: t.accent, opacity: pressed ? 0.85 : 1 },
            ]}
            accessibilityLabel="Build a workout plan">
            <Ionicons name="sparkles-outline" size={16} color="#fff" />
            <Text style={styles.primaryLabel}>Build a workout plan</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              haptics.fire('tap');
              onStartAdhoc();
            }}
            style={({ pressed }) => [styles.secondaryBtn, { opacity: pressed ? 0.7 : 1 }]}
            accessibilityLabel="Start an ad-hoc session">
            <Text style={[styles.secondaryLabel, { color: t.accent }]}>Start ad-hoc session</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // State 2: plan exists but today is a rest day
  if (plan.isRestDay) {
    return (
      <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
        <View style={styles.header}>
          <Ionicons name="bed-outline" size={16} color={t.muted} />
          <Text style={[styles.label, { color: t.muted }]}>Today's workout</Text>
        </View>
        <Text style={[styles.title, { color: t.text }]}>Rest day</Text>
        <Text style={[styles.body, { color: t.muted }]}>
          Your plan has today off. Still want to move?
        </Text>
        <View style={styles.actions}>
          <Pressable
            onPress={() => {
              haptics.fire('tap');
              onStartAdhoc();
            }}
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: t.accent, opacity: pressed ? 0.85 : 1 },
            ]}>
            <Ionicons name="barbell" size={16} color="#fff" />
            <Text style={styles.primaryLabel}>Start ad-hoc session</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // State 3: scheduled workout today
  const exerciseCount = plan.exercises?.length ?? 0;
  const totalSets = (plan.exercises ?? []).reduce((s, e) => s + (e.sets ?? 0), 0);

  return (
    <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
      <View style={styles.header}>
        <Ionicons name="calendar" size={16} color={t.accent} />
        <Text style={[styles.label, { color: t.muted }]}>Today's workout</Text>
      </View>
      <Text style={[styles.title, { color: t.text }]}>{plan.dayName ?? 'Scheduled session'}</Text>
      <Text style={[styles.body, { color: t.muted }]}>
        {exerciseCount} exercise{exerciseCount === 1 ? '' : 's'} · {totalSets} set{totalSets === 1 ? '' : 's'}
      </Text>
      <View style={styles.actions}>
        <Pressable
          onPress={() => {
            haptics.fire('tap');
            onStartPlanned();
          }}
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: t.accent, opacity: pressed ? 0.85 : 1 },
          ]}>
          <Ionicons name="barbell" size={16} color="#fff" />
          <Text style={styles.primaryLabel}>Start workout</Text>
        </Pressable>
        {onChooseDifferent ? (
          <Pressable
            onPress={() => {
              haptics.fire('tap');
              onChooseDifferent();
            }}
            style={({ pressed }) => [styles.secondaryBtn, { opacity: pressed ? 0.7 : 1 }]}>
            <Text style={[styles.secondaryLabel, { color: t.accent }]}>Choose different</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 6,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  title: { fontSize: 18, fontWeight: '700', marginTop: 2 },
  body: { fontSize: 13, lineHeight: 18 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10, flexWrap: 'wrap' },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 14,
  },
  primaryLabel: { color: '#fff', fontSize: 14, fontWeight: '700' },
  secondaryBtn: { paddingVertical: 10 },
  secondaryLabel: { fontSize: 13, fontWeight: '600' },
});

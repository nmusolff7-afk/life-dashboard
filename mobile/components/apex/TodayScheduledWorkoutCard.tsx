import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useHaptics } from '../../lib/useHaptics';
import { useTokens } from '../../lib/theme';

/** A scheduled day from the active workout plan. Expanded in Phase 12
 *  to separate strength + cardio so the Today's card can surface both
 *  with their own action buttons. */
export interface TodayScheduledWorkout {
  /** Display label (e.g. "Push day" or "Upper A"). */
  dayName?: string;
  /** Strength exercises scheduled today. */
  exercises?: { name: string; sets: number }[];
  /** Cardio session (specific type like "Easy Run"). Null when no
   *  cardio is scheduled today. */
  cardio?: { type: string } | null;
  isRestDay?: boolean;
}

interface Props {
  plan: TodayScheduledWorkout | null;
  loading?: boolean;
  /** Launch the strength tracker pre-seeded with today's exercises. */
  onStartPlannedStrength: () => void;
  /** Launch the strength tracker with no pre-seeded exercises. */
  onStartAdhoc: () => void;
  /** Mark today's cardio complete (logs a workout row). */
  onLogCardio?: () => void;
  /** Open the manual cardio-log modal so user can fill distance/etc. */
  onLogCardioManual?: () => void;
}

/** Today's Scheduled Workout — shows strength and cardio as separate
 *  rows so each can be started / marked complete independently.
 *
 *  States:
 *   1. No plan → Build CTA (routes to Settings → Workout Plan) +
 *      Start ad-hoc fallback.
 *   2. Plan exists, pure rest day → rest copy + ad-hoc fallback.
 *   3. Plan exists, strength only → strength row with Start button.
 *   4. Plan exists, cardio only → cardio row with Mark / Manual buttons.
 *   5. Both scheduled → both rows visible, each with its own actions. */
export function TodayScheduledWorkoutCard({
  plan,
  loading,
  onStartPlannedStrength,
  onStartAdhoc,
  onLogCardio,
  onLogCardioManual,
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

  // State 1: no plan at all
  if (!plan) {
    return (
      <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
        <View style={styles.header}>
          <Ionicons name="calendar-outline" size={16} color={t.muted} />
          <Text style={[styles.label, { color: t.muted }]}>Today's workout</Text>
        </View>
        <Text style={[styles.title, { color: t.text }]}>No workout plan yet</Text>
        <Text style={[styles.body, { color: t.muted }]}>
          Build a plan — AI import, manual builder, or guided AI build. Your scheduled sessions
          show up here and in each day's fitness sections.
        </Text>
        <View style={styles.actions}>
          <Pressable
            onPress={() => {
              haptics.fire('tap');
              router.push('/settings/workout-plan');
            }}
            accessibilityLabel="Build a workout plan"
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: t.accent, opacity: pressed ? 0.85 : 1 },
            ]}>
            <Ionicons name="sparkles-outline" size={16} color="#fff" />
            <Text style={styles.primaryLabel}>Build a plan</Text>
          </Pressable>
          <Pressable
            onPress={() => { haptics.fire('tap'); onStartAdhoc(); }}
            style={({ pressed }) => [styles.secondaryBtn, { opacity: pressed ? 0.7 : 1 }]}>
            <Text style={[styles.secondaryLabel, { color: t.accent }]}>Start ad-hoc session</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const exercises = plan.exercises ?? [];
  const cardio = plan.cardio?.type?.trim();
  const isRest = !!plan.isRestDay || (exercises.length === 0 && !cardio);

  // State 2: rest day
  if (isRest) {
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
            onPress={() => { haptics.fire('tap'); onStartAdhoc(); }}
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

  // States 3–5: any combination of strength + cardio
  const totalSets = exercises.reduce((s, e) => s + (e.sets ?? 0), 0);

  return (
    <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
      <View style={styles.header}>
        <Ionicons name="calendar" size={16} color={t.accent} />
        <Text style={[styles.label, { color: t.muted }]}>Today's workout</Text>
      </View>
      {plan.dayName ? (
        <Text style={[styles.title, { color: t.text }]}>{plan.dayName}</Text>
      ) : null}

      {/* Strength row */}
      {exercises.length > 0 ? (
        <View style={[styles.subRow, { backgroundColor: t.surface2 }]}>
          <View style={[styles.subIcon, { backgroundColor: t.fitness + '22' }]}>
            <Ionicons name="barbell-outline" size={16} color={t.fitness} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.subTitle, { color: t.text }]}>Strength</Text>
            <Text style={[styles.subMeta, { color: t.muted }]}>
              {exercises.length} exercise{exercises.length === 1 ? '' : 's'} · {totalSets} set{totalSets === 1 ? '' : 's'}
            </Text>
          </View>
          <Pressable
            onPress={() => { haptics.fire('tap'); onStartPlannedStrength(); }}
            accessibilityLabel="Start strength workout"
            style={({ pressed }) => [
              styles.rowBtn,
              { backgroundColor: t.accent, opacity: pressed ? 0.85 : 1 },
            ]}>
            <Ionicons name="play" size={12} color="#fff" />
            <Text style={styles.rowBtnLabel}>Start</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Cardio row */}
      {cardio ? (
        <View style={[styles.subRow, { backgroundColor: t.surface2 }]}>
          <View style={[styles.subIcon, { backgroundColor: t.fitness + '22' }]}>
            <Ionicons name="walk-outline" size={16} color={t.fitness} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.subTitle, { color: t.text }]}>Cardio</Text>
            <Text style={[styles.subMeta, { color: t.muted }]}>{cardio}</Text>
          </View>
          <Pressable
            onPress={() => { haptics.fire('tap'); onLogCardioManual?.(); }}
            accessibilityLabel="Log cardio manually"
            style={({ pressed }) => [
              styles.rowBtnSecondary,
              { backgroundColor: t.surface, borderColor: t.border, opacity: pressed ? 0.7 : 1 },
            ]}>
            <Ionicons name="create-outline" size={12} color={t.muted} />
            <Text style={[styles.rowBtnLabelSecondary, { color: t.text }]}>Log</Text>
          </Pressable>
          <Pressable
            onPress={() => { haptics.fire('success'); onLogCardio?.(); }}
            accessibilityLabel="Mark cardio complete"
            style={({ pressed }) => [
              styles.rowBtn,
              { backgroundColor: t.green, opacity: pressed ? 0.85 : 1 },
            ]}>
            <Ionicons name="checkmark" size={14} color="#fff" />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 8,
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

  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 12,
    marginTop: 4,
  },
  subIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subTitle: { fontSize: 14, fontWeight: '700' },
  subMeta: { fontSize: 11, marginTop: 2 },

  rowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 100,
  },
  rowBtnLabel: { color: '#fff', fontSize: 12, fontWeight: '700' },
  rowBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 100,
    borderWidth: 1,
  },
  rowBtnLabelSecondary: { fontSize: 12, fontWeight: '700' },
});

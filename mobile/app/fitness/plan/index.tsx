import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { DayName, PlanDay, PlanExercise, WeeklyPlan } from '../../../../shared/src/types/plan';
import {
  WORKOUT_PLAN_SOURCES,
  type WorkoutPlanSource,
} from '../../../../shared/src/data/workoutPlanSources';
import { deactivateWorkoutPlan, patchWorkoutPlan, reviseWorkoutPlan } from '../../../lib/api/plan';
import { useWorkoutPlan } from '../../../lib/hooks/useWorkoutPlan';
import { useStrengthSession } from '../../../lib/useStrengthSession';
import { useHaptics } from '../../../lib/useHaptics';
import { useTokens } from '../../../lib/theme';

const DAYS: DayName[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Workout Plan display + edit (PRD §4.3.10 "Edit Plan"). Week view
 *  with per-day expand. Tap a day to see its exercises. Manual edits
 *  on set/rep counts + exercise names go back to /api/workout-plan
 *  PATCH. "Revise with AI" opens a prompt box that calls
 *  /api/workout-plan/revise. "Switch Plan" deactivates + sends the
 *  user to the builder for a fresh plan. */
export default function PlanIndex() {
  const t = useTokens();
  const router = useRouter();
  const haptics = useHaptics();
  const { plan, loading, refetch } = useWorkoutPlan();
  const strength = useStrengthSession();

  const [expandedDay, setExpandedDay] = useState<DayName | null>(null);
  const [reviseOpen, setReviseOpen] = useState(false);
  const [reviseText, setReviseText] = useState('');
  const [revising, setRevising] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  // Inline exercise editor — modal opens when user taps an exercise
  // row. Stores the (day, idx) coordinates plus a working copy of the
  // exercise that's mutated in the modal and saved on confirm.
  const [editTarget, setEditTarget] = useState<{
    day: DayName;
    idx: number;
    draft: PlanExercise;
  } | null>(null);

  // Resolve source shortNames back to full citations.
  const sourceObjects = useMemo<WorkoutPlanSource[]>(() => {
    const names = plan?.sources ?? [];
    if (!names.length) return [];
    return WORKOUT_PLAN_SOURCES.filter((s) => names.includes(s.shortName));
  }, [plan?.sources]);

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: t.bg }]}>
        <Stack.Screen options={{ title: 'Plan' }} />
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }

  if (!plan) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <Stack.Screen options={{ title: 'Plan' }} />
        <View style={styles.emptyWrap}>
          <Ionicons name="calendar-outline" size={40} color={t.muted} />
          <Text style={[styles.emptyTitle, { color: t.text }]}>No active plan</Text>
          <Text style={[styles.emptyBody, { color: t.muted }]}>
            Build a weekly plan to have a scheduled workout every day. Takes about a minute.
          </Text>
          <Pressable
            onPress={() => router.push('/fitness/plan/builder')}
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: t.accent, opacity: pressed ? 0.85 : 1 },
            ]}>
            <Ionicons name="sparkles-outline" size={16} color="#fff" />
            <Text style={styles.primaryLabel}>Build a plan</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const weekly = plan.plan.weeklyPlan ?? {};

  const handleEditPlan = () => {
    haptics.fire('tap');
    // PRD §4.3.10: "Edit Plan opens the Workout Builder with
    // pre-populated answers". Pass the saved quiz_payload through
    // a URL search param; builder reverses it back to per-step
    // state. Falls through to fresh state if no payload exists
    // (older plans pre-dating quiz_payload column).
    const payload = plan.quiz_payload;
    if (!payload) {
      // Old plan without saved quiz — just open fresh wizard.
      router.push('/fitness/plan/builder' as never);
      return;
    }
    const encoded = encodeURIComponent(JSON.stringify(payload));
    router.push(`/fitness/plan/builder?initial=${encoded}` as never);
  };

  const handleSwitchPlan = () => {
    Alert.alert(
      'Switch plan?',
      'Builds a new plan from a fresh quiz. Your current plan archives — you can reactivate it later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Switch',
          style: 'destructive',
          onPress: async () => {
            try {
              await deactivateWorkoutPlan();
              haptics.fire('success');
              router.replace('/fitness/plan/builder');
            } catch (e) {
              haptics.fire('error');
              Alert.alert('Failed', e instanceof Error ? e.message : String(e));
            }
          },
        },
      ],
    );
  };

  const handleRevise = async () => {
    const msg = reviseText.trim();
    if (!msg) return;
    haptics.fire('tap');
    setRevising(true);
    try {
      await reviseWorkoutPlan(msg);
      haptics.fire('success');
      setReviseText('');
      setReviseOpen(false);
      await refetch();
    } catch (e) {
      haptics.fire('error');
      Alert.alert('Revise failed', e instanceof Error ? e.message : String(e));
    } finally {
      setRevising(false);
    }
  };

  const startPlannedSession = (dayName: DayName) => {
    haptics.fire('tap');
    // Seed strength session from the plan day's exercises.
    const day = weekly[dayName];
    const exercises = (day?.exercises ?? []).map((ex) => ({
      name: ex.name,
      sets: Array.from({ length: Math.max(1, ex.sets) }, () => ({
        completed: false, weight: '', reps: '',
      })),
    }));
    if (exercises.length === 0) {
      Alert.alert('Nothing to start', 'That day has no exercises scheduled.');
      return;
    }
    if (strength.active) {
      strength.maximize();
    } else {
      strength.setExercises(exercises);
      void strength.start();
    }
    router.replace('/(tabs)/fitness');
  };

  const handleRemoveExercise = async (dayName: DayName, exerciseIdx: number) => {
    const day = weekly[dayName];
    if (!day) return;
    const nextDay: PlanDay = {
      ...day,
      exercises: (day.exercises ?? []).filter((_, i) => i !== exerciseIdx),
    };
    const nextPlan: WeeklyPlan = {
      ...plan.plan,
      weeklyPlan: { ...weekly, [dayName]: nextDay },
    };
    try {
      await patchWorkoutPlan(nextPlan);
      haptics.fire('success');
      await refetch();
    } catch (e) {
      haptics.fire('error');
      Alert.alert('Edit failed', e instanceof Error ? e.message : String(e));
    }
  };

  const openExerciseEditor = (dayName: DayName, idx: number) => {
    const day = weekly[dayName];
    const ex = day?.exercises?.[idx];
    if (!ex) return;
    haptics.fire('tap');
    // Clone so the modal mutates a draft, not the live plan.
    setEditTarget({ day: dayName, idx, draft: { ...ex } });
  };

  const handleSaveExerciseEdit = async () => {
    if (!editTarget) return;
    const { day: dayName, idx, draft } = editTarget;
    const day = weekly[dayName];
    if (!day) return;
    const cleaned: PlanExercise = {
      name: draft.name.trim() || day.exercises[idx]?.name || 'Exercise',
      sets: Math.max(1, Math.min(20, Number(draft.sets) || 3)),
      reps: String(draft.reps || '').trim() || '8-12',
      rest: typeof draft.rest === 'string' && draft.rest.trim() ? draft.rest.trim() : null,
      notes: typeof draft.notes === 'string' && draft.notes.trim() ? draft.notes.trim() : null,
    };
    const nextExercises = (day.exercises ?? []).map((ex, i) => (i === idx ? cleaned : ex));
    const nextPlan: WeeklyPlan = {
      ...plan.plan,
      weeklyPlan: { ...weekly, [dayName]: { ...day, exercises: nextExercises } },
    };
    try {
      await patchWorkoutPlan(nextPlan);
      haptics.fire('success');
      setEditTarget(null);
      await refetch();
    } catch (e) {
      haptics.fire('error');
      Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: 'Plan' }} />
      <ScrollView contentContainerStyle={styles.content}>
        {plan.understanding ? (
          <View style={[styles.understanding, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Ionicons name="information-circle-outline" size={16} color={t.accent} />
            <Text style={[styles.understandingBody, { color: t.muted }]}>
              {plan.understanding}
            </Text>
          </View>
        ) : null}

        {sourceObjects.length > 0 ? (
          <>
            <Pressable
              onPress={() => { haptics.fire('tap'); setSourcesOpen((v) => !v); }}
              style={[styles.sourcesToggle, { borderColor: t.border }]}>
              <Ionicons name="library-outline" size={14} color={t.accent} />
              <Text style={[styles.sourcesToggleLabel, { color: t.accent }]}>
                How we built your plan ({sourceObjects.length} source{sourceObjects.length === 1 ? '' : 's'})
              </Text>
              <Ionicons
                name={sourcesOpen ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={t.accent}
              />
            </Pressable>
            {sourcesOpen ? (
              <View style={[styles.sourcesPanel, { backgroundColor: t.surface, borderColor: t.border }]}>
                {sourceObjects.map((s) => (
                  <Pressable
                    key={s.shortName}
                    onPress={() => { void Linking.openURL(s.url); }}
                    accessibilityRole="link"
                    style={({ pressed }) => [
                      styles.sourceRow,
                      { borderBottomColor: t.border, opacity: pressed ? 0.6 : 1 },
                    ]}>
                    <Text style={[styles.sourceName, { color: t.text }]}>{s.shortName}</Text>
                    <Text style={[styles.sourceCitation, { color: t.muted }]}>
                      {s.fullCitation}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </>
        ) : null}

        {DAYS.map((dayName) => {
          const day = weekly[dayName];
          const exCount = day?.exercises?.length ?? 0;
          const cardioLabel = (day?.cardio?.type || '').trim();
          const isRest = !exCount && !cardioLabel;
          const expanded = expandedDay === dayName;
          return (
            <View key={dayName} style={[styles.dayCard, { backgroundColor: t.surface, borderColor: t.border }]}>
              <Pressable
                onPress={() => {
                  haptics.fire('tap');
                  setExpandedDay((prev) => prev === dayName ? null : dayName);
                }}
                style={styles.dayHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.dayName, { color: t.text }]}>{dayName}</Text>
                  <Text style={[styles.dayHint, { color: t.muted }]} numberOfLines={1}>
                    {isRest ? 'Rest'
                      : `${day?.label ? day.label + ' · ' : ''}${exCount} exercise${exCount === 1 ? '' : 's'}${cardioLabel ? ` · ${cardioLabel}` : ''}`}
                  </Text>
                </View>
                {!isRest ? (
                  <Pressable
                    onPress={() => startPlannedSession(dayName)}
                    accessibilityLabel={`Start ${dayName} workout`}
                    style={[styles.startDayBtn, { backgroundColor: t.accent }]}>
                    <Ionicons name="play" size={14} color="#fff" />
                  </Pressable>
                ) : null}
                <Ionicons
                  name={expanded ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={t.muted}
                />
              </Pressable>

              {expanded && !isRest ? (
                <View style={styles.dayBody}>
                  {(day?.exercises ?? []).map((ex, i) => (
                    <View key={i} style={[styles.exerciseRow, { borderBottomColor: t.border }]}>
                      <Pressable
                        onPress={() => openExerciseEditor(dayName, i)}
                        accessibilityLabel={`Edit ${ex.name}`}
                        style={({ pressed }) => [
                          { flex: 1, opacity: pressed ? 0.6 : 1 },
                        ]}>
                        <Text style={[styles.exerciseName, { color: t.text }]}>{ex.name}</Text>
                        <Text style={[styles.exerciseMeta, { color: t.muted }]}>
                          {ex.sets} × {ex.reps}{ex.rest ? ` · rest ${ex.rest}` : ''}
                        </Text>
                        {ex.notes ? (
                          <Text style={[styles.exerciseNotes, { color: t.subtle }]} numberOfLines={2}>
                            {ex.notes}
                          </Text>
                        ) : null}
                      </Pressable>
                      <Pressable
                        onPress={() => handleRemoveExercise(dayName, i)}
                        hitSlop={8}
                        accessibilityLabel={`Remove ${ex.name}`}
                        style={[styles.removeBtn, { backgroundColor: t.surface2 }]}>
                        <Ionicons name="trash-outline" size={13} color={t.danger} />
                      </Pressable>
                    </View>
                  ))}
                  {cardioLabel ? (
                    <View style={[styles.cardioRow, { borderTopColor: t.border }]}>
                      <Ionicons name="walk-outline" size={16} color={t.fitness} />
                      <Text style={[styles.cardioLabel, { color: t.text }]}>{cardioLabel}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}

        <View style={styles.planActions}>
          <Pressable
            onPress={() => { haptics.fire('tap'); setReviseOpen(true); }}
            style={({ pressed }) => [
              styles.secondaryBtn,
              { backgroundColor: t.surface, borderColor: t.border, opacity: pressed ? 0.7 : 1 },
            ]}>
            <Ionicons name="sparkles-outline" size={16} color={t.accent} />
            <Text style={[styles.secondaryLabel, { color: t.accent }]}>Revise with AI</Text>
          </Pressable>
          <Pressable
            onPress={handleEditPlan}
            style={({ pressed }) => [
              styles.secondaryBtn,
              { backgroundColor: t.surface, borderColor: t.border, opacity: pressed ? 0.7 : 1 },
            ]}>
            <Ionicons name="create-outline" size={16} color={t.muted} />
            <Text style={[styles.secondaryLabel, { color: t.text }]}>Edit plan</Text>
          </Pressable>
        </View>
        <Pressable
          onPress={handleSwitchPlan}
          style={({ pressed }) => [
            styles.tertiaryBtn,
            { opacity: pressed ? 0.6 : 1 },
          ]}>
          <Text style={[styles.tertiaryLabel, { color: t.subtle }]}>
            Build a totally new plan from scratch
          </Text>
        </Pressable>

        {reviseOpen ? (
          <View style={[styles.reviseBox, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={[styles.reviseLabel, { color: t.muted }]}>What should change?</Text>
            <TextInput
              value={reviseText}
              onChangeText={setReviseText}
              placeholder="e.g. swap Barbell Row for a dumbbell alternative; add more chest volume"
              placeholderTextColor={t.subtle}
              multiline
              style={[
                styles.reviseInput,
                { color: t.text, backgroundColor: t.surface2, borderColor: t.border },
              ]}
            />
            <View style={styles.reviseActions}>
              <Pressable
                onPress={() => { haptics.fire('tap'); setReviseOpen(false); setReviseText(''); }}
                disabled={revising}
                style={styles.secondaryGhost}>
                <Text style={[styles.secondaryLabel, { color: t.muted }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleRevise}
                disabled={revising || !reviseText.trim()}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  {
                    backgroundColor: t.accent,
                    opacity: pressed || revising || !reviseText.trim() ? 0.7 : 1,
                  },
                ]}>
                {revising ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryLabel}>Apply</Text>
                )}
              </Pressable>
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* Inline exercise editor — opens when user taps an exercise row.
          Five fields: name, sets, reps, rest, notes. Save patches the
          full plan via /api/workout-plan PATCH. */}
      <Modal
        visible={!!editTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setEditTarget(null)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}>
          <Pressable
            onPress={() => setEditTarget(null)}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.modalSheet, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={[styles.modalTitle, { color: t.text }]}>Edit exercise</Text>

            <Text style={[styles.modalLabel, { color: t.muted }]}>Name</Text>
            <TextInput
              value={editTarget?.draft.name ?? ''}
              onChangeText={(v) => setEditTarget((prev) =>
                prev ? { ...prev, draft: { ...prev.draft, name: v } } : prev)}
              placeholder="e.g. Barbell Squat"
              placeholderTextColor={t.subtle}
              style={[
                styles.modalInput,
                { color: t.text, backgroundColor: t.surface2, borderColor: t.border },
              ]}
            />

            <View style={styles.modalRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalLabel, { color: t.muted }]}>Sets</Text>
                <TextInput
                  value={String(editTarget?.draft.sets ?? '')}
                  onChangeText={(v) => setEditTarget((prev) =>
                    prev ? { ...prev, draft: { ...prev.draft, sets: parseInt(v, 10) || 0 } } : prev)}
                  placeholder="3"
                  placeholderTextColor={t.subtle}
                  keyboardType="number-pad"
                  style={[
                    styles.modalInput,
                    { color: t.text, backgroundColor: t.surface2, borderColor: t.border },
                  ]}
                />
              </View>
              <View style={{ flex: 2 }}>
                <Text style={[styles.modalLabel, { color: t.muted }]}>Reps</Text>
                <TextInput
                  value={editTarget?.draft.reps ?? ''}
                  onChangeText={(v) => setEditTarget((prev) =>
                    prev ? { ...prev, draft: { ...prev.draft, reps: v } } : prev)}
                  placeholder="8-12"
                  placeholderTextColor={t.subtle}
                  style={[
                    styles.modalInput,
                    { color: t.text, backgroundColor: t.surface2, borderColor: t.border },
                  ]}
                />
              </View>
            </View>

            <Text style={[styles.modalLabel, { color: t.muted }]}>Rest</Text>
            <TextInput
              value={editTarget?.draft.rest ?? ''}
              onChangeText={(v) => setEditTarget((prev) =>
                prev ? { ...prev, draft: { ...prev.draft, rest: v } } : prev)}
              placeholder="e.g. 2 min"
              placeholderTextColor={t.subtle}
              style={[
                styles.modalInput,
                { color: t.text, backgroundColor: t.surface2, borderColor: t.border },
              ]}
            />

            <Text style={[styles.modalLabel, { color: t.muted }]}>Notes</Text>
            <TextInput
              value={editTarget?.draft.notes ?? ''}
              onChangeText={(v) => setEditTarget((prev) =>
                prev ? { ...prev, draft: { ...prev.draft, notes: v } } : prev)}
              placeholder="Form cue, tempo, etc."
              placeholderTextColor={t.subtle}
              multiline
              style={[
                styles.modalInput,
                { color: t.text, backgroundColor: t.surface2, borderColor: t.border, minHeight: 60 },
              ]}
            />

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => { haptics.fire('tap'); setEditTarget(null); }}
                style={styles.secondaryGhost}>
                <Text style={[styles.secondaryLabel, { color: t.muted }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSaveExerciseEdit}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { backgroundColor: t.accent, opacity: pressed ? 0.8 : 1 },
                ]}>
                <Text style={styles.primaryLabel}>Save</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 60, gap: 10 },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyBody: { fontSize: 13, textAlign: 'center', lineHeight: 18, maxWidth: 280 },

  understanding: {
    flexDirection: 'row',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 6,
  },
  understandingBody: { fontSize: 13, flex: 1, lineHeight: 18 },

  dayCard: { borderWidth: 1, borderRadius: 14 },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  dayName: { fontSize: 15, fontWeight: '700' },
  dayHint: { fontSize: 12, marginTop: 2 },
  startDayBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  dayBody: { paddingHorizontal: 14, paddingBottom: 12 },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  exerciseName: { fontSize: 14, fontWeight: '600' },
  exerciseMeta: { fontSize: 12, marginTop: 2 },
  exerciseNotes: { fontSize: 11, fontStyle: 'italic', marginTop: 2 },
  removeBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },

  cardioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderTopWidth: 1,
    marginTop: 8,
  },
  cardioLabel: { fontSize: 13, fontWeight: '500' },

  planActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
  },
  secondaryLabel: { fontSize: 13, fontWeight: '700' },
  secondaryGhost: { paddingHorizontal: 14, paddingVertical: 10 },

  tertiaryBtn: { alignItems: 'center', paddingVertical: 12 },
  tertiaryLabel: { fontSize: 12, fontWeight: '500', textDecorationLine: 'underline' },

  reviseBox: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10, marginTop: 6 },
  reviseLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  reviseInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 80,
  },
  reviseActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, alignItems: 'center' },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 100,
    justifyContent: 'center',
  },
  primaryLabel: { color: '#fff', fontSize: 14, fontWeight: '700' },

  sourcesToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  sourcesToggleLabel: { flex: 1, fontSize: 13, fontWeight: '700' },
  sourcesPanel: { borderWidth: 1, borderRadius: 12, padding: 10 },
  sourceRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 4 },
  sourceName: { fontSize: 12, fontWeight: '700' },
  sourceCitation: { fontSize: 11, lineHeight: 15 },

  // Edit-exercise modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalSheet: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    gap: 6,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', marginBottom: 4 },
  modalLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 8,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginTop: 4,
  },
  modalRow: { flexDirection: 'row', gap: 10 },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
  },
});

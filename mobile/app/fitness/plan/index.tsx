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
  // Inline cardio editor — same pattern as exercise edit. Opens when
  // user taps the cardio row OR the "Add cardio" CTA on a day without
  // cardio. Stores the day + a draft cardio object; save writes
  // through to draftPlan, delete sets cardio = null.
  const [editCardio, setEditCardio] = useState<{
    day: DayName;
    draft: { type: string; committed: boolean };
  } | null>(null);

  // Draft-mode state. All edits (manual via modal/delete + AI-proposed
  // via dry-run revise) land here, NOT on the server. The user reviews
  // the cumulative changes and either commits via "Save changes"
  // (PATCH + redirect to Fitness tab) or discards via "Cancel".
  // null = no pending changes (rendering reads from `plan.plan` from
  // the server). Non-null = working copy.
  const [draftPlan, setDraftPlan] = useState<WeeklyPlan | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);

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

  // Effective rendering source — draft (when dirty) or server-saved.
  // Single source of truth for all read paths so the page reflects
  // unsaved changes exactly as the user will see them post-save.
  const workingPlan: WeeklyPlan = draftPlan ?? plan.plan;
  const weekly = workingPlan.weeklyPlan ?? {};
  const isDirty = draftPlan !== null;

  // Helper for handlers that produce a new plan dict — bumps draft
  // state without touching the server.
  const updateDraft = (mutator: (current: WeeklyPlan) => WeeklyPlan) => {
    setDraftPlan((prev) => mutator(prev ?? plan.plan));
  };

  const handleSaveDraft = async () => {
    if (!draftPlan) return;
    haptics.fire('tap');
    setSavingDraft(true);
    try {
      await patchWorkoutPlan(draftPlan);
      haptics.fire('success');
      setDraftPlan(null);
      // Per founder direction: Save → bounce to the Fitness tab so the
      // user sees their freshly-saved plan in context (Today's
      // Scheduled Workout pulls from it).
      router.replace('/(tabs)/fitness' as never);
    } catch (e) {
      haptics.fire('error');
      Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
    } finally {
      setSavingDraft(false);
    }
  };

  const handleDiscardDraft = () => {
    if (!draftPlan) return;
    Alert.alert(
      'Discard changes?',
      'Your unsaved edits will be lost.',
      [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            haptics.fire('tap');
            setDraftPlan(null);
          },
        },
      ],
    );
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
      // Dry-run mode: AI proposes a revised plan without saving. Pass
      // the current working plan (could be draft or server-saved) so
      // the AI revises on top of any pending manual edits — gives the
      // user a coherent unified preview to either Save or Cancel.
      const result = await reviseWorkoutPlan(msg, {
        dryRun: true,
        currentPlan: workingPlan,
      });
      haptics.fire('success');
      setReviseText('');
      setReviseOpen(false);
      // Apply the AI proposal as the new draft. User reviews via the
      // existing day cards + Save/Cancel banner.
      setDraftPlan(result.plan);
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

  const handleRemoveExercise = (dayName: DayName, exerciseIdx: number) => {
    haptics.fire('tap');
    updateDraft((current) => {
      const w = current.weeklyPlan ?? {};
      const day = w[dayName];
      if (!day) return current;
      const nextDay: PlanDay = {
        ...day,
        exercises: (day.exercises ?? []).filter((_, i) => i !== exerciseIdx),
      };
      return { ...current, weeklyPlan: { ...w, [dayName]: nextDay } };
    });
  };

  const openExerciseEditor = (dayName: DayName, idx: number) => {
    const day = weekly[dayName];
    const ex = day?.exercises?.[idx];
    if (!ex) return;
    haptics.fire('tap');
    // Clone so the modal mutates a draft of the exercise (separate
    // from the page's draftPlan), not the live plan.
    setEditTarget({ day: dayName, idx, draft: { ...ex } });
  };

  const handleSaveExerciseEdit = () => {
    if (!editTarget) return;
    const { day: dayName, idx, draft } = editTarget;
    haptics.fire('tap');
    updateDraft((current) => {
      const w = current.weeklyPlan ?? {};
      const day = w[dayName];
      if (!day) return current;
      const cleaned: PlanExercise = {
        name: draft.name.trim() || day.exercises[idx]?.name || 'Exercise',
        sets: Math.max(1, Math.min(20, Number(draft.sets) || 3)),
        reps: String(draft.reps || '').trim() || '8-12',
        rest: typeof draft.rest === 'string' && draft.rest.trim() ? draft.rest.trim() : null,
        notes: typeof draft.notes === 'string' && draft.notes.trim() ? draft.notes.trim() : null,
      };
      const nextExercises = (day.exercises ?? []).map((ex, i) => (i === idx ? cleaned : ex));
      return {
        ...current,
        weeklyPlan: { ...w, [dayName]: { ...day, exercises: nextExercises } },
      };
    });
    setEditTarget(null);
  };

  const openCardioEditor = (dayName: DayName) => {
    haptics.fire('tap');
    const day = weekly[dayName];
    const existing = day?.cardio;
    setEditCardio({
      day: dayName,
      // Seed draft with the current cardio (if any) so editing
      // pre-fills, or empty fields when adding fresh.
      draft: { type: existing?.type ?? '', committed: existing?.committed ?? true },
    });
  };

  const handleSaveCardioEdit = () => {
    if (!editCardio) return;
    const { day: dayName, draft } = editCardio;
    haptics.fire('tap');
    const trimmed = draft.type.trim();
    updateDraft((current) => {
      const w = current.weeklyPlan ?? {};
      const day = w[dayName] ?? { label: 'Workout', exercises: [], cardio: null };
      // Empty type = remove cardio. Non-empty = upsert.
      const nextCardio = trimmed
        ? { type: trimmed, committed: !!draft.committed }
        : null;
      return {
        ...current,
        weeklyPlan: { ...w, [dayName]: { ...day, cardio: nextCardio } },
      };
    });
    setEditCardio(null);
  };

  const handleRemoveCardio = (dayName: DayName) => {
    haptics.fire('tap');
    updateDraft((current) => {
      const w = current.weeklyPlan ?? {};
      const day = w[dayName];
      if (!day) return current;
      return {
        ...current,
        weeklyPlan: { ...w, [dayName]: { ...day, cardio: null } },
      };
    });
    setEditCardio(null);
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: 'Plan' }} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          // When the save bar is visible, give the scroll content extra
          // bottom padding so the user can see the last day card above
          // the sticky bar.
          isDirty ? { paddingBottom: 110 } : null,
        ]}>

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
                    <Pressable
                      onPress={() => openCardioEditor(dayName)}
                      accessibilityLabel={`Edit cardio for ${dayName}`}
                      style={({ pressed }) => [
                        styles.cardioRow,
                        { borderTopColor: t.border, opacity: pressed ? 0.6 : 1 },
                      ]}>
                      <Ionicons name="walk-outline" size={16} color={t.fitness} />
                      <Text style={[styles.cardioLabel, { color: t.text, flex: 1 }]}>{cardioLabel}</Text>
                      <Ionicons name="create-outline" size={14} color={t.muted} />
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={() => openCardioEditor(dayName)}
                      accessibilityLabel={`Add cardio to ${dayName}`}
                      style={({ pressed }) => [
                        styles.cardioRow,
                        { borderTopColor: t.border, opacity: pressed ? 0.6 : 1 },
                      ]}>
                      <Ionicons name="add-circle-outline" size={16} color={t.muted} />
                      <Text style={[styles.cardioLabel, { color: t.muted, flex: 1, fontStyle: 'italic' }]}>
                        Add cardio session
                      </Text>
                    </Pressable>
                  )}
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

      {/* Sticky save/discard banner — appears only when there are
          unsaved manual edits or AI-proposed revisions. Save commits
          the working plan via PATCH and bounces to the Fitness tab so
          the user sees their changes in the workout-of-the-day card. */}
      {isDirty ? (
        <View style={[styles.saveBar, { backgroundColor: t.surface, borderTopColor: t.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.saveBarTitle, { color: t.text }]}>Unsaved changes</Text>
            <Text style={[styles.saveBarHint, { color: t.muted }]} numberOfLines={1}>
              Review the days above. Save to apply, Cancel to discard.
            </Text>
          </View>
          <Pressable
            onPress={handleDiscardDraft}
            disabled={savingDraft}
            style={({ pressed }) => [
              styles.saveBarGhost,
              { opacity: pressed ? 0.6 : 1 },
            ]}>
            <Text style={[styles.saveBarGhostLabel, { color: t.muted }]}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={handleSaveDraft}
            disabled={savingDraft}
            style={({ pressed }) => [
              styles.saveBarPrimary,
              { backgroundColor: t.accent, opacity: pressed || savingDraft ? 0.85 : 1 },
            ]}>
            {savingDraft ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark" size={16} color="#fff" />
                <Text style={styles.primaryLabel}>Save</Text>
              </>
            )}
          </Pressable>
        </View>
      ) : null}

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

      {/* Cardio editor — opens when user taps a cardio row OR the
          "Add cardio session" CTA on a day with no cardio yet. Single
          field (type label) plus a Remove button when editing an
          existing cardio session. */}
      <Modal
        visible={!!editCardio}
        transparent
        animationType="fade"
        onRequestClose={() => setEditCardio(null)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}>
          <Pressable
            onPress={() => setEditCardio(null)}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.modalSheet, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={[styles.modalTitle, { color: t.text }]}>
              {weekly[editCardio?.day as DayName]?.cardio?.type ? 'Edit cardio' : 'Add cardio'}
            </Text>

            <Text style={[styles.modalLabel, { color: t.muted }]}>Session type</Text>
            <TextInput
              value={editCardio?.draft.type ?? ''}
              onChangeText={(v) => setEditCardio((prev) =>
                prev ? { ...prev, draft: { ...prev.draft, type: v } } : prev)}
              placeholder="e.g. Easy Run, Incline Walk, Bike Intervals"
              placeholderTextColor={t.subtle}
              autoCapitalize="words"
              style={[
                styles.modalInput,
                { color: t.text, backgroundColor: t.surface2, borderColor: t.border },
              ]}
            />
            <Text style={[styles.modalHint, { color: t.subtle }]}>
              Leave blank and Save to clear cardio for this day.
            </Text>

            <View style={styles.modalActions}>
              {weekly[editCardio?.day as DayName]?.cardio?.type ? (
                <Pressable
                  onPress={() => editCardio && handleRemoveCardio(editCardio.day)}
                  style={[styles.secondaryGhost, { marginRight: 'auto' }]}
                  accessibilityLabel="Remove cardio">
                  <Ionicons name="trash-outline" size={14} color={t.danger} />
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => { haptics.fire('tap'); setEditCardio(null); }}
                style={styles.secondaryGhost}>
                <Text style={[styles.secondaryLabel, { color: t.muted }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSaveCardioEdit}
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

  // Save/Discard sticky banner — shown when draftPlan is non-null
  saveBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 18,
    borderTopWidth: 1,
  },
  saveBarTitle: { fontSize: 13, fontWeight: '700' },
  saveBarHint: { fontSize: 11, marginTop: 1 },
  saveBarGhost: { paddingHorizontal: 12, paddingVertical: 10 },
  saveBarGhostLabel: { fontSize: 13, fontWeight: '600' },
  saveBarPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 100,
    minWidth: 92,
    justifyContent: 'center',
  },

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
  modalHint: { fontSize: 11, fontStyle: 'italic', marginTop: 4 },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
  },
});

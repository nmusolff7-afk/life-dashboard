import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { estimateBurn, logWorkout } from '../../lib/api/fitness';
import {
  blankExercise,
  blankSet,
  buildWorkoutDescription,
  formatTimer,
  saveTemplate,
  type StrengthExercise,
} from '../../lib/strength';
import { useStrengthSession } from '../../lib/useStrengthSession';
import { useTokens } from '../../lib/theme';

interface Props {
  /** Called after a session is logged successfully — triggers refetch on caller. */
  onLogged: () => void;
}

/** Full-screen strength workout tracker — ports Flask's #checklist-overlay.
 *  Session state lives in useStrengthSession so the modal is minimizable and
 *  the banner outside keeps ticking. Save & Log flow builds a descriptive
 *  string, calls /api/burn-estimate + /api/log-workout. */
export function StrengthTrackerModal({ onLogged }: Props) {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const session = useStrengthSession();
  const [now, setNow] = useState(Date.now());
  const [saving, setSaving] = useState(false);

  const visible = session.modalVisible;
  const exercises = session.exercises;
  const startTs = session.startTs;
  const lastTickTs = session.lastTickTs;

  // Timer tick. Runs whenever there's an active session (visible or not).
  useEffect(() => {
    if (startTs == null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startTs]);

  const elapsedSec = startTs != null ? Math.floor((now - startTs) / 1000) : 0;
  const restSec = lastTickTs != null ? Math.floor((now - lastTickTs) / 1000) : 0;

  // ── Mutators (all go through context.setExercises) ───────────────────────

  const updateExercise = useCallback(
    (idx: number, update: (ex: StrengthExercise) => StrengthExercise) => {
      session.setExercises(exercises.map((ex, i) => (i === idx ? update(ex) : ex)));
    },
    [exercises, session],
  );

  const toggleSet = (exIdx: number, setIdx: number) => {
    session.tickRest();
    updateExercise(exIdx, (ex) => ({
      ...ex,
      sets: ex.sets.map((s, i) => (i === setIdx ? { ...s, completed: !s.completed } : s)),
    }));
  };

  const setWeight = (exIdx: number, setIdx: number, value: string) => {
    updateExercise(exIdx, (ex) => ({
      ...ex,
      sets: ex.sets.map((s, i) => (i === setIdx ? { ...s, weight: value } : s)),
    }));
  };

  const setReps = (exIdx: number, setIdx: number, value: string) => {
    updateExercise(exIdx, (ex) => ({
      ...ex,
      sets: ex.sets.map((s, i) => (i === setIdx ? { ...s, reps: value } : s)),
    }));
  };

  const renameExercise = (exIdx: number, name: string) => {
    updateExercise(exIdx, (ex) => ({ ...ex, name }));
  };

  const addSet = (exIdx: number) => {
    updateExercise(exIdx, (ex) => ({ ...ex, sets: [...ex.sets, blankSet()] }));
  };

  const removeSet = (exIdx: number, setIdx: number) => {
    updateExercise(exIdx, (ex) => ({ ...ex, sets: ex.sets.filter((_, i) => i !== setIdx) }));
  };

  const addExercise = () => {
    session.setExercises([...exercises, blankExercise(`Exercise ${exercises.length + 1}`)]);
  };

  const removeExercise = (idx: number) => {
    session.setExercises(exercises.filter((_, i) => i !== idx));
  };

  // ── Minimize / discard ───────────────────────────────────────────────────

  const handleMinimize = () => {
    // Minimize just hides the modal — session keeps ticking + banner shows.
    session.minimize();
  };

  const handleDiscard = () => {
    const anyCompleted = exercises.some((ex) => ex.sets.some((s) => s.completed));
    if (anyCompleted) {
      Alert.alert('Discard workout?', 'All progress in this session will be lost.', [
        { text: 'Keep going', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => void session.end() },
      ]);
    } else {
      void session.end();
    }
  };

  // ── Save & Log ───────────────────────────────────────────────────────────

  const handleSave = async () => {
    const anyCompleted = exercises.some((ex) => ex.sets.some((s) => s.completed));
    if (!anyCompleted) {
      Alert.alert('No sets completed', 'Check off at least one set before logging.');
      return;
    }
    setSaving(true);
    try {
      const description = buildWorkoutDescription(exercises, elapsedSec);
      let calories = 0;
      try {
        const est = await estimateBurn(description);
        calories = est.calories_burned ?? 0;
      } catch {
        calories = Math.max(50, Math.round((elapsedSec / 60) * 5));
      }
      await logWorkout(description, calories);
      await saveTemplate(exercises);
      onLogged();
      await session.end();
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <Modal
      animationType="slide"
      presentationStyle="fullScreen"
      visible={visible}
      onRequestClose={handleMinimize}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, backgroundColor: t.bg }}>
        <View
          style={[
            styles.header,
            {
              backgroundColor: t.surface,
              borderBottomColor: t.border,
              paddingTop: insets.top + 8,
            },
          ]}>
          <Pressable onPress={handleMinimize} style={styles.headerBtn} hitSlop={8}>
            <Ionicons name="chevron-down" size={24} color={t.muted} />
            <Text style={[styles.headerBtnLabel, { color: t.muted }]}>Hide</Text>
          </Pressable>

          <View style={styles.timers}>
            <View style={styles.timerBlock}>
              <Text style={[styles.timerValue, { color: t.text }]}>{formatTimer(elapsedSec)}</Text>
              <Text style={[styles.timerLabel, { color: t.muted }]}>Workout</Text>
            </View>
            <View style={[styles.timerDivider, { backgroundColor: t.border }]} />
            <View style={styles.timerBlock}>
              <Text style={[styles.timerValue, { color: t.accent }]}>{formatTimer(restSec)}</Text>
              <Text style={[styles.timerLabel, { color: t.muted }]}>Rest</Text>
            </View>
          </View>

          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={[styles.saveBtn, { backgroundColor: t.green, opacity: saving ? 0.8 : 1 }]}>
            {saving ? <ActivityIndicator color="#fff" /> : (
              <Text style={styles.saveLabel}>Save & Log</Text>
            )}
          </Pressable>
        </View>

        {/* Secondary toolbar row: Discard button so it's not in the primary header */}
        <View style={[styles.subHeader, { borderBottomColor: t.border }]}>
          <Pressable onPress={handleDiscard} hitSlop={6}>
            <Text style={[styles.discardLabel, { color: t.danger }]}>Discard workout</Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 96 }]}
          keyboardShouldPersistTaps="handled">
          {exercises.map((ex, exIdx) => (
            <ExerciseBlock
              key={exIdx}
              exercise={ex}
              onRename={(name) => renameExercise(exIdx, name)}
              onToggleSet={(setIdx) => toggleSet(exIdx, setIdx)}
              onWeight={(setIdx, v) => setWeight(exIdx, setIdx, v)}
              onReps={(setIdx, v) => setReps(exIdx, setIdx, v)}
              onAddSet={() => addSet(exIdx)}
              onRemoveSet={(setIdx) => removeSet(exIdx, setIdx)}
              onRemoveExercise={() => removeExercise(exIdx)}
              canRemove={exercises.length > 1}
            />
          ))}

          <Pressable
            onPress={addExercise}
            style={[styles.addExerciseBtn, { borderColor: t.border }]}>
            <Ionicons name="add" size={18} color={t.accent} />
            <Text style={[styles.addExerciseLabel, { color: t.accent }]}>Add exercise</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Exercise block ─────────────────────────────────────────────────────

interface BlockProps {
  exercise: StrengthExercise;
  onRename: (name: string) => void;
  onToggleSet: (setIdx: number) => void;
  onWeight: (setIdx: number, value: string) => void;
  onReps: (setIdx: number, value: string) => void;
  onAddSet: () => void;
  onRemoveSet: (setIdx: number) => void;
  onRemoveExercise: () => void;
  canRemove: boolean;
}

function ExerciseBlock({
  exercise,
  onRename,
  onToggleSet,
  onWeight,
  onReps,
  onAddSet,
  onRemoveSet,
  onRemoveExercise,
  canRemove,
}: BlockProps) {
  const t = useTokens();
  const done = exercise.sets.filter((s) => s.completed).length;

  return (
    <View style={[blockStyles.card, { backgroundColor: t.surface, shadowColor: '#000' }]}>
      <View style={blockStyles.header}>
        <TextInput
          value={exercise.name}
          onChangeText={onRename}
          style={[blockStyles.name, { color: t.text }]}
          placeholder="Exercise name"
          placeholderTextColor={t.subtle}
        />
        <Text style={[blockStyles.progress, { color: t.muted }]}>
          {done} / {exercise.sets.length}
        </Text>
        {canRemove ? (
          <Pressable onPress={onRemoveExercise} hitSlop={8} style={blockStyles.trashBtn}>
            <Ionicons name="trash-outline" size={16} color={t.danger} />
          </Pressable>
        ) : null}
      </View>

      {exercise.sets.map((s, setIdx) => (
        <View key={setIdx} style={[blockStyles.setRow, { borderBottomColor: t.border }]}>
          <Pressable
            onPress={() => onToggleSet(setIdx)}
            hitSlop={6}
            style={[
              blockStyles.checkbox,
              {
                backgroundColor: s.completed ? t.green : 'transparent',
                borderColor: s.completed ? t.green : t.muted,
              },
            ]}>
            {s.completed ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
          </Pressable>
          <Text style={[blockStyles.setLabel, { color: s.completed ? t.muted : t.text }]}>
            Set {setIdx + 1}
          </Text>
          <TextInput
            value={s.weight}
            onChangeText={(v) => onWeight(setIdx, v)}
            keyboardType="decimal-pad"
            placeholder="lbs"
            placeholderTextColor={t.subtle}
            style={[
              blockStyles.smallInput,
              { color: t.text, backgroundColor: t.surface2, borderColor: t.border },
            ]}
          />
          <Text style={[blockStyles.times, { color: t.muted }]}>×</Text>
          <TextInput
            value={s.reps}
            onChangeText={(v) => onReps(setIdx, v)}
            keyboardType="number-pad"
            placeholder="reps"
            placeholderTextColor={t.subtle}
            style={[
              blockStyles.smallInput,
              { color: t.text, backgroundColor: t.surface2, borderColor: t.border },
            ]}
          />
          <Pressable onPress={() => onRemoveSet(setIdx)} hitSlop={6} style={blockStyles.removeSet}>
            <Ionicons name="close" size={16} color={t.muted} />
          </Pressable>
        </View>
      ))}

      <Pressable onPress={onAddSet} style={blockStyles.addSetBtn}>
        <Ionicons name="add" size={14} color={t.accent} />
        <Text style={[blockStyles.addSetLabel, { color: t.accent }]}>Add set</Text>
      </Pressable>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  headerBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 4, gap: 2 },
  headerBtnLabel: { fontSize: 13, fontWeight: '500' },

  timers: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  timerBlock: { alignItems: 'center' },
  timerValue: { fontSize: 18, fontWeight: '700', letterSpacing: 0.5 },
  timerLabel: { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 1 },
  timerDivider: { width: 1, height: 26 },

  saveBtn: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 100,
  },
  saveLabel: { fontSize: 13, fontWeight: '700', color: '#fff' },

  subHeader: {
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  discardLabel: { fontSize: 12, fontWeight: '600' },

  body: { padding: 14, gap: 10 },

  addExerciseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 16,
    paddingVertical: 14,
  },
  addExerciseLabel: { fontSize: 14, fontWeight: '600' },
});

const blockStyles = StyleSheet.create({
  card: {
    borderRadius: 18,
    padding: 14,
    gap: 4,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 2,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 8 },
  name: { flex: 1, fontSize: 15, fontWeight: '700', padding: 0 },
  progress: { fontSize: 12, fontWeight: '500' },
  trashBtn: { padding: 4 },

  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setLabel: { fontSize: 13, fontWeight: '500', width: 46 },
  smallInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 14,
    textAlign: 'center',
  },
  times: { fontSize: 14 },
  removeSet: { padding: 2 },

  addSetBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 2 },
  addSetLabel: { fontSize: 12, fontWeight: '600' },
});

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { WorkoutSessionType } from '../../../shared/src/types/home';
import { estimateBurn, logWorkout, saveWorkoutTemplate } from '../../lib/api/fitness';
import { useHaptics } from '../../lib/useHaptics';
import { useTokens } from '../../lib/theme';

interface Props {
  onLogged: () => void;
  onTemplateSaved?: () => void;
  initialDescription?: string;
  initialCalories?: number | null;
  /** Strength tracker modal trigger — replaces the old FAB Strength submenu. */
  onStrengthPress?: () => void;
  /** Structured cardio entry modal. */
  onCardioPress?: () => void;
  /** Saved workouts picker. */
  onSavedPress?: () => void;
  /** Weight modal. */
  onWeightPress?: () => void;
}

/** Log a workout by describing it — AI estimates kcal burn + classifies
 *  cardio/strength. Mirrors LogMealCard visually and behaviorally:
 *    • input first
 *    • estimate button only visible once user starts typing
 *    • kcal + session-type chip appear only after estimate
 *    • four-action row below replaces the FAB workout submenu
 */
type Mode = 'input' | 'estimated';

export function LogActivityCard({
  onLogged,
  onTemplateSaved,
  initialDescription = '',
  initialCalories = null,
  onStrengthPress,
  onCardioPress,
  onSavedPress,
  onWeightPress,
}: Props) {
  const t = useTokens();
  const haptics = useHaptics();
  const [description, setDescription] = useState(initialDescription);
  const [calories, setCalories] = useState<number | null>(initialCalories);
  const [notes, setNotes] = useState<string>('');
  const [sessionType, setSessionType] = useState<WorkoutSessionType | null>(null);
  const [mode, setMode] = useState<Mode>(initialCalories != null ? 'estimated' : 'input');
  const [estimating, setEstimating] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setDescription('');
    setCalories(null);
    setNotes('');
    setSessionType(null);
    setMode('input');
  };

  const handleTextChange = (v: string) => {
    setDescription(v);
    // Any edit after an estimate invalidates it — match LogMealCard's
    // "re-type clears the estimate" behaviour so users aren't saving a
    // stale AI result against new text.
    if (mode === 'estimated') {
      setCalories(null);
      setNotes('');
      setSessionType(null);
      setMode('input');
    }
  };

  const handleEstimate = async () => {
    const desc = description.trim();
    if (!desc) return;
    haptics.fire('tap');
    setEstimating(true);
    try {
      const est = await estimateBurn(desc);
      setCalories(est.calories_burned);
      setNotes(est.notes ?? '');
      setSessionType(est.session_type ?? null);
      setMode('estimated');
    } catch (e) {
      haptics.fire('error');
      Alert.alert('Burn estimate failed', e instanceof Error ? e.message : String(e));
    } finally {
      setEstimating(false);
    }
  };

  const handleSave = async () => {
    if (calories == null) return;
    haptics.fire('tap');
    setSaving(true);
    try {
      await logWorkout(description.trim(), calories, sessionType);
      haptics.fire('success');
      reset();
      onLogged();
    } catch (e) {
      haptics.fire('error');
      Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (calories == null) return;
    haptics.fire('tap');
    try {
      await saveWorkoutTemplate(description.trim(), calories);
      onTemplateSaved?.();
      Alert.alert('Saved', 'Added to your saved workouts.');
    } catch (e) {
      haptics.fire('error');
      Alert.alert("Couldn't save", e instanceof Error ? e.message : String(e));
    }
  };

  const hasText = description.trim().length > 0;
  const kcalDisplay = calories ?? 0;

  return (
    <View style={[styles.card, { backgroundColor: t.surface, shadowColor: '#000' }]}>
      <Text style={[styles.title, { color: t.muted }]}>Log a workout</Text>

      <TextInput
        value={description}
        onChangeText={handleTextChange}
        placeholder="describe a workout you've completed"
        placeholderTextColor={t.subtle}
        multiline
        style={[styles.input, { color: t.text, backgroundColor: t.surface2, borderColor: t.border }]}
      />
      <Text style={[styles.exampleHint, { color: t.subtle }]}>e.g. 4mi walk</Text>

      {mode === 'input' ? (
        <>
          {hasText ? (
            <Pressable
              onPress={handleEstimate}
              disabled={estimating}
              style={({ pressed }) => [
                styles.estimateBtn,
                { backgroundColor: t.accent, opacity: pressed || estimating ? 0.7 : 1 },
              ]}>
              {estimating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="sparkles" size={16} color="#fff" />
                  <Text style={styles.estimateLabel}>Estimate burn</Text>
                </>
              )}
            </Pressable>
          ) : null}

          {/* Four-action row — visible always, mirrors the Nutrition
              card's Photo/Barcode/Pantry/Saved cluster. Mapping per 11.5.3:
              Strength Workout / Manual Cardio / Saved Workouts / Log Weight. */}
          <View style={styles.iconRow}>
            <IconBtn icon="barbell-outline" label="Strength" onPress={onStrengthPress} />
            <IconBtn icon="walk-outline" label="Cardio" onPress={onCardioPress} />
            <IconBtn icon="bookmark-outline" label="Saved" onPress={onSavedPress} />
            <IconBtn icon="scale-outline" label="Weight" onPress={onWeightPress} />
          </View>
        </>
      ) : (
        <EstimatedBreakdown
          description={description}
          kcal={kcalDisplay}
          sessionType={sessionType}
          notes={notes}
          onLog={handleSave}
          onRedo={handleEstimate}
          onSaveTemplate={handleSaveTemplate}
          onKcalEdit={(v) => setCalories(v)}
          saving={saving}
          redoing={estimating}
        />
      )}
    </View>
  );
}

// ── Estimated breakdown ────────────────────────────────────────────────

function EstimatedBreakdown({
  description,
  kcal,
  sessionType,
  notes,
  onLog,
  onRedo,
  onSaveTemplate,
  onKcalEdit,
  saving,
  redoing,
}: {
  description: string;
  kcal: number;
  sessionType: WorkoutSessionType | null;
  notes: string;
  onLog: () => void;
  onRedo: () => void;
  onSaveTemplate: () => void;
  onKcalEdit: (v: number) => void;
  saving: boolean;
  redoing: boolean;
}) {
  const t = useTokens();
  // Make the AI's kcal estimate inline-editable. Tap the number → text
  // input opens. Saves are confirm-before-commit (the primary button
  // shows the number you're about to log so there's no surprise).
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(kcal));
  // Keep draft in sync if a fresh re-estimate arrives.
  useEffect(() => { if (!editing) setDraft(String(kcal)); }, [kcal, editing]);
  const commitEdit = () => {
    const v = parseInt(draft.replace(/[^0-9]/g, ''), 10);
    if (Number.isFinite(v) && v >= 0) onKcalEdit(v);
    setEditing(false);
  };

  return (
    <View style={breakdown.wrap}>
      <Text style={[breakdown.headerLabel, { color: t.muted }]}>AI ESTIMATE — TAP TO EDIT</Text>
      {editing ? (
        <View style={breakdown.editRow}>
          <TextInput
            value={draft}
            onChangeText={(v) => setDraft(v.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            autoFocus
            onBlur={commitEdit}
            onSubmitEditing={commitEdit}
            style={[breakdown.kcalInput, { color: t.cal, borderColor: t.border, backgroundColor: t.surface2 }]}
          />
          <Text style={[breakdown.kcalUnit, { color: t.muted }]}>kcal</Text>
          <Pressable onPress={commitEdit} hitSlop={10} style={breakdown.editDoneBtn}>
            <Text style={[breakdown.editDoneText, { color: t.accent }]}>Done</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={() => setEditing(true)} accessibilityLabel="Edit calorie estimate">
          <Text style={[breakdown.kcal, { color: t.cal }]}>
            {kcal.toLocaleString()} <Text style={[breakdown.kcalUnit, { color: t.muted }]}>kcal</Text>
            <Text style={[breakdown.kcalEditHint, { color: t.subtle }]}>  ✎</Text>
          </Text>
        </Pressable>
      )}

      {sessionType ? (
        <View style={breakdown.typeRow}>
          <View style={[breakdown.typeChip, { backgroundColor: t.surface2, borderColor: t.border }]}>
            <Ionicons
              name={sessionType === 'cardio' ? 'walk-outline' : sessionType === 'strength' ? 'barbell-outline' : 'flash-outline'}
              size={12}
              color={t.accent}
            />
            <Text style={[breakdown.typeLabel, { color: t.text }]}>
              {sessionType === 'cardio' ? 'Cardio' : sessionType === 'strength' ? 'Strength' : 'Mixed'}
            </Text>
          </View>
          <Text style={[breakdown.typeHint, { color: t.subtle }]}>AI-detected</Text>
        </View>
      ) : null}

      {notes ? (
        <Text style={[breakdown.notes, { color: t.muted }]}>
          <Ionicons name="information-circle-outline" size={12} color={t.muted} /> {notes}
        </Text>
      ) : null}

      {/* Transparency note: tell the user this is a model estimate, not a
          measured number. They can edit the kcal value above; pressing
          "Log" commits whatever's currently shown. */}
      <Text style={[breakdown.transparencyNote, { color: t.subtle }]}>
        AI estimates are usually within ~15% but can be off — especially for cardio without HR data. Tap the number above to override before logging.
      </Text>

      <View style={breakdown.actions}>
        <Pressable
          onPress={onSaveTemplate}
          style={({ pressed }) => [breakdown.templateBtn, { opacity: pressed ? 0.6 : 1 }]}
          accessibilityLabel="Save as template">
          <Ionicons name="bookmark-outline" size={14} color={t.muted} />
          <Text style={[breakdown.templateLabel, { color: t.muted }]}>Save as template</Text>
        </Pressable>

        <Pressable
          onPress={onRedo}
          disabled={redoing}
          style={[breakdown.secondary, { backgroundColor: t.surface2 }]}>
          {redoing ? (
            <ActivityIndicator color={t.accent} />
          ) : (
            <Text style={[breakdown.secondaryLabel, { color: t.accent }]}>Re-estimate</Text>
          )}
        </Pressable>

        <Pressable
          onPress={onLog}
          disabled={saving}
          style={({ pressed }) => [
            breakdown.primary,
            { backgroundColor: t.accent, opacity: saving || pressed ? 0.85 : 1 },
          ]}>
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={breakdown.primaryLabel}>Log {kcal.toLocaleString()} kcal</Text>
          )}
        </Pressable>
      </View>

      <Text style={[breakdown.originalDesc, { color: t.subtle }]} numberOfLines={2}>
        “{description}”
      </Text>
    </View>
  );
}

// ── Icon-row buttons ───────────────────────────────────────────────────

function IconBtn({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress?: () => void;
}) {
  const t = useTokens();
  const haptics = useHaptics();
  const comingSoon = !onPress;
  return (
    <Pressable
      onPress={() => {
        if (comingSoon) {
          Alert.alert('Coming soon', `${label} opens once the wire-through is live.`);
          return;
        }
        haptics.fire('tap');
        onPress?.();
      }}
      accessibilityLabel={label}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.iconBtn,
        {
          backgroundColor: t.surface2,
          borderColor: t.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}>
      <Ionicons name={icon} size={18} color={t.muted} />
      <Text style={[styles.iconBtnLabel, { color: t.muted }]}>{label}</Text>
    </Pressable>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 20,
    gap: 12,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 3,
  },
  title: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.1 },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 56,
  },
  exampleHint: { fontSize: 11, fontStyle: 'italic', marginTop: -6 },
  estimateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 14,
    paddingVertical: 12,
  },
  estimateLabel: { color: '#fff', fontSize: 14, fontWeight: '700' },

  iconRow: { flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  iconBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
  },
  iconBtnLabel: { fontSize: 10, fontWeight: '600' },
});

const breakdown = StyleSheet.create({
  wrap: { gap: 12 },
  headerLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.0, marginBottom: -4 },
  kcal: { fontSize: 28, fontWeight: '700' },
  kcalEditHint: { fontSize: 14, fontWeight: '400' },
  kcalUnit: { fontSize: 12, fontWeight: '500' },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kcalInput: {
    fontSize: 28, fontWeight: '700',
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 6,
    minWidth: 110, textAlign: 'center',
  },
  editDoneBtn: { paddingVertical: 6, paddingHorizontal: 10 },
  editDoneText: { fontSize: 13, fontWeight: '700' },
  transparencyNote: { fontSize: 11, lineHeight: 15, fontStyle: 'italic' },

  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  typeLabel: { fontSize: 11, fontWeight: '700' },
  typeHint: { fontSize: 10, fontStyle: 'italic' },

  notes: { fontSize: 12, fontStyle: 'italic' },

  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  templateBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8 },
  templateLabel: { fontSize: 11, fontWeight: '600' },
  secondary: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryLabel: { fontSize: 13, fontWeight: '700' },
  primary: {
    flex: 1,
    minWidth: 120,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: { color: '#fff', fontSize: 14, fontWeight: '700' },

  originalDesc: { fontSize: 12, fontStyle: 'italic', marginTop: 2 },
});

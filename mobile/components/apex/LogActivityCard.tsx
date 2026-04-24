import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { WorkoutSessionType } from '../../../shared/src/types/home';
import { estimateBurn, logWorkout, saveWorkoutTemplate } from '../../lib/api/fitness';
import { useTokens } from '../../lib/theme';

interface Props {
  /** Called after a successful workout save so parents can refetch today's list. */
  onLogged: () => void;
  /** Called after saving a new saved-workout template (refresh chips row). */
  onTemplateSaved?: () => void;
  /** Optional prefill (from tapping a saved-workout chip). */
  initialDescription?: string;
  initialCalories?: number | null;
}

/** Flask #log-workout-card: description input, AI burn estimate, save.
 *  Mirrors the templates/index.html log-workout flow. */
export function LogActivityCard({
  onLogged,
  onTemplateSaved,
  initialDescription = '',
  initialCalories = null,
}: Props) {
  const t = useTokens();
  const [description, setDescription] = useState(initialDescription);
  const [calories, setCalories] = useState<string>(
    initialCalories != null ? String(initialCalories) : '',
  );
  const [notes, setNotes] = useState<string>('');
  const [sessionType, setSessionType] = useState<WorkoutSessionType | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setDescription('');
    setCalories('');
    setNotes('');
    setSessionType(null);
  };

  const handleEstimate = async () => {
    const desc = description.trim();
    if (!desc) {
      Alert.alert('Add a description', 'Describe the workout so we can estimate burn.');
      return;
    }
    setEstimating(true);
    try {
      const est = await estimateBurn(desc);
      setCalories(String(est.calories_burned));
      setNotes(est.notes ?? '');
      setSessionType(est.session_type ?? null);
    } catch (e) {
      Alert.alert('Burn estimate failed', e instanceof Error ? e.message : String(e));
    } finally {
      setEstimating(false);
    }
  };

  const handleSave = async () => {
    const desc = description.trim();
    const kcal = parseInt(calories, 10);
    if (!desc) {
      Alert.alert('Add a description', 'Describe the workout first.');
      return;
    }
    if (!Number.isFinite(kcal) || kcal < 0) {
      Alert.alert('Missing calories', 'Tap Estimate burn or type a number.');
      return;
    }
    setSaving(true);
    try {
      await logWorkout(desc, kcal, sessionType);
      reset();
      onLogged();
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTemplate = async () => {
    const desc = description.trim();
    const kcal = parseInt(calories, 10);
    if (!desc || !Number.isFinite(kcal) || kcal <= 0) {
      Alert.alert('Fill in the workout first', 'Description + calories required before saving as a template.');
      return;
    }
    try {
      await saveWorkoutTemplate(desc, kcal);
      onTemplateSaved?.();
      Alert.alert('Saved', 'Added to your quick-log templates.');
    } catch (e) {
      Alert.alert('Couldn’t save template', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: t.surface, shadowColor: '#000' }]}>
      <Text style={[styles.title, { color: t.muted }]}>Log activity</Text>

      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder="e.g. 30 min run, 5k pace"
        placeholderTextColor={t.subtle}
        multiline
        style={[styles.input, { color: t.text, backgroundColor: t.surface2, borderColor: t.border }]}
      />

      <View style={styles.row}>
        <TextInput
          value={calories}
          onChangeText={setCalories}
          placeholder="kcal"
          keyboardType="number-pad"
          placeholderTextColor={t.subtle}
          style={[styles.kcalInput, { color: t.text, backgroundColor: t.surface2, borderColor: t.border }]}
        />
        <Pressable
          onPress={handleEstimate}
          disabled={estimating || !description.trim()}
          style={[
            styles.estBtn,
            {
              backgroundColor: t.surface2,
              borderColor: t.border,
              opacity: !description.trim() ? 0.5 : 1,
            },
          ]}>
          {estimating ? (
            <ActivityIndicator color={t.accent} />
          ) : (
            <>
              <Ionicons name="flash-outline" size={16} color={t.accent} />
              <Text style={[styles.estLabel, { color: t.accent }]}>Estimate burn</Text>
            </>
          )}
        </Pressable>
      </View>

      {sessionType ? (
        <View style={styles.typeRow}>
          <View style={[styles.typeChip, { backgroundColor: t.surface2, borderColor: t.border }]}>
            <Ionicons
              name={sessionType === 'cardio' ? 'walk-outline' : sessionType === 'strength' ? 'barbell-outline' : 'flash-outline'}
              size={12}
              color={t.accent}
            />
            <Text style={[styles.typeLabel, { color: t.text }]}>
              {sessionType === 'cardio' ? 'Cardio' : sessionType === 'strength' ? 'Strength' : 'Mixed'}
            </Text>
          </View>
          <Text style={[styles.typeHint, { color: t.subtle }]}>AI-detected</Text>
        </View>
      ) : null}

      {notes ? (
        <Text style={[styles.notes, { color: t.muted }]}>
          <Ionicons name="information-circle-outline" size={12} color={t.muted} /> {notes}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          onPress={handleSaveTemplate}
          style={({ pressed }) => [styles.templateBtn, { opacity: pressed ? 0.6 : 1 }]}>
          <Ionicons name="bookmark-outline" size={14} color={t.muted} />
          <Text style={[styles.templateLabel, { color: t.muted }]}>Save template</Text>
        </Pressable>

        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={({ pressed }) => [
            styles.saveBtn,
            { backgroundColor: t.accent, opacity: saving || pressed ? 0.85 : 1 },
          ]}>
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveLabel}>Log workout</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

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
  row: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  kcalInput: {
    width: 90,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    textAlign: 'center',
  },
  estBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  estLabel: { fontSize: 13, fontWeight: '600' },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -4 },
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
  notes: { fontSize: 12, marginTop: -4 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  templateBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  templateLabel: { fontSize: 12, fontWeight: '500' },
  saveBtn: {
    borderRadius: 14,
    paddingHorizontal: 22,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 130,
  },
  saveLabel: { fontSize: 14, fontWeight: '700', color: '#fff' },
});

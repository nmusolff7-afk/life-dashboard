import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { Workout } from '../../../shared/src/types/home';
import { deleteWorkout, editWorkout } from '../../lib/api/fitness';
import { useTokens } from '../../lib/theme';

interface Props {
  workouts: Workout[];
  /** Refetch today's workouts after an edit/delete. */
  onChanged: () => void;
}

/** Rough classifier for strength vs. cardio vs. mixed based on description
 *  keywords. Matches Flask's UI affordance of showing a type icon per row. */
function classify(description: string): 'strength' | 'cardio' | 'mixed' {
  const d = description.toLowerCase();
  const strength = /\b(lift|bench|squat|deadlift|press|curl|row|pull[-\s]?up|push[-\s]?up|dumbbell|barbell|kettlebell|sets?|reps?)\b/;
  const cardio = /\b(run|jog|bike|cycle|row(?:ing)?|swim|walk|hike|elliptical|treadmill|zone|mile|km|pace|hiit)\b/;
  const s = strength.test(d);
  const c = cardio.test(d);
  if (s && c) return 'mixed';
  if (s) return 'strength';
  return c ? 'cardio' : 'mixed';
}

function iconFor(type: 'strength' | 'cardio' | 'mixed'): React.ComponentProps<typeof Ionicons>['name'] {
  switch (type) {
    case 'strength': return 'barbell-outline';
    case 'cardio':   return 'walk-outline';
    default:         return 'sparkles-outline';
  }
}

export function TodayWorkoutsList({ workouts, onChanged }: Props) {
  const t = useTokens();
  const [editing, setEditing] = useState<Workout | null>(null);

  if (workouts.length === 0) {
    return (
      <View style={[styles.card, { backgroundColor: t.surface, shadowColor: '#000' }]}>
        <Text style={[styles.title, { color: t.muted }]}>Today's workouts</Text>
        <Text style={[styles.empty, { color: t.subtle }]}>
          No workouts logged yet today. Log your first above.
        </Text>
      </View>
    );
  }

  const totalBurn = workouts.reduce((sum, w) => sum + (w.calories_burned ?? 0), 0);

  return (
    <View style={[styles.card, { backgroundColor: t.surface, shadowColor: '#000' }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: t.muted }]}>Today's workouts</Text>
        <Text style={[styles.totalBurn, { color: t.cal }]}>{totalBurn} kcal</Text>
      </View>

      {workouts.map((w) => {
        const type = classify(w.description);
        return (
          <Pressable
            key={w.id}
            onPress={() => setEditing(w)}
            style={({ pressed }) => [
              styles.row,
              { borderBottomColor: t.border, opacity: pressed ? 0.6 : 1 },
            ]}>
            <Ionicons name={iconFor(type)} size={20} color={t.fitness} />
            <View style={styles.rowBody}>
              <Text style={[styles.rowDesc, { color: t.text }]} numberOfLines={2}>
                {w.description}
              </Text>
              <Text style={[styles.rowTime, { color: t.muted }]}>
                {formatTime(w.logged_at)}
              </Text>
            </View>
            <Text style={[styles.rowBurn, { color: t.cal }]}>
              {w.calories_burned} <Text style={styles.rowBurnUnit}>kcal</Text>
            </Text>
          </Pressable>
        );
      })}

      <WorkoutEditSheet
        workout={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          onChanged();
        }}
      />
    </View>
  );
}

function formatTime(isoOrTs: string): string {
  // Flask logged_at may be ISO or a time-only string; be defensive.
  const d = new Date(isoOrTs);
  if (isNaN(d.getTime())) return isoOrTs;
  const h = d.getHours();
  const m = d.getMinutes();
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

// ── Edit sheet ──────────────────────────────────────────────────────────

function WorkoutEditSheet({
  workout,
  onClose,
  onSaved,
}: {
  workout: Workout | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTokens();
  const [description, setDescription] = useState('');
  const [calories, setCalories] = useState('');
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);

  // Seed / re-seed when the selected workout changes.
  useEffect(() => {
    if (workout) {
      setDescription(workout.description);
      setCalories(String(workout.calories_burned));
    }
  }, [workout]);

  const handleClose = () => {
    setDescription('');
    setCalories('');
    onClose();
  };

  const handleSave = async () => {
    if (!workout) return;
    const desc = description.trim();
    const kcal = parseInt(calories, 10);
    if (!desc || !Number.isFinite(kcal) || kcal < 0) {
      Alert.alert('Check the fields', 'Description + non-negative calories required.');
      return;
    }
    setBusy('save');
    try {
      await editWorkout(workout.id, desc, kcal);
      handleClose();
      onSaved();
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = () => {
    if (!workout) return;
    Alert.alert('Delete workout?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy('delete');
          try {
            await deleteWorkout(workout.id);
            handleClose();
            onSaved();
          } catch (e) {
            Alert.alert('Delete failed', e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  return (
    <Modal
      transparent
      animationType="fade"
      visible={workout !== null}
      onRequestClose={handleClose}>
      <Pressable onPress={handleClose} style={styles.modalBackdrop}>
        <Pressable onPress={() => {}} style={[styles.modalCard, { backgroundColor: t.surface }]}>
          <Text style={[styles.modalTitle, { color: t.text }]}>Edit workout</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            multiline
            placeholderTextColor={t.subtle}
            style={[styles.modalInput, { color: t.text, backgroundColor: t.surface2, borderColor: t.border }]}
          />
          <TextInput
            value={calories}
            onChangeText={setCalories}
            keyboardType="number-pad"
            placeholder="kcal"
            placeholderTextColor={t.subtle}
            style={[styles.modalKcal, { color: t.text, backgroundColor: t.surface2, borderColor: t.border }]}
          />
          <View style={styles.modalBtns}>
            <Pressable
              onPress={handleDelete}
              disabled={busy !== null}
              style={[styles.modalBtn, { backgroundColor: t.surface2 }]}>
              {busy === 'delete' ? (
                <ActivityIndicator color={t.danger} />
              ) : (
                <Text style={[styles.modalBtnLabel, { color: t.danger }]}>Delete</Text>
              )}
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={busy !== null}
              style={[styles.modalBtn, { backgroundColor: t.accent }]}>
              {busy === 'save' ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[styles.modalBtnLabel, { color: '#fff' }]}>Save</Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 16,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingBottom: 8,
  },
  title: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.1 },
  totalBurn: { fontSize: 14, fontWeight: '700' },
  empty: { fontSize: 13, marginTop: 4 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowBody: { flex: 1 },
  rowDesc: { fontSize: 14, fontWeight: '500' },
  rowTime: { fontSize: 11, marginTop: 2 },
  rowBurn: { fontSize: 15, fontWeight: '700' },
  rowBurnUnit: { fontSize: 10, fontWeight: '500' },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 20,
    padding: 20,
    gap: 12,
  },
  modalTitle: { fontSize: 16, fontWeight: '700' },
  modalInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    minHeight: 64,
  },
  modalKcal: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    width: 120,
    textAlign: 'center',
  },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnLabel: { fontSize: 14, fontWeight: '700' },
});

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
  workout: Workout | null;
  onClose: () => void;
  onSaved: () => void;
}

/** Modal for editing or deleting a logged workout — shared between the Fitness
 *  Today list and the History list. */
export function WorkoutEditSheet({ workout, onClose, onSaved }: Props) {
  const t = useTokens();
  const [description, setDescription] = useState('');
  const [calories, setCalories] = useState('');
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);

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
    <Modal transparent animationType="fade" visible={workout !== null} onRequestClose={handleClose}>
      <Pressable onPress={handleClose} style={styles.backdrop}>
        <Pressable onPress={() => {}} style={[styles.card, { backgroundColor: t.surface }]}>
          <Text style={[styles.title, { color: t.text }]}>Edit workout</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            multiline
            placeholderTextColor={t.subtle}
            style={[styles.input, { color: t.text, backgroundColor: t.surface2, borderColor: t.border }]}
          />
          <TextInput
            value={calories}
            onChangeText={setCalories}
            keyboardType="number-pad"
            placeholder="kcal"
            placeholderTextColor={t.subtle}
            style={[styles.kcal, { color: t.text, backgroundColor: t.surface2, borderColor: t.border }]}
          />
          <View style={styles.btns}>
            <Pressable
              onPress={handleDelete}
              disabled={busy !== null}
              style={[styles.btn, { backgroundColor: t.surface2 }]}>
              {busy === 'delete' ? (
                <ActivityIndicator color={t.danger} />
              ) : (
                <Text style={[styles.btnLabel, { color: t.danger }]}>Delete</Text>
              )}
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={busy !== null}
              style={[styles.btn, { backgroundColor: t.accent }]}>
              {busy === 'save' ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[styles.btnLabel, { color: '#fff' }]}>Save</Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: { width: '100%', maxWidth: 380, borderRadius: 20, padding: 20, gap: 12 },
  title: { fontSize: 16, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    minHeight: 64,
  },
  kcal: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    width: 120,
    textAlign: 'center',
  },
  btns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btn: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  btnLabel: { fontSize: 14, fontWeight: '700' },
});

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { Meal } from '../../../shared/src/types/home';
import { deleteMeal, editMeal } from '../../lib/api/nutrition';
import { useTokens } from '../../lib/theme';

interface Props {
  meal: Meal | null;
  onClose: () => void;
  onSaved: () => void;
}

/** Modal for editing or deleting a logged meal. Editable fields are the
 *  description and every macro/micro. Same structural role as
 *  WorkoutEditSheet but richer because meals carry seven macros. */
export function MealEditSheet({ meal, onClose, onSaved }: Props) {
  const t = useTokens();
  const [description, setDescription] = useState('');
  const [calories, setCalories] = useState('');
  const [proteinG, setProteinG] = useState('');
  const [carbsG, setCarbsG] = useState('');
  const [fatG, setFatG] = useState('');
  const [sugarG, setSugarG] = useState('');
  const [fiberG, setFiberG] = useState('');
  const [sodiumMg, setSodiumMg] = useState('');
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);

  useEffect(() => {
    if (meal) {
      setDescription(meal.description);
      setCalories(String(meal.calories));
      setProteinG(String(meal.protein_g ?? 0));
      setCarbsG(String(meal.carbs_g ?? 0));
      setFatG(String(meal.fat_g ?? 0));
      setSugarG(String(meal.sugar_g ?? 0));
      setFiberG(String(meal.fiber_g ?? 0));
      setSodiumMg(String(meal.sodium_mg ?? 0));
    }
  }, [meal]);

  const handleSave = async () => {
    if (!meal) return;
    const desc = description.trim();
    if (!desc) {
      Alert.alert('Missing description', 'Describe the meal first.');
      return;
    }
    const payload = {
      description: desc,
      calories: parseInt(calories, 10) || 0,
      protein_g: parseFloat(proteinG) || 0,
      carbs_g: parseFloat(carbsG) || 0,
      fat_g: parseFloat(fatG) || 0,
      sugar_g: parseFloat(sugarG) || 0,
      fiber_g: parseFloat(fiberG) || 0,
      sodium_mg: parseFloat(sodiumMg) || 0,
    };
    setBusy('save');
    try {
      await editMeal(meal.id, payload);
      onSaved();
      onClose();
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = () => {
    if (!meal) return;
    Alert.alert('Delete meal?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy('delete');
          try {
            await deleteMeal(meal.id);
            onSaved();
            onClose();
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
    <Modal transparent animationType="fade" visible={meal !== null} onRequestClose={onClose}>
      <Pressable onPress={onClose} style={styles.backdrop}>
        <Pressable onPress={() => {}} style={[styles.card, { backgroundColor: t.surface }]}>
          <Text style={[styles.title, { color: t.text }]}>Edit meal</Text>

          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <Label text="Description" />
            <TextInput
              value={description}
              onChangeText={setDescription}
              multiline
              placeholderTextColor={t.subtle}
              style={[styles.input, { color: t.text, backgroundColor: t.surface2, borderColor: t.border }]}
            />

            <Label text="Calories" />
            <TextInput
              value={calories}
              onChangeText={setCalories}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={t.subtle}
              style={[styles.smallInput, { color: t.text, backgroundColor: t.surface2, borderColor: t.border }]}
            />

            <View style={styles.macroRow}>
              <MacroInput label="Protein g" value={proteinG} onChange={setProteinG} color={t.protein} />
              <MacroInput label="Carbs g" value={carbsG} onChange={setCarbsG} color={t.carbs} />
              <MacroInput label="Fat g" value={fatG} onChange={setFatG} color={t.fat} />
            </View>
            <View style={styles.macroRow}>
              <MacroInput label="Sugar g" value={sugarG} onChange={setSugarG} color={t.sugar} />
              <MacroInput label="Fiber g" value={fiberG} onChange={setFiberG} color={t.fiber} />
              <MacroInput label="Sodium mg" value={sodiumMg} onChange={setSodiumMg} color={t.sodium} />
            </View>
          </ScrollView>

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

function Label({ text }: { text: string }) {
  const t = useTokens();
  return <Text style={[styles.labelText, { color: t.muted }]}>{text}</Text>;
}

function MacroInput({
  label,
  value,
  onChange,
  color,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  color: string;
}) {
  const t = useTokens();
  return (
    <View style={styles.macroCol}>
      <Text style={[styles.macroLabel, { color }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor={t.subtle}
        style={[styles.smallInput, { color: t.text, backgroundColor: t.surface2, borderColor: t.border }]}
      />
    </View>
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
  card: { width: '100%', maxWidth: 420, maxHeight: '85%', borderRadius: 20, padding: 20, gap: 10 },
  title: { fontSize: 16, fontWeight: '700' },
  scroll: { gap: 10, paddingBottom: 4 },
  labelText: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 56,
  },
  smallInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    textAlign: 'center',
  },
  macroRow: { flexDirection: 'row', gap: 8 },
  macroCol: { flex: 1, gap: 4 },
  macroLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  btns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btn: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  btnLabel: { fontSize: 14, fontWeight: '700' },
});

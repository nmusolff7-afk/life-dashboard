import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Meal, NutritionEstimate } from '../../../shared/src/types/home';
import { aiEditMeal, deleteMeal, editMeal } from '../../lib/api/nutrition';
import { useTokens } from '../../lib/theme';
import { MealEditSheet } from './MealEditSheet';
import { ProgressRow } from './ProgressRow';

interface Props {
  meal: Meal | null;
  onClose: () => void;
  onChanged: () => void;
}

type Mode = 'view' | 'ai-edit';

/** Phase-5 meal detail: full-screen overlay shown when tapping a meal row
 *  anywhere in Nutrition. Shows the stored meal with richer affordances than
 *  the plain edit sheet — AI re-estimate with a free-text correction, manual
 *  edit (reuses MealEditSheet), and delete. */
export function MealDetailModal({ meal, onClose, onChanged }: Props) {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('view');
  const [manualOpen, setManualOpen] = useState(false);
  const [correction, setCorrection] = useState('');
  const [aiPreview, setAiPreview] = useState<NutritionEstimate | null>(null);
  const [aiBusy, setAiBusy] = useState<'estimate' | 'save' | null>(null);
  const [deleting, setDeleting] = useState(false);

  const close = () => {
    setMode('view');
    setCorrection('');
    setAiPreview(null);
    onClose();
  };

  const handleAiEstimate = async () => {
    if (!meal) return;
    const edits = correction.trim();
    if (!edits) {
      Alert.alert('Add a correction', 'Describe what should change, e.g. "it was with chicken not tofu".');
      return;
    }
    setAiBusy('estimate');
    try {
      const res = await aiEditMeal(meal.description, edits);
      setAiPreview(res);
    } catch (e) {
      Alert.alert('AI edit failed', e instanceof Error ? e.message : String(e));
    } finally {
      setAiBusy(null);
    }
  };

  const handleAiSave = async () => {
    if (!meal || !aiPreview) return;
    setAiBusy('save');
    try {
      // Append the correction to the description so the log reflects the new reality.
      const newDesc = correction.trim()
        ? `${meal.description} — ${correction.trim()}`
        : meal.description;
      await editMeal(meal.id, {
        description: newDesc,
        calories: aiPreview.calories,
        protein_g: aiPreview.protein_g,
        carbs_g: aiPreview.carbs_g,
        fat_g: aiPreview.fat_g,
        sugar_g: aiPreview.sugar_g,
        fiber_g: aiPreview.fiber_g,
        sodium_mg: aiPreview.sodium_mg,
      });
      onChanged();
      close();
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
    } finally {
      setAiBusy(null);
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
          setDeleting(true);
          try {
            await deleteMeal(meal.id);
            onChanged();
            close();
          } catch (e) {
            Alert.alert('Delete failed', e instanceof Error ? e.message : String(e));
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  if (!meal) return null;

  const loggedDate = new Date(meal.logged_at);
  const dateLabel = isNaN(loggedDate.getTime())
    ? meal.log_date
    : loggedDate.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });

  return (
    <Modal
      animationType="slide"
      presentationStyle="fullScreen"
      visible={meal !== null}
      onRequestClose={close}>
      <View style={[styles.root, { backgroundColor: t.bg, paddingTop: insets.top }]}>
        <View style={[styles.header, { borderBottomColor: t.border }]}>
          <Pressable onPress={close} hitSlop={10} style={styles.closeBtn}>
            <Ionicons name="chevron-back" size={26} color={t.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: t.text }]}>Meal detail</Text>
          <View style={{ width: 26 }} />
        </View>

        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
          {/* Meta: description + timestamp */}
          <View style={styles.metaBlock}>
            <Text style={[styles.desc, { color: t.text }]}>{meal.description}</Text>
            <Text style={[styles.timestamp, { color: t.muted }]}>{dateLabel}</Text>
          </View>

          {/* Big calories */}
          <View style={styles.kcalBlock}>
            <Text style={[styles.kcalBig, { color: t.cal }]}>
              {meal.calories.toLocaleString()}
            </Text>
            <Text style={[styles.kcalLabel, { color: t.muted }]}>KCAL</Text>
          </View>

          {/* Macro / micro progress bars */}
          <View style={[styles.card, { backgroundColor: t.surface, shadowColor: '#000' }]}>
            <Text style={[styles.cardTitle, { color: t.muted }]}>Macros</Text>
            <ProgressRow label="Protein" color={t.protein} consumed={meal.protein_g ?? 0} target={null} unit="g" />
            <ProgressRow label="Carbs"   color={t.carbs}   consumed={meal.carbs_g ?? 0}   target={null} unit="g" />
            <ProgressRow label="Fat"     color={t.fat}     consumed={meal.fat_g ?? 0}     target={null} unit="g" />
          </View>

          {((meal.sugar_g ?? 0) > 0 || (meal.fiber_g ?? 0) > 0 || (meal.sodium_mg ?? 0) > 0) ? (
            <View style={[styles.card, { backgroundColor: t.surface, shadowColor: '#000' }]}>
              <Text style={[styles.cardTitle, { color: t.muted }]}>Micros</Text>
              <ProgressRow label="Sugar"  color={t.sugar}  consumed={meal.sugar_g ?? 0}   target={null} unit="g" />
              <ProgressRow label="Fiber"  color={t.fiber}  consumed={meal.fiber_g ?? 0}   target={null} unit="g" />
              <ProgressRow label="Sodium" color={t.sodium} consumed={meal.sodium_mg ?? 0} target={null} unit="mg" />
            </View>
          ) : null}

          {/* AI Edit panel */}
          {mode === 'ai-edit' ? (
            <View style={[styles.card, { backgroundColor: t.surface, shadowColor: '#000' }]}>
              <Text style={[styles.cardTitle, { color: t.muted }]}>AI re-estimate</Text>
              <TextInput
                value={correction}
                onChangeText={setCorrection}
                placeholder='e.g. "it was with chicken not tofu"'
                placeholderTextColor={t.subtle}
                multiline
                style={[
                  styles.aiInput,
                  { color: t.text, backgroundColor: t.surface2, borderColor: t.border },
                ]}
              />

              {aiPreview ? (
                <View style={[styles.aiPreview, { borderColor: t.border }]}>
                  <Text style={[styles.aiKcal, { color: t.cal }]}>
                    {aiPreview.calories.toLocaleString()}{' '}
                    <Text style={[styles.aiKcalUnit, { color: t.muted }]}>kcal</Text>
                  </Text>
                  <View style={styles.aiMacroRow}>
                    <AiMacroCell label="P" value={aiPreview.protein_g} color={t.protein} />
                    <AiMacroCell label="C" value={aiPreview.carbs_g} color={t.carbs} />
                    <AiMacroCell label="F" value={aiPreview.fat_g} color={t.fat} />
                  </View>
                  {aiPreview.items && aiPreview.items.length > 0 ? (
                    <View style={styles.aiItems}>
                      {aiPreview.items.map((it, i) => (
                        <Text key={i} style={[styles.aiItemText, { color: t.muted }]}>
                          • {it.name} — {it.calories} kcal
                        </Text>
                      ))}
                    </View>
                  ) : null}
                  {aiPreview.notes ? (
                    <Text style={[styles.aiNotes, { color: t.muted }]}>{aiPreview.notes}</Text>
                  ) : null}
                </View>
              ) : null}

              <View style={styles.aiActions}>
                <Pressable
                  onPress={() => {
                    setMode('view');
                    setAiPreview(null);
                    setCorrection('');
                  }}
                  style={[styles.secondaryBtn, { backgroundColor: t.surface2 }]}>
                  <Text style={[styles.secondaryLabel, { color: t.text }]}>Cancel</Text>
                </Pressable>

                {aiPreview ? (
                  <Pressable
                    onPress={handleAiSave}
                    disabled={aiBusy === 'save'}
                    style={[styles.primaryBtn, { backgroundColor: t.accent, opacity: aiBusy === 'save' ? 0.8 : 1 }]}>
                    {aiBusy === 'save' ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.primaryLabel}>Apply changes</Text>
                    )}
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={handleAiEstimate}
                    disabled={aiBusy === 'estimate' || !correction.trim()}
                    style={[
                      styles.primaryBtn,
                      {
                        backgroundColor: t.accent,
                        opacity: aiBusy === 'estimate' || !correction.trim() ? 0.6 : 1,
                      },
                    ]}>
                    {aiBusy === 'estimate' ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="sparkles" size={14} color="#fff" />
                        <Text style={styles.primaryLabel}>  Re-estimate</Text>
                      </>
                    )}
                  </Pressable>
                )}
              </View>
            </View>
          ) : null}

          {/* Bottom action row (hidden while in ai-edit to keep focus). */}
          {mode === 'view' ? (
            <View style={styles.actions}>
              <Pressable
                onPress={() => setMode('ai-edit')}
                style={({ pressed }) => [
                  styles.actionBtn,
                  { backgroundColor: t.surface, opacity: pressed ? 0.7 : 1 },
                ]}>
                <Ionicons name="sparkles-outline" size={18} color={t.accent} />
                <Text style={[styles.actionLabel, { color: t.text }]}>AI Edit</Text>
              </Pressable>
              <Pressable
                onPress={() => setManualOpen(true)}
                style={({ pressed }) => [
                  styles.actionBtn,
                  { backgroundColor: t.surface, opacity: pressed ? 0.7 : 1 },
                ]}>
                <Ionicons name="create-outline" size={18} color={t.text} />
                <Text style={[styles.actionLabel, { color: t.text }]}>Edit Manually</Text>
              </Pressable>
              <Pressable
                onPress={handleDelete}
                disabled={deleting}
                style={({ pressed }) => [
                  styles.actionBtn,
                  { backgroundColor: t.surface, opacity: pressed ? 0.7 : 1 },
                ]}>
                {deleting ? (
                  <ActivityIndicator color={t.danger} />
                ) : (
                  <>
                    <Ionicons name="trash-outline" size={18} color={t.danger} />
                    <Text style={[styles.actionLabel, { color: t.danger }]}>Delete</Text>
                  </>
                )}
              </Pressable>
            </View>
          ) : null}
        </ScrollView>

        <MealEditSheet
          meal={manualOpen ? meal : null}
          onClose={() => setManualOpen(false)}
          onSaved={() => {
            onChanged();
            close();
          }}
        />
      </View>
    </Modal>
  );
}

function AiMacroCell({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Text style={[styles.aiMacroCell, { color }]}>
      {label} {Math.round(value)}g
    </Text>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  closeBtn: { padding: 4 },
  headerTitle: { fontSize: 16, fontWeight: '700' },

  body: { padding: 16, gap: 14 },

  metaBlock: { gap: 4 },
  desc: { fontSize: 22, fontWeight: '700', lineHeight: 28 },
  timestamp: { fontSize: 12 },

  kcalBlock: { alignItems: 'center', paddingVertical: 8 },
  kcalBig: { fontSize: 48, fontWeight: '800', letterSpacing: -1 },
  kcalLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, marginTop: -4 },

  card: {
    borderRadius: 20,
    padding: 16,
    gap: 12,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 3,
  },
  cardTitle: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.1 },

  aiInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 64,
  },
  aiPreview: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  aiKcal: { fontSize: 22, fontWeight: '700' },
  aiKcalUnit: { fontSize: 11, fontWeight: '500' },
  aiMacroRow: { flexDirection: 'row', gap: 14 },
  aiMacroCell: { fontSize: 13, fontWeight: '700' },
  aiItems: { gap: 2 },
  aiItemText: { fontSize: 12 },
  aiNotes: { fontSize: 12, fontStyle: 'italic' },

  aiActions: { flexDirection: 'row', gap: 10, marginTop: 2 },
  secondaryBtn: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  secondaryLabel: { fontSize: 13, fontWeight: '700' },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 11,
  },
  primaryLabel: { color: '#fff', fontSize: 13, fontWeight: '700' },

  actions: { flexDirection: 'row', gap: 10 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 14,
    paddingVertical: 14,
  },
  actionLabel: { fontSize: 13, fontWeight: '700' },
});

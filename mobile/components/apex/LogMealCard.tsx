import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { NutritionEstimate } from '../../../shared/src/types/home';
import {
  estimateMealNutrition,
  logMeal,
  saveMealTemplate,
} from '../../lib/api/nutrition';
import { useTokens } from '../../lib/theme';

interface Props {
  onLogged: () => void;
  onTemplateSaved?: () => void;
  /** Opens the full-screen meal photo scanner. */
  onPhotoScan?: () => void;
  /** Opens the barcode scanner (Phase 4 continued). */
  onBarcodeScan?: () => void;
  /** Opens the pantry scanner (Phase 4 continued). */
  onPantryScan?: () => void;
  /** Opens the saved-meals picker bottom sheet. */
  onSavedPick?: () => void;
}

type Mode = 'input' | 'estimated';

/** Flask log-meal flow: type description → Estimate (AI) → review macros +
 *  items → Log Meal. Re-estimate clears current estimate and returns to input
 *  mode. Save template saves to /api/saved-meals so it appears in Recent. */
export function LogMealCard({
  onLogged,
  onTemplateSaved,
  onPhotoScan,
  onBarcodeScan,
  onPantryScan,
  onSavedPick,
}: Props) {
  const t = useTokens();
  const [description, setDescription] = useState('');
  const [estimate, setEstimate] = useState<NutritionEstimate | null>(null);
  const [mode, setMode] = useState<Mode>('input');
  const [estimating, setEstimating] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setDescription('');
    setEstimate(null);
    setMode('input');
  };

  const handleEstimate = async () => {
    const desc = description.trim();
    if (!desc) {
      Alert.alert('Describe your meal', 'Type what you ate, e.g. "chicken bowl with rice".');
      return;
    }
    setEstimating(true);
    try {
      const est = await estimateMealNutrition(desc);
      setEstimate(est);
      setMode('estimated');
    } catch (e) {
      Alert.alert('Estimate failed', e instanceof Error ? e.message : String(e));
    } finally {
      setEstimating(false);
    }
  };

  const handleLog = async () => {
    if (!estimate) return;
    setSaving(true);
    try {
      await logMeal({
        description: description.trim(),
        calories: estimate.calories,
        protein_g: estimate.protein_g,
        carbs_g: estimate.carbs_g,
        fat_g: estimate.fat_g,
        sugar_g: estimate.sugar_g,
        fiber_g: estimate.fiber_g,
        sodium_mg: estimate.sodium_mg,
      });
      reset();
      onLogged();
    } catch (e) {
      Alert.alert('Log failed', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!estimate) return;
    try {
      await saveMealTemplate({
        description: description.trim(),
        calories: estimate.calories,
        protein_g: estimate.protein_g,
        carbs_g: estimate.carbs_g,
        fat_g: estimate.fat_g,
        sugar_g: estimate.sugar_g,
        fiber_g: estimate.fiber_g,
        sodium_mg: estimate.sodium_mg,
        items: estimate.items,
      });
      onTemplateSaved?.();
      Alert.alert('Saved', 'Added to your Recent meals for quick re-logging.');
    } catch (e) {
      Alert.alert('Couldn’t save template', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: t.surface, shadowColor: '#000' }]}>
      <Text style={[styles.title, { color: t.muted }]}>Log a meal</Text>

      <TextInput
        value={description}
        onChangeText={(v) => {
          setDescription(v);
          if (mode === 'estimated') {
            setEstimate(null);
            setMode('input');
          }
        }}
        placeholder="What did you eat?"
        placeholderTextColor={t.subtle}
        multiline
        style={[styles.input, { color: t.text, backgroundColor: t.surface2, borderColor: t.border }]}
      />
      {/* E1 locked — voice input via the keyboard's built-in dictation mic.
          Native voice-to-text as a dedicated in-card mic button lands in a
          later phase (requires a native speech-recognition module + Expo
          prebuild). Until then this hint points users at the free path. */}
      <Text style={[styles.voiceHint, { color: t.subtle }]}>
        Tip: tap the mic on your keyboard to dictate.
      </Text>

      {mode === 'input' ? (
        <>
          <Pressable
            onPress={handleEstimate}
            disabled={estimating || !description.trim()}
            style={({ pressed }) => [
              styles.estimateBtn,
              {
                backgroundColor: t.accent,
                opacity: !description.trim() || pressed ? 0.7 : 1,
              },
            ]}>
            {estimating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="sparkles" size={16} color="#fff" />
                <Text style={styles.estimateLabel}>Estimate macros</Text>
              </>
            )}
          </Pressable>

          <View style={styles.iconRow}>
            <IconBtn icon="camera-outline" label="Photo" onPress={onPhotoScan} comingSoon={!onPhotoScan} />
            <IconBtn icon="barcode-outline" label="Barcode" onPress={onBarcodeScan} comingSoon={!onBarcodeScan} />
            <IconBtn icon="restaurant-outline" label="Pantry" onPress={onPantryScan} comingSoon={!onPantryScan} />
            <IconBtn icon="bookmark-outline" label="Saved" onPress={onSavedPick} comingSoon={!onSavedPick} />
          </View>
        </>
      ) : estimate ? (
        <EstimatedBreakdown
          description={description}
          estimate={estimate}
          onLog={handleLog}
          onRedo={handleEstimate}
          onSaveTemplate={handleSaveTemplate}
          saving={saving}
          redoing={estimating}
        />
      ) : null}
    </View>
  );
}

// ── Estimated breakdown ────────────────────────────────────────────────

function EstimatedBreakdown({
  description,
  estimate,
  onLog,
  onRedo,
  onSaveTemplate,
  saving,
  redoing,
}: {
  description: string;
  estimate: NutritionEstimate;
  onLog: () => void;
  onRedo: () => void;
  onSaveTemplate: () => void;
  saving: boolean;
  redoing: boolean;
}) {
  const t = useTokens();

  return (
    <View style={breakdown.wrap}>
      <Text style={[breakdown.kcal, { color: t.cal }]}>
        {estimate.calories.toLocaleString()}{' '}
        <Text style={[breakdown.kcalUnit, { color: t.muted }]}>kcal</Text>
      </Text>

      <View style={breakdown.macroRow}>
        <MacroCell label="Protein" value={estimate.protein_g} unit="g" color={t.protein} />
        <MacroCell label="Carbs" value={estimate.carbs_g} unit="g" color={t.carbs} />
        <MacroCell label="Fat" value={estimate.fat_g} unit="g" color={t.fat} />
      </View>

      {(estimate.sugar_g > 0 || estimate.fiber_g > 0 || estimate.sodium_mg > 0) ? (
        <View style={breakdown.macroRow}>
          <MacroCell label="Sugar" value={estimate.sugar_g} unit="g" color={t.sugar} />
          <MacroCell label="Fiber" value={estimate.fiber_g} unit="g" color={t.fiber} />
          <MacroCell label="Sodium" value={estimate.sodium_mg} unit="mg" color={t.sodium} />
        </View>
      ) : null}

      {estimate.items.length > 0 ? (
        <View style={breakdown.items}>
          <Text style={[breakdown.itemsLabel, { color: t.muted }]}>Items</Text>
          {estimate.items.map((it, i) => (
            <View key={i} style={breakdown.itemRow}>
              <Text style={[breakdown.itemName, { color: t.text }]} numberOfLines={1}>
                {it.name}
              </Text>
              <Text style={[breakdown.itemKcal, { color: t.cal }]}>
                {it.calories} <Text style={[breakdown.itemUnit, { color: t.muted }]}>kcal</Text>
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {estimate.notes ? (
        <Text style={[breakdown.notes, { color: t.muted }]}>
          <Ionicons name="information-circle-outline" size={12} color={t.muted} /> {estimate.notes}
        </Text>
      ) : null}

      <View style={breakdown.actions}>
        <Pressable
          onPress={onSaveTemplate}
          style={({ pressed }) => [breakdown.templateBtn, { opacity: pressed ? 0.6 : 1 }]}>
          <Ionicons name="bookmark-outline" size={14} color={t.muted} />
          <Text style={[breakdown.templateLabel, { color: t.muted }]}>Save template</Text>
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
            <Text style={breakdown.primaryLabel}>Log meal</Text>
          )}
        </Pressable>
      </View>

      {/* Low-pri: show the typed description underneath in case user needs to scroll back. */}
      <Text style={[breakdown.originalDesc, { color: t.subtle }]} numberOfLines={2}>
        “{description}”
      </Text>
    </View>
  );
}

function MacroCell({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: number;
  unit: string;
  color: string;
}) {
  const t = useTokens();
  return (
    <View style={breakdown.macroCell}>
      <Text style={[breakdown.macroLabel, { color }]}>{label}</Text>
      <Text style={[breakdown.macroValue, { color: t.text }]}>
        {Math.round(value)}
        <Text style={[breakdown.macroUnit, { color: t.muted }]}>{unit}</Text>
      </Text>
    </View>
  );
}

// ── Icon row buttons (scan shortcuts) ──────────────────────────────────

function IconBtn({
  icon,
  label,
  disabled,
  comingSoon,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  disabled?: boolean;
  comingSoon?: boolean;
  onPress?: () => void;
}) {
  const t = useTokens();
  return (
    <Pressable
      onPress={() => {
        if (comingSoon) {
          Alert.alert('Coming soon', `${label} scanner ships in Nutrition Phase 4.`);
          return;
        }
        onPress?.();
      }}
      style={[
        styles.iconBtn,
        {
          backgroundColor: t.surface2,
          borderColor: t.border,
          opacity: disabled && !comingSoon ? 0.4 : 1,
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
  voiceHint: { fontSize: 11, fontStyle: 'italic', marginTop: -6 },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 56,
  },
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
  kcal: { fontSize: 28, fontWeight: '700' },
  kcalUnit: { fontSize: 12, fontWeight: '500' },

  macroRow: { flexDirection: 'row', gap: 10 },
  macroCell: { flex: 1, gap: 2 },
  macroLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  macroValue: { fontSize: 15, fontWeight: '700' },
  macroUnit: { fontSize: 11, fontWeight: '500' },

  items: { gap: 6, marginTop: 4 },
  itemsLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemName: { fontSize: 13, flex: 1, paddingRight: 8 },
  itemKcal: { fontSize: 13, fontWeight: '700' },
  itemUnit: { fontSize: 10, fontWeight: '500' },

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

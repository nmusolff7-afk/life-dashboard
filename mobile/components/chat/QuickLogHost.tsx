import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
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

import {
  BarcodeScanner,
  LogActivityCard,
  LogMealCard,
  MealPhotoScanner,
  SavedMealsPicker,
} from '../apex';
import { deleteSavedWorkout, logWeight, logWorkout } from '../../lib/api/fitness';
import {
  useSavedMeals,
  useSavedWorkouts,
  useProfile,
  useTodayNutrition,
  useTodayWorkouts,
} from '../../lib/hooks/useHomeData';
import { useStrengthSession } from '../../lib/useStrengthSession';
import { useChatSession } from '../../lib/useChatSession';
import { useTokens } from '../../lib/theme';
import { useUnits } from '../../lib/useUnits';

/** Floating entry boxes for the FAB shortcut rail. Any tab can host the
 *  FAB, but the modals live here at the tab-layout level so entry flows
 *  never lose the underlying screen. Opened / dismissed via chat.quickLog
 *  in useChatSession. */
export function QuickLogHost() {
  const chat = useChatSession();
  const kind = chat.quickLog;

  const nutrition = useTodayNutrition();
  const workouts = useTodayWorkouts();
  const profile = useProfile();
  const savedMeals = useSavedMeals();
  const savedWorkouts = useSavedWorkouts();
  const strength = useStrengthSession();

  // Entering "workout-strength" starts the strength session and clears
  // quickLog — StrengthTrackerModal is already mounted one layer up.
  useEffect(() => {
    if (kind === 'workout-strength') {
      void strength.start();
      chat.closeQuickLog();
    }
  }, [kind, strength, chat]);

  const refreshMeals = () => {
    nutrition.refetch();
    chat.bumpDataVersion();
  };
  const refreshWorkouts = () => {
    workouts.refetch();
    chat.bumpDataVersion();
  };
  const refreshProfile = () => {
    profile.refetch();
    chat.bumpDataVersion();
  };

  return (
    <>
      <MealManualModal
        visible={kind === 'meal-manual'}
        onClose={chat.closeQuickLog}
        onLogged={() => {
          refreshMeals();
          chat.closeQuickLog();
        }}
        onTemplateSaved={savedMeals.refetch}
      />

      <MealPhotoScanner
        visible={kind === 'meal-scan'}
        onClose={chat.closeQuickLog}
        onLogged={() => {
          refreshMeals();
          chat.closeQuickLog();
        }}
      />
      <BarcodeScanner
        visible={kind === 'meal-barcode'}
        onClose={chat.closeQuickLog}
        onLogged={() => {
          refreshMeals();
          chat.closeQuickLog();
        }}
      />
      <SavedMealsPicker
        visible={kind === 'meal-saved'}
        meals={savedMeals.data ?? []}
        onClose={chat.closeQuickLog}
        onLogged={() => {
          refreshMeals();
          chat.closeQuickLog();
        }}
        onRemoved={savedMeals.refetch}
      />

      <WorkoutManualModal
        visible={kind === 'workout-manual'}
        onClose={chat.closeQuickLog}
        onLogged={() => {
          refreshWorkouts();
          chat.closeQuickLog();
        }}
        onTemplateSaved={savedWorkouts.refetch}
      />
      <CardioManualModal
        visible={kind === 'workout-cardio'}
        onClose={chat.closeQuickLog}
        onLogged={() => {
          refreshWorkouts();
          chat.closeQuickLog();
        }}
      />
      <SavedWorkoutsPickerModal
        visible={kind === 'workout-saved'}
        onClose={chat.closeQuickLog}
        onLogged={() => {
          refreshWorkouts();
          chat.closeQuickLog();
        }}
        onRemoved={savedWorkouts.refetch}
        saved={savedWorkouts.data ?? []}
      />

      <WeightModal
        visible={kind === 'weight'}
        initial={profile.data?.current_weight_lbs ?? null}
        onClose={chat.closeQuickLog}
        onLogged={() => {
          refreshProfile();
          chat.closeQuickLog();
        }}
      />
    </>
  );
}

// ── Shared modal chrome ────────────────────────────────────────────────

function FloatingModal({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={[styles.backdrop, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <ScrollView
          contentContainerStyle={styles.sheetScroll}
          keyboardShouldPersistTaps="handled">
          <View style={[styles.sheet, { backgroundColor: t.surface, borderColor: t.border }]}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: t.text }]}>{title}</Text>
              <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
                <Ionicons name="close" size={22} color={t.muted} />
              </Pressable>
            </View>
            {children}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Meal manual ────────────────────────────────────────────────────────

function MealManualModal({
  visible,
  onClose,
  onLogged,
  onTemplateSaved,
}: {
  visible: boolean;
  onClose: () => void;
  onLogged: () => void;
  onTemplateSaved: () => void;
}) {
  const chat = useChatSession();
  // The icon row switches to a scanner flow — close the manual modal and
  // jump directly to the relevant quick-log variant. Keeps the manual
  // card interchangeable with the FAB sub-shortcuts without duplicating
  // modal management.
  const swapTo = (next: 'meal-scan' | 'meal-barcode' | 'meal-saved') => () => {
    onClose();
    chat.openQuickLog(next);
  };
  return (
    <FloatingModal visible={visible} title="Log a meal" onClose={onClose}>
      <LogMealCard
        onLogged={onLogged}
        onTemplateSaved={onTemplateSaved}
        onPhotoScan={swapTo('meal-scan')}
        onBarcodeScan={swapTo('meal-barcode')}
        onSavedPick={swapTo('meal-saved')}
      />
    </FloatingModal>
  );
}

// ── Workout manual ─────────────────────────────────────────────────────

function WorkoutManualModal({
  visible,
  onClose,
  onLogged,
  onTemplateSaved,
}: {
  visible: boolean;
  onClose: () => void;
  onLogged: () => void;
  onTemplateSaved: () => void;
}) {
  return (
    <FloatingModal visible={visible} title="Log a workout" onClose={onClose}>
      <LogActivityCard onLogged={onLogged} onTemplateSaved={onTemplateSaved} />
    </FloatingModal>
  );
}

// ── Cardio manual ──────────────────────────────────────────────────────

function CardioManualModal({
  visible,
  onClose,
  onLogged,
}: {
  visible: boolean;
  onClose: () => void;
  onLogged: () => void;
}) {
  const t = useTokens();
  const [type, setType] = useState<'run' | 'walk' | 'bike' | 'swim' | 'other'>('run');
  const [minutes, setMinutes] = useState('');
  const [distance, setDistance] = useState('');
  const [calories, setCalories] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setMinutes('');
      setDistance('');
      setCalories('');
    }
  }, [visible]);

  const handleSave = async () => {
    const mins = parseFloat(minutes);
    if (!Number.isFinite(mins) || mins <= 0) {
      Alert.alert('Missing duration', 'Add how long the session was.');
      return;
    }
    const kcalInput = parseInt(calories, 10);
    // If calories weren't entered, fall back to a rough MET-based estimate.
    // This keeps the Cardio modal usable offline, without requiring an AI
    // round-trip for the trivial case. The Manual modal (which does call
    // the AI) stays available for anything nuanced.
    const METS: Record<typeof type, number> = { run: 8, walk: 3.5, bike: 7, swim: 8, other: 6 };
    const estKcal = Math.round(METS[type] * 3.5 * 165 / 200 * mins); // ≈ 165 lb default
    const kcal = Number.isFinite(kcalInput) && kcalInput > 0 ? kcalInput : estKcal;

    const distParts = distance.trim() ? ` ${distance.trim()}` : '';
    const desc = `${mins} min ${type}${distParts}`.trim();

    setSaving(true);
    try {
      await logWorkout(desc, kcal, 'cardio');
      onLogged();
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const TYPES: { key: typeof type; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
    { key: 'run',   label: 'Run',   icon: 'walk-outline' },
    { key: 'walk',  label: 'Walk',  icon: 'footsteps-outline' },
    { key: 'bike',  label: 'Bike',  icon: 'bicycle-outline' },
    { key: 'swim',  label: 'Swim',  icon: 'water-outline' },
    { key: 'other', label: 'Other', icon: 'pulse-outline' },
  ];

  return (
    <FloatingModal visible={visible} title="Log cardio" onClose={onClose}>
      <View style={{ gap: 12 }}>
        <View style={styles.typeRow}>
          {TYPES.map((opt) => (
            <Pressable
              key={opt.key}
              onPress={() => setType(opt.key)}
              style={[
                styles.typePill,
                {
                  backgroundColor: type === opt.key ? t.accent : t.surface2,
                  borderColor: type === opt.key ? t.accent : t.border,
                },
              ]}>
              <Ionicons name={opt.icon} size={14} color={type === opt.key ? '#fff' : t.muted} />
              <Text
                style={[
                  styles.typePillLabel,
                  { color: type === opt.key ? '#fff' : t.text },
                ]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.inputRow}>
          <Field
            label="Minutes"
            value={minutes}
            onChange={setMinutes}
            placeholder="30"
            keyboard="number-pad"
          />
          <Field
            label="Distance"
            value={distance}
            onChange={setDistance}
            placeholder="3 mi"
          />
        </View>

        <Field
          label="Calories (optional)"
          value={calories}
          onChange={setCalories}
          placeholder="auto-estimate"
          keyboard="number-pad"
        />

        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={({ pressed }) => [
            styles.primary,
            { backgroundColor: t.accent, opacity: saving || pressed ? 0.85 : 1 },
          ]}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryLabel}>Log cardio</Text>}
        </Pressable>
      </View>
    </FloatingModal>
  );
}

// ── Saved workouts picker ──────────────────────────────────────────────

function SavedWorkoutsPickerModal({
  visible,
  saved,
  onClose,
  onLogged,
  onRemoved,
}: {
  visible: boolean;
  saved: { id: number; description: string; calories_burned: number }[];
  onClose: () => void;
  onLogged: () => void;
  onRemoved: () => void;
}) {
  const t = useTokens();
  const [busyId, setBusyId] = useState<number | null>(null);

  const handleLog = async (id: number, description: string, cal: number) => {
    setBusyId(id);
    try {
      await logWorkout(description, cal);
      onLogged();
    } catch (e) {
      Alert.alert('Log failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = (id: number, description: string) => {
    Alert.alert('Remove saved workout?', description, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteSavedWorkout(id);
            onRemoved();
          } catch (e) {
            Alert.alert('Remove failed', e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  };

  return (
    <FloatingModal visible={visible} title="Saved workouts" onClose={onClose}>
      <View style={{ gap: 8 }}>
        {saved.length === 0 ? (
          <Text style={[styles.emptyText, { color: t.muted }]}>
            No saved workouts yet. After logging one, use “Save template” to see it here.
          </Text>
        ) : (
          saved.map((w) => (
            <View
              key={w.id}
              style={[styles.savedRow, { borderColor: t.border, backgroundColor: t.surface2 }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.savedDesc, { color: t.text }]} numberOfLines={2}>
                  {w.description}
                </Text>
                <Text style={[styles.savedKcal, { color: t.cal }]}>{w.calories_burned} kcal</Text>
              </View>
              <Pressable
                onPress={() => handleLog(w.id, w.description, w.calories_burned)}
                disabled={busyId === w.id}
                style={[styles.savedBtn, { backgroundColor: t.accent, opacity: busyId === w.id ? 0.6 : 1 }]}>
                {busyId === w.id ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.savedBtnLabel}>Log</Text>
                )}
              </Pressable>
              <Pressable
                onPress={() => handleRemove(w.id, w.description)}
                hitSlop={8}
                style={[styles.savedClose, { backgroundColor: t.surface }]}
                accessibilityLabel="Remove template">
                <Ionicons name="trash-outline" size={14} color={t.muted} />
              </Pressable>
            </View>
          ))
        )}
      </View>
    </FloatingModal>
  );
}

// ── Weight ─────────────────────────────────────────────────────────────

function WeightModal({
  visible,
  initial,
  onClose,
  onLogged,
}: {
  visible: boolean;
  initial: number | null;
  onClose: () => void;
  onLogged: () => void;
}) {
  const t = useTokens();
  const units = useUnits();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialDisplay = useMemo(() => {
    if (initial == null) return '';
    return units.formatWeight(initial, { round: false });
  }, [initial, units]);

  useEffect(() => {
    if (visible) {
      setText(initialDisplay);
      setError(null);
    }
  }, [visible, initialDisplay]);

  const handleSave = async () => {
    const n = parseFloat(text);
    if (!Number.isFinite(n) || n <= 0) {
      setError('Enter a valid weight.');
      return;
    }
    const lbs = units.toCanonicalWeightLbs(n);
    setSaving(true);
    setError(null);
    try {
      await logWeight(lbs);
      onLogged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FloatingModal visible={visible} title="Log weight" onClose={onClose}>
      <View style={{ gap: 12 }}>
        <View style={styles.weightRow}>
          <TextInput
            value={text}
            onChangeText={setText}
            keyboardType="decimal-pad"
            placeholder={initialDisplay || units.weightUnit}
            placeholderTextColor={t.subtle}
            autoFocus
            style={[styles.weightInput, { color: t.text, backgroundColor: t.surface2, borderColor: t.border }]}
          />
          <Text style={[styles.weightUnit, { color: t.muted }]}>{units.weightUnit}</Text>
        </View>
        {error ? <Text style={[styles.errorText, { color: t.danger }]}>{error}</Text> : null}
        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={({ pressed }) => [
            styles.primary,
            { backgroundColor: t.accent, opacity: saving || pressed ? 0.85 : 1 },
          ]}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryLabel}>Save weight</Text>}
        </Pressable>
      </View>
    </FloatingModal>
  );
}

// ── Small shared field ─────────────────────────────────────────────────

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboard,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboard?: 'default' | 'number-pad' | 'decimal-pad';
}) {
  const t = useTokens();
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={[styles.fieldLabel, { color: t.muted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={t.subtle}
        keyboardType={keyboard ?? 'default'}
        style={[styles.fieldInput, { color: t.text, backgroundColor: t.surface2, borderColor: t.border }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  sheetScroll: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  sheet: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    gap: 14,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: { fontSize: 16, fontWeight: '700' },

  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 100,
    borderWidth: 1,
  },
  typePillLabel: { fontSize: 13, fontWeight: '600' },

  inputRow: { flexDirection: 'row', gap: 10 },
  fieldLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  fieldInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },

  primary: {
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: { color: '#fff', fontSize: 14, fontWeight: '700' },

  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  savedDesc: { fontSize: 13, fontWeight: '500' },
  savedKcal: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  savedBtn: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8, minWidth: 60, alignItems: 'center' },
  savedBtnLabel: { color: '#fff', fontSize: 13, fontWeight: '700' },
  savedClose: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 13, fontStyle: 'italic', padding: 12 },

  weightRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  weightInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  weightUnit: { fontSize: 16, fontWeight: '600', minWidth: 40 },
  errorText: { fontSize: 12 },
});

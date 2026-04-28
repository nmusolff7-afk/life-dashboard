import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { DayName, WeeklyPlan } from '../../../shared/src/types/plan';
import { parseWorkoutPlanText, saveWorkoutPlan } from '../../lib/api/plan';
import { useWorkoutPlan } from '../../lib/hooks/useWorkoutPlan';
import { useHaptics } from '../../lib/useHaptics';
import { useTokens } from '../../lib/theme';

type Mode = 'overview' | 'import' | 'manual' | 'build';

const DAYS: DayName[] = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
];

/** Settings → Workout Plan hub (PRD §4.3.10). Three authoring modes,
 *  PWA-parity:
 *    - AI Import: paste free-form text → Haiku parses → review → save
 *    - Manual Builder: day-by-day editor, strength + cardio fields
 *    - AI Build: the existing guided quiz at /fitness/plan/builder
 *
 *  All three save the same normalized WeeklyPlan to workout_plans.
 *  Shown after a plan exists: quick summary + View/Edit + Switch. */
export default function SettingsWorkoutPlan() {
  const t = useTokens();
  const router = useRouter();
  const haptics = useHaptics();
  const { plan, loading, refetch } = useWorkoutPlan();
  const [mode, setMode] = useState<Mode>('overview');

  useFocusEffect(useCallback(() => { void refetch(); }, [refetch]));

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: 'Workout plan' }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Existing active plan summary — when a plan exists, lead
              with primary actions (Edit / View) and tuck the build-
              modes behind an expand. Reduces clutter; the typical
              return visit isn't to rebuild from scratch. */}
          {loading ? (
            <ActivityIndicator color={t.accent} style={{ marginTop: 40 }} />
          ) : plan ? (
            <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
              <Text style={[styles.cardLabel, { color: t.muted }]}>Active plan</Text>
              <Text style={[styles.cardTitle, { color: t.text }]}>{planSummary(plan.plan)}</Text>
              {plan.understanding ? (
                <Text style={[styles.cardBody, { color: t.muted }]} numberOfLines={3}>
                  {plan.understanding}
                </Text>
              ) : null}
              <View style={styles.cardActions}>
                <Pressable
                  onPress={() => { haptics.fire('tap'); router.push('/fitness/plan' as never); }}
                  style={({ pressed }) => [styles.secondary, { backgroundColor: t.accent, opacity: pressed ? 0.85 : 1 }]}>
                  <Ionicons name="create-outline" size={14} color="#fff" />
                  <Text style={[styles.secondaryLabel, { color: '#fff' }]}>View / edit</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {/* Build modes — full-width when no plan exists, tucked into
              an "Other ways to build" expandable when one does. */}
          {!plan ? (
            <>
              <Text style={[styles.sectionHeader, { color: t.muted }]}>Build your plan</Text>
              {mode === 'overview' ? (
                <View style={styles.modeGrid}>
                  <ModeCard
                    icon="sparkles-outline"
                    title="AI Build"
                    body="Answer a short quiz — we generate a full strength + cardio plan in about 10 seconds."
                    onPress={() => {
                      haptics.fire('tap');
                      router.push('/fitness/plan/builder' as never);
                    }}
                  />
                  <ModeCard
                    icon="reader-outline"
                    title="AI Import"
                    body="Paste your existing schedule in any format. AI converts it into a clean weekly plan."
                    onPress={() => { haptics.fire('tap'); setMode('import'); }}
                  />
                  <ModeCard
                    icon="construct-outline"
                    title="Manual builder"
                    body="Type your exercises day-by-day. Full control, no AI."
                    onPress={() => { haptics.fire('tap'); setMode('manual'); }}
                  />
                </View>
              ) : null}
            </>
          ) : mode === 'overview' ? (
            <Pressable
              onPress={() => {
                haptics.fire('tap');
                // Cycle through import → manual → reset to overview.
                // Compact, doesn't add a third heavy panel.
                setMode('import');
              }}
              style={({ pressed }) => [
                styles.tertiaryRow,
                { borderColor: t.border, opacity: pressed ? 0.7 : 1 },
              ]}>
              <Ionicons name="options-outline" size={14} color={t.muted} />
              <Text style={[styles.tertiaryLabel, { color: t.muted }]}>
                Build a different way (import or manual)
              </Text>
              <Ionicons name="chevron-forward" size={14} color={t.subtle} />
            </Pressable>
          ) : (
            // mode is 'import' or 'manual' AND plan exists — show the
            // mode form just like the no-plan path. The forms handle
            // their own back button.
            null
          )}

          {mode === 'import' ? (
            <AIImportForm
              onBack={() => setMode('overview')}
              onSaved={async () => {
                await refetch();
                setMode('overview');
              }}
            />
          ) : null}

          {mode === 'manual' ? (
            <ManualBuilderForm
              existing={plan?.plan}
              onBack={() => setMode('overview')}
              onSaved={async () => {
                await refetch();
                setMode('overview');
              }}
            />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ── AI Import ──────────────────────────────────────────────────────────

function AIImportForm({ onBack, onSaved }: { onBack: () => void; onSaved: () => void | Promise<void> }) {
  const t = useTokens();
  const haptics = useHaptics();
  const [text, setText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<WeeklyPlan | null>(null);
  const [saving, setSaving] = useState(false);

  const handleParse = async () => {
    if (!text.trim()) return;
    haptics.fire('tap');
    setParsing(true);
    try {
      const parsed = await parseWorkoutPlanText(text.trim());
      setPreview(parsed);
    } catch (e) {
      haptics.fire('error');
      Alert.alert('Import failed', e instanceof Error ? e.message : String(e));
    } finally {
      setParsing(false);
    }
  };

  const handleSave = async () => {
    if (!preview) return;
    haptics.fire('tap');
    setSaving(true);
    try {
      await saveWorkoutPlan({ plan: preview });
      haptics.fire('success');
      await onSaved();
    } catch (e) {
      haptics.fire('error');
      Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
      <View style={styles.formHeader}>
        <Pressable onPress={onBack} hitSlop={10} style={styles.backBtn} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={18} color={t.muted} />
        </Pressable>
        <Text style={[styles.formTitle, { color: t.text }]}>AI Import</Text>
      </View>
      <Text style={[styles.formBody, { color: t.muted }]}>
        Paste your schedule in any format. The AI extracts exercises, sets, reps, and any cardio
        you mention, and assigns them to the right day of the week.
      </Text>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={'e.g.\nMon/Wed/Fri: Squat 4x8, Bench 4x10, Row 4x10\nTue/Thu: OHP 3x8, RDL 3x10, 20 min easy run\nSat: Long Run 45 min'}
        placeholderTextColor={t.subtle}
        multiline
        style={[
          styles.textarea,
          { color: t.text, backgroundColor: t.surface2, borderColor: t.border },
        ]}
      />
      {!preview ? (
        <Pressable
          onPress={handleParse}
          disabled={parsing || !text.trim()}
          style={({ pressed }) => [
            styles.primary,
            { backgroundColor: t.accent, opacity: pressed || parsing || !text.trim() ? 0.7 : 1 },
          ]}>
          {parsing ? <ActivityIndicator color="#fff" /> : (
            <>
              <Ionicons name="sparkles" size={14} color="#fff" />
              <Text style={styles.primaryLabel}>Import plan</Text>
            </>
          )}
        </Pressable>
      ) : (
        <View style={{ gap: 10 }}>
          <Text style={[styles.previewHeader, { color: t.accent }]}>Parsed — review &amp; save</Text>
          <PlanPreview plan={preview} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={() => { haptics.fire('tap'); setPreview(null); }}
              style={({ pressed }) => [styles.secondary, { backgroundColor: t.surface2, opacity: pressed ? 0.7 : 1 }]}>
              <Ionicons name="refresh" size={14} color={t.text} />
              <Text style={[styles.secondaryLabel, { color: t.text }]}>Re-parse</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={saving}
              style={({ pressed }) => [
                styles.primary,
                { backgroundColor: t.accent, opacity: pressed || saving ? 0.85 : 1, flex: 1 },
              ]}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryLabel}>Save plan</Text>}
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

// ── Manual Builder ─────────────────────────────────────────────────────

function ManualBuilderForm({
  existing,
  onBack,
  onSaved,
}: {
  existing?: WeeklyPlan;
  onBack: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const t = useTokens();
  const haptics = useHaptics();
  const [weekly, setWeekly] = useState<WeeklyPlan>(() => seed(existing));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    haptics.fire('tap');
    setSaving(true);
    try {
      await saveWorkoutPlan({ plan: weekly });
      haptics.fire('success');
      await onSaved();
    } catch (e) {
      haptics.fire('error');
      Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const updateDay = (day: DayName, mutate: (d: NonNullable<WeeklyPlan['weeklyPlan'][DayName]>) => NonNullable<WeeklyPlan['weeklyPlan'][DayName]>) => {
    setWeekly((prev) => {
      const current = prev.weeklyPlan[day] ?? { label: 'Rest', exercises: [], cardio: null };
      return {
        ...prev,
        weeklyPlan: { ...prev.weeklyPlan, [day]: mutate(current) },
      };
    });
  };

  return (
    <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
      <View style={styles.formHeader}>
        <Pressable onPress={onBack} hitSlop={10} style={styles.backBtn} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={18} color={t.muted} />
        </Pressable>
        <Text style={[styles.formTitle, { color: t.text }]}>Manual builder</Text>
      </View>
      <Text style={[styles.formBody, { color: t.muted }]}>
        Add exercises per day. Cardio has its own row at the bottom of each day — pick a
        session type (or leave blank for no cardio).
      </Text>

      {DAYS.map((d) => (
        <ManualDayEditor
          key={d}
          day={d}
          value={weekly.weeklyPlan[d] ?? { label: 'Rest', exercises: [], cardio: null }}
          onChange={(next) => updateDay(d, () => next)}
        />
      ))}

      <Pressable
        onPress={handleSave}
        disabled={saving}
        style={({ pressed }) => [
          styles.primary,
          { backgroundColor: t.accent, opacity: pressed || saving ? 0.85 : 1 },
        ]}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryLabel}>Save plan</Text>}
      </Pressable>
    </View>
  );
}

function seed(existing?: WeeklyPlan): WeeklyPlan {
  const weekly: WeeklyPlan['weeklyPlan'] = {};
  DAYS.forEach((d) => {
    weekly[d] = existing?.weeklyPlan[d] ?? { label: 'Rest', exercises: [], cardio: null };
  });
  return { weeklyPlan: weekly, planNotes: existing?.planNotes ?? '' };
}

function ManualDayEditor({
  day,
  value,
  onChange,
}: {
  day: DayName;
  value: NonNullable<WeeklyPlan['weeklyPlan'][DayName]>;
  onChange: (next: NonNullable<WeeklyPlan['weeklyPlan'][DayName]>) => void;
}) {
  const t = useTokens();
  const [newName, setNewName] = useState('');
  const [newSets, setNewSets] = useState('3');

  const addExercise = () => {
    const name = newName.trim();
    if (!name) return;
    onChange({
      ...value,
      label: value.label && value.label !== 'Rest' ? value.label : 'Workout',
      exercises: [
        ...value.exercises,
        { name, sets: Math.max(1, parseInt(newSets, 10) || 3), reps: '8-12' },
      ],
    });
    setNewName('');
  };

  const removeExercise = (idx: number) => {
    const next = value.exercises.filter((_, i) => i !== idx);
    onChange({
      ...value,
      exercises: next,
      label: next.length === 0 && !(value.cardio?.type) ? 'Rest' : (value.label ?? 'Workout'),
    });
  };

  const setCardio = (type: string) => {
    onChange({
      ...value,
      cardio: type.trim() ? { type: type.trim(), committed: true } : null,
      label: type.trim() && value.exercises.length === 0 ? 'Cardio' : (value.label ?? 'Workout'),
    });
  };

  return (
    <View style={[styles.dayBlock, { borderColor: t.border, backgroundColor: t.surface2 }]}>
      <View style={styles.dayBlockHeader}>
        <Text style={[styles.dayBlockName, { color: t.text }]}>{day}</Text>
        <Text style={[styles.dayBlockMeta, { color: t.muted }]}>
          {value.exercises.length} exercise{value.exercises.length === 1 ? '' : 's'}
          {value.cardio?.type ? ` · ${value.cardio.type}` : ''}
        </Text>
      </View>
      {value.exercises.map((ex, i) => (
        <View key={i} style={[styles.exRow, { borderBottomColor: t.border }]}>
          <Text style={[styles.exName, { color: t.text }]} numberOfLines={1}>
            {ex.name}
          </Text>
          <Text style={[styles.exMeta, { color: t.muted }]}>{ex.sets}×{ex.reps}</Text>
          <Pressable onPress={() => removeExercise(i)} hitSlop={6} accessibilityLabel="Remove">
            <Ionicons name="close" size={14} color={t.muted} />
          </Pressable>
        </View>
      ))}
      <View style={styles.addRow}>
        <TextInput
          value={newName}
          onChangeText={setNewName}
          placeholder="Exercise name"
          placeholderTextColor={t.subtle}
          style={[styles.addInput, { flex: 1, color: t.text, backgroundColor: t.surface, borderColor: t.border }]}
        />
        <TextInput
          value={newSets}
          onChangeText={setNewSets}
          placeholder="3"
          placeholderTextColor={t.subtle}
          keyboardType="number-pad"
          style={[styles.addInput, { width: 48, textAlign: 'center', color: t.text, backgroundColor: t.surface, borderColor: t.border }]}
        />
        <Pressable
          onPress={addExercise}
          style={({ pressed }) => [styles.addBtn, { backgroundColor: t.accent, opacity: pressed ? 0.85 : 1 }]}>
          <Ionicons name="add" size={16} color="#fff" />
        </Pressable>
      </View>
      <TextInput
        value={value.cardio?.type ?? ''}
        onChangeText={setCardio}
        placeholder="Cardio (e.g. Easy Run, Incline Walk)"
        placeholderTextColor={t.subtle}
        style={[
          styles.cardioInput,
          { color: t.text, backgroundColor: t.surface, borderColor: t.border },
        ]}
      />
    </View>
  );
}

// ── Preview (used by AI Import) ────────────────────────────────────────

function PlanPreview({ plan }: { plan: WeeklyPlan }) {
  const t = useTokens();
  return (
    <View style={[styles.previewBox, { borderColor: t.border, backgroundColor: t.surface2 }]}>
      {DAYS.map((d) => {
        const day = plan.weeklyPlan[d];
        const exs = day?.exercises ?? [];
        const cardio = day?.cardio?.type;
        const rest = !exs.length && !cardio;
        return (
          <View key={d} style={[styles.previewDay, { borderBottomColor: t.border }]}>
            <Text style={[styles.previewDayName, { color: t.accent }]}>{d.slice(0, 3)}</Text>
            <Text style={[styles.previewDayBody, { color: t.text }]} numberOfLines={3}>
              {rest ? 'Rest' : [
                ...exs.map((e) => `${e.name} ${e.sets}×${e.reps}`),
                cardio ?? null,
              ].filter(Boolean).join(', ')}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ── Shared ────────────────────────────────────────────────────────────

function ModeCard({
  icon,
  title,
  body,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  body: string;
  onPress: () => void;
}) {
  const t = useTokens();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [
        styles.modeCard,
        {
          backgroundColor: t.surface,
          borderColor: t.border,
          transform: [{ scale: pressed ? 0.99 : 1 }],
          opacity: pressed ? 0.9 : 1,
        },
      ]}>
      <View style={[styles.modeIcon, { backgroundColor: t.surface2 }]}>
        <Ionicons name={icon} size={20} color={t.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.modeTitle, { color: t.text }]}>{title}</Text>
        <Text style={[styles.modeBody, { color: t.muted }]} numberOfLines={2}>
          {body}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={t.subtle} />
    </Pressable>
  );
}

function planSummary(plan: WeeklyPlan): string {
  const weekly = plan.weeklyPlan ?? {};
  let strength = 0;
  let cardio = 0;
  DAYS.forEach((d) => {
    const day = weekly[d];
    if ((day?.exercises?.length ?? 0) > 0) strength += 1;
    if ((day?.cardio?.type ?? '').trim()) cardio += 1;
  });
  return `${strength} strength · ${cardio} cardio / week`;
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 72 },

  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 },
  cardLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  cardTitle: { fontSize: 18, fontWeight: '700' },
  cardBody: { fontSize: 13, lineHeight: 18 },
  cardActions: { flexDirection: 'row', gap: 10, marginTop: 4 },

  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 10,
  },

  modeGrid: { gap: 10 },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  modeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeTitle: { fontSize: 15, fontWeight: '700' },
  modeBody: { fontSize: 12, marginTop: 3, lineHeight: 16 },

  formHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  backBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  formTitle: { fontSize: 16, fontWeight: '700' },
  formBody: { fontSize: 12, lineHeight: 17 },

  textarea: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    minHeight: 120,
    lineHeight: 19,
  },

  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 100,
  },
  primaryLabel: { color: '#fff', fontSize: 14, fontWeight: '700' },

  tertiaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  tertiaryLabel: { flex: 1, fontSize: 13, fontWeight: '500' },
  secondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 100,
  },
  secondaryLabel: { fontSize: 13, fontWeight: '600' },

  previewHeader: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  previewBox: { borderWidth: 1, borderRadius: 12 },
  previewDay: {
    flexDirection: 'row',
    gap: 10,
    padding: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  previewDayName: { fontSize: 12, fontWeight: '700', minWidth: 32 },
  previewDayBody: { fontSize: 12, flex: 1, lineHeight: 17 },

  dayBlock: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 6, marginTop: 8 },
  dayBlockHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  dayBlockName: { fontSize: 14, fontWeight: '700' },
  dayBlockMeta: { fontSize: 11 },
  exRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  exName: { fontSize: 13, flex: 1, fontWeight: '500' },
  exMeta: { fontSize: 11, minWidth: 42, textAlign: 'right' },
  addRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  addInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardioInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    marginTop: 4,
  },
});

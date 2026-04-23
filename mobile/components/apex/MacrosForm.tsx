import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { GoalKey, OnboardingDataResponse, ProfileResponse } from '../../../shared/src/types/home';
import {
  computeTargets,
  getGoalConfig,
  GOAL_CONFIGS,
} from '../../../shared/src/logic/targets';
import { updateGoal } from '../../lib/api/profile';
import { useTokens } from '../../lib/theme';

interface Props {
  onboarding: OnboardingDataResponse | null;
  profile: ProfileResponse | null;
  onSaved: () => void | Promise<void>;
}

const GOAL_ORDER: GoalKey[] = ['lose_weight', 'recomp', 'build_muscle', 'maintain'];

function ageFromBirthday(iso: string | undefined): number | null {
  if (!iso) return null;
  const parts = iso.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [y, m, d] = parts;
  const now = new Date();
  let age = now.getFullYear() - y;
  const mDiff = now.getMonth() + 1 - m;
  if (mDiff < 0 || (mDiff === 0 && now.getDate() < d)) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

export function MacrosForm({ onboarding, profile, onSaved }: Props) {
  const t = useTokens();
  const saved = onboarding?.saved ?? null;

  // Goal + body stats needed to compute suggestions.
  const [goal, setGoal] = useState<GoalKey>('lose_weight');
  const [calorieTarget, setCalorieTarget] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [sugar, setSugar] = useState('');
  const [fiber, setFiber] = useState('');
  const [sodium, setSodium] = useState('');
  const [saving, setSaving] = useState(false);

  // Resolve body stats from onboarding raw_inputs (preferred) then profile.
  const bodyStats = useMemo(() => {
    const weightLbs = (saved?.current_weight_lbs as number | undefined) ?? profile?.current_weight_lbs ?? null;
    const targetLbs = (saved?.target_weight_lbs as number | undefined) ?? profile?.target_weight_lbs ?? null;
    const heightFt = (saved?.height_ft as number | undefined) ?? profile?.height_ft ?? null;
    const heightIn = (saved?.height_in as number | undefined) ?? profile?.height_in ?? null;
    const sex = ((saved?.gender as string | undefined) ?? profile?.gender) as 'male' | 'female' | undefined;
    const bf = (saved?.body_fat_pct as number | undefined) ?? profile?.body_fat_pct ?? undefined;
    const bd = saved?.birthday as string | undefined;
    const ageRaw = (saved?.age as number | undefined) ?? profile?.age ?? null;
    const age = ageFromBirthday(bd) ?? ageRaw;
    if (weightLbs == null || heightFt == null || heightIn == null || !sex || age == null) {
      return null;
    }
    return { weightLbs, targetLbs: targetLbs ?? undefined, heightFt, heightIn, sex, age, bf };
  }, [saved, profile]);

  // Goal-driven suggestions via shared logic.
  const suggestion = useMemo(() => {
    if (!bodyStats) return null;
    return computeTargets({
      goal,
      weightLbs: bodyStats.weightLbs,
      targetWeightLbs: bodyStats.targetLbs,
      heightFt: bodyStats.heightFt,
      heightIn: bodyStats.heightIn,
      ageYears: bodyStats.age,
      sex: bodyStats.sex,
      bodyFatPct: bodyStats.bf,
    });
  }, [goal, bodyStats]);

  // Seed saved targets (from the server) or fall back to the fresh suggestion.
  useEffect(() => {
    if (profile?.primary_goal && GOAL_ORDER.includes(profile.primary_goal as GoalKey)) {
      setGoal(profile.primary_goal as GoalKey);
    } else if (saved?.primary_goal && GOAL_ORDER.includes(saved.primary_goal as GoalKey)) {
      setGoal(saved.primary_goal as GoalKey);
    }
  }, [profile?.primary_goal, saved?.primary_goal]);

  useEffect(() => {
    // Prefer server-saved goal_targets (user_goals row); else fall back to suggestion.
    const gt = profile?.goal_targets;
    if (gt) {
      setCalorieTarget(String(gt.calorie_target));
      setProtein(String(gt.protein_g));
      setCarbs(String(gt.carbs_g));
      setFat(String(gt.fat_g));
      setSugar('');
      setFiber('');
      setSodium('');
    } else if (suggestion) {
      setCalorieTarget(String(suggestion.calorieTarget));
      setProtein(String(suggestion.proteinG));
      setCarbs(String(suggestion.carbsG));
      setFat(String(suggestion.fatG));
    }
  }, [profile?.goal_targets, suggestion]);

  // ── Derived: macro-kcal breakdown ───────────────────────────────────────

  const breakdown = useMemo(() => {
    const p = parseFloat(protein) || 0;
    const c = parseFloat(carbs) || 0;
    const f = parseFloat(fat) || 0;
    const kcal = p * 4 + c * 4 + f * 9;
    const target = parseFloat(calorieTarget) || 0;
    return { kcal, delta: kcal - target };
  }, [protein, carbs, fat, calorieTarget]);

  // ── Actions ─────────────────────────────────────────────────────────────

  const applySuggestion = () => {
    if (!suggestion) return;
    setCalorieTarget(String(suggestion.calorieTarget));
    setProtein(String(suggestion.proteinG));
    setCarbs(String(suggestion.carbsG));
    setFat(String(suggestion.fatG));
  };

  const handleSave = async () => {
    const target = parseFloat(calorieTarget);
    const p = parseFloat(protein);
    const c = parseFloat(carbs);
    const f = parseFloat(fat);
    if (!Number.isFinite(target) || target < 800) {
      Alert.alert('Check calorie target', 'Enter a valid daily calorie target (≥ 800).');
      return;
    }
    if (!Number.isFinite(p) || p < 0 || !Number.isFinite(c) || c < 0 || !Number.isFinite(f) || f < 0) {
      Alert.alert('Check macros', 'Protein / carbs / fat must be non-negative numbers.');
      return;
    }
    if (!suggestion) {
      Alert.alert('Missing body stats', 'Fill out Body Stats first so we know your RMR.');
      return;
    }

    setSaving(true);
    try {
      // /api/goal/update expects rmr + deficit; Flask computes target = rmr + deficit.
      // We send the user's chosen calorie target as (rmr, deficit = target - rmr).
      const deficit = Math.round(target - suggestion.rmr);
      await updateGoal({
        goal,
        rmr: suggestion.rmr,
        deficit,
        protein: Math.round(p),
        carbs: Math.round(c),
        fat: Math.round(f),
        sugar: parseFloat(sugar) || undefined,
        fiber: parseFloat(fiber) || undefined,
        sodium: parseFloat(sodium) || undefined,
      });
      await onSaved();
      Alert.alert('Saved', 'Your calorie + macro targets are updated. The Nutrition ring will reflect them.');
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={[styles.lead, { color: t.muted }]}>
        Flask computes suggested targets from your goal + body stats. Override any value — the
        Nutrition ring picks up the new target immediately.
      </Text>

      {/* Goal picker */}
      <Section title="Goal">
        <View style={styles.goalGrid}>
          {GOAL_ORDER.map((k) => {
            const active = goal === k;
            const cfg = GOAL_CONFIGS[k];
            return (
              <Pressable
                key={k}
                onPress={() => setGoal(k)}
                style={[
                  styles.goalCard,
                  {
                    backgroundColor: active ? t.accent : t.surface2,
                    borderColor: active ? t.accent : t.border,
                  },
                ]}>
                <Text style={[styles.goalLabel, { color: active ? '#fff' : t.text, fontWeight: active ? '700' : '600' }]}>
                  {cfg.label}
                </Text>
                <Text style={[styles.goalAdjust, { color: active ? 'rgba(255,255,255,0.85)' : t.muted }]}>
                  {cfg.calAdjust === 0 ? 'TDEE' : `${cfg.calAdjust > 0 ? '+' : ''}${Math.round(cfg.calAdjust * 100)}%`}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Section>

      {/* Suggestion banner */}
      {suggestion ? (
        <View style={[styles.suggestion, { backgroundColor: t.surface, borderColor: t.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.suggestionTitle, { color: t.muted }]}>Suggested</Text>
            <Text style={[styles.suggestionVal, { color: t.text }]}>
              {suggestion.calorieTarget.toLocaleString()}{' '}
              <Text style={[styles.suggestionUnit, { color: t.muted }]}>kcal</Text>
            </Text>
            <Text style={[styles.suggestionMacros, { color: t.muted }]}>
              P {suggestion.proteinG}g · C {suggestion.carbsG}g · F {suggestion.fatG}g
            </Text>
          </View>
          <Pressable
            onPress={applySuggestion}
            style={[styles.suggestBtn, { backgroundColor: t.accent }]}>
            <Ionicons name="sparkles" size={13} color="#fff" />
            <Text style={styles.suggestBtnLabel}>Apply</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={[styles.needStats, { color: t.danger }]}>
          Missing body stats — fill them in first so we can compute suggested targets.
        </Text>
      )}

      {/* Calorie target */}
      <Section title="Calories">
        <NumberInput
          label="Daily calorie target"
          value={calorieTarget}
          onChange={setCalorieTarget}
          unit="kcal"
          suggested={suggestion ? suggestion.calorieTarget : undefined}
        />
      </Section>

      {/* Macros */}
      <Section title="Macros">
        <NumberInput
          label="Protein"
          value={protein}
          onChange={setProtein}
          unit="g"
          suggested={suggestion?.proteinG}
          color={t.protein}
        />
        <NumberInput
          label="Carbs"
          value={carbs}
          onChange={setCarbs}
          unit="g"
          suggested={suggestion?.carbsG}
          color={t.carbs}
        />
        <NumberInput
          label="Fat"
          value={fat}
          onChange={setFat}
          unit="g"
          suggested={suggestion?.fatG}
          color={t.fat}
        />
        <View style={[styles.breakdown, { backgroundColor: t.surface2, borderColor: t.border }]}>
          <Text style={[styles.breakdownLabel, { color: t.muted }]}>Macro total</Text>
          <Text
            style={[
              styles.breakdownValue,
              {
                color:
                  Math.abs(breakdown.delta) <= 50
                    ? t.green
                    : Math.abs(breakdown.delta) <= 150
                      ? t.amber
                      : t.danger,
              },
            ]}>
            {breakdown.kcal.toLocaleString()} kcal{'  '}
            <Text style={[styles.breakdownDelta, { color: t.muted }]}>
              ({breakdown.delta >= 0 ? '+' : ''}
              {breakdown.delta.toFixed(0)} vs target)
            </Text>
          </Text>
        </View>
      </Section>

      {/* Micros — optional */}
      <Section title="Micros (optional)">
        <NumberInput label="Sugar" value={sugar} onChange={setSugar} unit="g" color={t.sugar} placeholder="50" />
        <NumberInput label="Fiber" value={fiber} onChange={setFiber} unit="g" color={t.fiber} placeholder="30" />
        <NumberInput label="Sodium" value={sodium} onChange={setSodium} unit="mg" color={t.sodium} placeholder="2300" />
      </Section>

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
          <Text style={styles.saveLabel}>Save targets</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const t = useTokens();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: t.muted }]}>{title}</Text>
      {children}
    </View>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  unit,
  suggested,
  color,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  unit?: string;
  suggested?: number;
  color?: string;
  placeholder?: string;
}) {
  const t = useTokens();
  return (
    <View style={styles.numberRow}>
      <View style={styles.numberHeader}>
        <Text style={[styles.numberLabel, { color: color ?? t.text }]}>{label}</Text>
        {suggested != null ? (
          <Pressable onPress={() => onChange(String(suggested))}>
            <Text style={[styles.numberSuggest, { color: t.accent }]}>
              suggested {suggested}
              {unit ? ` ${unit}` : ''}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.numberInputWrap}>
        <TextInput
          value={value}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          placeholder={placeholder ?? '0'}
          placeholderTextColor={t.subtle}
          style={[
            styles.numberInput,
            { color: t.text, backgroundColor: t.surface2, borderColor: t.border },
          ]}
        />
        {unit ? <Text style={[styles.numberUnit, { color: t.muted }]}>{unit}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 60, gap: 16 },
  lead: { fontSize: 13, lineHeight: 18 },

  section: { gap: 10 },
  sectionTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },

  goalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  goalCard: {
    flexBasis: '48%',
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 2,
  },
  goalLabel: { fontSize: 13 },
  goalAdjust: { fontSize: 11, fontWeight: '500' },

  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  suggestionTitle: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  suggestionVal: { fontSize: 22, fontWeight: '700', marginTop: 2 },
  suggestionUnit: { fontSize: 12, fontWeight: '500' },
  suggestionMacros: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  suggestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  suggestBtnLabel: { color: '#fff', fontWeight: '700', fontSize: 13 },

  needStats: { fontSize: 13, paddingHorizontal: 2 },

  numberRow: { gap: 4 },
  numberHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  numberLabel: { fontSize: 13, fontWeight: '600' },
  numberSuggest: { fontSize: 11, fontWeight: '600' },
  numberInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  numberInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: '600',
  },
  numberUnit: { fontSize: 13, fontWeight: '500', minWidth: 36 },

  breakdown: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 4,
  },
  breakdownLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  breakdownValue: { fontSize: 13, fontWeight: '700' },
  breakdownDelta: { fontSize: 11, fontWeight: '500' },

  saveBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  saveLabel: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

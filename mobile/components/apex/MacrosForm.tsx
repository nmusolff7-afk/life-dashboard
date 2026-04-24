import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { GoalKey, OnboardingDataResponse, ProfileResponse } from '../../../shared/src/types/home';
import { composeTdee } from '../../../shared/src/logic/tdee';
import {
  computeTargets,
  GOAL_CONFIGS,
} from '../../../shared/src/logic/targets';
import type { Occupation } from '../../../shared/src/logic/neat';
import { computeProjection } from '../../../shared/src/logic/projection';
import { updateGoal } from '../../lib/api/profile';
import { DEFAULT_PREFERENCES, loadPreferences, type Preferences } from '../../lib/preferences';
import { useTokens } from '../../lib/theme';
import { useHaptics } from '../../lib/useHaptics';
import { SliderRow } from './SliderRow';

/** Safety floor — never allow target calories below this value regardless of
 *  slider position. Below this is medically dangerous and would bypass the
 *  deficit model. The PWA uses the same conceptual minimum. */
const MIN_SAFE_KCAL = 1200;

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
  const haptics = useHaptics();
  const saved = onboarding?.saved ?? null;

  const [goal, setGoal] = useState<GoalKey>('lose_weight');
  /** Deficit, in kcal/day. Negative = cut, positive = bulk, 0 = maintain.
   *  Flask computes target = max(burn + deficit, rmr). */
  const [deficit, setDeficit] = useState(0);
  const [protein, setProtein] = useState(150);
  const [carbs, setCarbs] = useState(200);
  const [fat, setFat] = useState(65);
  const [sugar, setSugar] = useState(50);
  const [fiber, setFiber] = useState(30);
  const [sodium, setSodium] = useState(2300);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);
  useEffect(() => {
    loadPreferences().then(setPrefs).catch(() => {});
  }, []);

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
    const workStyleRaw = (saved?.work_style as string | undefined) ?? profile?.work_style;
    const workStyle: Occupation =
      workStyleRaw === 'sedentary' || workStyleRaw === 'standing' || workStyleRaw === 'physical'
        ? workStyleRaw
        : 'sedentary';
    const steps = profile?.steps_per_day_estimated ?? 4000;
    if (weightLbs == null || heightFt == null || heightIn == null || !sex || age == null) {
      return null;
    }
    return {
      weightLbs, targetLbs: targetLbs ?? undefined, heightFt, heightIn, sex, age, bf,
      workStyle, steps,
    };
  }, [saved, profile]);

  // Compose full TDEE (RMR + NEAT + EAT + TEF) client-side — Flask's
  // goal_config falls back to RMR when given tdee=0, which collapses every
  // goal to the same target. We pass a real TDEE so deficit actually bites.
  const tdeeResult = useMemo(() => {
    if (!bodyStats) return null;
    const weightKg = bodyStats.weightLbs * 0.453592;
    const heightCm = (bodyStats.heightFt * 12 + bodyStats.heightIn) * 2.54;
    return composeTdee({
      rmr: {
        weightKg, heightCm,
        ageYears: bodyStats.age, sex: bodyStats.sex,
        bodyFatPct: bodyStats.bf,
      },
      neat: { occupation: bodyStats.workStyle, totalSteps: bodyStats.steps },
      eatKcal: 0,
      macros: {},
      caloriesConsumed: 0,
    });
  }, [bodyStats]);

  const suggestion = useMemo(() => {
    if (!bodyStats || !tdeeResult) return null;
    return computeTargets({
      goal,
      weightLbs: bodyStats.weightLbs,
      targetWeightLbs: bodyStats.targetLbs,
      heightFt: bodyStats.heightFt,
      heightIn: bodyStats.heightIn,
      ageYears: bodyStats.age,
      sex: bodyStats.sex,
      bodyFatPct: bodyStats.bf,
      tdee: tdeeResult.tdee,
    });
  }, [goal, bodyStats, tdeeResult]);

  const burn = tdeeResult?.tdee ?? 0;
  const suggestedDeficit = suggestion ? suggestion.deficitSurplus : 0;
  // Live calorie-target = burn + deficit, floored at MIN_SAFE_KCAL. The PWA
  // stops here too — RMR is NOT a floor because a real cut dips below RMR
  // intraday, recovered via NEAT/TEF over the full day.
  const calorieTarget = Math.max(burn + deficit, MIN_SAFE_KCAL);

  // Seed goal + sliders when data loads.
  useEffect(() => {
    if (profile?.primary_goal && GOAL_ORDER.includes(profile.primary_goal as GoalKey)) {
      setGoal(profile.primary_goal as GoalKey);
    } else if (saved?.primary_goal && GOAL_ORDER.includes(saved.primary_goal as GoalKey)) {
      setGoal(saved.primary_goal as GoalKey);
    }
  }, [profile?.primary_goal, saved?.primary_goal]);

  useEffect(() => {
    const gt = profile?.goal_targets;
    if (gt) {
      // Server has saved targets — prefer the persisted deficit_surplus
      // (already stored on user_goals) so round-trip is exact.
      setDeficit(gt.deficit_surplus ?? 0);
      setProtein(gt.protein_g ?? 150);
      setCarbs(gt.carbs_g ?? 200);
      setFat(gt.fat_g ?? 65);
    } else if (suggestion) {
      setDeficit(suggestion.deficitSurplus);
      setProtein(suggestion.proteinG);
      setCarbs(suggestion.carbsG);
      setFat(suggestion.fatG);
    }
  }, [profile?.goal_targets, suggestion]);

  const breakdown = useMemo(() => {
    const kcal = protein * 4 + carbs * 4 + fat * 9;
    return { kcal, delta: kcal - calorieTarget };
  }, [protein, carbs, fat, calorieTarget]);

  const applySuggestion = () => {
    if (!suggestion) return;
    setDeficit(suggestion.deficitSurplus);
    setProtein(suggestion.proteinG);
    setCarbs(suggestion.carbsG);
    setFat(suggestion.fatG);
    setSugar(50);
    setFiber(30);
    setSodium(2300);
  };

  /** Tapping a goal card re-seeds every slider from the new goal's
   *  suggestion. Users can still manually tweak afterwards. */
  const handleGoalChange = (k: GoalKey) => {
    setGoal(k);
    if (bodyStats && tdeeResult) {
      const s = computeTargets({
        goal: k,
        weightLbs: bodyStats.weightLbs,
        targetWeightLbs: bodyStats.targetLbs,
        heightFt: bodyStats.heightFt,
        heightIn: bodyStats.heightIn,
        ageYears: bodyStats.age,
        sex: bodyStats.sex,
        bodyFatPct: bodyStats.bf,
        tdee: tdeeResult.tdee,
      });
      setDeficit(s.deficitSurplus);
      setProtein(s.proteinG);
      setCarbs(s.carbsG);
      setFat(s.fatG);
    }
  };

  // ── Time-to-goal projection (only when target weight is set) ────────────

  const projection = useMemo(() => {
    if (!bodyStats?.targetLbs || bodyStats.weightLbs === bodyStats.targetLbs) return null;
    // projection.ts uses positive deficit = losing. My slider uses negative
    // deficit = cutting, so flip the sign before calling.
    const result = computeProjection({
      currentWeightLbs: bodyStats.weightLbs,
      targetWeightLbs: bodyStats.targetLbs,
      dailyDeficitKcal: -deficit,
    });
    return result.weeks != null ? result : null;
  }, [bodyStats?.weightLbs, bodyStats?.targetLbs, deficit]);

  const handleSave = async () => {
    if (!suggestion) {
      Alert.alert('Missing body stats', 'Fill out Body Stats first so we know your burn.');
      return;
    }
    // RMR lock (Advanced pref): when ON, preserve the previously stored
    // RMR instead of recomputing from fresh body stats. Without this, a
    // user who tuned their RMR manually would see it silently re-shift
    // every time they save from this screen.
    const lockedRmr = profile?.rmr_kcal ?? null;
    const rmrToPersist = prefs.rmrLocked && lockedRmr != null ? lockedRmr : suggestion.rmr;

    setSaving(true);
    try {
      await updateGoal({
        goal,
        rmr: rmrToPersist,
        tdee: burn, // full TDEE so Flask's target math differentiates goals
        deficit: Math.round(deficit),
        protein: Math.round(protein),
        carbs: Math.round(carbs),
        fat: Math.round(fat),
        sugar: Math.round(sugar),
        fiber: Math.round(fiber),
        sodium: Math.round(sodium),
      });
      await onSaved();
      haptics.fire('success');
      Alert.alert('Saved', 'Your deficit + macro targets are updated. The Nutrition ring will reflect them.');
    } catch (e) {
      haptics.fire('error');
      Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const deltaColor =
    Math.abs(breakdown.delta) <= 50 ? t.green : Math.abs(breakdown.delta) <= 150 ? t.amber : t.danger;

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={[styles.lead, { color: t.muted }]}>
        Your daily calorie target = <Text style={{ fontWeight: '700' }}>burn + deficit</Text>, floored at your RMR so you never go below maintenance.
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
                onPress={() => handleGoalChange(k)}
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

      {/* Live target card */}
      {suggestion ? (
        <View style={[styles.targetCard, { backgroundColor: t.surface, shadowColor: '#000' }]}>
          <View style={styles.targetRow}>
            <TargetCell label="Burn" value={burn} color={t.fitness} />
            <Text style={[styles.op, { color: t.muted }]}>{deficit >= 0 ? '+' : '−'}</Text>
            <TargetCell
              label={deficit >= 0 ? 'Surplus' : 'Deficit'}
              value={Math.abs(deficit)}
              color={deficit > 0 ? t.cal : deficit < 0 ? t.green : t.muted}
            />
            <Text style={[styles.op, { color: t.muted }]}>=</Text>
            <TargetCell label="Target" value={calorieTarget} color={t.text} bold />
          </View>
          <Pressable onPress={applySuggestion} style={[styles.suggestBtn, { backgroundColor: t.surface2 }]}>
            <Ionicons name="sparkles-outline" size={13} color={t.accent} />
            <Text style={[styles.suggestBtnLabel, { color: t.accent }]}>
              Apply suggested ({suggestedDeficit >= 0 ? '+' : ''}{suggestedDeficit} kcal)
            </Text>
          </Pressable>
        </View>
      ) : (
        <Text style={[styles.needStats, { color: t.danger }]}>
          Missing body stats — fill them in first so we can compute your burn.
        </Text>
      )}

      {/* Time to goal */}
      {projection && bodyStats?.targetLbs ? (
        <View style={[styles.projection, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Ionicons name="flag-outline" size={18} color={t.green} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.projectionTitle, { color: t.text }]}>
              {projection.weeks} week{projection.weeks === 1 ? '' : 's'} to{' '}
              {Math.round(bodyStats.targetLbs)} lbs
            </Text>
            <Text style={[styles.projectionDate, { color: t.muted }]}>
              at this deficit, hits target {projection.projectedDate}
            </Text>
          </View>
        </View>
      ) : bodyStats?.targetLbs && bodyStats.weightLbs !== bodyStats.targetLbs ? (
        <View style={[styles.projection, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Ionicons name="information-circle-outline" size={18} color={t.muted} />
          <Text style={[styles.projectionDate, { color: t.muted, flex: 1 }]}>
            Deficit direction doesn't match your goal weight. Adjust the slider to project time to
            goal.
          </Text>
        </View>
      ) : null}

      {/* Deficit slider */}
      <Section title="Daily deficit / surplus">
        <SliderRow
          label="vs burn"
          value={deficit}
          onChange={setDeficit}
          min={-1000}
          max={500}
          step={25}
          color={deficit > 0 ? t.cal : deficit < 0 ? t.green : t.muted}
          format={(n) => `${n >= 0 ? '+' : ''}${Math.round(n)} kcal`}
          hint={suggestion ? `Suggested ${suggestedDeficit >= 0 ? '+' : ''}${suggestedDeficit}` : undefined}
        />
      </Section>

      {/* Macros */}
      <Section title="Macros">
        <SliderRow
          label="Protein"
          value={protein}
          onChange={setProtein}
          min={50}
          max={300}
          step={5}
          color={t.protein}
          unit="g"
          hint={suggestion ? `Suggested ${suggestion.proteinG}g` : undefined}
        />
        <SliderRow
          label="Carbs"
          value={carbs}
          onChange={setCarbs}
          min={50}
          max={500}
          step={5}
          color={t.carbs}
          unit="g"
          hint={suggestion ? `Suggested ${suggestion.carbsG}g` : undefined}
        />
        <SliderRow
          label="Fat"
          value={fat}
          onChange={setFat}
          min={20}
          max={200}
          step={5}
          color={t.fat}
          unit="g"
          hint={suggestion ? `Suggested ${suggestion.fatG}g` : undefined}
        />
        <View style={[styles.breakdown, { backgroundColor: t.surface2, borderColor: t.border }]}>
          <Text style={[styles.breakdownLabel, { color: t.muted }]}>Macro total</Text>
          <Text style={[styles.breakdownValue, { color: deltaColor }]}>
            {breakdown.kcal.toLocaleString()} kcal{'  '}
            <Text style={[styles.breakdownDelta, { color: t.muted }]}>
              ({breakdown.delta >= 0 ? '+' : ''}
              {Math.round(breakdown.delta)} vs target)
            </Text>
          </Text>
        </View>
      </Section>

      {/* Micros */}
      <Section title="Micros">
        <SliderRow label="Sugar"  value={sugar}  onChange={setSugar}  min={0} max={150}  step={5}  color={t.sugar}  unit="g" />
        <SliderRow label="Fiber"  value={fiber}  onChange={setFiber}  min={10} max={80}  step={1}  color={t.fiber}  unit="g" />
        <SliderRow label="Sodium" value={sodium} onChange={setSodium} min={500} max={5000} step={50} color={t.sodium} unit="mg" />
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const t = useTokens();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: t.muted }]}>{title}</Text>
      {children}
    </View>
  );
}

function TargetCell({ label, value, color, bold }: { label: string; value: number; color: string; bold?: boolean }) {
  const t = useTokens();
  return (
    <View style={styles.cell}>
      <Text style={[styles.cellLabel, { color: t.muted }]}>{label}</Text>
      <Text style={[styles.cellValue, { color, fontWeight: bold ? '800' : '700' }]}>
        {Math.round(value).toLocaleString()}
      </Text>
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

  targetCard: {
    borderRadius: 16,
    padding: 14,
    gap: 12,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 2,
  },
  targetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  cell: { alignItems: 'center', flex: 1 },
  cellLabel: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  cellValue: { fontSize: 20, marginTop: 2 },
  op: { fontSize: 18, fontWeight: '600' },

  suggestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
  },
  suggestBtnLabel: { fontSize: 12, fontWeight: '700' },

  needStats: { fontSize: 13, paddingHorizontal: 2 },

  projection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  projectionTitle: { fontSize: 14, fontWeight: '700' },
  projectionDate: { fontSize: 12, marginTop: 2 },

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

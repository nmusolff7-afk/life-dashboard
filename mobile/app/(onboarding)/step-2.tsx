import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { computeTargets, type GoalKey } from '../../../shared/src/logic/targets';
import { Button, Card, ProgressDots, TextField } from '../../components/ui';
import { apiFetch } from '../../lib/api';
import { useTokens } from '../../lib/theme';

interface GoalOption {
  key: GoalKey;
  label: string;
  description: string;
}

const GOALS: GoalOption[] = [
  { key: 'lose_weight', label: 'Get Leaner', description: 'Lose body fat while keeping as much muscle as possible' },
  { key: 'build_muscle', label: 'Get Bigger', description: 'Build muscle and strength, even if it means gaining some fat' },
  { key: 'recomp', label: 'Lean & Muscular', description: 'Lose fat and build muscle at the same time' },
  { key: 'maintain', label: 'Stay Where I Am', description: 'Maintain my current weight and body composition' },
];

// Skeleton: we don't yet fetch step-1's saved values, so preview uses placeholder body stats.
// Founder confirmation needed on whether to extend the onboarding save/read API to support cross-step preview.
const PREVIEW_STATS = { weightLbs: 170, heightFt: 5, heightIn: 10, ageYears: 30, sex: 'male' as const };

export default function Step2Screen() {
  const t = useTokens();
  const router = useRouter();
  const [goal, setGoal] = useState<GoalKey | null>(null);
  const [targetWeight, setTargetWeight] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo(() => {
    if (!goal) return null;
    const twLbs = targetWeight ? parseFloat(targetWeight) : undefined;
    return computeTargets({
      goal,
      weightLbs: PREVIEW_STATS.weightLbs,
      targetWeightLbs: twLbs,
      heightFt: PREVIEW_STATS.heightFt,
      heightIn: PREVIEW_STATS.heightIn,
      ageYears: PREVIEW_STATS.ageYears,
      sex: PREVIEW_STATS.sex,
    });
  }, [goal, targetWeight]);

  const needsTargetWeight = goal === 'lose_weight' || goal === 'build_muscle';

  const onContinue = async () => {
    if (!goal) return;
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { primary_goal: goal };
      if (targetWeight) payload.target_weight_lbs = parseFloat(targetWeight);
      const res = await apiFetch('/api/onboarding/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      router.push('/(onboarding)/step-3');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={styles.container}>
      <ProgressDots current={2} total={3} label="Step 2 of 3" />
      <Text style={[styles.title, { color: t.text }]}>What&apos;s your goal?</Text>
      <Text style={[styles.subtitle, { color: t.muted }]}>This determines your calorie target, protein, and macros.</Text>

      <View style={styles.grid}>
        {GOALS.map((g) => {
          const selected = goal === g.key;
          return (
            <Pressable
              key={g.key}
              onPress={() => setGoal(g.key)}
              style={[
                styles.goalCard,
                { backgroundColor: t.surface, borderColor: selected ? t.accent : t.border },
              ]}>
              <Text style={[styles.goalLabel, { color: t.text }]}>{g.label}</Text>
              <Text style={[styles.goalDesc, { color: t.muted }]}>{g.description}</Text>
            </Pressable>
          );
        })}
      </View>

      {needsTargetWeight ? (
        <TextField
          label="Target weight (lbs, optional)"
          placeholder="165"
          keyboardType="decimal-pad"
          value={targetWeight}
          onChangeText={setTargetWeight}
        />
      ) : null}

      {preview ? (
        <Card>
          <Text style={[styles.previewTitle, { color: t.muted }]}>Your plan preview</Text>
          <Text style={[styles.previewBig, { color: t.text }]}>{preview.calorieTarget} kcal / day</Text>
          <View style={styles.previewRow}>
            <View style={styles.previewCell}>
              <Text style={[styles.cellLabel, { color: t.muted }]}>Protein</Text>
              <Text style={[styles.cellValue, { color: t.protein }]}>{preview.proteinG}g</Text>
            </View>
            <View style={styles.previewCell}>
              <Text style={[styles.cellLabel, { color: t.muted }]}>Carbs</Text>
              <Text style={[styles.cellValue, { color: t.carbs }]}>{preview.carbsG}g</Text>
            </View>
            <View style={styles.previewCell}>
              <Text style={[styles.cellLabel, { color: t.muted }]}>Fat</Text>
              <Text style={[styles.cellValue, { color: t.fat }]}>{preview.fatG}g</Text>
            </View>
          </View>
          <Text style={[styles.previewNote, { color: t.subtle }]}>
            Preview based on sample stats. Actual target recomputes from your body stats.
          </Text>
        </Card>
      ) : null}

      {error ? <Text style={[styles.error, { color: t.danger }]}>{error}</Text> : null}

      <Button title={saving ? 'Saving…' : 'Continue'} onPress={onContinue} disabled={!goal || saving} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 14 },
  title: { fontSize: 28, fontWeight: '700', marginTop: 8 },
  subtitle: { fontSize: 15, lineHeight: 22 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  goalCard: { flexBasis: '48%', flexGrow: 1, borderWidth: 1.5, borderRadius: 14, padding: 14, gap: 6 },
  goalLabel: { fontSize: 16, fontWeight: '700' },
  goalDesc: { fontSize: 12, lineHeight: 17 },
  previewTitle: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  previewBig: { fontSize: 28, fontWeight: '700', marginTop: 4 },
  previewRow: { flexDirection: 'row', marginTop: 12 },
  previewCell: { flex: 1, gap: 2 },
  cellLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  cellValue: { fontSize: 18, fontWeight: '700' },
  previewNote: { fontSize: 11, marginTop: 10 },
  error: { fontSize: 13 },
});

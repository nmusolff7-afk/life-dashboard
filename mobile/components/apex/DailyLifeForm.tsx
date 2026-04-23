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

import type {
  OnboardingDataResponse,
  ProfileResponse,
} from '../../../shared/src/types/home';
import { computeNeat, type Occupation } from '../../../shared/src/logic/neat';
import { saveOnboardingInputs } from '../../lib/api/profile';
import { useTokens } from '../../lib/theme';

interface Props {
  onboarding: OnboardingDataResponse | null;
  profile: ProfileResponse | null;
  onSaved: () => void | Promise<void>;
}

const STRESS_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const WORK_STYLES: { value: Occupation; label: string; hint: string }[] = [
  { value: 'sedentary', label: 'Sedentary', hint: 'Desk work, driving — base 200 kcal' },
  { value: 'standing', label: 'Standing', hint: 'Teacher, retail, kitchen — base 400 kcal' },
  { value: 'physical', label: 'Physical', hint: 'Construction, trades, warehouse — base 700 kcal' },
];

export function DailyLifeForm({ onboarding, profile, onSaved }: Props) {
  const t = useTokens();
  const saved = onboarding?.saved ?? null;

  const [occupation, setOccupation] = useState('');
  const [workStyle, setWorkStyle] = useState<Occupation>('sedentary');
  const [stress, setStress] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (saved) {
      setOccupation((saved.occupation_description as string | undefined) ?? '');
      const ws = saved.work_style as Occupation | undefined;
      if (ws === 'sedentary' || ws === 'standing' || ws === 'physical') setWorkStyle(ws);
      const s = saved.stress_level_1_10 as number | undefined;
      if (s != null && s >= 1 && s <= 10) setStress(s);
    }
  }, [saved]);

  // ── NEAT preview (typical-day estimate using profile's steps_per_day) ────

  const neatPreview = useMemo(() => {
    const baselineSteps = profile?.steps_per_day_estimated ?? 4000;
    return computeNeat({ occupation: workStyle, totalSteps: baselineSteps });
  }, [workStyle, profile?.steps_per_day_estimated]);

  // ── Save ─────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (stress == null) {
      Alert.alert('Stress level', 'Pick a number 1–10.');
      return;
    }
    if (!occupation.trim()) {
      Alert.alert('Occupation', 'What do you do for work?');
      return;
    }
    setSaving(true);
    try {
      await saveOnboardingInputs({
        occupation_description: occupation.trim(),
        work_style: workStyle,
        stress_level_1_10: stress,
      });
      await onSaved();
      Alert.alert('Saved', 'Daily-life inputs updated. Regenerate your AI profile or open Macros to apply the new TDEE.');
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={[styles.lead, { color: t.muted }]}>
        How you work + your stress level drive NEAT (non-exercise activity) and TDEE. These update
        calorie targets on regenerate.
      </Text>

      <Section title="Occupation">
        <TextInput
          value={occupation}
          onChangeText={setOccupation}
          placeholder="Software engineer, nurse, student…"
          placeholderTextColor={t.subtle}
          autoCapitalize="sentences"
          style={[styles.input, { color: t.text, backgroundColor: t.surface2, borderColor: t.border }]}
        />
      </Section>

      <Section title="Work style">
        <View style={styles.workGrid}>
          {WORK_STYLES.map((w) => {
            const active = workStyle === w.value;
            return (
              <Pressable
                key={w.value}
                onPress={() => setWorkStyle(w.value)}
                style={[
                  styles.workCard,
                  {
                    backgroundColor: active ? t.accent : t.surface2,
                    borderColor: active ? t.accent : t.border,
                  },
                ]}>
                <Text
                  style={[
                    styles.workLabel,
                    { color: active ? '#fff' : t.text, fontWeight: active ? '700' : '600' },
                  ]}>
                  {w.label}
                </Text>
                <Text
                  style={[
                    styles.workHint,
                    { color: active ? 'rgba(255,255,255,0.85)' : t.muted },
                  ]}>
                  {w.hint}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Section title="Stress level (1 low — 10 high)">
        <View style={styles.chipRow}>
          {STRESS_LEVELS.map((n) => {
            const active = stress === n;
            return (
              <Pressable
                key={n}
                onPress={() => setStress(n)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? t.accent : t.surface2,
                    borderColor: active ? t.accent : t.border,
                  },
                ]}>
                <Text
                  style={[
                    styles.chipText,
                    { color: active ? '#fff' : t.text, fontWeight: active ? '700' : '600' },
                  ]}>
                  {n}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Section>

      <View style={[styles.previewCard, { backgroundColor: t.surface, shadowColor: '#000' }]}>
        <Text style={[styles.previewTitle, { color: t.muted }]}>Live NEAT preview</Text>
        <Text style={[styles.previewVal, { color: t.text }]}>
          {neatPreview.neatKcal.toLocaleString()}{' '}
          <Text style={[styles.previewUnit, { color: t.muted }]}>kcal / day</Text>
        </Text>
        <Text style={[styles.previewBreakdown, { color: t.subtle }]}>
          Occupation base {neatPreview.neatKcal - Math.round(neatPreview.netSteps * 0.04)} kcal +{' '}
          {neatPreview.netSteps.toLocaleString()} steps ≈{' '}
          {Math.round(neatPreview.netSteps * 0.04)} kcal
        </Text>
      </View>

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
          <Text style={styles.saveLabel}>Save daily life</Text>
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

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 60, gap: 16 },
  lead: { fontSize: 13, lineHeight: 18 },

  section: { gap: 10 },
  sectionTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },

  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
  },

  workGrid: { gap: 8 },
  workCard: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  workLabel: { fontSize: 14 },
  workHint: { fontSize: 11, marginTop: 3 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { fontSize: 14 },

  previewCard: {
    borderRadius: 16,
    padding: 14,
    gap: 4,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 2,
  },
  previewTitle: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  previewVal: { fontSize: 22, fontWeight: '700' },
  previewUnit: { fontSize: 12, fontWeight: '500' },
  previewBreakdown: { fontSize: 12 },

  saveBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  saveLabel: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, ProgressDots, SegmentedControl, TextField } from '../../components/ui';
import { apiFetch } from '../../lib/api';
import { useTokens } from '../../lib/theme';

type WorkStyle = 'sedentary' | 'standing' | 'physical';

const STRESS_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export default function Step3Screen() {
  const t = useTokens();
  const router = useRouter();
  const [occupation, setOccupation] = useState('');
  const [workStyle, setWorkStyle] = useState<WorkStyle | null>(null);
  const [stress, setStress] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canContinue = occupation.trim().length > 0 && workStyle !== null && stress !== null;

  const onContinue = async () => {
    if (!canContinue) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        occupation_description: occupation.trim(),
        work_style: workStyle,
        stress_level_1_10: stress,
      };
      const saveRes = await apiFetch('/api/onboarding/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!saveRes.ok) throw new Error(`Save failed (${saveRes.status})`);

      // Trigger AI profile generation (async); next screen polls for completion.
      const completeRes = await apiFetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!completeRes.ok && completeRes.status !== 409) {
        throw new Error(`Profile generation failed to start (${completeRes.status})`);
      }
      router.replace('/(onboarding)/generating');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={styles.container}>
      <ProgressDots current={3} total={3} label="Step 3 of 3" />
      <Text style={[styles.title, { color: t.text }]}>Your daily life</Text>
      <Text style={[styles.subtitle, { color: t.muted }]}>How you work and your stress level affect your calorie needs.</Text>

      <TextField
        label="What do you do for work?"
        placeholder="Software engineer, nurse, student…"
        value={occupation}
        onChangeText={setOccupation}
        autoCapitalize="sentences"
      />

      <Text style={[styles.label, { color: t.muted }]}>Work style</Text>
      <SegmentedControl<WorkStyle>
        value={workStyle}
        onChange={setWorkStyle}
        options={[
          { value: 'sedentary', label: 'Sedentary' },
          { value: 'standing', label: 'Standing' },
          { value: 'physical', label: 'Physical' },
        ]}
      />

      <Text style={[styles.label, { color: t.muted }]}>Stress level (1 low — 10 high)</Text>
      <View style={styles.chipRow}>
        {STRESS_LEVELS.map((n) => {
          const selected = stress === n;
          return (
            <Pressable
              key={n}
              onPress={() => setStress(n)}
              style={[
                styles.chip,
                { backgroundColor: selected ? t.accent : t.surface, borderColor: selected ? t.accent : t.border },
              ]}>
              <Text style={[styles.chipText, { color: selected ? '#FFFFFF' : t.muted }]}>{n}</Text>
            </Pressable>
          );
        })}
      </View>

      {error ? <Text style={[styles.error, { color: t.danger }]}>{error}</Text> : null}

      <Button title={saving ? 'Saving…' : 'Generate my plan'} onPress={onContinue} disabled={!canContinue || saving} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 14 },
  title: { fontSize: 28, fontWeight: '700', marginTop: 8 },
  subtitle: { fontSize: 15, lineHeight: 22 },
  label: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 14, fontWeight: '700' },
  error: { fontSize: 13 },
});

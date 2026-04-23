import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, ProgressDots, SegmentedControl, TextField } from '../../components/ui';
import { apiFetch } from '../../lib/api';
import { useTokens } from '../../lib/theme';

type Sex = 'male' | 'female';

function computeBmi(weightLbs: number, heightIn: number): number | null {
  if (!weightLbs || !heightIn) return null;
  // BMI = (lbs / in²) × 703
  const bmi = (weightLbs / (heightIn * heightIn)) * 703;
  return Math.round(bmi * 10) / 10;
}

function ageFromBirthdate(month: number, day: number, year: number): number {
  const today = new Date();
  let age = today.getFullYear() - year;
  const m = today.getMonth() + 1 - month;
  if (m < 0 || (m === 0 && today.getDate() < day)) age -= 1;
  return age;
}

export default function Step1Screen() {
  const t = useTokens();
  const router = useRouter();
  const [name, setName] = useState('');
  const [heightFt, setHeightFt] = useState('');
  const [heightIn, setHeightIn] = useState('');
  const [birthMonth, setBirthMonth] = useState('');
  const [birthDay, setBirthDay] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [weight, setWeight] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [sex, setSex] = useState<Sex | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalIn = (parseFloat(heightFt) || 0) * 12 + (parseFloat(heightIn) || 0);
  const wLbs = parseFloat(weight) || 0;
  const bmi = useMemo(() => computeBmi(wLbs, totalIn), [wLbs, totalIn]);

  const canContinue = !!name && heightFt !== '' && heightIn !== '' && birthMonth !== '' && birthDay !== '' && birthYear !== '' && weight !== '' && sex !== null;

  const onContinue = async () => {
    if (!canContinue) return;
    setSaving(true);
    setError(null);
    try {
      const age = ageFromBirthdate(parseInt(birthMonth), parseInt(birthDay), parseInt(birthYear));
      const payload = {
        first_name: name.trim(),
        height_ft: parseInt(heightFt),
        height_in: parseInt(heightIn),
        current_weight_lbs: parseFloat(weight),
        body_fat_pct: bodyFat ? parseFloat(bodyFat) : null,
        age,
        birthdate: `${birthYear.padStart(4, '0')}-${birthMonth.padStart(2, '0')}-${birthDay.padStart(2, '0')}`,
        gender: sex,
      };
      const res = await apiFetch('/api/onboarding/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      router.push('/(onboarding)/step-2');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <ProgressDots current={1} total={3} label="Step 1 of 3" />
      <Text style={[styles.title, { color: t.text }]}>Let&apos;s get to know you</Text>
      <Text style={[styles.subtitle, { color: t.muted }]}>
        Your name and body stats — used to calculate your metabolism.
      </Text>

      <TextField label="What should we call you?" placeholder="Your first name" value={name} onChangeText={setName} autoCapitalize="words" />

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <TextField label="Height (ft)" placeholder="5" keyboardType="number-pad" value={heightFt} onChangeText={setHeightFt} />
        </View>
        <View style={{ flex: 1 }}>
          <TextField label="Height (in)" placeholder="10" keyboardType="number-pad" value={heightIn} onChangeText={setHeightIn} />
        </View>
      </View>

      <Text style={[styles.label, { color: t.muted }]}>Birthday</Text>
      <View style={styles.row}>
        <View style={{ flex: 1 }}><TextField placeholder="MM" keyboardType="number-pad" value={birthMonth} onChangeText={setBirthMonth} maxLength={2} /></View>
        <View style={{ flex: 1 }}><TextField placeholder="DD" keyboardType="number-pad" value={birthDay} onChangeText={setBirthDay} maxLength={2} /></View>
        <View style={{ flex: 1.2 }}><TextField placeholder="YYYY" keyboardType="number-pad" value={birthYear} onChangeText={setBirthYear} maxLength={4} /></View>
      </View>

      <TextField label="Current weight (lbs)" placeholder="174.8" keyboardType="decimal-pad" value={weight} onChangeText={setWeight} />
      <TextField label="Body fat % (optional)" placeholder="18" keyboardType="decimal-pad" value={bodyFat} onChangeText={setBodyFat} />

      <Text style={[styles.label, { color: t.muted }]}>Sex</Text>
      <SegmentedControl<Sex>
        value={sex}
        onChange={setSex}
        options={[
          { value: 'male', label: 'Male' },
          { value: 'female', label: 'Female' },
        ]}
      />
      <Text style={[styles.hint, { color: t.subtle }]}>Used for calorie calculations.</Text>

      {bmi != null ? (
        <View style={[styles.bmiBox, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text style={[styles.bmiLabel, { color: t.muted }]}>BMI</Text>
          <Text style={[styles.bmiValue, { color: t.text }]}>{bmi}</Text>
        </View>
      ) : null}

      {error ? <Text style={[styles.error, { color: t.danger }]}>{error}</Text> : null}

      <Button title={saving ? 'Saving…' : 'Continue'} onPress={onContinue} disabled={!canContinue || saving} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 14 },
  title: { fontSize: 28, fontWeight: '700', marginTop: 8 },
  subtitle: { fontSize: 15, lineHeight: 22 },
  label: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  hint: { fontSize: 12 },
  row: { flexDirection: 'row', gap: 10 },
  bmiBox: { borderWidth: 1, borderRadius: 14, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bmiLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  bmiValue: { fontSize: 18, fontWeight: '700' },
  error: { fontSize: 13 },
});

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

import type {
  OnboardingDataResponse,
  ProfileResponse,
} from '../../../shared/src/types/home';
import { computeRmr } from '../../../shared/src/logic/rmr';
import { logWeight } from '../../lib/api/fitness';
import { saveOnboardingInputs } from '../../lib/api/profile';
import { useTokens } from '../../lib/theme';
import { useHaptics } from '../../lib/useHaptics';

interface Props {
  onboarding: OnboardingDataResponse | null;
  profile: ProfileResponse | null;
  /** Refetch both on save. */
  onSaved: () => void | Promise<void>;
}

type Gender = 'male' | 'female';

/** Utility: compute age from YYYY-MM-DD birthday. */
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

const BIRTHDAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function BodyStatsForm({ onboarding, profile, onSaved }: Props) {
  const t = useTokens();
  const haptics = useHaptics();

  // Pre-fill source of truth: onboarding raw_inputs first, then profile fallback.
  const saved = onboarding?.saved ?? null;

  const [firstName, setFirstName] = useState('');
  const [birthday, setBirthday] = useState('');
  const [gender, setGender] = useState<Gender>('male');
  const [heightFt, setHeightFt] = useState('');
  const [heightIn, setHeightIn] = useState('');
  const [weight, setWeight] = useState('');
  const [targetWeight, setTargetWeight] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [saving, setSaving] = useState(false);

  // Seed when onboarding/profile data arrives.
  useEffect(() => {
    if (saved) {
      setFirstName((saved.first_name as string | undefined) ?? profile?.first_name ?? '');
      setBirthday((saved.birthday as string | undefined) ?? '');
      const g = saved.gender as Gender | undefined;
      if (g === 'male' || g === 'female') setGender(g);
      setHeightFt(saved.height_ft != null ? String(saved.height_ft) : '');
      setHeightIn(saved.height_in != null ? String(saved.height_in) : '');
      setWeight(
        saved.current_weight_lbs != null
          ? String(saved.current_weight_lbs)
          : profile?.current_weight_lbs != null
            ? String(profile.current_weight_lbs)
            : '',
      );
      setTargetWeight(saved.target_weight_lbs != null ? String(saved.target_weight_lbs) : '');
      setBodyFat(saved.body_fat_pct != null ? String(saved.body_fat_pct) : '');
    } else if (profile) {
      // Fallback to profile if onboarding data hasn't loaded.
      setFirstName(profile.first_name ?? '');
      if (profile.gender === 'male' || profile.gender === 'female') setGender(profile.gender);
      setHeightFt(profile.height_ft != null ? String(profile.height_ft) : '');
      setHeightIn(profile.height_in != null ? String(profile.height_in) : '');
      setWeight(profile.current_weight_lbs != null ? String(profile.current_weight_lbs) : '');
      setTargetWeight(profile.target_weight_lbs != null ? String(profile.target_weight_lbs) : '');
      setBodyFat(profile.body_fat_pct != null ? String(profile.body_fat_pct) : '');
    }
  }, [saved, profile]);

  // ── Live RMR computation ────────────────────────────────────────────────

  const rmrPreview = useMemo(() => {
    const wLbs = parseFloat(weight);
    const hFt = parseInt(heightFt, 10);
    const hIn = parseInt(heightIn, 10);
    const bf = parseFloat(bodyFat);
    const age = ageFromBirthday(birthday);
    if (!Number.isFinite(wLbs) || wLbs < 30) return null;
    if (!Number.isFinite(hFt) || hFt < 3 || hFt > 8) return null;
    if (!Number.isFinite(hIn) || hIn < 0 || hIn > 11) return null;
    if (age == null) return null;
    const weightKg = wLbs * 0.453592;
    const heightCm = (hFt * 12 + hIn) * 2.54;
    return computeRmr({
      weightKg,
      heightCm,
      ageYears: age,
      sex: gender,
      bodyFatPct: Number.isFinite(bf) && bf > 0 ? bf : undefined,
    });
  }, [weight, heightFt, heightIn, bodyFat, birthday, gender]);

  const age = ageFromBirthday(birthday);
  const bmi = useMemo(() => {
    const wLbs = parseFloat(weight);
    const hFt = parseInt(heightFt, 10);
    const hIn = parseInt(heightIn, 10);
    if (!Number.isFinite(wLbs) || !Number.isFinite(hFt) || !Number.isFinite(hIn)) return null;
    const heightIn2 = hFt * 12 + hIn;
    if (heightIn2 <= 0) return null;
    return +((wLbs * 703) / (heightIn2 * heightIn2)).toFixed(1);
  }, [weight, heightFt, heightIn]);

  // ── Save ────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    const wLbs = parseFloat(weight);
    const hFt = parseInt(heightFt, 10);
    const hIn = parseInt(heightIn, 10);
    const tgt = parseFloat(targetWeight);
    const bf = parseFloat(bodyFat);
    const computedAge = ageFromBirthday(birthday);

    if (birthday && !BIRTHDAY_PATTERN.test(birthday)) {
      Alert.alert('Birthday format', 'Use YYYY-MM-DD (e.g. 1990-04-23).');
      return;
    }
    if (!Number.isFinite(wLbs) || wLbs < 30 || wLbs > 800) {
      Alert.alert('Check weight', 'Enter a valid weight in lbs.');
      return;
    }
    if (!Number.isFinite(hFt) || hFt < 3 || hFt > 8) {
      Alert.alert('Check height', 'Enter a valid height in feet.');
      return;
    }
    if (!Number.isFinite(hIn) || hIn < 0 || hIn > 11) {
      Alert.alert('Check height', 'Inches must be 0–11.');
      return;
    }

    setSaving(true);
    try {
      // Merge patch into raw_inputs. /api/onboarding/save strips nulls.
      await saveOnboardingInputs({
        first_name: firstName.trim() || undefined,
        birthday: birthday || undefined,
        age: computedAge ?? undefined,
        gender,
        height_ft: hFt,
        height_in: hIn,
        current_weight_lbs: wLbs,
        target_weight_lbs: Number.isFinite(tgt) && tgt > 0 ? tgt : undefined,
        body_fat_pct: Number.isFinite(bf) && bf > 0 ? bf : undefined,
      });
      // Also persist weight to daily_activity so today's balance ring /
      // weight trend chart pick it up immediately.
      await logWeight(wLbs).catch(() => {
        // Non-fatal — onboarding save already captured the value.
      });
      await onSaved();
      haptics.fire('success');
      Alert.alert('Saved', 'Your body stats are updated. Targets recompute from your macros page.');
    } catch (e) {
      haptics.fire('error');
      Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={[styles.lead, { color: t.muted }]}>
        Updating these recomputes your RMR. Save the macros page afterward to apply the new calorie
        target.
      </Text>

      <Field label="First name">
        <TextInput
          value={firstName}
          onChangeText={setFirstName}
          placeholder="Nathan"
          placeholderTextColor={t.subtle}
          style={[styles.input, { color: t.text, backgroundColor: t.surface2, borderColor: t.border }]}
        />
      </Field>

      <Field label="Birthday (YYYY-MM-DD)" helper={age != null ? `Age ${age}` : undefined}>
        <TextInput
          value={birthday}
          onChangeText={setBirthday}
          placeholder="1990-04-23"
          placeholderTextColor={t.subtle}
          autoCapitalize="none"
          keyboardType="numbers-and-punctuation"
          style={[styles.input, { color: t.text, backgroundColor: t.surface2, borderColor: t.border }]}
        />
      </Field>

      <Field label="Sex">
        <SegmentedControl
          options={[
            { value: 'male', label: 'Male' },
            { value: 'female', label: 'Female' },
          ]}
          value={gender}
          onChange={(v) => setGender(v as Gender)}
        />
      </Field>

      <View style={styles.row}>
        <Field label="Height (ft)" style={{ flex: 1 }}>
          <TextInput
            value={heightFt}
            onChangeText={setHeightFt}
            placeholder="5"
            placeholderTextColor={t.subtle}
            keyboardType="number-pad"
            style={[styles.input, { color: t.text, backgroundColor: t.surface2, borderColor: t.border }]}
          />
        </Field>
        <Field label="Height (in)" style={{ flex: 1 }}>
          <TextInput
            value={heightIn}
            onChangeText={setHeightIn}
            placeholder="10"
            placeholderTextColor={t.subtle}
            keyboardType="number-pad"
            style={[styles.input, { color: t.text, backgroundColor: t.surface2, borderColor: t.border }]}
          />
        </Field>
      </View>

      <View style={styles.row}>
        <Field label="Current weight (lbs)" style={{ flex: 1 }}>
          <TextInput
            value={weight}
            onChangeText={setWeight}
            placeholder="170"
            placeholderTextColor={t.subtle}
            keyboardType="decimal-pad"
            style={[styles.input, { color: t.text, backgroundColor: t.surface2, borderColor: t.border }]}
          />
        </Field>
        <Field label="Target weight (lbs)" style={{ flex: 1 }}>
          <TextInput
            value={targetWeight}
            onChangeText={setTargetWeight}
            placeholder="165"
            placeholderTextColor={t.subtle}
            keyboardType="decimal-pad"
            style={[styles.input, { color: t.text, backgroundColor: t.surface2, borderColor: t.border }]}
          />
        </Field>
      </View>

      <Field label="Body fat % (optional)" helper="Enables Katch-McArdle RMR (5–60% valid range)">
        <TextInput
          value={bodyFat}
          onChangeText={setBodyFat}
          placeholder="15"
          placeholderTextColor={t.subtle}
          keyboardType="decimal-pad"
          style={[styles.input, { color: t.text, backgroundColor: t.surface2, borderColor: t.border }]}
        />
      </Field>

      {/* Live preview card */}
      <View style={[styles.previewCard, { backgroundColor: t.surface, shadowColor: '#000' }]}>
        <Text style={[styles.previewTitle, { color: t.muted }]}>Live preview</Text>
        <View style={styles.previewRow}>
          <PreviewCell label="RMR" value={rmrPreview ? `${rmrPreview.kcalPerDay}` : '—'} unit="kcal/day" />
          <PreviewCell
            label="Method"
            value={rmrPreview ? (rmrPreview.formulaUsed === 'katch' ? 'Katch' : 'Mifflin') : '—'}
          />
          <PreviewCell label="BMI" value={bmi != null ? String(bmi) : '—'} />
        </View>
        {rmrPreview ? (
          <Text style={[styles.previewFooter, { color: t.subtle }]}>
            <Ionicons name="information-circle-outline" size={11} color={t.subtle} /> Calorie target
            = RMR × adjustment for your goal. Update on the Macros page.
          </Text>
        ) : null}
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
          <Text style={styles.saveLabel}>Save body stats</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────

function Field({
  label,
  helper,
  children,
  style,
}: {
  label: string;
  helper?: string;
  children: React.ReactNode;
  style?: object;
}) {
  const t = useTokens();
  return (
    <View style={[styles.field, style]}>
      <Text style={[styles.fieldLabel, { color: t.muted }]}>{label}</Text>
      {children}
      {helper ? <Text style={[styles.fieldHelper, { color: t.subtle }]}>{helper}</Text> : null}
    </View>
  );
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const t = useTokens();
  return (
    <View style={[styles.segControl, { backgroundColor: t.surface2, borderColor: t.border }]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[
              styles.segBtn,
              active && { backgroundColor: t.accent },
            ]}>
            <Text style={[styles.segLabel, { color: active ? '#fff' : t.text, fontWeight: active ? '700' : '500' }]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function PreviewCell({ label, value, unit }: { label: string; value: string; unit?: string }) {
  const t = useTokens();
  return (
    <View style={styles.previewCell}>
      <Text style={[styles.previewLabel, { color: t.muted }]}>{label}</Text>
      <Text style={[styles.previewValue, { color: t.text }]}>
        {value}
        {unit ? <Text style={[styles.previewUnit, { color: t.muted }]}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 60, gap: 14 },
  lead: { fontSize: 13, lineHeight: 18 },

  field: { gap: 6 },
  fieldLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  fieldHelper: { fontSize: 11 },

  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
  },

  row: { flexDirection: 'row', gap: 10 },

  segControl: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 12,
    padding: 3,
  },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10 },
  segLabel: { fontSize: 14 },

  previewCard: {
    borderRadius: 16,
    padding: 14,
    gap: 10,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 2,
    marginTop: 4,
  },
  previewTitle: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  previewRow: { flexDirection: 'row', gap: 12 },
  previewCell: { flex: 1 },
  previewLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  previewValue: { fontSize: 18, fontWeight: '700', marginTop: 2 },
  previewUnit: { fontSize: 11, fontWeight: '500' },
  previewFooter: { fontSize: 11, lineHeight: 15 },

  saveBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  saveLabel: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

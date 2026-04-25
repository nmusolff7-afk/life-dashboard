import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
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
import { autoSaveLabel, useDebouncedAutoSave } from '../../lib/useDebouncedAutoSave';

interface Props {
  onboarding: OnboardingDataResponse | null;
  profile: ProfileResponse | null;
  /** Called once after each successful auto-save. */
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

/** Combine MM/DD/YYYY parts into the canonical YYYY-MM-DD when complete. */
function composeBirthday(month: string, day: string, year: string): string | null {
  const m = parseInt(month, 10);
  const d = parseInt(day, 10);
  const y = parseInt(year, 10);
  if (!Number.isFinite(m) || m < 1 || m > 12) return null;
  if (!Number.isFinite(d) || d < 1 || d > 31) return null;
  if (!Number.isFinite(y) || y < 1900 || y > new Date().getFullYear()) return null;
  return `${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
}

/** Reverse — split a stored YYYY-MM-DD into 3 strings for the inputs. */
function splitBirthday(iso: string): { month: string; day: string; year: string } {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return { month: '', day: '', year: '' };
  return { year: m[1], month: m[2].replace(/^0/, ''), day: m[3].replace(/^0/, '') };
}

export function BodyStatsForm({ onboarding, profile, onSaved }: Props) {
  const t = useTokens();

  // Pre-fill source of truth: onboarding raw_inputs first, then profile fallback.
  const saved = onboarding?.saved ?? null;

  const [firstName, setFirstName] = useState('');
  const [bMonth, setBMonth] = useState('');
  const [bDay, setBDay] = useState('');
  const [bYear, setBYear] = useState('');
  const [gender, setGender] = useState<Gender>('male');
  const [heightFt, setHeightFt] = useState('');
  const [heightIn, setHeightIn] = useState('');
  const [weight, setWeight] = useState('');
  const [targetWeight, setTargetWeight] = useState('');
  const [bodyFat, setBodyFat] = useState('');

  // Track "what was last saved" so we can compute `dirty` for the
  // auto-save hook. Updated on initial seed + after each successful save.
  const lastSavedRef = useRef<string>('');

  // Seed when onboarding/profile data arrives.
  useEffect(() => {
    if (saved) {
      setFirstName((saved.first_name as string | undefined) ?? profile?.first_name ?? '');
      const birthday = (saved.birthday as string | undefined) ?? '';
      const parts = splitBirthday(birthday);
      setBMonth(parts.month);
      setBDay(parts.day);
      setBYear(parts.year);
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
      setFirstName(profile.first_name ?? '');
      if (profile.gender === 'male' || profile.gender === 'female') setGender(profile.gender);
      setHeightFt(profile.height_ft != null ? String(profile.height_ft) : '');
      setHeightIn(profile.height_in != null ? String(profile.height_in) : '');
      setWeight(profile.current_weight_lbs != null ? String(profile.current_weight_lbs) : '');
      setTargetWeight(profile.target_weight_lbs != null ? String(profile.target_weight_lbs) : '');
      setBodyFat(profile.body_fat_pct != null ? String(profile.body_fat_pct) : '');
    }
    // Capture the freshly-seeded snapshot so the first edit makes
    // `dirty` flip true.
    lastSavedRef.current = '__seed__';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved, profile]);

  // ── Validation ──────────────────────────────────────────────────────────

  const birthday = composeBirthday(bMonth, bDay, bYear); // null if incomplete/invalid
  const wRaw = parseFloat(weight);
  const wLbs = Number.isFinite(wRaw) ? Math.round(wRaw * 10) / 10 : NaN;
  const hFt = parseInt(heightFt, 10);
  const hIn = parseInt(heightIn, 10);
  const tgtRaw = parseFloat(targetWeight);
  const tgt = Number.isFinite(tgtRaw) ? Math.round(tgtRaw * 10) / 10 : NaN;
  const bf = parseFloat(bodyFat);

  const weightOk = Number.isFinite(wLbs) && wLbs >= 30 && wLbs <= 800;
  const heightFtOk = Number.isFinite(hFt) && hFt >= 3 && hFt <= 8;
  const heightInOk = Number.isFinite(hIn) && hIn >= 0 && hIn <= 11;
  const birthdayOk = !!birthday || (!bMonth && !bDay && !bYear);  // empty also ok
  const targetOk = !targetWeight || (Number.isFinite(tgt) && tgt > 0);
  const bodyFatOk = !bodyFat || (Number.isFinite(bf) && bf >= 3 && bf <= 70);

  const validation: { ok: boolean; messages: string[] } = useMemo(() => {
    const messages: string[] = [];
    if (!weightOk && weight) messages.push('Weight 30–800 lbs');
    if (!heightFtOk && heightFt) messages.push('Height feet 3–8');
    if (!heightInOk && heightIn) messages.push('Height inches 0–11');
    if (!birthdayOk) messages.push('Birthday: month 1–12, day 1–31, year ≥ 1900');
    if (!targetOk) messages.push('Target weight must be positive');
    if (!bodyFatOk) messages.push('Body fat 3–70%');
    return { ok: weightOk && heightFtOk && heightInOk && birthdayOk && targetOk && bodyFatOk, messages };
  }, [weight, heightFt, heightIn, weightOk, heightFtOk, heightInOk, birthdayOk, targetOk, bodyFatOk]);

  // ── Live RMR preview ────────────────────────────────────────────────────

  const rmrPreview = useMemo(() => {
    const age = ageFromBirthday(birthday ?? undefined);
    if (!weightOk || !heightFtOk || !heightInOk || age == null) return null;
    const weightKg = wLbs * 0.453592;
    const heightCm = (hFt * 12 + hIn) * 2.54;
    return computeRmr({
      weightKg,
      heightCm,
      ageYears: age,
      sex: gender,
      bodyFatPct: bodyFatOk && Number.isFinite(bf) && bf > 0 ? bf : undefined,
    });
  }, [birthday, weightOk, heightFtOk, heightInOk, wLbs, hFt, hIn, gender, bf, bodyFatOk]);

  const age = ageFromBirthday(birthday ?? undefined);
  const bmi = useMemo(() => {
    if (!weightOk || !heightFtOk || !heightInOk) return null;
    const heightIn2 = hFt * 12 + hIn;
    if (heightIn2 <= 0) return null;
    return +((wLbs * 703) / (heightIn2 * heightIn2)).toFixed(1);
  }, [weightOk, heightFtOk, heightInOk, wLbs, hFt, hIn]);

  // ── Auto-save ───────────────────────────────────────────────────────────

  // Build the payload that would actually be persisted. Auto-save only
  // fires when validation passes AND the payload differs from what was
  // last saved (so re-renders don't trigger no-op writes).
  const payload = useMemo(
    () => ({
      first_name: firstName.trim() || undefined,
      birthday: birthday ?? undefined,
      age: age ?? undefined,
      gender,
      height_ft: heightFtOk ? hFt : undefined,
      height_in: heightInOk ? hIn : undefined,
      current_weight_lbs: weightOk ? wLbs : undefined,
      target_weight_lbs: targetOk && Number.isFinite(tgt) && tgt > 0 ? tgt : undefined,
      body_fat_pct: bodyFatOk && Number.isFinite(bf) && bf > 0 ? bf : undefined,
    }),
    [firstName, birthday, age, gender, hFt, hIn, wLbs, tgt, bf,
      heightFtOk, heightInOk, weightOk, targetOk, bodyFatOk],
  );
  const payloadJson = JSON.stringify(payload);
  const dirty = payloadJson !== lastSavedRef.current && lastSavedRef.current !== '';
  const enabled = validation.ok && weightOk;  // weight is the only required field

  const { status, error, lastSavedAt } = useDebouncedAutoSave({
    payload, enabled, dirty, delayMs: 800,
    save: async (p) => {
      await saveOnboardingInputs(p);
      // Persist weight to daily_activity so the trend chart picks it up.
      if (p.current_weight_lbs) {
        await logWeight(p.current_weight_lbs).catch(() => { /* non-fatal */ });
      }
      lastSavedRef.current = payloadJson;
    },
    onSaved,
  });

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.headerRow}>
        <Text style={[styles.lead, { color: t.muted, flex: 1 }]}>
          Updates auto-save. Recomputes your RMR live; macros refresh next time you visit Macros.
        </Text>
        <StatusPill status={status} lastSavedAt={lastSavedAt} />
      </View>

      {error ? (
        <Text style={[styles.errorBanner, { color: t.danger }]}>
          Auto-save error: {error} — change a field to retry.
        </Text>
      ) : null}
      {validation.messages.length > 0 ? (
        <View style={styles.validationList}>
          {validation.messages.map((m) => (
            <Text key={m} style={[styles.validation, { color: t.subtle }]}>• {m}</Text>
          ))}
        </View>
      ) : null}

      <Field label="First name">
        <TextInput
          value={firstName}
          onChangeText={setFirstName}
          placeholder="Nathan"
          placeholderTextColor={t.subtle}
          style={[styles.input, { color: t.text, backgroundColor: t.surface2, borderColor: t.border }]}
        />
      </Field>

      <Field label="Birthday" helper={age != null ? `Age ${age}` : 'Month / Day / Year'}>
        <View style={styles.birthdayRow}>
          <TextInput
            value={bMonth}
            onChangeText={(v) => setBMonth(v.replace(/[^0-9]/g, '').slice(0, 2))}
            placeholder="MM"
            placeholderTextColor={t.subtle}
            keyboardType="number-pad"
            maxLength={2}
            style={[styles.input, styles.bdShort, { color: t.text, backgroundColor: t.surface2, borderColor: t.border }]}
          />
          <Text style={[styles.bdSep, { color: t.subtle }]}>/</Text>
          <TextInput
            value={bDay}
            onChangeText={(v) => setBDay(v.replace(/[^0-9]/g, '').slice(0, 2))}
            placeholder="DD"
            placeholderTextColor={t.subtle}
            keyboardType="number-pad"
            maxLength={2}
            style={[styles.input, styles.bdShort, { color: t.text, backgroundColor: t.surface2, borderColor: t.border }]}
          />
          <Text style={[styles.bdSep, { color: t.subtle }]}>/</Text>
          <TextInput
            value={bYear}
            onChangeText={(v) => setBYear(v.replace(/[^0-9]/g, '').slice(0, 4))}
            placeholder="YYYY"
            placeholderTextColor={t.subtle}
            keyboardType="number-pad"
            maxLength={4}
            style={[styles.input, styles.bdYear, { color: t.text, backgroundColor: t.surface2, borderColor: t.border }]}
          />
        </View>
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

      <Field label="Body fat % (optional)" helper="Enables Katch-McArdle RMR (3–70% valid range)">
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
    </ScrollView>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────

function StatusPill({ status, lastSavedAt }: { status: ReturnType<typeof useDebouncedAutoSave>['status']; lastSavedAt: number | null }) {
  const t = useTokens();
  const label = autoSaveLabel(status, lastSavedAt);
  if (!label) return null;
  const color =
    status === 'error' ? t.danger :
    status === 'saving' ? t.accent :
    status === 'dirty' ? t.amber :
    t.subtle;
  return (
    <View style={[styles.pill, { borderColor: color }]}>
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </View>
  );
}

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
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lead: { fontSize: 13, lineHeight: 18 },
  pill: {
    borderWidth: 1,
    borderRadius: 100,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  pillText: { fontSize: 11, fontWeight: '600' },
  errorBanner: { fontSize: 12, fontStyle: 'italic' },
  validationList: { gap: 2 },
  validation: { fontSize: 11 },

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
  birthdayRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bdShort: { width: 64, textAlign: 'center', paddingHorizontal: 6 },
  bdYear: { width: 96, textAlign: 'center', paddingHorizontal: 6 },
  bdSep: { fontSize: 18, fontWeight: '600' },

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
});

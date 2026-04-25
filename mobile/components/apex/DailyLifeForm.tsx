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
import type { Occupation } from '../../../shared/src/logic/neat';
import { saveOnboardingInputs } from '../../lib/api/profile';
import { useTokens } from '../../lib/theme';
import { autoSaveLabel, useDebouncedAutoSave } from '../../lib/useDebouncedAutoSave';
import { SliderRow } from './SliderRow';

interface Props {
  onboarding: OnboardingDataResponse | null;
  profile: ProfileResponse | null;
  onSaved: () => void | Promise<void>;
}

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
  const [stress, setStress] = useState<number>(5);
  const lastSavedRef = useRef<string>('');

  useEffect(() => {
    if (saved) {
      setOccupation((saved.occupation_description as string | undefined) ?? '');
      const ws = saved.work_style as Occupation | undefined;
      if (ws === 'sedentary' || ws === 'standing' || ws === 'physical') setWorkStyle(ws);
      const s = saved.stress_level_1_10 as number | undefined;
      if (s != null && s >= 1 && s <= 10) setStress(s);
    }
    lastSavedRef.current = '__seed__';
  }, [saved]);

  // ── Auto-save ───────────────────────────────────────────────────────────

  const trimmedOcc = occupation.trim();
  const payload = useMemo(
    () => ({
      occupation_description: trimmedOcc || undefined,
      work_style: workStyle,
      stress_level_1_10: stress,
    }),
    [trimmedOcc, workStyle, stress],
  );
  const payloadJson = JSON.stringify(payload);
  const dirty = payloadJson !== lastSavedRef.current && lastSavedRef.current !== '';
  // We allow saving even with empty occupation (the field is informational
  // and the original Save button blocked on it via Alert; auto-save just
  // skips persisting an empty string and waits for the user to type).
  const enabled = trimmedOcc.length >= 2;

  const { status, error, lastSavedAt } = useDebouncedAutoSave({
    payload, enabled, dirty, delayMs: 800,
    save: async (p) => {
      await saveOnboardingInputs(p);
      lastSavedRef.current = payloadJson;
    },
    onSaved,
  });

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.headerRow}>
        <Text style={[styles.lead, { color: t.muted, flex: 1 }]}>
          How you work + your stress level drive NEAT and TDEE. Updates auto-save.
        </Text>
        <StatusPill status={status} lastSavedAt={lastSavedAt} />
      </View>

      {error ? (
        <Text style={[styles.errorBanner, { color: t.danger }]}>
          Auto-save error: {error} — change a field to retry.
        </Text>
      ) : null}

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
        <SliderRow
          label="Stress"
          value={stress}
          onChange={setStress}
          min={1}
          max={10}
          step={1}
        />
      </Section>
    </ScrollView>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────

function StatusPill({ status, lastSavedAt }: {
  status: ReturnType<typeof useDebouncedAutoSave>['status'];
  lastSavedAt: number | null;
}) {
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
});

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { OnboardingDataResponse } from '../../../shared/src/types/home';
import { saveOnboardingInputs } from '../../lib/api/profile';
import { useTokens } from '../../lib/theme';
import { autoSaveLabel, useDebouncedAutoSave } from '../../lib/useDebouncedAutoSave';

interface Props {
  onboarding: OnboardingDataResponse | null;
  onSaved: () => void | Promise<void>;
}

const DIET_PRESETS = [
  'Omnivore',
  'Flexitarian',
  'Pescatarian',
  'Vegetarian',
  'Vegan',
  'Keto',
  'Paleo',
  'Mediterranean',
];

export function DietForm({ onboarding, onSaved }: Props) {
  const t = useTokens();
  const saved = onboarding?.saved ?? null;

  const [dietType, setDietType] = useState('');
  const [restrictions, setRestrictions] = useState('');
  const lastSavedRef = useRef<string>('');

  useEffect(() => {
    if (saved) {
      setDietType((saved.diet_type as string | undefined) ?? '');
      setRestrictions((saved.dietary_restrictions as string | undefined) ?? '');
    }
    lastSavedRef.current = '__seed__';
  }, [saved]);

  // ── Auto-save ───────────────────────────────────────────────────────────

  const trimmedDiet = dietType.trim();
  const trimmedRestrictions = restrictions.trim();
  const payload = useMemo(
    () => ({
      diet_type: trimmedDiet || undefined,
      dietary_restrictions: trimmedRestrictions || undefined,
    }),
    [trimmedDiet, trimmedRestrictions],
  );
  const payloadJson = JSON.stringify(payload);
  const dirty = payloadJson !== lastSavedRef.current && lastSavedRef.current !== '';
  // Diet preferences allow blank — saves whenever the form changes.
  const enabled = true;

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
          Used by the meal-log AI estimator and Pantry suggestions. Edits auto-save.
          Changing diet flags your AI profile as out-of-sync — regenerate it from the Profile screen when ready.
        </Text>
        <StatusPill status={status} lastSavedAt={lastSavedAt} />
      </View>

      {error ? (
        <Text style={[styles.errorBanner, { color: t.danger }]}>
          Auto-save error: {error} — change a field to retry.
        </Text>
      ) : null}

      <Section title="Diet type">
        <TextInput
          value={dietType}
          onChangeText={setDietType}
          placeholder="Omnivore"
          placeholderTextColor={t.subtle}
          style={[styles.input, { color: t.text, backgroundColor: t.surface2, borderColor: t.border }]}
        />
        <View style={styles.presets}>
          {DIET_PRESETS.map((p) => (
            <Pressable
              key={p}
              onPress={() => setDietType(p)}
              style={[
                styles.preset,
                {
                  backgroundColor: dietType === p ? t.accent : t.surface2,
                  borderColor: dietType === p ? t.accent : t.border,
                },
              ]}>
              <Text
                style={[
                  styles.presetText,
                  { color: dietType === p ? '#fff' : t.text, fontWeight: dietType === p ? '700' : '500' },
                ]}>
                {p}
              </Text>
            </Pressable>
          ))}
        </View>
      </Section>

      <Section title="Restrictions / allergies">
        <TextInput
          value={restrictions}
          onChangeText={setRestrictions}
          placeholder="no dairy, peanut allergy, halal"
          placeholderTextColor={t.subtle}
          multiline
          style={[
            styles.input,
            styles.textArea,
            { color: t.text, backgroundColor: t.surface2, borderColor: t.border },
          ]}
        />
        <Text style={[styles.helper, { color: t.subtle }]}>
          Free-text — Claude parses it on meal estimates to skip restricted ingredients.
        </Text>
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
  textArea: { minHeight: 72, textAlignVertical: 'top' },

  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preset: {
    borderWidth: 1,
    borderRadius: 100,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  presetText: { fontSize: 13 },

  helper: { fontSize: 11 },
});

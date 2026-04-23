import { useEffect, useState } from 'react';
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

import type { OnboardingDataResponse } from '../../../shared/src/types/home';
import { saveOnboardingInputs } from '../../lib/api/profile';
import { useTokens } from '../../lib/theme';

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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (saved) {
      setDietType((saved.diet_type as string | undefined) ?? '');
      setRestrictions((saved.dietary_restrictions as string | undefined) ?? '');
    }
  }, [saved]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveOnboardingInputs({
        diet_type: dietType.trim() || undefined,
        dietary_restrictions: restrictions.trim() || undefined,
      });
      await onSaved();
      Alert.alert(
        'Saved',
        'Diet preferences updated. They flow into meal suggestions and AI burn/nutrition estimates.',
      );
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={[styles.lead, { color: t.muted }]}>
        Used by the meal-log AI estimator and Pantry suggestions to respect what you'll actually
        eat. Leave blank if you don't care to filter.
      </Text>

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
          <Text style={styles.saveLabel}>Save diet preferences</Text>
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

  saveBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  saveLabel: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

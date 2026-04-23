import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SegmentedControl } from '../../components/ui';
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences,
  type HapticsLevel,
  type LanguageCode,
  type Preferences,
  type UnitSystem,
} from '../../lib/preferences';
import { useTheme, useTokens } from '../../lib/theme';
import type { ThemePreference } from '../../lib/theme';

const LANGUAGES: { value: LanguageCode; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'pt', label: 'Português' },
  { value: 'it', label: 'Italiano' },
  { value: 'nl', label: 'Nederlands' },
  { value: 'pl', label: 'Polski' },
  { value: 'zh', label: '中文' },
  { value: 'ar', label: 'العربية' },
];

export default function PreferencesScreen() {
  const t = useTokens();
  const { preference, setPreference, resolved } = useTheme();
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPreferences().then((p) => {
      setPrefs(p);
      setLoading(false);
    });
  }, []);

  const update = async <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    await savePreferences(next);
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen
        options={{
          title: 'Preferences',
          headerStyle: { backgroundColor: t.bg },
          headerTintColor: t.text,
          headerShadowVisible: false,
        }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Section label="Appearance">
          <SegmentedControl<ThemePreference>
            value={preference}
            onChange={setPreference}
            options={[
              { value: 'system', label: 'System' },
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
            ]}
          />
          <Text style={[styles.hint, { color: t.subtle }]}>
            Currently: {resolved}{preference === 'system' ? ' (follows OS)' : ''}.
          </Text>
        </Section>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={t.accent} />
          </View>
        ) : (
          <>
            <Section label="Units">
              <SegmentedControl<UnitSystem>
                value={prefs.units}
                onChange={(v) => update('units', v)}
                options={[
                  { value: 'imperial', label: 'Imperial' },
                  { value: 'metric', label: 'Metric' },
                ]}
              />
              <Text style={[styles.hint, { color: t.subtle }]}>
                {prefs.units === 'imperial'
                  ? 'Pounds, feet / inches, miles.'
                  : 'Kilograms, centimeters, kilometers.'}
              </Text>
            </Section>

            <Section label="Haptics">
              <SegmentedControl<HapticsLevel>
                value={prefs.haptics}
                onChange={(v) => update('haptics', v)}
                options={[
                  { value: 'off', label: 'Off' },
                  { value: 'subtle', label: 'Subtle' },
                  { value: 'full', label: 'Full' },
                ]}
              />
              <Text style={[styles.hint, { color: t.subtle }]}>
                Vibration on taps, switches, and confirmations.
              </Text>
            </Section>

            <Section label="Language">
              <View style={styles.langGrid}>
                {LANGUAGES.map((l) => {
                  const active = prefs.language === l.value;
                  return (
                    <Text
                      key={l.value}
                      onPress={() => update('language', l.value)}
                      style={[
                        styles.langChip,
                        {
                          backgroundColor: active ? t.accent : t.surface2,
                          borderColor: active ? t.accent : t.border,
                          color: active ? '#fff' : t.text,
                          fontWeight: active ? '700' : '500',
                        },
                      ]}>
                      {l.label}
                    </Text>
                  );
                })}
              </View>
              <Text style={[styles.hint, { color: t.subtle }]}>
                English is fully translated today. Other languages populate as we ship localized
                copy.
              </Text>
            </Section>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  const t = useTokens();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { color: t.muted }]}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 18, paddingBottom: 40 },
  loading: { alignItems: 'center', padding: 20 },
  section: { gap: 8 },
  sectionLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  hint: { fontSize: 12, marginTop: 4 },

  langGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  langChip: {
    borderWidth: 1,
    borderRadius: 100,
    paddingVertical: 7,
    paddingHorizontal: 14,
    fontSize: 13,
    overflow: 'hidden',
  },
});

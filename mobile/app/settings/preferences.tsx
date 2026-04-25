import { Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { SegmentedControl } from '../../components/ui';
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  resolveTimezone,
  savePreferences,
  type HapticsLevel,
  type LanguageCode,
  type Preferences,
  type TimezoneMode,
  type UnitSystem,
} from '../../lib/preferences';
import { useTheme, useTokens } from '../../lib/theme';
import type { ThemePreference } from '../../lib/theme';

const LANGUAGES: { value: LanguageCode; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
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
                English + Spanish per PRD v1.27 §4.8.6. More languages unlock with expanded
                translations.
              </Text>
            </Section>

            <Section label="Hydration">
              <View style={[styles.rowBetween, { backgroundColor: t.surface, borderColor: t.border }]}>
                <Text style={[styles.rowLabel, { color: t.text }]}>Track hydration</Text>
                <Switch
                  value={prefs.hydrationActive}
                  onValueChange={(v) => update('hydrationActive', v)}
                  trackColor={{ true: t.accent, false: t.surface2 }}
                  thumbColor="#fff"
                />
              </View>
              <Text style={[styles.hint, { color: t.subtle }]}>
                Opt-in per PRD §4.4.12. Adds a hydration widget to Nutrition Today with
                quick-add buttons (+8 / +16 / +24 oz). Daily goal: {prefs.hydrationGoalOz} oz.
              </Text>
            </Section>

            <TimezoneSection prefs={prefs} onChange={update} />

            <Text style={[styles.fineprint, { color: t.subtle }]}>
              Preferences are stored on this device. They'll roam to other devices once server-side preferences sync ships (tracked for a later phase).
            </Text>
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

function TimezoneSection({
  prefs,
  onChange,
}: {
  prefs: Preferences;
  onChange: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void | Promise<void>;
}) {
  const t = useTokens();
  const resolved = useMemo(() => resolveTimezone(prefs), [prefs]);
  const deviceTz = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  }, []);

  return (
    <Section label="Timezone">
      <SegmentedControl<TimezoneMode>
        value={prefs.timezoneMode}
        onChange={(v) => onChange('timezoneMode', v)}
        options={[
          { value: 'automatic', label: 'Automatic' },
          { value: 'manual', label: 'Manual' },
        ]}
      />
      {prefs.timezoneMode === 'manual' ? (
        <>
          <TextInput
            value={prefs.timezoneManual}
            onChangeText={(v) => onChange('timezoneManual', v)}
            placeholder="e.g. America/Los_Angeles"
            placeholderTextColor={t.subtle}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
          />
          <Text style={[styles.hint, { color: t.subtle }]}>
            Use an IANA zone identifier. Blank falls back to your device timezone ({deviceTz}).
          </Text>
        </>
      ) : (
        <Text style={[styles.hint, { color: t.subtle }]}>
          Following your device timezone: {deviceTz}.
        </Text>
      )}
      <Text style={[styles.hint, { color: t.subtle }]}>
        "Today" rolls over at {resolved} midnight.
      </Text>
    </Section>
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

  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  rowLabel: { fontSize: 14, fontWeight: '500' },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginTop: 8,
  },
  fineprint: { fontSize: 11, lineHeight: 15, marginTop: 12, fontStyle: 'italic' },
});

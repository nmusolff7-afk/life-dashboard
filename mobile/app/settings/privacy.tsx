import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import {
  DEFAULT_PRIVACY,
  loadPrivacyPrefs,
  type PrivacyPrefs,
  savePrivacyPrefs,
} from '../../lib/settingsPrefs';
import { useTokens } from '../../lib/theme';

const SOURCES: { key: keyof PrivacyPrefs; label: string }[] = [
  { key: 'healthkit',     label: 'HealthKit (iOS)' },
  { key: 'healthConnect', label: 'Health Connect (Android)' },
  { key: 'plaid',         label: 'Plaid transactions' },
  { key: 'gmail',         label: 'Gmail' },
  { key: 'outlook',       label: 'Outlook' },
  { key: 'calendar',      label: 'Calendar events' },
  { key: 'screenTime',    label: 'Screen Time' },
  { key: 'location',      label: 'Location' },
  { key: 'strava',        label: 'Strava' },
  { key: 'weather',       label: 'Weather' },
];

export default function Privacy() {
  const t = useTokens();
  const [prefs, setPrefs] = useState<PrivacyPrefs>(DEFAULT_PRIVACY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPrivacyPrefs().then((p) => {
      setPrefs(p);
      setLoading(false);
    });
  }, []);

  const update = async (key: keyof PrivacyPrefs, value: boolean) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    await savePrivacyPrefs(next);
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen
        options={{
          title: 'Privacy',
          headerStyle: { backgroundColor: t.bg },
          headerTintColor: t.text,
          headerShadowVisible: false,
        }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.intro, { color: t.muted }]}>
          Per-source AI consent. You granted consent at the time you connected each source — these
          toggles let you revoke it without disconnecting. Data still syncs for scoring and
          display; turning a toggle off just stops the chatbot from seeing it in prompts.
        </Text>
        {loading ? (
          <ActivityIndicator color={t.accent} />
        ) : (
          <>
            {SOURCES.map((s) => (
              <View
                key={s.key}
                style={[styles.row, { backgroundColor: t.surface, borderColor: t.border }]}>
                <Text style={[styles.name, { color: t.text }]}>{s.label}</Text>
                <Switch
                  value={prefs[s.key]}
                  onValueChange={(v) => update(s.key, v)}
                  trackColor={{ true: t.accent, false: t.surface2 }}
                  thumbColor="#fff"
                />
              </View>
            ))}
            <Text style={[styles.hint, { color: t.subtle }]}>
              Settings saved locally. Chatbot prompt-filter reads these toggles on every call so
              data from sources you've disabled never reaches the model.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 10, paddingBottom: 40 },
  intro: { fontSize: 12, lineHeight: 18, marginBottom: 4, fontStyle: 'italic' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  name: { fontSize: 14, fontWeight: '500', flex: 1 },
  hint: { fontSize: 11, marginTop: 12, lineHeight: 16 },
});

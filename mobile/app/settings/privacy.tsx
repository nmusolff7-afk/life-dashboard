import { Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { useTokens } from '../../lib/theme';

const AI_SOURCES = [
  'HealthKit / Health Connect',
  'Plaid transactions',
  'Gmail / Outlook email',
  'Calendar events',
  'Screen Time',
  'Location',
  'Strava',
  'Weather',
];

export default function Privacy() {
  const t = useTokens();
  const [consent, setConsent] = useState<Record<string, boolean>>({});

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: 'Privacy' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.intro, { color: t.muted }]}>
          Per-source AI consent. All default OFF per PRD §3.5 and §6.4. The data still syncs for scoring and display;
          these toggles only control whether the AI chatbot can see it in prompts.
        </Text>
        {AI_SOURCES.map((s) => (
          <View key={s} style={[styles.row, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={[styles.name, { color: t.text }]}>{s}</Text>
            <Switch
              value={!!consent[s]}
              onValueChange={(v) => setConsent((prev) => ({ ...prev, [s]: v }))}
              trackColor={{ true: t.accent, false: t.surface2 }}
            />
          </View>
        ))}
        <Text style={[styles.hint, { color: t.subtle }]}>
          Chatbot Audit (Settings → Privacy → Audit in the real build) shows exactly what was sent in each prompt.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 8, paddingBottom: 40 },
  intro: { fontSize: 12, lineHeight: 18, marginBottom: 8, fontStyle: 'italic' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 14, padding: 14 },
  name: { fontSize: 14, fontWeight: '500', flex: 1 },
  hint: { fontSize: 11, marginTop: 16, lineHeight: 16 },
});

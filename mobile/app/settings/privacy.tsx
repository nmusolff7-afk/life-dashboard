import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import type { ConsentMap } from '../../../shared/src/types/connectors';
import { setConsent, useConsent } from '../../lib/hooks/useConnectors';
import { useTokens } from '../../lib/theme';

// Sources the chatbot may see. Matches the connector catalog. The opt-out
// model (absence of a row = allowed) means defaults look like "everything
// on" until the user toggles something off.
const SOURCES: { key: string; label: string }[] = [
  { key: 'healthkit',             label: 'Apple Health' },
  { key: 'health_connect',        label: 'Health Connect (Android)' },
  { key: 'plaid',                 label: 'Plaid transactions' },
  { key: 'gmail',                 label: 'Gmail' },
  { key: 'outlook',               label: 'Outlook' },
  { key: 'gcal',                  label: 'Google Calendar' },
  { key: 'apple_family_controls', label: 'Screen Time' },
  { key: 'location',              label: 'Location' },
  { key: 'strava',                label: 'Strava' },
  { key: 'garmin',                label: 'Garmin' },
];

export default function Privacy() {
  const t = useTokens();
  const router = useRouter();
  const consent = useConsent();
  const [local, setLocal] = useState<ConsentMap>({});

  useEffect(() => {
    if (consent.data?.consent) {
      setLocal({ ...consent.data.consent });
    }
  }, [consent.data]);

  const getAllowed = (key: string) => {
    // Opt-out model: absent rows are true.
    const v = local[key];
    return v === undefined ? true : v;
  };

  const onToggle = async (key: string, next: boolean) => {
    setLocal((prev) => ({ ...prev, [key]: next }));
    try {
      await setConsent(key, next);
    } catch (e) {
      // Roll back on failure so the UI stays consistent with server.
      setLocal((prev) => ({ ...prev, [key]: !next }));
    }
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
          Per-source AI consent. Turning a toggle off means the chatbot never sees data from that source in its prompts. Scoring and your own dashboard views still read the data. Sources you haven't connected yet are listed for forward compatibility — the toggle takes effect the moment you connect them.
        </Text>

        <Pressable
          onPress={() => router.push('/settings/chatbot-audit')}
          style={({ pressed }) => [
            styles.auditLink,
            {
              backgroundColor: t.surface,
              borderColor: t.border,
              opacity: pressed ? 0.85 : 1,
              transform: [{ scale: pressed ? 0.99 : 1 }],
            },
          ]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.auditTitle, { color: t.text }]}>View Chatbot Audit</Text>
            <Text style={[styles.auditSub, { color: t.muted }]}>
              Every chatbot call, 30-day retention — what was sent, what came back.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={t.muted} />
        </Pressable>

        {consent.loading && !consent.data ? (
          <ActivityIndicator color={t.accent} />
        ) : (
          <>
            {SOURCES.map((s) => (
              <View
                key={s.key}
                style={[styles.row, { backgroundColor: t.surface, borderColor: t.border }]}>
                <Text style={[styles.name, { color: t.text }]}>{s.label}</Text>
                <Switch
                  value={getAllowed(s.key)}
                  onValueChange={(v) => onToggle(s.key, v)}
                  trackColor={{ true: t.accent, false: t.surface2 }}
                  thumbColor="#fff"
                />
              </View>
            ))}
            <Text style={[styles.hint, { color: t.subtle }]}>
              Preferences saved to the server. The chatbot prompt filter reads these toggles on every call so data from sources you've disabled never reaches the model.
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
  auditLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 6,
  },
  auditTitle: { fontSize: 14, fontWeight: '600' },
  auditSub: { fontSize: 12, marginTop: 2, lineHeight: 16 },
});

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/ui';
import { useTokens } from '../../lib/theme';

interface ConnectionDef {
  key: string;
  name: string;
  description: string;
  icon: string;
}

// PRD §8.3 — the v1 connection catalog. Each tile is a skeleton stub.
const CONNECTIONS: ConnectionDef[] = [
  { key: 'healthkit', name: 'Apple Health', description: 'Steps, weight, sleep, HRV', icon: '❤️' },
  { key: 'health-connect', name: 'Health Connect', description: 'Android health data', icon: '💚' },
  { key: 'plaid', name: 'Plaid (Bank accounts)', description: 'Spending, budget, bills', icon: '🏦' },
  { key: 'gmail', name: 'Gmail', description: 'Email triage', icon: '📧' },
  { key: 'outlook', name: 'Outlook', description: 'Email triage', icon: '📬' },
  { key: 'google-calendar', name: 'Google Calendar', description: 'Events & meeting hours', icon: '📅' },
  { key: 'apple-calendar', name: 'Apple Calendar', description: 'Events via EventKit', icon: '🗓️' },
  { key: 'outlook-calendar', name: 'Outlook Calendar', description: 'Events via Microsoft Graph', icon: '📆' },
  { key: 'strava', name: 'Strava', description: 'Activities (read-only)', icon: '🏃' },
  { key: 'garmin', name: 'Garmin', description: 'HRV, sleep, training load', icon: '⌚' },
  { key: 'screen-time', name: 'Screen Time', description: 'Attention patterns', icon: '📱' },
  { key: 'location', name: 'Location', description: 'Place patterns', icon: '📍' },
];

export default function ConnectionsScreen() {
  const t = useTokens();
  const router = useRouter();
  const [connected, setConnected] = useState<Set<string>>(new Set());
  const next = () => router.replace('/(onboarding)/notifications');
  const toggle = (k: string) => {
    setConnected((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.title, { color: t.text }]}>Connect your life</Text>
        <Text style={[styles.subtitle, { color: t.muted }]}>
          Life Dashboard works with zero connections. Connecting more gives you richer scores and lets the chatbot answer more questions.
        </Text>

        {CONNECTIONS.map((c) => {
          const on = connected.has(c.key);
          return (
            <View key={c.key} style={[styles.tile, { backgroundColor: t.surface, borderColor: t.border }]}>
              <Text style={styles.icon}>{c.icon}</Text>
              <View style={styles.tileText}>
                <Text style={[styles.tileName, { color: t.text }]}>{c.name}</Text>
                <Text style={[styles.tileDesc, { color: t.muted }]}>{c.description}</Text>
              </View>
              <Pressable
                onPress={() => toggle(c.key)}
                style={[
                  styles.cta,
                  { backgroundColor: on ? t.green : 'transparent', borderColor: on ? t.green : t.accent },
                ]}>
                <Text style={[styles.ctaText, { color: on ? '#FFFFFF' : t.accent }]}>
                  {on ? 'Connected' : 'Connect'}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
      <View style={[styles.footer, { backgroundColor: t.bg, borderColor: t.border }]}>
        <Button title="Continue" onPress={next} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: { padding: 24, gap: 10, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '700' },
  subtitle: { fontSize: 15, lineHeight: 22, marginBottom: 10 },
  tile: { borderWidth: 1, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { fontSize: 28 },
  tileText: { flex: 1 },
  tileName: { fontSize: 15, fontWeight: '600' },
  tileDesc: { fontSize: 12, marginTop: 2 },
  cta: { borderWidth: 1, borderRadius: 100, paddingVertical: 6, paddingHorizontal: 14 },
  ctaText: { fontSize: 13, fontWeight: '600' },
  footer: { padding: 16, paddingBottom: 24, borderTopWidth: 1 },
});

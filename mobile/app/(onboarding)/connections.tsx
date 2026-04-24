import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/ui';
import { useHealthConnection } from '../../lib/useHealthConnection';
import { useTokens } from '../../lib/theme';

interface ConnectionDef {
  key: string;
  name: string;
  description: string;
  icon: string;
  /** `available` connections have a real connect/disconnect flow. `coming_soon`
   *  render with a disabled pill + explanation. */
  state: 'available' | 'coming_soon';
  /** For coming-soon items: the explanation shown when tapped. */
  comingSoonHint?: string;
}

/** PRD §4.1.7 connection catalog. v1 exposes real OAuth flows for Gmail,
 *  Google Calendar, and native health data (HealthKit on iOS / Health
 *  Connect on Android). Everything else renders a clear "coming soon"
 *  state with the specific reason, per the PRD ("explicit reason"). */
const CONNECTIONS: ConnectionDef[] = [
  {
    key: 'healthkit',
    name: Platform.OS === 'android' ? 'Health Connect' : 'Apple Health',
    description: 'Steps, weight, sleep, HRV',
    icon: '❤️',
    state: 'available',
  },
  {
    key: 'gmail',
    name: 'Gmail',
    description: 'Read-only email triage in the Time tab',
    icon: '📧',
    state: 'coming_soon',
    comingSoonHint:
      'Gmail OAuth is wired on the server, mobile connect button ships in v1.1.',
  },
  {
    key: 'google-calendar',
    name: 'Google Calendar',
    description: 'Events + meeting hours for the Time tab',
    icon: '📅',
    state: 'coming_soon',
    comingSoonHint:
      'Google Calendar OAuth is wired on the server, mobile connect button ships in v1.1.',
  },
  {
    key: 'plaid',
    name: 'Plaid (bank accounts)',
    description: 'Spending, budget, bills for the Finance tab',
    icon: '🏦',
    state: 'coming_soon',
    comingSoonHint:
      'Finance category launches in v1.1. Plaid Link integration ships alongside it.',
  },
  {
    key: 'strava',
    name: 'Strava',
    description: 'Activity feed (read-only)',
    icon: '🏃',
    state: 'coming_soon',
    comingSoonHint: 'Strava OAuth is planned for v1.2 once the Fitness tab has more surface area.',
  },
  {
    key: 'apple-family',
    name: 'Apple Family Controls',
    description: 'Attention + screen-time pattern data',
    icon: '🛡️',
    state: 'coming_soon',
    comingSoonHint:
      'Requires Apple approval to use Family Controls — we\'ve applied; expected ~2 weeks.',
  },
];

export default function ConnectionsScreen() {
  const t = useTokens();
  const router = useRouter();
  const health = useHealthConnection();
  const [busy, setBusy] = useState<string | null>(null);
  const next = () => router.replace('/(onboarding)/notifications');

  // Refresh native health connection state on mount so the pill
  // reflects reality if the user bounced to Settings.
  useEffect(() => { void health.refetch(); }, [health]);

  const toggleHealth = async () => {
    if (health.connected) {
      setBusy('healthkit');
      try { await health.disconnect(); } finally { setBusy(null); }
      return;
    }
    setBusy('healthkit');
    try {
      await health.connect();
    } catch (e) {
      Alert.alert('Not available', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const onTile = (c: ConnectionDef) => {
    if (c.state === 'available' && c.key === 'healthkit') {
      void toggleHealth();
    } else if (c.state === 'coming_soon') {
      Alert.alert(c.name, c.comingSoonHint ?? 'Coming soon.');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.title, { color: t.text }]}>Connect your life</Text>
        <Text style={[styles.subtitle, { color: t.muted }]}>
          Life Dashboard works with zero connections. Connecting more gives you richer scores and
          lets the chatbot answer more questions.
        </Text>

        {CONNECTIONS.map((c) => {
          const isHealth = c.key === 'healthkit';
          const isConnected = isHealth && health.connected;
          const isBusy = busy === c.key;
          const isAvailable = c.state === 'available';
          return (
            <Pressable
              key={c.key}
              onPress={() => onTile(c)}
              disabled={isBusy}
              style={({ pressed }) => [
                styles.tile,
                {
                  backgroundColor: t.surface,
                  borderColor: t.border,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}>
              <Text style={styles.icon}>{c.icon}</Text>
              <View style={styles.tileText}>
                <Text style={[styles.tileName, { color: t.text }]}>{c.name}</Text>
                <Text style={[styles.tileDesc, { color: t.muted }]}>{c.description}</Text>
              </View>
              <View
                style={[
                  styles.cta,
                  {
                    backgroundColor: isConnected ? t.green : 'transparent',
                    borderColor: isConnected
                      ? t.green
                      : isAvailable
                        ? t.accent
                        : t.border,
                  },
                ]}>
                <Text
                  style={[
                    styles.ctaText,
                    {
                      color: isConnected
                        ? '#FFFFFF'
                        : isAvailable
                          ? t.accent
                          : t.subtle,
                    },
                  ]}>
                  {isBusy ? '…' : isConnected ? 'Connected' : isAvailable ? 'Connect' : 'Coming soon'}
                </Text>
              </View>
            </Pressable>
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
  tile: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  icon: { fontSize: 28 },
  tileText: { flex: 1 },
  tileName: { fontSize: 15, fontWeight: '600' },
  tileDesc: { fontSize: 12, marginTop: 2 },
  cta: { borderWidth: 1, borderRadius: 100, paddingVertical: 6, paddingHorizontal: 14 },
  ctaText: { fontSize: 13, fontWeight: '600' },
  footer: { padding: 16, paddingBottom: 24, borderTopWidth: 1 },
});

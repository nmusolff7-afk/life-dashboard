import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useHealthConnection, type HealthPlatform } from '../../lib/useHealthConnection';
import { useHaptics } from '../../lib/useHaptics';
import { useTokens } from '../../lib/theme';

interface Row {
  key: string;
  name: string;
  icon: string;
  platformOnly?: 'ios' | 'android';
}

const CONNECTIONS: Row[] = [
  { key: 'healthkit', name: 'Apple Health', icon: '❤️', platformOnly: 'ios' },
  { key: 'health-connect', name: 'Health Connect', icon: '💚', platformOnly: 'android' },
  { key: 'plaid', name: 'Plaid (Bank)', icon: '🏦' },
  { key: 'gmail', name: 'Gmail', icon: '📧' },
  { key: 'outlook', name: 'Outlook', icon: '📬' },
  { key: 'google-calendar', name: 'Google Calendar', icon: '📅' },
  { key: 'apple-calendar', name: 'Apple Calendar', icon: '🗓️' },
  { key: 'outlook-calendar', name: 'Outlook Calendar', icon: '📆' },
  { key: 'strava', name: 'Strava', icon: '🏃' },
  { key: 'garmin', name: 'Garmin', icon: '⌚' },
  { key: 'screen-time', name: 'Screen Time', icon: '📱', platformOnly: 'ios' },
  { key: 'location', name: 'Location', icon: '📍' },
];

export default function Connections() {
  const t = useTokens();
  const haptics = useHaptics();
  // Health connection state for the native platform of this device —
  // iOS reads HealthKit; Android reads Health Connect. Other platforms
  // don't render the health row.
  const health = useHealthConnection();

  const visible = CONNECTIONS.filter((c) => {
    if (!c.platformOnly) return true;
    return Platform.OS === c.platformOnly;
  });

  const onHealthPress = async (row: Row) => {
    const isHealth = row.key === 'healthkit' || row.key === 'health-connect';
    if (!isHealth) {
      Alert.alert(
        `${row.name}`,
        `${row.name} connect flow ships in a later phase.`,
      );
      return;
    }
    haptics.fire('tap');
    if (health.connected) {
      Alert.alert(
        `Disconnect ${row.name}?`,
        `Sleep and Recovery subsystems will stop receiving new data from ${row.name}. Your existing logs stay.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Disconnect',
            style: 'destructive',
            onPress: async () => {
              await health.disconnect();
              haptics.fire('success');
            },
          },
        ],
      );
    } else {
      Alert.alert(
        `Connect ${row.name}`,
        `Life Dashboard will request read access to:\n\n• Sleep (duration + stages)\n• Heart rate variability (HRV)\n• Resting heart rate\n\nNative permission prompt arrives with the next build. Tap Connect to mark the connection as enabled now — the data pipe lights up when the native module ships.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Connect',
            onPress: async () => {
              await health.connect();
              haptics.fire('success');
            },
          },
        ],
      );
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: 'Connections' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.intro, { color: t.muted }]}>
          Data sources Life Dashboard reads. Connecting a source adds its
          signals to your scoring. Only Apple Health / Health Connect are
          user-togglable today — the rest will wire up in coming phases.
        </Text>
        {visible.map((c) => {
          const isHealth = c.key === 'healthkit' || c.key === 'health-connect';
          const connected = isHealth && health.connected;
          return (
            <Pressable
              key={c.key}
              onPress={() => onHealthPress(c)}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: t.surface,
                  borderColor: connected ? t.fitness : t.border,
                  borderWidth: connected ? 1.5 : 1,
                  opacity: pressed ? 0.92 : 1,
                },
              ]}>
              <Text style={styles.icon}>{c.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: t.text }]}>{c.name}</Text>
                {connected && health.connectedAt ? (
                  <Text style={[styles.sub, { color: t.muted }]}>
                    Connected {formatSince(health.connectedAt)}
                  </Text>
                ) : null}
              </View>
              {connected ? (
                <View style={[styles.badge, { backgroundColor: t.fitness }]}>
                  <Ionicons name="checkmark" size={12} color="#fff" />
                  <Text style={styles.badgeLabel}>Connected</Text>
                </View>
              ) : (
                <Text style={[styles.state, { color: t.subtle }]}>Not connected</Text>
              )}
            </Pressable>
          );
        })}
        <Text style={[styles.footer, { color: t.subtle }]}>
          Per-source AI consent (what the chatbot can see) lives in Settings →
          Privacy. Connecting a source is separate from granting the
          chatbot permission to reference its data.
        </Text>
      </ScrollView>
    </View>
  );
}

function formatSince(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return 'recently';
  }
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 8, paddingBottom: 40 },
  intro: { fontSize: 12, fontStyle: 'italic', lineHeight: 18, marginBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  icon: { fontSize: 22 },
  name: { fontSize: 15, fontWeight: '600' },
  sub: { fontSize: 11, marginTop: 1 },
  state: { fontSize: 12 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
  },
  badgeLabel: { color: '#fff', fontSize: 11, fontWeight: '700' },
  footer: { fontSize: 11, marginTop: 12, lineHeight: 16, fontStyle: 'italic' },
});

import { Stack } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTokens } from '../../lib/theme';

// Same catalog as /(onboarding)/connections.tsx — kept duplicated here for the
// skeleton. The real build extracts to shared/src/data or a hook.
const CONNECTIONS = [
  { key: 'healthkit', name: 'Apple Health', icon: '❤️' },
  { key: 'health-connect', name: 'Health Connect', icon: '💚' },
  { key: 'plaid', name: 'Plaid (Bank)', icon: '🏦' },
  { key: 'gmail', name: 'Gmail', icon: '📧' },
  { key: 'outlook', name: 'Outlook', icon: '📬' },
  { key: 'google-calendar', name: 'Google Calendar', icon: '📅' },
  { key: 'apple-calendar', name: 'Apple Calendar', icon: '🗓️' },
  { key: 'outlook-calendar', name: 'Outlook Calendar', icon: '📆' },
  { key: 'strava', name: 'Strava', icon: '🏃' },
  { key: 'garmin', name: 'Garmin', icon: '⌚' },
  { key: 'screen-time', name: 'Screen Time', icon: '📱' },
  { key: 'location', name: 'Location', icon: '📍' },
];

export default function Connections() {
  const t = useTokens();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: 'Connections' }} />
      <ScrollView contentContainerStyle={styles.content}>
        {CONNECTIONS.map((c) => (
          <Pressable
            key={c.key}
            onPress={() => Alert.alert('Connection skeleton', `${c.name} connect/disconnect flow ships in a later phase.`)}
            style={[styles.row, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={styles.icon}>{c.icon}</Text>
            <Text style={[styles.name, { color: t.text }]}>{c.name}</Text>
            <Text style={[styles.state, { color: t.subtle }]}>Not connected</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 8, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, padding: 14, gap: 12 },
  icon: { fontSize: 22 },
  name: { flex: 1, fontSize: 15, fontWeight: '600' },
  state: { fontSize: 12 },
});

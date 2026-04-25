import { Stack } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ConnectorTile } from '../../components/apex';
import type { ConnectorEntry } from '../../../shared/src/types/connectors';
import { useConnectors, disconnectConnector } from '../../lib/hooks/useConnectors';
import { useHealthConnection } from '../../lib/useHealthConnection';
import { useHaptics } from '../../lib/useHaptics';
import { useTokens } from '../../lib/theme';

// Providers that have a working mobile connect/disconnect flow in THIS
// build. Everything else renders as "coming soon" with the honest note
// from the backend catalog. When Phase C1 wires Gmail/Calendar/etc., add
// them here (or switch to reading `ships_in_phase === 'a0' | 'b1' | 'c1'
// as shipped once we start shipping C1).
const SHIPPED_PROVIDERS = new Set<string>(['healthkit', 'health_connect']);

export default function Connections() {
  const t = useTokens();
  const haptics = useHaptics();
  const list = useConnectors();
  const health = useHealthConnection();

  const refresh = useCallback(async () => {
    await list.refetch();
  }, [list]);

  const visible = (list.data?.connectors ?? []).filter((e) => {
    if (e.platforms.length === 2) return true;
    return e.platforms.includes(Platform.OS);
  });

  const handlePress = async (entry: ConnectorEntry) => {
    const shipped = SHIPPED_PROVIDERS.has(entry.provider);
    if (!shipped) {
      Alert.alert(entry.display_name, entry.note || 'This connector ships in a later phase.');
      return;
    }
    haptics.fire('tap');
    const isHealth = entry.provider === 'healthkit' || entry.provider === 'health_connect';
    if (isHealth) {
      if (health.connected) {
        Alert.alert(
          `Disconnect ${entry.display_name}?`,
          `New sleep / HRV / heart-rate data stops flowing. Existing logs stay.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Disconnect', style: 'destructive',
              onPress: async () => {
                await health.disconnect();
                try { await disconnectConnector(entry.provider); } catch { /* non-fatal */ }
                await refresh();
                haptics.fire('success');
              },
            },
          ],
        );
      } else {
        Alert.alert(
          `Connect ${entry.display_name}`,
          `Life Dashboard requests read access to sleep, heart rate, HRV. You can revoke any time from iOS Settings or here.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Connect',
              onPress: async () => {
                await health.connect();
                await refresh();
                haptics.fire('success');
              },
            },
          ],
        );
      }
      return;
    }
    // Fallback for future shipped providers — a tap opens a connect flow
    // per-provider. Until Phase C1, nothing else is shipped.
    Alert.alert(entry.display_name, 'Connect flow ships in a later phase.');
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: 'Connections' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.intro, { color: t.muted }]}>
          Data sources Life Dashboard reads. Connecting a source adds its signals to your scoring. Apple Health / Health Connect ship today; the rest wire up in coming phases.
        </Text>

        {list.loading && !list.data ? (
          <ActivityIndicator color={t.accent} style={{ marginTop: 20 }} />
        ) : (
          visible.map((entry) => (
            <ConnectorTile
              key={entry.provider}
              entry={entry}
              shipped={SHIPPED_PROVIDERS.has(entry.provider)}
              onPress={() => handlePress(entry)}
            />
          ))
        )}

        <Text style={[styles.footer, { color: t.subtle }]}>
          Per-source AI consent (what the chatbot can see) lives in Settings → Privacy. Connecting a source is separate from granting the chatbot permission to reference its data.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 8, paddingBottom: 40 },
  intro: { fontSize: 12, fontStyle: 'italic', lineHeight: 18, marginBottom: 4 },
  footer: { fontSize: 11, marginTop: 12, lineHeight: 16, fontStyle: 'italic' },
});

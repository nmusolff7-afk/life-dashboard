import { Stack } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ConnectorTile } from '../../components/apex';
import type { ConnectorEntry } from '../../../shared/src/types/connectors';
import { useConnectors, disconnectConnector, markConnectorConnected } from '../../lib/hooks/useConnectors';
import { connectGmail, disconnectGmail, gmailRedirectUriForRegistration } from '../../lib/hooks/useGmailOAuth';
import { useHealthConnection } from '../../lib/useHealthConnection';
import { useHaptics } from '../../lib/useHaptics';
import { useTokens } from '../../lib/theme';

// Providers with a working mobile connect/disconnect flow in THIS build.
// Anything else renders as "coming soon" with the honest note from the
// backend catalog.
const SHIPPED_PROVIDERS = new Set<string>(['healthkit', 'health_connect', 'gmail']);

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

  const [busy, setBusy] = useState<string | null>(null);

  const handlePress = async (entry: ConnectorEntry) => {
    const shipped = SHIPPED_PROVIDERS.has(entry.provider);
    if (!shipped) {
      Alert.alert(entry.display_name, entry.note || 'This connector ships in a later phase.');
      return;
    }
    haptics.fire('tap');

    // Gmail — OAuth via expo-web-browser, deep-link callback.
    if (entry.provider === 'gmail') {
      if (entry.status === 'connected') {
        Alert.alert(
          'Disconnect Gmail?',
          `Stops syncing email. Existing summaries stay until pruned.\nConnected as: ${entry.external_user_id ?? 'unknown'}`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Disconnect', style: 'destructive',
              onPress: async () => {
                setBusy('gmail');
                try { await disconnectGmail(); await refresh(); haptics.fire('success'); }
                catch (e) { Alert.alert('Disconnect failed', (e as Error).message); }
                finally { setBusy(null); }
              },
            },
          ],
        );
        return;
      }
      // Not connected — kick off OAuth
      Alert.alert(
        'Connect Gmail',
        `Read-only access for inbox triage in the Time tab. You'll see Google's permission screen next.\n\nIf this fails with redirect_uri_mismatch, register this URI in Google Cloud Console:\n\n${gmailRedirectUriForRegistration()}`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Continue',
            onPress: async () => {
              setBusy('gmail');
              try {
                const email = await connectGmail();
                await refresh();
                haptics.fire('success');
                Alert.alert('Connected', `Gmail connected as ${email}.`);
              } catch (e) {
                Alert.alert('Connect failed', (e as Error).message);
              } finally {
                setBusy(null);
              }
            },
          },
        ],
      );
      return;
    }

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
                // Persist the connection state server-side so the
                // backend knows the user has granted device-native
                // access. Non-fatal if it fails (user can retry from
                // refresh).
                try { await markConnectorConnected(entry.provider); } catch { /* noop */ }
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
              disabled={busy === entry.provider}
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

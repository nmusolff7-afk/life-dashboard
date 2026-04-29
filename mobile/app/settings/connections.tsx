import { Stack } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ConnectorTile } from '../../components/apex';
import type { ConnectorEntry } from '../../../shared/src/types/connectors';
import { useConnectors, disconnectConnector, markConnectorConnected } from '../../lib/hooks/useConnectors';
import { useGmailOAuth } from '../../lib/hooks/useGmailOAuth';
import { useGcalOAuth, syncGcal } from '../../lib/hooks/useGcalOAuth';
import { useOutlookOAuth, syncOutlook } from '../../lib/hooks/useOutlookOAuth';
import { useStravaOAuth, syncStrava } from '../../lib/hooks/useStravaOAuth';
import { useHealthConnection } from '../../lib/useHealthConnection';
import { useHealthData } from '../../lib/hooks/useHealthData';
import { useLocationConnector } from '../../lib/hooks/useLocationConnector';
import { useUsageStats } from '../../lib/hooks/useUsageStats';
import { useHaptics } from '../../lib/useHaptics';
import { useTokens } from '../../lib/theme';

// Providers with a working mobile connect/disconnect flow in THIS build.
// Anything else renders as "coming soon" with the honest note from the
// backend catalog.
const SHIPPED_PROVIDERS = new Set<string>([
  'healthkit', 'health_connect', 'gmail', 'strava', 'gcal', 'outlook',
  'location', 'android_usage_stats',
]);

export default function Connections() {
  const t = useTokens();
  const haptics = useHaptics();
  const list = useConnectors();
  const health = useHealthConnection();
  const gmailOAuth = useGmailOAuth();
  const gcalOAuth = useGcalOAuth();
  const outlookOAuth = useOutlookOAuth();
  const stravaOAuth = useStravaOAuth();
  const healthData = useHealthData();
  const location = useLocationConnector();
  const usageStats = useUsageStats();

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

    // Gmail — native OAuth via expo-auth-session/providers/google with
    // platform-specific client IDs + PKCE. No URL registration needed:
    // Google's iOS/Android OAuth clients auto-derive the redirect URI
    // from the bundle ID (com.lifedashboard).
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
                try { await gmailOAuth.disconnect(); await refresh(); haptics.fire('success'); }
                catch (e) { Alert.alert('Disconnect failed', (e as Error).message); }
                finally { setBusy(null); }
              },
            },
          ],
        );
        return;
      }
      // Not connected — kick off OAuth.
      // NB: Expo Go won't work for this (its bundle ID is host.exp.exponent
      // — Google's Android client expects com.lifedashboard). User must
      // be running a dev-client build (eas build --profile development).
      Alert.alert(
        'Connect Gmail',
        `Google's permission screen will open next. Read-only access for inbox triage in the Time tab.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Continue',
            onPress: async () => {
              setBusy('gmail');
              try {
                const email = await gmailOAuth.connect();
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

    // Google Calendar — same Google OAuth project as Gmail, separate
    // connector row. Initial connect imports yesterday + next 7 days
    // of events; tap a connected tile for sync-now / disconnect.
    if (entry.provider === 'gcal') {
      if (entry.status === 'connected') {
        Alert.alert(
          'Google Calendar',
          `Connected as ${entry.external_user_id ?? 'unknown'}.\nWhat would you like to do?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Sync now',
              onPress: async () => {
                setBusy('gcal');
                try {
                  const r = await syncGcal();
                  await refresh();
                  haptics.fire('success');
                  Alert.alert('Calendar synced',
                    `${r.fetched} event${r.fetched === 1 ? '' : 's'} in your window.`);
                } catch (e) {
                  Alert.alert('Sync failed', (e as Error).message);
                } finally {
                  setBusy(null);
                }
              },
            },
            {
              text: 'Disconnect', style: 'destructive',
              onPress: async () => {
                setBusy('gcal');
                try {
                  await gcalOAuth.disconnect();
                  await refresh();
                  haptics.fire('success');
                } catch (e) {
                  Alert.alert('Disconnect failed', (e as Error).message);
                } finally { setBusy(null); }
              },
            },
          ],
        );
        return;
      }
      Alert.alert(
        'Connect Google Calendar',
        `Google's permission screen will open next. Read-only access to your calendar events for the Time tab.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Continue',
            onPress: async () => {
              setBusy('gcal');
              try {
                const r = await gcalOAuth.connect();
                await refresh();
                haptics.fire('success');
                Alert.alert('Connected',
                  `Calendar connected as ${r.email || 'your Google account'}.\nImported ${r.fetched} event${r.fetched === 1 ? '' : 's'}.`);
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

    // Outlook — Microsoft Graph (mail + calendar in one OAuth grant).
    // Single connector covers both surfaces.
    if (entry.provider === 'outlook') {
      if (entry.status === 'connected') {
        Alert.alert(
          'Outlook',
          `Connected as ${entry.external_user_id ?? 'unknown'}.\nWhat would you like to do?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Sync now',
              onPress: async () => {
                setBusy('outlook');
                try {
                  const r = await syncOutlook();
                  await refresh();
                  haptics.fire('success');
                  Alert.alert('Outlook synced',
                    `${r.emails} email${r.emails === 1 ? '' : 's'}, ${r.events} event${r.events === 1 ? '' : 's'} cached.`);
                } catch (e) {
                  Alert.alert('Sync failed', (e as Error).message);
                } finally {
                  setBusy(null);
                }
              },
            },
            {
              text: 'Disconnect', style: 'destructive',
              onPress: async () => {
                setBusy('outlook');
                try {
                  await outlookOAuth.disconnect();
                  await refresh();
                  haptics.fire('success');
                } catch (e) {
                  Alert.alert('Disconnect failed', (e as Error).message);
                } finally { setBusy(null); }
              },
            },
          ],
        );
        return;
      }
      Alert.alert(
        'Connect Outlook',
        `Microsoft's permission screen will open next. Read-only access to your inbox and calendar — covers both Outlook mail and Outlook calendar events.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Continue',
            onPress: async () => {
              setBusy('outlook');
              try {
                const r = await outlookOAuth.connect();
                await refresh();
                haptics.fire('success');
                Alert.alert('Connected',
                  `Outlook connected as ${r.name || r.email || 'your account'}.\nImported ${r.emails} email${r.emails === 1 ? '' : 's'} and ${r.events} event${r.events === 1 ? '' : 's'}.`);
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

    // Strava — OAuth 2.0 with server-side client_secret. No PKCE.
    // Initial connect runs a 90-day backfill server-side; subsequent
    // taps on a connected tile re-sync.
    if (entry.provider === 'strava') {
      if (entry.status === 'connected') {
        Alert.alert(
          'Strava',
          `Connected as athlete ${entry.external_user_id ?? 'unknown'}.\nWhat would you like to do?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Sync now',
              onPress: async () => {
                setBusy('strava');
                try {
                  const r = await syncStrava();
                  await refresh();
                  haptics.fire('success');
                  Alert.alert('Strava synced',
                    `Fetched ${r.fetched} activities, ${r.inserted} new in your history.`);
                } catch (e) {
                  Alert.alert('Sync failed', (e as Error).message);
                } finally {
                  setBusy(null);
                }
              },
            },
            {
              text: 'Disconnect', style: 'destructive',
              onPress: async () => {
                setBusy('strava');
                try {
                  await stravaOAuth.disconnect();
                  await refresh();
                  haptics.fire('success');
                } catch (e) {
                  Alert.alert('Disconnect failed', (e as Error).message);
                } finally { setBusy(null); }
              },
            },
          ],
        );
        return;
      }
      Alert.alert(
        'Connect Strava',
        `Strava's permission screen will open next. Read access to your activities (last 90 days import on connect).`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Continue',
            onPress: async () => {
              setBusy('strava');
              try {
                const r = await stravaOAuth.connect();
                await refresh();
                haptics.fire('success');
                Alert.alert('Connected',
                  `Strava connected as ${r.athlete_name}.\nImported ${r.inserted} of ${r.fetched} activities.`);
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

    // Health Connect (Android) — REAL native permission flow via
    // react-native-health-connect. iOS HealthKit still uses the older
    // AsyncStorage stub (`health` from useHealthConnection).
    if (entry.provider === 'health_connect') {
      if (entry.status === 'connected' || healthData.permitted) {
        Alert.alert(
          'Health Connect',
          `Steps, sleep, heart rate, HRV will stop syncing. Existing logs stay. Full revoke happens in Android Settings → Apps → Health Connect.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Sync now',
              onPress: async () => {
                setBusy('health_connect');
                try { await healthData.sync(); await refresh(); haptics.fire('success'); }
                catch (e) { Alert.alert('Sync failed', (e as Error).message); }
                finally { setBusy(null); }
              },
            },
            {
              text: 'Disconnect', style: 'destructive',
              onPress: async () => {
                setBusy('health_connect');
                try {
                  await healthData.disconnect();
                  try { await disconnectConnector('health_connect'); } catch { /* non-fatal */ }
                  await refresh(); haptics.fire('success');
                } catch (e) { Alert.alert('Disconnect failed', (e as Error).message); }
                finally { setBusy(null); }
              },
            },
          ],
        );
        return;
      }
      Alert.alert(
        'Connect Health Connect',
        `Tap Continue to open Health Connect's settings. Find "Life Dashboard" in the apps list, toggle on Steps / Sleep / Heart Rate / HRV / Active Calories, then come back to this app — it'll auto-detect the grant within 60 seconds.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Continue',
            onPress: async () => {
              setBusy('health_connect');
              try {
                const ok = await healthData.connect();
                if (!ok) {
                  // Show a Play-Store-direct CTA when the SDK isn't
                  // installed, distinct from a generic permission denial.
                  if (healthData.needsHcApp) {
                    Alert.alert(
                      'Install Health Connect',
                      healthData.error || 'Health Connect isn\'t installed or needs an update. Open the Play Store to install/update.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Open Play Store',
                          onPress: () => {
                            Linking.openURL('market://details?id=com.google.android.apps.healthdata').catch(() =>
                              Linking.openURL('https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata'),
                            );
                          },
                        },
                      ],
                    );
                  } else {
                    Alert.alert('Permission needed',
                      healthData.error || 'Some Health Connect permissions weren\'t granted. Try again or grant in Health Connect app settings.');
                  }
                  return;
                }
                await refresh(); haptics.fire('success');
                // Silent-success was the founder's actual symptom 2026-
                // 04-28: tapping Continue with perms-already-granted ran
                // sync() and returned true, but no UI feedback fired
                // because we only confirmed in the connection-failed
                // branch. Surface a positive ack consistent with Gmail/
                // Strava/Outlook flows.
                Alert.alert(
                  'Connected',
                  'Health Connect is connected. Your steps, sleep, HRV, heart rate, and active calories will sync automatically when you open the app.',
                );
              } finally { setBusy(null); }
            },
          },
        ],
      );
      return;
    }

    // Apple HealthKit (iOS-only stub for v1) — same flow as before.
    if (entry.provider === 'healthkit') {
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

    // Location — foreground samples via expo-location.
    if (entry.provider === 'location') {
      if (entry.status === 'connected' || location.permitted) {
        Alert.alert(
          'Location',
          `Currently sampling foreground location. Full revoke in Settings → Apps → Life Dashboard → Permissions → Location.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Sample now',
              onPress: async () => {
                setBusy('location');
                try { await location.sample(); await refresh(); haptics.fire('success'); }
                catch (e) { Alert.alert('Sample failed', (e as Error).message); }
                finally { setBusy(null); }
              },
            },
            {
              text: 'Disconnect', style: 'destructive',
              onPress: async () => {
                setBusy('location');
                try {
                  await location.disconnect();
                  try { await disconnectConnector('location'); } catch { /* non-fatal */ }
                  await refresh(); haptics.fire('success');
                } finally { setBusy(null); }
              },
            },
          ],
        );
        return;
      }
      Alert.alert(
        'Connect Location',
        `Foreground samples only for v1 — every time you open the app, your current location gets logged. Used for "where you spend time" patterns. Background sampling ships in v1.1.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Continue',
            onPress: async () => {
              setBusy('location');
              try {
                const ok = await location.connect();
                if (!ok) {
                  // Founder INBOX (C1 phase log): alert chain on
                  // first-connect was fragile — denial just showed
                  // a generic "permission not granted" with no path
                  // forward. Surface concrete next-steps for both
                  // first-deny and OS-level "deny permanently".
                  const detail = location.error
                    ? `\n\nDetail: ${location.error}`
                    : '';
                  Alert.alert(
                    'Location permission not granted',
                    `Life Dashboard needs Location to detect places you visit (gym, work, home) and surface them on the Time tab.\n\nIf you tapped "Don't allow" or the dialog didn't appear, grant it manually:\n\nSettings → Apps → Life Dashboard → Permissions → Location → Allow only while using the app${detail}`,
                    [{ text: 'OK' }],
                  );
                  return;
                }
                await refresh(); haptics.fire('success');
              } finally { setBusy(null); }
            },
          },
        ],
      );
      return;
    }

    // Android Screen Time — UsageStatsManager via our local Expo
    // Module (mobile/modules/usage-stats). Connect flow opens system
    // Settings → Usage access; we poll for the grant.
    if (entry.provider === 'android_usage_stats') {
      if (entry.status === 'connected' || usageStats.permitted) {
        Alert.alert(
          'Screen Time',
          `Currently reading daily phone-usage from Android. Full revoke in Settings → Apps → Special access → Usage access.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Sync now',
              onPress: async () => {
                setBusy('android_usage_stats');
                try { await usageStats.sync(); await refresh(); haptics.fire('success'); }
                catch (e) { Alert.alert('Sync failed', (e as Error).message); }
                finally { setBusy(null); }
              },
            },
            {
              text: 'Disconnect', style: 'destructive',
              onPress: async () => {
                setBusy('android_usage_stats');
                try {
                  await usageStats.disconnect();
                  try { await disconnectConnector('android_usage_stats'); } catch { /* non-fatal */ }
                  await refresh(); haptics.fire('success');
                } finally { setBusy(null); }
              },
            },
          ],
        );
        return;
      }
      Alert.alert(
        'Connect Screen Time',
        `Tap Continue to open Android's Usage Access settings. Find "Life Dashboard" in the list, toggle it on, then come back to the app — it'll auto-detect the grant within 30 seconds.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Continue',
            onPress: async () => {
              setBusy('android_usage_stats');
              try {
                const ok = await usageStats.connect();
                if (!ok) {
                  Alert.alert('Permission not granted',
                    'Tap Connect again once you toggle Life Dashboard on in Usage access. Or you may have hit the 30-second poll timeout.');
                  return;
                }
                await refresh(); haptics.fire('success');
              } finally { setBusy(null); }
            },
          },
        ],
      );
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

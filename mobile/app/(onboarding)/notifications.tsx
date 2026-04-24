import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/ui';
import { useTokens } from '../../lib/theme';

export default function NotificationsScreen() {
  const t = useTokens();
  const router = useRouter();

  // Onboarding was finalized server-side when step-3 called
  // /api/onboarding/complete and /generating confirmed status=done. Do NOT call
  // /complete again here — doing so resets _ob_jobs to pending and re-runs
  // profile generation (wastes a Claude call and creates a race with the tabs gate).
  const finish = () => router.replace('/(tabs)');

  const requestPermission = async () => {
    // TODO(Phase 13.4): real expo-notifications permission prompt.
    //   1. Add expo-notifications to package.json + expo prebuild
    //   2. `await Notifications.requestPermissionsAsync()`
    //   3. If granted, enable default quiet hours + category-default
    //      aggressiveness in lock-/notification-prefs.
    //   4. If denied, route to Settings → Notifications for manual
    //      re-enable instructions.
    // Kept as a stub for now because the package isn't in
    // package.json — adding it requires a prebuild which is outside
    // this change's scope.
    finish();
  };

  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
      <View style={styles.body}>
        <Text style={styles.emoji}>🔔</Text>
        <Text style={[styles.title, { color: t.text }]}>Stay in the loop</Text>
        <Text style={[styles.subtitle, { color: t.muted }]}>
          Life Dashboard sends a few well-timed nudges — meal reminders, goal milestones, unreplied emails. You control frequency and categories in Settings.
        </Text>
      </View>
      <View style={styles.actions}>
        <Button title="Allow notifications" onPress={requestPermission} />
        <Button title="Not now" variant="ghost" onPress={finish} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'space-between' },
  body: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14 },
  emoji: { fontSize: 64 },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 340 },
  actions: { gap: 12, paddingBottom: 24 },
});

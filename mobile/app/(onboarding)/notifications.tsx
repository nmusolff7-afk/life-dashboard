import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/ui';
import { apiFetch } from '../../lib/api';
import { useTokens } from '../../lib/theme';

export default function NotificationsScreen() {
  const t = useTokens();
  const router = useRouter();

  const finish = async () => {
    // Flag onboarding complete server-side if not already done. Flask's
    // is_onboarding_complete is set by /api/onboarding/complete; /complete is
    // idempotent so re-hitting is safe.
    try {
      await apiFetch('/api/onboarding/complete', { method: 'POST' });
    } catch {
      // skeleton: swallow; status check will fall through to tabs anyway
    }
    router.replace('/(tabs)');
  };

  const requestPermission = async () => {
    // Skeleton: don't actually request OS permission here. Requires
    // expo-notifications which isn't installed yet; adding it is a real
    // Phase 3 task tied to the §4.9 notifications build.
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

import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/ui';
import { useTokens } from '../../lib/theme';

/**
 * Real expo-notifications permission request with runtime-safe fallback.
 *
 * expo-notifications is a native module — it's only actually callable in
 * builds produced after the package was included in a prebuild. On a
 * dev build without it, `require()` throws. We catch that and degrade to
 * an honest "we'll ask next session" experience instead of lying to the
 * user by pretending we asked.
 *
 * Three possible states:
 *   nativeAvailable=false → show a truthful "we'll ask on the next
 *       build" card, no fake button.
 *   nativeAvailable=true + permissionGranted=null → show Allow / Not now
 *       buttons that call the real permission prompt.
 *   nativeAvailable=true + permissionGranted=set → show status pill and
 *       a Continue button.
 */
export default function NotificationsScreen() {
  const t = useTokens();
  const router = useRouter();
  const [nativeAvailable, setNativeAvailable] = useState<boolean | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [requesting, setRequesting] = useState(false);

  // Onboarding was finalized server-side when step-3 called
  // /api/onboarding/complete and /generating confirmed status=done. Do NOT
  // call /complete again here — doing so resets _ob_jobs to pending and
  // re-runs profile generation.
  const finish = () => router.replace('/(tabs)');

  // Probe for the native module on mount. If require() succeeds AND
  // expo-notifications actually has a working getPermissionsAsync, we're
  // in a real build; otherwise we're in a dev build without the native
  // binding and need to fall back.
  useEffect(() => {
    let cancelled = false;
    const probe = async () => {
      try {
        const mod = getNotificationsModule();
        if (!mod) {
          if (!cancelled) setNativeAvailable(false);
          return;
        }
        const { status } = await mod.getPermissionsAsync();
        if (cancelled) return;
        setNativeAvailable(true);
        setPermissionStatus(status === 'granted' ? 'granted' : 'unknown');
      } catch {
        if (!cancelled) setNativeAvailable(false);
      }
    };
    void probe();
    return () => { cancelled = true; };
  }, []);

  const requestPermission = async () => {
    const mod = getNotificationsModule();
    if (!mod) {
      // Shouldn't happen if nativeAvailable=true, but defensive.
      Alert.alert('Not available', 'Notifications aren\'t available in this build. We\'ll ask again next session.');
      finish();
      return;
    }
    setRequesting(true);
    try {
      const { status } = await mod.requestPermissionsAsync();
      setPermissionStatus(status === 'granted' ? 'granted' : 'denied');
      if (status !== 'granted' && Platform.OS === 'ios') {
        Alert.alert(
          'Notifications disabled',
          'You can turn these on later in Settings → Life Dashboard → Notifications.',
        );
      }
    } catch (e) {
      Alert.alert('Couldn\'t request permission', e instanceof Error ? e.message : String(e));
    } finally {
      setRequesting(false);
    }
  };

  if (nativeAvailable === null) {
    // Probing — avoid button flicker.
    return <View style={[styles.container, { backgroundColor: t.bg }]} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
      <View style={styles.body}>
        <Text style={styles.emoji}>🔔</Text>
        <Text style={[styles.title, { color: t.text }]}>Stay in the loop</Text>
        <Text style={[styles.subtitle, { color: t.muted }]}>
          Life Dashboard sends a few well-timed nudges — meal reminders, goal milestones, unreplied emails. You control frequency and categories in Settings.
        </Text>
        {!nativeAvailable ? (
          <Text style={[styles.caveat, { color: t.subtle }]}>
            Notifications will be requested in the next build. Skip for now and head to Home.
          </Text>
        ) : permissionStatus === 'granted' ? (
          <Text style={[styles.granted, { color: t.accent }]}>Notifications enabled ✓</Text>
        ) : permissionStatus === 'denied' ? (
          <Text style={[styles.caveat, { color: t.subtle }]}>
            Declined. Enable later in Settings → Life Dashboard → Notifications.
          </Text>
        ) : null}
      </View>
      <View style={styles.actions}>
        {nativeAvailable && permissionStatus === 'unknown' ? (
          <Button
            title={requesting ? 'Requesting…' : 'Allow notifications'}
            onPress={requestPermission}
            disabled={requesting}
          />
        ) : null}
        <Button
          title={permissionStatus === 'granted' ? 'Continue' : 'Not now'}
          variant={permissionStatus === 'granted' ? 'primary' : 'ghost'}
          onPress={finish}
        />
      </View>
    </View>
  );
}

/**
 * Runtime-safe require of expo-notifications. Returns null if the native
 * module isn't bound into this build (dev builds, Expo Go, web). Uses
 * `eval` to dodge Metro's static analysis so the missing module doesn't
 * cause a bundle-time error.
 */
function getNotificationsModule():
  | {
      getPermissionsAsync: () => Promise<{ status: string }>;
      requestPermissionsAsync: () => Promise<{ status: string }>;
    }
  | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, no-eval
    const mod: unknown = (0, eval)('require')('expo-notifications');
    if (
      mod && typeof mod === 'object' &&
      'getPermissionsAsync' in mod && 'requestPermissionsAsync' in mod
    ) {
      return mod as ReturnType<typeof getNotificationsModule>;
    }
    return null;
  } catch {
    return null;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'space-between' },
  body: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14 },
  emoji: { fontSize: 64 },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 340 },
  caveat: { fontSize: 13, lineHeight: 18, textAlign: 'center', maxWidth: 340, marginTop: 8, fontStyle: 'italic' },
  granted: { fontSize: 14, fontWeight: '700', marginTop: 8 },
  actions: { gap: 12, paddingBottom: 24 },
});

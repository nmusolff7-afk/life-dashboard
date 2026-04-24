import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import * as LocalAuth from 'expo-local-authentication';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/ui';
import { clearFlaskToken } from '../../lib/flaskToken';
import { DEFAULT_LOCKS, loadLockPrefs, saveLockPrefs } from '../../lib/lockPrefs';
import { useTokens } from '../../lib/theme';

/** Onboarding step: biometric enrollment. PRD §4.1.3 says replace the
 *  previous stub with a real expo-local-authentication binding. On
 *  success we persist biometricLock=true in lock prefs so the rest of
 *  the app respects the user's choice. */
export default function BiometricScreen() {
  const t = useTokens();
  const router = useRouter();
  const { signOut } = useAuth();

  const [supported, setSupported] = useState<boolean | null>(null);
  const [bioLabel, setBioLabel] = useState('Biometric');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const compatible = await LocalAuth.hasHardwareAsync();
      const enrolled = await LocalAuth.isEnrolledAsync();
      setSupported(compatible && enrolled);
      if (compatible) {
        const types = await LocalAuth.supportedAuthenticationTypesAsync();
        if (types.includes(LocalAuth.AuthenticationType.FACIAL_RECOGNITION)) setBioLabel('Face ID');
        else if (types.includes(LocalAuth.AuthenticationType.FINGERPRINT)) setBioLabel('Fingerprint');
        else if (types.includes(LocalAuth.AuthenticationType.IRIS)) setBioLabel('Iris');
      }
    })();
  }, []);

  const next = () => router.replace('/(onboarding)/step-1');

  const enableBiometric = async () => {
    if (!supported) {
      Alert.alert(
        'Not available',
        'This device doesn\'t have a registered biometric method. You can set one up later in Settings → Security.',
      );
      next();
      return;
    }
    setBusy(true);
    try {
      // Prompt once so iOS confirms the user can actually authenticate
      // via Face/Touch/Fingerprint before we persist the preference.
      const result = await LocalAuth.authenticateAsync({
        promptMessage: `Confirm ${bioLabel} to enable quick unlock`,
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });
      if (result.success) {
        const existing = await loadLockPrefs();
        await saveLockPrefs({ ...existing, biometricLock: true });
        next();
      } else if (result.error !== 'user_cancel' && result.error !== 'system_cancel') {
        Alert.alert('Authentication failed', 'You can enable this later in Settings → Security.');
      }
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const skip = async () => {
    // Make sure we explicitly flip the pref OFF so a re-run of
    // onboarding doesn't lock a user out unexpectedly.
    const existing = await loadLockPrefs();
    await saveLockPrefs({ ...existing, biometricLock: false });
    next();
  };

  const handleSignOut = async () => {
    clearFlaskToken();
    await signOut();
    router.replace('/(auth)/sign-in');
  };

  const title = supported === false ? 'Biometric unavailable' : `Secure with ${bioLabel}`;
  const subtitle =
    supported === false
      ? 'Your device either lacks biometric hardware or has no registered Face ID / fingerprint. You can enable this later in Settings → Security.'
      : `Unlock Life Dashboard instantly with ${bioLabel}. You can change this any time in Settings → Security.`;

  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
      <View style={styles.body}>
        <Text style={[styles.emoji]}>🔐</Text>
        <Text style={[styles.title, { color: t.text }]}>{title}</Text>
        <Text style={[styles.subtitle, { color: t.muted }]}>{subtitle}</Text>
      </View>
      <View style={styles.actions}>
        <Button
          title={busy ? 'Confirming…' : supported === false ? 'Continue' : `Enable ${bioLabel}`}
          onPress={supported === false ? next : enableBiometric}
          disabled={busy}
        />
        {supported !== false ? (
          <Button title="Skip for now" variant="ghost" onPress={skip} />
        ) : null}
        <Pressable onPress={handleSignOut} hitSlop={10}>
          <Text style={[styles.signOut, { color: t.subtle }]}>Sign out</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'space-between' },
  body: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14 },
  emoji: { fontSize: 72 },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 15, textAlign: 'center', lineHeight: 22, maxWidth: 320 },
  actions: { gap: 12, paddingBottom: 24 },
  signOut: { fontSize: 13, textAlign: 'center', marginTop: 8 },
});

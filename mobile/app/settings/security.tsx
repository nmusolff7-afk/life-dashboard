import { useAuth, useUser } from '@clerk/clerk-expo';
import { Stack, useRouter } from 'expo-router';
import * as LocalAuth from 'expo-local-authentication';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { SettingsRow } from '../../components/apex';
import { clearFlaskToken } from '../../lib/flaskToken';
import { DEFAULT_LOCKS, loadLockPrefs, type LockPrefs, saveLockPrefs } from '../../lib/lockPrefs';
import { useTokens } from '../../lib/theme';

export default function Security() {
  const t = useTokens();
  const router = useRouter();
  const { signOut, sessionId } = useAuth();
  const { user } = useUser();
  const [locks, setLocks] = useState<LockPrefs>(DEFAULT_LOCKS);
  const [loading, setLoading] = useState(true);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioLabel, setBioLabel] = useState<string>('Biometric');
  const [signingOutAll, setSigningOutAll] = useState(false);

  useEffect(() => {
    loadLockPrefs().then((p) => {
      setLocks(p);
      setLoading(false);
    });
    (async () => {
      const compatible = await LocalAuth.hasHardwareAsync();
      const enrolled = await LocalAuth.isEnrolledAsync();
      setBioAvailable(compatible && enrolled);
      if (compatible) {
        const types = await LocalAuth.supportedAuthenticationTypesAsync();
        if (types.includes(LocalAuth.AuthenticationType.FACIAL_RECOGNITION)) setBioLabel('Face ID');
        else if (types.includes(LocalAuth.AuthenticationType.FINGERPRINT)) setBioLabel('Fingerprint');
        else if (types.includes(LocalAuth.AuthenticationType.IRIS)) setBioLabel('Iris');
      }
    })();
  }, []);

  const updateLock = async <K extends keyof LockPrefs>(key: K, value: LockPrefs[K]) => {
    // Ask the user to authenticate before ENABLING biometric lock to confirm it works.
    if (key === 'biometricLock' && value === true) {
      if (!bioAvailable) {
        Alert.alert(
          'Not available',
          'Set up Face ID / Touch ID / fingerprint in system settings first.',
        );
        return;
      }
      const res = await LocalAuth.authenticateAsync({
        promptMessage: `Confirm ${bioLabel} to enable lock`,
        fallbackLabel: 'Use passcode',
      });
      if (!res.success) {
        Alert.alert('Not enabled', 'error' in res ? res.error : 'Authentication cancelled.');
        return;
      }
    }
    const next = { ...locks, [key]: value };
    setLocks(next);
    await saveLockPrefs(next);
  };

  const handleChangePassword = async () => {
    // Clerk's user-profile portal is the recommended way to change password
    // from a mobile client. Opens an in-app browser to the Clerk-hosted page.
    try {
      const pk = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
      const match = pk.match(/^pk_(test|live)_([A-Za-z0-9=]+)$/);
      if (!match) throw new Error('Clerk publishable key unavailable');
      // pk_(test|live)_<base64> → host derived from decoded base64, trailing $.
      const decoded = atob(match[2]);
      const host = decoded.replace(/\$$/, '');
      const url = `https://${host}/user`;
      await WebBrowser.openAuthSessionAsync(url, 'lifedashboard://');
    } catch (e) {
      Alert.alert('Change password failed', e instanceof Error ? e.message : String(e));
    }
  };

  const handleSignOutAll = () => {
    Alert.alert(
      'Sign out of all devices?',
      "This ends every Life Dashboard session — this device and any others you're signed in on. You'll need to sign in again.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out all',
          style: 'destructive',
          onPress: async () => {
            setSigningOutAll(true);
            try {
              const sessions = await user?.getSessions?.();
              if (sessions) {
                await Promise.all(
                  sessions
                    .filter((s) => s.id !== sessionId)
                    .map((s) => s.revoke()),
                );
              }
              clearFlaskToken();
              await signOut();
              router.replace('/(auth)/sign-in');
            } catch (e) {
              Alert.alert('Sign-out failed', e instanceof Error ? e.message : String(e));
            } finally {
              setSigningOutAll(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen
        options={{
          title: 'Security',
          headerStyle: { backgroundColor: t.bg },
          headerTintColor: t.text,
          headerShadowVisible: false,
        }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator color={t.accent} />
        ) : (
          <>
            <Text style={[styles.sectionLabel, { color: t.muted }]}>Device locks</Text>
            <View style={[styles.row, { backgroundColor: t.surface, borderColor: t.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: t.text }]}>{bioLabel} unlock</Text>
                <Text style={[styles.rowHint, { color: t.muted }]}>
                  {bioAvailable
                    ? `Require ${bioLabel} before opening the app.`
                    : `Set up ${bioLabel} in system settings to enable.`}
                </Text>
              </View>
              <Switch
                value={locks.biometricLock}
                disabled={!bioAvailable}
                onValueChange={(v) => updateLock('biometricLock', v)}
                trackColor={{ true: t.accent, false: t.surface2 }}
                thumbColor="#fff"
              />
            </View>
            <View style={[styles.row, { backgroundColor: t.surface, borderColor: t.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: t.text }]}>App lock</Text>
                <Text style={[styles.rowHint, { color: t.muted }]}>
                  Lock the app whenever it returns from background. Pairs with biometric unlock
                  above.
                </Text>
              </View>
              <Switch
                value={locks.appLock}
                onValueChange={(v) => updateLock('appLock', v)}
                trackColor={{ true: t.accent, false: t.surface2 }}
                thumbColor="#fff"
              />
            </View>

            <Text style={[styles.sectionLabel, { color: t.muted, marginTop: 18 }]}>Account</Text>
            <SettingsRow
              title="Change password"
              hint="Opens Clerk's secure profile portal in-app"
              onPress={handleChangePassword}
            />
            <SettingsRow
              title={signingOutAll ? 'Signing out…' : 'Sign out of all devices'}
              hint="Revokes every active session"
              destructive
              onPress={signingOutAll ? undefined : handleSignOutAll}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 10, paddingBottom: 40 },
  sectionLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  rowTitle: { fontSize: 14, fontWeight: '600' },
  rowHint: { fontSize: 11, marginTop: 2 },
});

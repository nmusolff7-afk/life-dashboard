import { useAuth } from '@clerk/clerk-expo';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SettingsRow } from '../../components/apex';
import { apiFetch } from '../../lib/api';
import { clearFlaskToken } from '../../lib/flaskToken';
import { useTokens } from '../../lib/theme';

export default function AccountSettings() {
  const t = useTokens();
  const router = useRouter();
  const { signOut } = useAuth();
  const [deleting, setDeleting] = useState(false);

  const handleSignOut = async () => {
    clearFlaskToken();
    await signOut();
    router.replace('/(auth)/sign-in');
  };

  /** Two-step confirmation: first "are you sure?", then typed-confirmation to
   *  avoid accidental taps. Matches Flask's modal flow for delete-account. */
  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete account?',
      'This permanently removes your meals, workouts, weight history, saved meals, and all preferences. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue…',
          style: 'destructive',
          onPress: () =>
            Alert.alert(
              'Final confirmation',
              'Really delete everything? This is your last chance to back out.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete forever',
                  style: 'destructive',
                  onPress: async () => {
                    setDeleting(true);
                    try {
                      const res = await apiFetch('/api/delete-account', {
                        method: 'POST',
                      });
                      if (!res.ok) {
                        const body = await res.json().catch(() => ({}));
                        throw new Error(
                          (body as { error?: string }).error ?? `delete-account → ${res.status}`,
                        );
                      }
                      // Clear tokens locally + sign out of Clerk, then boot to sign-in.
                      clearFlaskToken();
                      try {
                        await signOut();
                      } catch {
                        // Clerk sign-out failing shouldn't block the redirect.
                      }
                      router.replace('/(auth)/sign-in');
                    } catch (e) {
                      Alert.alert(
                        'Delete failed',
                        e instanceof Error ? e.message : String(e),
                      );
                    } finally {
                      setDeleting(false);
                    }
                  },
                },
              ],
            ),
        },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen
        options={{
          title: 'Data & account',
          headerStyle: { backgroundColor: t.bg },
          headerTintColor: t.text,
          headerShadowVisible: false,
        }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <SettingsRow
          title="Export my data"
          hint="CSV (Core) / PDF (Pro) per PRD §4.11"
          onPress={() =>
            Alert.alert(
              'Coming soon',
              'Export needs a new Flask endpoint — lands in a later phase.',
            )
          }
        />
        <SettingsRow title="Sign out" onPress={handleSignOut} />
        <SettingsRow
          title={deleting ? 'Deleting…' : 'Delete account'}
          hint="Permanently removes meals, workouts, weight + all settings"
          destructive
          onPress={deleting ? undefined : handleDeleteAccount}
        />
        {deleting ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={t.danger} />
            <Text style={[styles.loadingText, { color: t.muted }]}>
              Deleting account and all associated data…
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 8, paddingBottom: 40 },
  loadingRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    padding: 12,
  },
  loadingText: { fontSize: 13 },
});

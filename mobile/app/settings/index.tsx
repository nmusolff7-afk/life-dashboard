import { useUser } from '@clerk/clerk-expo';
import Constants from 'expo-constants';
import { Stack, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { SettingsRow } from '../../components/apex';
import { useTokens } from '../../lib/theme';

export default function SettingsScreen() {
  const t = useTokens();
  const router = useRouter();
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? 'Signed in';

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: 'Settings' }} />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Profile hero */}
        <SettingsRow title={email} hint="Tap to edit profile" onPress={() => router.push('/settings/profile')} />

        <Text style={[styles.section, { color: t.muted }]}>Account</Text>
        <SettingsRow title="Subscription & billing" onPress={() => router.push('/settings/subscription')} />
        <SettingsRow title="Connections" onPress={() => router.push('/settings/connections')} />

        <Text style={[styles.section, { color: t.muted }]}>Privacy & safety</Text>
        <SettingsRow title="Privacy & AI consent" onPress={() => router.push('/settings/privacy')} />
        <SettingsRow title="Notifications" onPress={() => router.push('/settings/notifications')} />
        <SettingsRow title="Security" onPress={() => router.push('/settings/security')} />

        <Text style={[styles.section, { color: t.muted }]}>App</Text>
        <SettingsRow title="Preferences" hint="Theme, units, language, haptics" onPress={() => router.push('/settings/preferences')} />
        <SettingsRow title="Data & account" onPress={() => router.push('/settings/account')} />
        <SettingsRow title="Support" onPress={() => router.push('/settings/support')} />

        <Text style={[styles.footer, { color: t.subtle }]}>
          Life Dashboard v{Constants.expoConfig?.version ?? '—'} (skeleton)
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 8, paddingBottom: 40 },
  section: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 14, marginBottom: 2 },
  footer: { fontSize: 11, textAlign: 'center', marginTop: 24 },
});

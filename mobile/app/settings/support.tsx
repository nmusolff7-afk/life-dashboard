import { Stack, useRouter } from 'expo-router';
import Constants from 'expo-constants';
import * as MailComposer from 'expo-mail-composer';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SettingsRow } from '../../components/apex';
import { useTokens } from '../../lib/theme';

export default function Support() {
  const t = useTokens();
  const router = useRouter();

  const handleContact = async () => {
    try {
      const available = await MailComposer.isAvailableAsync();
      if (!available) {
        Alert.alert('No mail account', 'Set up Mail first, or email support@lifedashboard.app directly.');
        return;
      }
      await MailComposer.composeAsync({
        recipients: ['support@lifedashboard.app'],
        subject: 'Life Dashboard — support request',
        body: `\n\n---\nApp v${Constants.expoConfig?.version ?? '—'}\nPlatform: ${Constants.platform?.ios ? 'iOS' : 'Android'}\n`,
      });
    } catch (e) {
      Alert.alert('Mail error', e instanceof Error ? e.message : String(e));
    }
  };

  const handleFeedback = async () => {
    try {
      const available = await MailComposer.isAvailableAsync();
      if (!available) {
        Alert.alert('No mail account', 'Set up Mail first, or email feedback@lifedashboard.app directly.');
        return;
      }
      await MailComposer.composeAsync({
        recipients: ['feedback@lifedashboard.app'],
        subject: 'Life Dashboard — feedback',
      });
    } catch (e) {
      Alert.alert('Mail error', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen
        options={{
          title: 'Support',
          headerStyle: { backgroundColor: t.bg },
          headerTintColor: t.text,
          headerShadowVisible: false,
        }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.section, { color: t.muted }]}>Help</Text>
        <SettingsRow title="FAQ" hint="Common questions" onPress={() => router.push('/settings/faq')} />
        <SettingsRow title="Contact support" hint="Email the team" onPress={handleContact} />
        <SettingsRow title="Give feedback" hint="Share ideas + bug reports" onPress={handleFeedback} />

        <Text style={[styles.section, { color: t.muted }]}>Product</Text>
        <SettingsRow
          title="Rate Life Dashboard"
          hint="Active once Life Dashboard is published to the App Store and Play Store."
          onPress={() =>
            Alert.alert(
              'Not yet published',
              'The rating flow activates once Life Dashboard is live in the App Store and Play Store. We\'ll enable this row automatically then.',
            )
          }
        />
        <SettingsRow
          title="What's new"
          hint={`v${Constants.expoConfig?.version ?? '—'} — release notes ship in a later update.`}
          onPress={() =>
            Alert.alert(
              "What's new",
              'Per-release notes ship in a later cycle. For now, check the commit log on the engineering side.',
            )
          }
        />

        <Text style={[styles.section, { color: t.muted }]}>Legal</Text>
        <SettingsRow
          title="Terms of Service"
          hint="Published alongside the public launch."
          onPress={() =>
            Alert.alert(
              'Not hosted yet',
              'Terms of Service will be hosted at launch. Until then, by using this beta build you agree to test feedback and no warranty on the pre-release experience.',
            )
          }
        />
        <SettingsRow
          title="Privacy Policy"
          hint="Published alongside the public launch."
          onPress={() =>
            Alert.alert(
              'Not hosted yet',
              'Privacy Policy will be hosted at launch. In this beta: your data stays on our infrastructure, is never sold, and you can permanently delete it from Data & account → Delete account.',
            )
          }
        />
        <SettingsRow
          title="Open-source licenses"
          onPress={() =>
            Alert.alert(
              'Open-source licenses',
              'Full license list ships in a later build. Built on React Native, Expo, TypeScript, Flask, and many more — thanks to all the open-source maintainers who make this possible.',
            )
          }
        />

        <Text style={[styles.footer, { color: t.subtle }]}>
          Life Dashboard v{Constants.expoConfig?.version ?? '—'}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 8, paddingBottom: 40 },
  section: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 14,
    marginBottom: 2,
  },
  footer: { fontSize: 11, textAlign: 'center', marginTop: 24 },
});

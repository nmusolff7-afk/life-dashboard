import { Stack, useRouter } from 'expo-router';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as MailComposer from 'expo-mail-composer';
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

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
          hint="Review in the App Store / Play Store"
          onPress={() => {
            const url = Platform.OS === 'ios'
              ? 'itms-apps://itunes.apple.com/app/idYOUR_APP_ID'
              : 'market://details?id=com.lifedashboard';
            Linking.openURL(url).catch(() => {
              Alert.alert(
                'Store not available',
                'The app-store rating flow will wire up once Life Dashboard is published.',
              );
            });
          }}
        />
        <SettingsRow
          title="What's new"
          hint={`v${Constants.expoConfig?.version ?? '—'}`}
          onPress={() =>
            Alert.alert(
              'What\'s new',
              'Release notes will appear here as we ship updates. For now, follow the changelog in your pull-request feed.',
            )
          }
        />

        <Text style={[styles.section, { color: t.muted }]}>Legal</Text>
        <SettingsRow
          title="Terms of Service"
          onPress={() => {
            Linking.openURL('https://lifedashboard.app/terms').catch(() => {
              Alert.alert(
                'Coming soon',
                'Terms of Service will be hosted at lifedashboard.app/terms before TestFlight.',
              );
            });
          }}
        />
        <SettingsRow
          title="Privacy Policy"
          onPress={() => {
            Linking.openURL('https://lifedashboard.app/privacy').catch(() => {
              Alert.alert(
                'Coming soon',
                'Privacy Policy will be hosted at lifedashboard.app/privacy before TestFlight.',
              );
            });
          }}
        />
        <SettingsRow
          title="Open-source licenses"
          onPress={() =>
            Alert.alert(
              'Open-source licenses',
              'Full license list ships in the next build. Built on React Native, Expo, TypeScript, Flask, and many more — thanks to all the open-source maintainers who make this possible.',
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

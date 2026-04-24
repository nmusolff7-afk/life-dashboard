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
        <SettingsRow title="FAQ" hint="Common questions" onPress={() => router.push('/settings/faq')} />
        <SettingsRow title="Contact support" hint="Email the team" onPress={handleContact} />
        <SettingsRow title="Give feedback" hint="Share ideas + bug reports" onPress={handleFeedback} />
        <Text style={[styles.footer, { color: t.subtle }]}>
          Life Dashboard v{Constants.expoConfig?.version ?? '—'}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 8, paddingBottom: 40 },
  footer: { fontSize: 11, textAlign: 'center', marginTop: 24 },
});

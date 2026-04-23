import { Stack } from 'expo-router';
import Constants from 'expo-constants';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SettingsRow } from '../../components/apex';
import { useTokens } from '../../lib/theme';

export default function Support() {
  const t = useTokens();
  const stub = (feature: string) => () => Alert.alert('Skeleton', `${feature} ships in a later phase.`);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: 'Support' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <SettingsRow title="FAQ" onPress={stub('FAQ')} />
        <SettingsRow title="Contact support" onPress={stub('Contact support')} />
        <SettingsRow title="Give feedback" onPress={stub('Feedback form')} />
        <Text style={[styles.footer, { color: t.subtle }]}>
          Life Dashboard v{Constants.expoConfig?.version ?? '—'} · build skeleton
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 8, paddingBottom: 40 },
  footer: { fontSize: 11, textAlign: 'center', marginTop: 24 },
});

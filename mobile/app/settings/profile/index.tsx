import { Stack, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { SettingsRow } from '../../../components/apex';
import { useTokens } from '../../../lib/theme';

export default function ProfileIndex() {
  const t = useTokens();
  const router = useRouter();

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: 'Profile' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.intro, { color: t.muted }]}>
          Direct-edit sections per PRD v1.27 §4.8.4. Onboarding is first-time-only; individual fields are edited here with minimum-necessary computation per edit.
        </Text>
        <SettingsRow title="Body stats" hint="Height, weight, birthday, sex, body fat" onPress={() => router.push('/settings/profile/body-stats')} />
        <SettingsRow title="Daily life" hint="Occupation, work style, stress" onPress={() => router.push('/settings/profile/daily-life')} />
        <SettingsRow title="Diet preferences" hint="Flags for next AI profile regeneration" onPress={() => router.push('/settings/profile/diet')} />
        <SettingsRow title="Macro targets" hint="Protein / carbs / fat / micros" onPress={() => router.push('/settings/profile/macros')} />
        <SettingsRow title="Advanced overrides" hint="Lock RMR, NEAT, or macro targets" onPress={() => router.push('/settings/profile/advanced')} />
        <SettingsRow title="Regenerate AI profile map" hint="Uses 1 AI call" onPress={() => router.push('/settings/profile/regenerate')} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 8, paddingBottom: 40 },
  intro: { fontSize: 12, lineHeight: 18, marginBottom: 8, fontStyle: 'italic' },
});

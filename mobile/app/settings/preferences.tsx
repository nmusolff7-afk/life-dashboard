import { Stack } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { SettingsRow } from '../../components/apex';
import { SegmentedControl } from '../../components/ui';
import { useTheme, useTokens } from '../../lib/theme';
import type { ThemePreference } from '../../lib/theme';

export default function Preferences() {
  const t = useTokens();
  const { preference, setPreference, resolved } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: 'Preferences' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.sectionLabel, { color: t.muted }]}>Appearance</Text>
        <SegmentedControl<ThemePreference>
          value={preference}
          onChange={setPreference}
          options={[
            { value: 'system', label: 'System' },
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
          ]}
        />
        <Text style={[styles.hint, { color: t.subtle }]}>
          Currently: {resolved}{preference === 'system' ? ' (follows OS)' : ''}.
        </Text>

        <Text style={[styles.sectionLabel, { color: t.muted, marginTop: 16 }]}>Other</Text>
        <SettingsRow title="Units" hint="Imperial / metric (stub)" />
        <SettingsRow title="Language" hint="English / Español (stub)" />
        <SettingsRow title="Haptics" hint="Subtle / full / off (stub)" />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 8, paddingBottom: 40 },
  sectionLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  hint: { fontSize: 12, marginTop: 4, marginBottom: 4 },
});

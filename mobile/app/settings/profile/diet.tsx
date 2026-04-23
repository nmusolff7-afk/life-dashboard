import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '../../../components/apex';
import { useTokens } from '../../../lib/theme';

export default function DietPrefs() {
  const t = useTokens();
  return (
    <View style={[styles.wrap, { backgroundColor: t.bg }]}>
      <Stack.Screen options={{ title: 'Diet preferences' }} />
      <EmptyState icon="🥗" title="Diet preferences editor" description="Saves flag `profile_map_out_of_sync` per §4.8.4 — no automatic AI regeneration." />
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { flex: 1 } });

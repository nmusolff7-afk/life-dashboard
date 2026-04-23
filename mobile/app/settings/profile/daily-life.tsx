import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '../../../components/apex';
import { useTokens } from '../../../lib/theme';

export default function DailyLife() {
  const t = useTokens();
  return (
    <View style={[styles.wrap, { backgroundColor: t.bg }]}>
      <Stack.Screen options={{ title: 'Daily life' }} />
      <EmptyState icon="🏢" title="Daily life editor" description="Occupation, work style, stress. Deterministic NEAT/TDEE/macros recompute on save." />
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { flex: 1 } });

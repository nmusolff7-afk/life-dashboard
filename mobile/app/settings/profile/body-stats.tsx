import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '../../../components/apex';
import { useTokens } from '../../../lib/theme';

export default function BodyStats() {
  const t = useTokens();
  return (
    <View style={[styles.wrap, { backgroundColor: t.bg }]}>
      <Stack.Screen options={{ title: 'Body stats' }} />
      <EmptyState icon="📐" title="Body stats editor" description="Height / weight / birthday / sex / body fat. Deterministic RMR/TDEE/macros recompute on save." />
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { flex: 1 } });

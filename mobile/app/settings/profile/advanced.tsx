import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '../../../components/apex';
import { useTokens } from '../../../lib/theme';

export default function AdvancedOverrides() {
  const t = useTokens();
  return (
    <View style={[styles.wrap, { backgroundColor: t.bg }]}>
      <Stack.Screen options={{ title: 'Advanced' }} />
      <EmptyState icon="⚙️" title="Advanced overrides" description="Lock RMR, NEAT, or macro targets with a manual override." />
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { flex: 1 } });

import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '../../../components/apex';
import { useTokens } from '../../../lib/theme';

export default function MacroTargets() {
  const t = useTokens();
  return (
    <View style={[styles.wrap, { backgroundColor: t.bg }]}>
      <Stack.Screen options={{ title: 'Macro targets' }} />
      <EmptyState icon="🎯" title="Macro targets editor" description="Protein / carbs / fat / sugar / fiber / sodium sliders with Lock toggle." />
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { flex: 1 } });

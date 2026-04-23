import { Stack } from 'expo-router';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../../components/ui';
import { useTokens } from '../../../lib/theme';

export default function RegenerateAI() {
  const t = useTokens();
  return (
    <View style={[styles.wrap, { backgroundColor: t.bg }]}>
      <Stack.Screen options={{ title: 'Regenerate profile' }} />
      <View style={styles.body}>
        <Text style={styles.icon}>✨</Text>
        <Text style={[styles.title, { color: t.text }]}>Regenerate AI profile map</Text>
        <Text style={[styles.subtitle, { color: t.muted }]}>
          This will use 1 AI call and update your personalization profile to reflect recent changes (body stats, diet preferences, work style).
        </Text>
      </View>
      <Button
        title="Regenerate"
        onPress={() => Alert.alert('Skeleton', 'Regeneration ships in the real build.')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 24, justifyContent: 'space-between' },
  body: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  icon: { fontSize: 64 },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 320 },
});

import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/ui';
import { useTokens } from '../../lib/theme';

export default function BiometricScreen() {
  const t = useTokens();
  const router = useRouter();
  const next = () => router.replace('/(onboarding)/step-1');

  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
      <View style={styles.body}>
        <Text style={[styles.emoji]}>🔐</Text>
        <Text style={[styles.title, { color: t.text }]}>Secure Life Dashboard</Text>
        <Text style={[styles.subtitle, { color: t.muted }]}>
          Unlock the app instantly without typing a password. You can change this any time in
          Settings.
        </Text>
      </View>
      <View style={styles.actions}>
        <Button title="Enable Face ID" onPress={next} />
        <Button title="Skip for now" variant="ghost" onPress={next} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'space-between' },
  body: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14 },
  emoji: { fontSize: 72 },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 15, textAlign: 'center', lineHeight: 22, maxWidth: 320 },
  actions: { gap: 12, paddingBottom: 24 },
});

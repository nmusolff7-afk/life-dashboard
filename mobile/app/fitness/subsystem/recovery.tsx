import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTokens } from '../../../lib/theme';

export default function RecoveryDetail() {
  const t = useTokens();
  const router = useRouter();

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen
        options={{
          title: 'Recovery',
          headerStyle: { backgroundColor: t.bg },
          headerTintColor: t.text,
          headerShadowVisible: false,
        }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.emptyCard, { backgroundColor: t.surface, borderColor: t.border }]}>
          <View style={[styles.iconWrap, { backgroundColor: t.surface2 }]}>
            <Ionicons name="heart-circle-outline" size={32} color={t.fitness} />
          </View>
          <Text style={[styles.title, { color: t.text }]}>Connect Apple Health to activate Recovery</Text>
          <Text style={[styles.body, { color: t.muted }]}>
            Once HRV data flows in, Life Dashboard will show:
          </Text>
          <View style={styles.bullets}>
            <Bullet text="HRV trend vs your 14-day exponential moving average" />
            <Bullet text="Readiness signal combining HRV + sleep + training load" />
            <Bullet text="Rest-day balance — too many hard sessions back-to-back gets flagged" />
          </View>
          <Pressable
            onPress={() => router.push('/settings/connections')}
            style={({ pressed }) => [
              styles.cta,
              { backgroundColor: t.accent, opacity: pressed ? 0.85 : 1 },
            ]}>
            <Text style={styles.ctaLabel}>Go to connections</Text>
          </Pressable>
        </View>

        <Text style={[styles.note, { color: t.subtle }]}>
          Recovery requires a wearable that reports HRV. Until it's connected,
          your Fitness score weight is redistributed to the other subsystems.
        </Text>
      </ScrollView>
    </View>
  );
}

function Bullet({ text }: { text: string }) {
  const t = useTokens();
  return (
    <View style={styles.bulletRow}>
      <View style={[styles.bulletDot, { backgroundColor: t.fitness }]} />
      <Text style={[styles.bulletText, { color: t.body }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40, gap: 14 },
  emptyCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '700', textAlign: 'center', marginTop: 4 },
  body: { fontSize: 13, textAlign: 'center', marginTop: 2 },
  bullets: { alignSelf: 'stretch', gap: 6, marginTop: 6, marginBottom: 4 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  bulletDot: { width: 4, height: 4, borderRadius: 2, marginTop: 7 },
  bulletText: { fontSize: 12, flex: 1, lineHeight: 18 },
  cta: { borderRadius: 14, paddingHorizontal: 22, paddingVertical: 12, marginTop: 8 },
  ctaLabel: { color: '#fff', fontSize: 14, fontWeight: '700' },
  note: { fontSize: 11, fontStyle: 'italic', lineHeight: 16, textAlign: 'center' },
});

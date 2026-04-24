import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useHealthConnection } from '../../../lib/useHealthConnection';
import { useTokens } from '../../../lib/theme';

export default function SleepDetail() {
  const t = useTokens();
  const router = useRouter();
  const health = useHealthConnection();

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen
        options={{
          title: 'Sleep',
          headerStyle: { backgroundColor: t.bg },
          headerTintColor: t.text,
          headerShadowVisible: false,
        }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {health.connected ? <SyncingState platform={health.platform} /> : <DisconnectedState onConnect={() => router.push('/settings/connections')} />}

        <Text style={[styles.note, { color: t.subtle }]}>
          Sleep is one of two Fitness subsystems (with Recovery) that requires
          a wearable or HealthKit connection. Your Fitness score redistributes
          weight to the other subsystems until these are connected.
        </Text>
      </ScrollView>
    </View>
  );
}

function SyncingState({ platform }: { platform: string | null }) {
  const t = useTokens();
  const label = platform === 'health-connect' ? 'Health Connect' : 'Apple Health';
  return (
    <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.fitness, borderWidth: 1.5 }]}>
      <View style={[styles.iconWrap, { backgroundColor: t.surface2 }]}>
        <Ionicons name="moon-outline" size={28} color={t.fitness} />
      </View>
      <Text style={[styles.title, { color: t.text }]}>{label} connected</Text>
      <Text style={[styles.body, { color: t.muted }]}>
        Native data pipe goes live in a coming build. As soon as it does, this
        screen will start showing:
      </Text>
      <View style={styles.bullets}>
        <Bullet text="Nightly sleep duration vs your 30-day baseline" />
        <Bullet text="Bedtime + wake-time consistency (14-day SD)" />
        <Bullet text="REM / deep / light breakdown when available" />
      </View>
      <View style={[styles.statusChip, { backgroundColor: t.surface2 }]}>
        <Ionicons name="sync-outline" size={12} color={t.fitness} />
        <Text style={[styles.statusLabel, { color: t.fitness }]}>Syncing — data pending</Text>
      </View>
    </View>
  );
}

function DisconnectedState({ onConnect }: { onConnect: () => void }) {
  const t = useTokens();
  return (
    <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
      <View style={[styles.iconWrap, { backgroundColor: t.surface2 }]}>
        <Ionicons name="moon-outline" size={32} color={t.fitness} />
      </View>
      <Text style={[styles.title, { color: t.text }]}>Connect Apple Health to activate Sleep</Text>
      <Text style={[styles.body, { color: t.muted }]}>
        Once connected, Life Dashboard will show:
      </Text>
      <View style={styles.bullets}>
        <Bullet text="Nightly sleep duration vs your personal baseline" />
        <Bullet text="Night-to-night consistency (SD of duration)" />
        <Bullet text="REM / deep / light breakdown when available" />
        <Bullet text="7-day trend chart + this-week vs baseline summary" />
      </View>
      <Pressable
        onPress={onConnect}
        style={({ pressed }) => [
          styles.cta,
          { backgroundColor: t.accent, opacity: pressed ? 0.85 : 1 },
        ]}>
        <Text style={styles.ctaLabel}>Go to connections</Text>
      </Pressable>
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
  card: {
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
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
    marginTop: 6,
  },
  statusLabel: { fontSize: 11, fontWeight: '600' },
  note: { fontSize: 11, fontStyle: 'italic', lineHeight: 16, textAlign: 'center' },
});

import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { healthHubLabel, useHealthData, useHealthToday, type HealthDay } from '../../../lib/hooks/useHealthData';
import { useTokens } from '../../../lib/theme';

/** Sleep subsystem detail. Reads `health_daily.sleep_minutes` from the
 *  HC custom Expo Module pipeline (Android) — `useHealthData.permitted`
 *  drives the empty-state vs data-state branch. iOS HealthKit hasn't
 *  shipped (Backlog → Icebox), so this screen will stay in the
 *  empty-state on iOS until that work lands. */
export default function SleepDetail() {
  const t = useTokens();
  const router = useRouter();
  const hc = useHealthData();
  const { today, history, loading } = useHealthToday();

  const hasAnySleepRow = today?.sleep_minutes != null
    || history.some((h) => h.sleep_minutes != null);

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
        {/* Three states: not-permitted, permitted-but-no-data,
         *  permitted-with-data. Loading state collapses to a spinner. */}
        {loading && !today ? (
          <ActivityIndicator color={t.accent} style={{ paddingVertical: 24 }} />
        ) : !hc.permitted ? (
          <DisconnectedState onConnect={() => router.push('/settings/connections')} />
        ) : !hasAnySleepRow ? (
          <NoDataState onSync={hc.sync} loading={hc.loading} />
        ) : (
          <SleepDataState today={today} history={history} />
        )}

        <Text style={[styles.note, { color: t.subtle }]}>
          Sleep is one of the Fitness subsystems that requires
          {' ' + healthHubLabel()}. Your Fitness score redistributes weight
          to the other subsystems until enough data accrues.
        </Text>
      </ScrollView>
    </View>
  );
}

function SleepDataState({ today, history }: {
  today: HealthDay | null;
  history: HealthDay[];
}) {
  const t = useTokens();

  // Last 7 nights with non-null sleep_minutes for the trend bars.
  const trend = useMemo(() => {
    const rows = [...history].reverse().slice(-7);
    return rows
      .map((r) => r.sleep_minutes ?? 0)
      .filter((m) => m > 0);
  }, [history]);

  const avgMin = trend.length > 0
    ? Math.round(trend.reduce((s, m) => s + m, 0) / trend.length)
    : null;

  const todayMin = today?.sleep_minutes ?? null;
  const todayLabel = todayMin != null ? formatHM(todayMin) : '—';
  const avgLabel = avgMin != null ? formatHM(avgMin) : '—';

  return (
    <>
      <View style={[styles.heroCard, { backgroundColor: t.surface, borderColor: t.border }]}>
        <Text style={[styles.heroLabel, { color: t.muted }]}>LAST NIGHT</Text>
        <Text style={[styles.heroValue, { color: t.text }]}>{todayLabel}</Text>
        <Text style={[styles.heroHint, { color: t.subtle }]}>
          {trend.length > 0 ? `7-day avg: ${avgLabel}` : 'Building your baseline…'}
        </Text>
      </View>

      {trend.length > 0 ? (
        <View style={[styles.trendCard, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text style={[styles.trendTitle, { color: t.muted }]}>Last 7 nights</Text>
          <View style={styles.bars}>
            {trend.map((m, i) => {
              const max = Math.max(1, ...trend);
              const pct = m / max;
              return (
                <View key={i} style={styles.barCol}>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { backgroundColor: t.fitness, height: `${pct * 100}%` }]} />
                  </View>
                  <Text style={[styles.barLabel, { color: t.subtle }]}>{formatHMShort(m)}</Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}
    </>
  );
}

function NoDataState({ onSync, loading }: { onSync: () => Promise<void>; loading: boolean }) {
  const t = useTokens();
  return (
    <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
      <View style={[styles.iconWrap, { backgroundColor: t.surface2 }]}>
        <Ionicons name="moon-outline" size={28} color={t.fitness} />
      </View>
      <Text style={[styles.title, { color: t.text }]}>{healthHubLabel()} connected — no sleep data yet</Text>
      <Text style={[styles.body, { color: t.muted }]}>
        Most Android phones don&apos;t track sleep natively. A wearable
        (Garmin, Pixel Watch, Fitbit, Oura) needs to be writing to
        {' ' + healthHubLabel()}. Open your watch&apos;s companion app
        → settings → Health Connect → make sure Sleep is enabled, then
        tap Sync below.
      </Text>
      <Pressable
        onPress={() => { void onSync(); }}
        disabled={loading}
        style={({ pressed }) => [
          styles.cta,
          { backgroundColor: t.accent, opacity: pressed || loading ? 0.6 : 1 },
        ]}>
        <Text style={styles.ctaLabel}>{loading ? 'Syncing…' : 'Sync now'}</Text>
      </Pressable>
    </View>
  );
}

function DisconnectedState({ onConnect }: { onConnect: () => void }) {
  const t = useTokens();
  const hub = healthHubLabel();
  return (
    <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
      <View style={[styles.iconWrap, { backgroundColor: t.surface2 }]}>
        <Ionicons name="moon-outline" size={32} color={t.fitness} />
      </View>
      <Text style={[styles.title, { color: t.text }]}>Connect {hub} to activate Sleep</Text>
      <Text style={[styles.body, { color: t.muted }]}>
        Once connected, Life Dashboard will show:
      </Text>
      <View style={styles.bullets}>
        <Bullet text="Nightly sleep duration vs your personal baseline" />
        <Bullet text="Night-to-night consistency (SD of duration)" />
        <Bullet text="REM / deep / light breakdown when available" />
        <Bullet text="7-night trend bars" />
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

function formatHM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

function formatHMShort(minutes: number): string {
  const h = (minutes / 60).toFixed(1);
  return `${h}h`;
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40, gap: 14 },
  heroCard: { borderRadius: 14, borderWidth: 1, padding: 18, alignItems: 'center', gap: 4 },
  heroLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  heroValue: { fontSize: 40, fontWeight: '700', letterSpacing: -1 },
  heroHint: { fontSize: 12 },
  trendCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  trendTitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: 100, gap: 8, marginTop: 6 },
  barCol: { flex: 1, alignItems: 'center', gap: 4 },
  barTrack: { width: '100%', height: 80, justifyContent: 'flex-end' },
  barFill: { width: '100%', borderRadius: 4, minHeight: 2 },
  barLabel: { fontSize: 9, fontWeight: '600' },
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
  note: { fontSize: 11, fontStyle: 'italic', lineHeight: 16, textAlign: 'center' },
});

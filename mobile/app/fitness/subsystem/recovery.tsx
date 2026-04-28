import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { healthHubLabel, useHealthData, useHealthToday, type HealthDay } from '../../../lib/hooks/useHealthData';
import { useTokens } from '../../../lib/theme';

/** Recovery subsystem detail. Reads `health_daily.hrv_ms` and
 *  `resting_hr` from the HC custom Expo Module pipeline (Android).
 *  iOS HealthKit hasn't shipped yet, so this stays in the empty
 *  state on iOS until that work lands. */
export default function RecoveryDetail() {
  const t = useTokens();
  const router = useRouter();
  const hc = useHealthData();
  const { today, history, loading } = useHealthToday();

  const hasHrvData = today?.hrv_ms != null
    || history.some((h) => h.hrv_ms != null);

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
        {loading && !today ? (
          <ActivityIndicator color={t.accent} style={{ paddingVertical: 24 }} />
        ) : !hc.permitted ? (
          <DisconnectedState onConnect={() => router.push('/settings/connections')} />
        ) : !hasHrvData ? (
          <NoDataState onSync={hc.sync} loading={hc.loading} />
        ) : (
          <RecoveryDataState today={today} history={history} />
        )}

        <Text style={[styles.note, { color: t.subtle }]}>
          Recovery requires a wearable that reports HRV via
          {' ' + healthHubLabel()}. Until data flows, Fitness score
          weight redistributes to the other subsystems.
        </Text>
      </ScrollView>
    </View>
  );
}

function RecoveryDataState({ today, history }: {
  today: HealthDay | null;
  history: HealthDay[];
}) {
  const t = useTokens();

  // 14-day HRV EMA (PRD §4.6 spec) — α=2/(N+1) over the last 14 days
  // of non-null hrv_ms readings, falling back to a simple mean when
  // there are fewer than 3 days.
  const hrvSeries = useMemo(() => {
    return [...history]
      .reverse()
      .map((h) => h.hrv_ms)
      .filter((v): v is number => v != null)
      .slice(-14);
  }, [history]);

  const hrvEma = useMemo(() => {
    if (hrvSeries.length === 0) return null;
    if (hrvSeries.length < 3) {
      return Math.round(hrvSeries.reduce((s, v) => s + v, 0) / hrvSeries.length);
    }
    const alpha = 2 / (hrvSeries.length + 1);
    let ema = hrvSeries[0];
    for (let i = 1; i < hrvSeries.length; i++) {
      ema = hrvSeries[i] * alpha + ema * (1 - alpha);
    }
    return Math.round(ema);
  }, [hrvSeries]);

  const todayHrv = today?.hrv_ms ?? null;
  const todayRhr = today?.resting_hr ?? null;
  const trend = todayHrv != null && hrvEma != null
    ? todayHrv >= hrvEma ? 'up' : 'down'
    : null;

  return (
    <>
      <View style={[styles.heroCard, { backgroundColor: t.surface, borderColor: t.border }]}>
        <Text style={[styles.heroLabel, { color: t.muted }]}>HRV TODAY</Text>
        <Text style={[styles.heroValue, { color: t.text }]}>
          {todayHrv != null ? todayHrv : '—'}
          <Text style={[styles.heroUnit, { color: t.muted }]}> ms</Text>
        </Text>
        <Text style={[styles.heroHint, { color: t.subtle }]}>
          {hrvEma != null ? `14-day EMA: ${hrvEma}ms` : 'Building your baseline…'}
          {trend === 'up' ? ' · trending up' : trend === 'down' ? ' · trending down' : ''}
        </Text>
      </View>

      <View style={[styles.statCard, { backgroundColor: t.surface, borderColor: t.border }]}>
        <Text style={[styles.statTitle, { color: t.muted }]}>Resting heart rate</Text>
        <Text style={[styles.statValue, { color: t.text }]}>
          {todayRhr != null ? todayRhr : '—'}
          <Text style={[styles.statUnit, { color: t.muted }]}> bpm</Text>
        </Text>
      </View>

      {hrvSeries.length > 0 ? (
        <View style={[styles.trendCard, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text style={[styles.trendTitle, { color: t.muted }]}>HRV last {hrvSeries.length} days</Text>
          <View style={styles.bars}>
            {hrvSeries.map((v, i) => {
              const max = Math.max(1, ...hrvSeries);
              const pct = v / max;
              return (
                <View key={i} style={styles.barCol}>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { backgroundColor: t.fitness, height: `${pct * 100}%` }]} />
                  </View>
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
        <Ionicons name="heart-circle-outline" size={28} color={t.fitness} />
      </View>
      <Text style={[styles.title, { color: t.text }]}>{healthHubLabel()} connected — no HRV data yet</Text>
      <Text style={[styles.body, { color: t.muted }]}>
        HRV + resting heart rate need a wearable that&apos;s writing to
        {' ' + healthHubLabel()}. Make sure your watch&apos;s companion
        app has Health Connect enabled, then tap Sync.
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
        <Ionicons name="heart-circle-outline" size={32} color={t.fitness} />
      </View>
      <Text style={[styles.title, { color: t.text }]}>Connect {hub} to activate Recovery</Text>
      <Text style={[styles.body, { color: t.muted }]}>
        Once HRV data flows in, Life Dashboard will show:
      </Text>
      <View style={styles.bullets}>
        <Bullet text="HRV trend vs your 14-day exponential moving average" />
        <Bullet text="Resting heart rate" />
        <Bullet text="Readiness signal combining HRV + sleep + training load" />
        <Bullet text="Rest-day balance — too many hard sessions back-to-back gets flagged" />
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
  heroCard: { borderRadius: 14, borderWidth: 1, padding: 18, alignItems: 'center', gap: 4 },
  heroLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  heroValue: { fontSize: 40, fontWeight: '700', letterSpacing: -1 },
  heroUnit: { fontSize: 14, fontWeight: '500', letterSpacing: 0 },
  heroHint: { fontSize: 12 },
  statCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 4 },
  statTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  statValue: { fontSize: 22, fontWeight: '700' },
  statUnit: { fontSize: 12, fontWeight: '500' },
  trendCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  trendTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: 70, gap: 4, marginTop: 6 },
  barCol: { flex: 1, alignItems: 'center' },
  barTrack: { width: '100%', height: 60, justifyContent: 'flex-end' },
  barFill: { width: '100%', borderRadius: 4, minHeight: 2 },
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

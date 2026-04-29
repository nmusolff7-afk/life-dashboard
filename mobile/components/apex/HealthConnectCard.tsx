import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { apiFetch } from '../../lib/api';
import { useHealthData } from '../../lib/hooks/useHealthData';
import { useTokens } from '../../lib/theme';

interface HealthDay {
  steps: number | null;
  sleep_minutes: number | null;
  resting_hr: number | null;
  hrv_ms: number | null;
  active_kcal: number | null;
  synced_at?: string;
}

interface HealthTodayResponse {
  today: HealthDay;
  history: HealthDay[];
}

/** Hook fetching the backend's stored Health Connect aggregates. The
 *  numbers shown here come from `health_daily` — written by the
 *  custom Expo Module on every sync. */
function useHealthToday() {
  const [data, setData] = useState<HealthTodayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const refetch = async () => {
    try {
      const res = await apiFetch('/api/health/today');
      if (!res.ok) return;
      setData(await res.json());
    } finally { setLoading(false); }
  };
  useEffect(() => { void refetch(); }, []);
  return { data, loading, refetch };
}

/** Surface for Health Connect aggregates on the Fitness Today tab.
 *  Five glanceable metrics in a row + a tap-to-sync action. Replaces
 *  the "I don't know what HC is doing" gap — every metric we collect
 *  is shown front and center. */
export function HealthConnectCard() {
  const t = useTokens();
  const router = useRouter();
  const hc = useHealthData();
  const { data, loading, refetch } = useHealthToday();
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const today = data?.today;
  const hasAnyMetric = today && (
    today.steps != null || today.sleep_minutes != null ||
    today.resting_hr != null || today.hrv_ms != null || today.active_kcal != null
  );

  const onSync = async () => {
    if (!hc.permitted) {
      // Fall back to the connect flow if perms aren't granted yet.
      await hc.connect();
    } else {
      setSyncing(true);
      try { await hc.sync(); await refetch(); }
      finally { setSyncing(false); }
    }
  };

  // Tapping the "Not connected" state fires the system permission sheet
  // directly. Founder 2026-04-28: "clicking hc card doesnt do anything"
  // — the card was a static View with no onPress, leaving Settings →
  // Connections as the only entry. Now the card is the entry.
  const onConnectPress = async () => {
    if (connecting) return;
    setConnecting(true);
    try {
      const ok = await hc.connect();
      if (ok) {
        await refetch();
        return;
      }
      if (hc.needsHcApp) {
        Alert.alert(
          'Install Health Connect',
          hc.error || "Health Connect isn't installed or needs an update. Open the Play Store to install/update.",
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Open Play Store',
              onPress: () => {
                Linking.openURL('market://details?id=com.google.android.apps.healthdata').catch(() =>
                  Linking.openURL('https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata'),
                );
              },
            },
          ],
        );
      } else {
        Alert.alert(
          'Permission needed',
          hc.error || "Some Health Connect permissions weren't granted. Try again or open Settings → Connections to retry.",
          [
            { text: 'OK' },
            { text: 'Open Settings', onPress: () => router.push('/settings/connections') },
          ],
        );
      }
    } finally {
      setConnecting(false);
    }
  };

  // Not on Android / module not loaded — render nothing.
  if (!hc.available) return null;

  if (!hc.permitted && !hasAnyMetric) {
    return (
      <Pressable
        onPress={onConnectPress}
        disabled={connecting}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: t.surface,
            borderColor: t.border,
            opacity: pressed || connecting ? 0.7 : 0.85,
          },
        ]}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Ionicons name="heart-outline" size={16} color={t.danger} />
            <Text style={[styles.title, { color: t.text }]}>Health Connect</Text>
          </View>
          <View style={[styles.pill, { borderColor: t.border }]}>
            <Text style={[styles.pillText, { color: t.subtle }]}>
              {connecting ? 'Connecting…' : 'Tap to connect'}
            </Text>
          </View>
        </View>
        <Text style={[styles.sub, { color: t.muted }]}>
          Tap to grant Steps / Sleep / Heart Rate / HRV / Active Calories. Or wire up in Settings → Connections.
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons name="heart-outline" size={16} color={t.danger} />
          <Text style={[styles.title, { color: t.text }]}>Health Connect</Text>
        </View>
        <Pressable onPress={onSync} disabled={syncing || hc.loading} hitSlop={10}>
          <Text style={[styles.linkText, { color: t.accent, opacity: (syncing || hc.loading) ? 0.5 : 1 }]}>
            {syncing || hc.loading ? 'Syncing…' : 'Sync now'}
          </Text>
        </Pressable>
      </View>

      {loading && !data ? (
        <ActivityIndicator color={t.accent} />
      ) : !hasAnyMetric ? (
        <Text style={[styles.summaryEmpty, { color: t.muted }]}>
          No data yet today. Tap Sync now after some movement / sleep is recorded by your phone or wearable.
        </Text>
      ) : (
        <View style={styles.statsGrid}>
          <Stat label="Steps" value={fmtNum(today!.steps)} unit="" color={t.accent} muted={t.muted} />
          <Stat label="Sleep" value={fmtSleep(today!.sleep_minutes)} unit="" color={t.text} muted={t.muted} />
          <Stat label="Resting HR" value={fmtNum(today!.resting_hr)} unit="bpm" color={t.text} muted={t.muted} />
          <Stat label="HRV" value={fmtNum(today!.hrv_ms)} unit="ms" color={t.text} muted={t.muted} />
          <Stat label="Active" value={fmtNum(today!.active_kcal)} unit="kcal" color={t.cal} muted={t.muted} />
        </View>
      )}
    </View>
  );
}

function Stat({ label, value, unit, color, muted }: {
  label: string; value: string; unit: string; color: string; muted: string;
}) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>
        {value}
        {unit ? <Text style={[styles.statUnit, { color: muted }]}> {unit}</Text> : null}
      </Text>
      <Text style={[styles.statLabel, { color: muted }]}>{label}</Text>
    </View>
  );
}

function fmtNum(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1000) return n.toLocaleString();
  return String(n);
}

function fmtSleep(min: number | null | undefined): string {
  if (min == null) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 6 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 14, fontWeight: '700' },
  sub: { fontSize: 12 },
  pill: { borderWidth: 1, borderRadius: 100, paddingVertical: 3, paddingHorizontal: 10 },
  pillText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  linkText: { fontSize: 12, fontWeight: '600' },
  summaryEmpty: { fontSize: 12, fontStyle: 'italic', marginTop: 4 },

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    gap: 12,
  },
  stat: { minWidth: 70, alignItems: 'flex-start', gap: 2 },
  statValue: { fontSize: 18, fontWeight: '800' },
  statUnit: { fontSize: 10, fontWeight: '500' },
  statLabel: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
});

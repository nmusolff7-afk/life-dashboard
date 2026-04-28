import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  fetchStravaActivityDetail,
  type StravaActivityDetail,
  type StravaSplit,
  type StravaZoneBucket,
} from '../../../lib/api/strava';
import { useTokens } from '../../../lib/theme';
import { useUnits } from '../../../lib/useUnits';

/** Strava activity detail (BUILD_PLAN_v2 §14.5.1).
 *
 *  Lazy server-side fetch on first hit (Strava /activities/{id} +
 *  /streams + /zones), cached in `strava_activity_detail`. Renders:
 *    - hero map preview (Google Static Maps from polyline)
 *    - summary stats grid
 *    - elevation profile (line chart from altitude stream)
 *    - HR zones bar chart (from /zones endpoint)
 *    - per-mile/per-km splits table
 *
 *  Reached from WorkoutHistoryList when user taps a Strava-sourced
 *  workout. Activity ID matches workout_logs.strava_activity_id.
 */
export default function StravaActivityDetailScreen() {
  const t = useTokens();
  const units = useUnits();
  const params = useLocalSearchParams<{ id?: string; name?: string }>();
  const id = (params.id || '').trim();
  const headerTitle = (params.name || 'Activity').trim();

  const [data, setData] = useState<StravaActivityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchStravaActivityDetail(id)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError((e as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  if (loading && !data) {
    return (
      <View style={[styles.centered, { backgroundColor: t.bg }]}>
        <Stack.Screen options={{ title: headerTitle }} />
        <ActivityIndicator color={t.accent} />
        <Text style={[styles.loadingHint, { color: t.muted }]}>
          Pulling details from Strava…
        </Text>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={[styles.centered, { backgroundColor: t.bg }]}>
        <Stack.Screen options={{ title: headerTitle }} />
        <Ionicons name="alert-circle-outline" size={28} color={t.danger} />
        <Text style={[styles.errorTitle, { color: t.text }]}>
          Couldn&apos;t load activity
        </Text>
        <Text style={[styles.errorBody, { color: t.muted }]}>
          {error || 'Unknown error'}
        </Text>
      </View>
    );
  }

  const { distance_m, moving_time_s, elevation_gain_m,
          avg_hr, max_hr, avg_speed_mps, avg_watts } = data;

  const isMetric = units.units === 'metric';
  const distanceUnit: 'mi' | 'km' = isMetric ? 'km' : 'mi';
  const formatDistance = (meters: number) => {
    const value = isMetric ? meters / 1000 : meters / 1609.344;
    return `${value.toFixed(2)} ${distanceUnit}`;
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: headerTitle }} />
      <ScrollView contentContainerStyle={styles.content}>

        {/* Map hero — Static Maps API URL pre-built server-side. */}
        {data.map_url ? (
          <View style={[styles.mapWrap, { borderColor: t.border }]}>
            <Image source={{ uri: data.map_url }} style={styles.mapImage} resizeMode="cover" />
          </View>
        ) : (
          <View style={[styles.mapPlaceholder, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Ionicons name="map-outline" size={28} color={t.subtle} />
            <Text style={[styles.mapPlaceholderText, { color: t.muted }]}>
              No GPS route for this activity
            </Text>
          </View>
        )}

        {/* Summary stats — 4-cell grid. Hides cells with no data. */}
        <View style={[styles.statsCard, { backgroundColor: t.surface, borderColor: t.border }]}>
          <View style={styles.statsRow}>
            <Stat
              label="Distance"
              value={distance_m ? formatDistance(distance_m) : '—'}
              accent={t.fitness}
              muted={t.muted}
              text={t.text}
            />
            <Stat
              label="Time"
              value={moving_time_s ? formatDuration(moving_time_s) : '—'}
              accent={t.text}
              muted={t.muted}
              text={t.text}
            />
            <Stat
              label="Pace"
              value={paceLabel(moving_time_s, distance_m, distanceUnit)}
              accent={t.text}
              muted={t.muted}
              text={t.text}
            />
            <Stat
              label="Climb"
              value={elevation_gain_m != null
                ? `${Math.round(elevation_gain_m * (isMetric ? 1 : 3.281))} ${isMetric ? 'm' : 'ft'}`
                : '—'}
              accent={t.text}
              muted={t.muted}
              text={t.text}
            />
          </View>
          {(avg_hr != null || avg_speed_mps != null || avg_watts != null) ? (
            <View style={[styles.statsRow, { marginTop: 12 }]}>
              {avg_hr != null ? (
                <Stat
                  label="Avg HR"
                  value={`${avg_hr} bpm`}
                  accent={t.danger}
                  muted={t.muted}
                  text={t.text}
                />
              ) : null}
              {max_hr != null ? (
                <Stat
                  label="Max HR"
                  value={`${max_hr} bpm`}
                  accent={t.text}
                  muted={t.muted}
                  text={t.text}
                />
              ) : null}
              {avg_watts != null ? (
                <Stat
                  label="Avg power"
                  value={`${Math.round(avg_watts)} W`}
                  accent={t.text}
                  muted={t.muted}
                  text={t.text}
                />
              ) : null}
            </View>
          ) : null}
        </View>

        {/* Elevation profile — derived from altitude stream. */}
        {data.streams?.altitude && data.streams.altitude.length > 1 ? (
          <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={[styles.cardLabel, { color: t.muted }]}>Elevation</Text>
            <ElevationSparkline
              altitudes={data.streams.altitude}
              accent={t.accent}
              line={t.muted}
            />
          </View>
        ) : null}

        {/* HR zones — bar chart of time spent per zone. */}
        {(() => {
          const hrZone = data.zones?.find((z) => z.type === 'heartrate');
          if (!hrZone || !hrZone.distribution_buckets?.length) return null;
          return (
            <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
              <Text style={[styles.cardLabel, { color: t.muted }]}>Heart-rate zones</Text>
              <ZonesBars buckets={hrZone.distribution_buckets} text={t.text} muted={t.muted} accent={t.danger} />
            </View>
          );
        })()}

        {/* Splits table. */}
        {data.splits && data.splits.length > 0 ? (
          <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={[styles.cardLabel, { color: t.muted }]}>
              Splits ({isMetric ? 'per km' : 'per mile'})
            </Text>
            <SplitsTable splits={data.splits} unitLabel={distanceUnit} text={t.text} muted={t.muted} border={t.border} />
          </View>
        ) : null}

        <Text style={[styles.footnote, { color: t.subtle }]}>
          Last fetched {formatLastFetched(data.fetched_at)} · Strava ID {data.activity_id}
        </Text>
      </ScrollView>
    </View>
  );
}

// ── Subcomponents ─────────────────────────────────────────────────

function Stat({ label, value, accent, muted, text }: {
  label: string; value: string; accent: string; muted: string; text: string;
}) {
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statValue, { color: accent || text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: muted }]}>{label}</Text>
    </View>
  );
}

function ElevationSparkline({
  altitudes, accent, line,
}: { altitudes: number[]; accent: string; line: string }) {
  // Pure-View SVG-less sparkline: build a series of vertical bars
  // whose heights are normalized against the altitude range. Avoids
  // adding a chart lib for a single line viz.
  const min = Math.min(...altitudes);
  const max = Math.max(...altitudes);
  const range = max - min || 1;
  const tokens = useTokens();
  return (
    <View style={styles.sparkWrap}>
      <View style={[styles.sparkAxis, { borderColor: line }]}>
        {altitudes.map((alt, i) => {
          const h = ((alt - min) / range) * 100;
          return (
            <View
              key={i}
              style={[
                styles.sparkBar,
                {
                  height: `${Math.max(2, h)}%`,
                  backgroundColor: accent,
                  width: `${100 / altitudes.length}%`,
                },
              ]}
            />
          );
        })}
      </View>
      <View style={styles.sparkLabels}>
        <Text style={[styles.sparkAxisLabel, { color: tokens.muted }]}>
          min {Math.round(min)}m
        </Text>
        <Text style={[styles.sparkAxisLabel, { color: tokens.muted }]}>
          max {Math.round(max)}m
        </Text>
      </View>
    </View>
  );
}

function ZonesBars({
  buckets, text, muted, accent,
}: { buckets: StravaZoneBucket[]; text: string; muted: string; accent: string }) {
  const totalSec = buckets.reduce((s, b) => s + (b.time || 0), 0);
  if (!totalSec) {
    return <Text style={[{ fontSize: 12, fontStyle: 'italic', color: muted, marginTop: 4 }]}>No HR samples in zones.</Text>;
  }
  return (
    <View style={{ marginTop: 6, gap: 6 }}>
      {buckets.map((b, i) => {
        const pct = (b.time / totalSec) * 100;
        const label = b.max >= 300 ? `Z${i + 1}: ${b.min}+ bpm` : `Z${i + 1}: ${b.min}–${b.max} bpm`;
        return (
          <View key={i} style={{ gap: 2 }}>
            <View style={styles.zoneRow}>
              <Text style={[styles.zoneLabel, { color: text }]}>{label}</Text>
              <Text style={[styles.zoneTime, { color: muted }]}>
                {formatDuration(b.time)} · {pct.toFixed(0)}%
              </Text>
            </View>
            <View style={[styles.zoneTrack, { backgroundColor: muted + '22' }]}>
              <View
                style={[
                  styles.zoneFill,
                  { width: `${pct}%`, backgroundColor: accent },
                ]}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function SplitsTable({
  splits, unitLabel, text, muted, border,
}: {
  splits: StravaSplit[];
  unitLabel: 'mi' | 'km';
  text: string; muted: string; border: string;
}) {
  return (
    <View style={{ marginTop: 6 }}>
      <View style={[styles.splitsHeader, { borderBottomColor: border }]}>
        <Text style={[styles.splitsHeadCell, { color: muted, flex: 0.6 }]}>#</Text>
        <Text style={[styles.splitsHeadCell, { color: muted, flex: 1 }]}>Pace</Text>
        <Text style={[styles.splitsHeadCell, { color: muted, flex: 1 }]}>Time</Text>
        <Text style={[styles.splitsHeadCell, { color: muted, flex: 1 }]}>HR</Text>
      </View>
      {splits.slice(0, 30).map((s, i) => {
        const paceLabel = s.average_speed > 0
          ? formatPace(s.average_speed, unitLabel)
          : '—';
        return (
          <View key={i} style={[styles.splitsRow, { borderBottomColor: border }]}>
            <Text style={[styles.splitsCell, { color: muted, flex: 0.6 }]}>{s.split}</Text>
            <Text style={[styles.splitsCell, { color: text, flex: 1 }]}>{paceLabel}</Text>
            <Text style={[styles.splitsCell, { color: text, flex: 1 }]}>
              {formatDuration(s.moving_time)}
            </Text>
            <Text style={[styles.splitsCell, { color: text, flex: 1 }]}>
              {s.average_heartrate ? `${Math.round(s.average_heartrate)}` : '—'}
            </Text>
          </View>
        );
      })}
      {splits.length > 30 ? (
        <Text style={[{ fontSize: 11, color: muted, marginTop: 6, fontStyle: 'italic' }]}>
          {splits.length - 30} more splits not shown.
        </Text>
      ) : null}
    </View>
  );
}

// ── Format helpers ────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function paceLabel(
  movingTime: number | null,
  distanceM: number | null,
  unit: 'mi' | 'km',
): string {
  if (!movingTime || !distanceM) return '—';
  const distanceUnits = unit === 'mi' ? distanceM / 1609.344 : distanceM / 1000;
  if (!distanceUnits) return '—';
  const secPerUnit = movingTime / distanceUnits;
  const min = Math.floor(secPerUnit / 60);
  const sec = Math.round(secPerUnit % 60);
  return `${min}:${String(sec).padStart(2, '0')} /${unit}`;
}

function formatPace(metersPerSecond: number, unit: 'mi' | 'km'): string {
  if (!metersPerSecond) return '—';
  const secPerUnit = unit === 'mi' ? 1609.344 / metersPerSecond : 1000 / metersPerSecond;
  const min = Math.floor(secPerUnit / 60);
  const sec = Math.round(secPerUnit % 60);
  return `${min}:${String(sec).padStart(2, '0')}`;
}

function formatLastFetched(iso: string): string {
  if (!iso) return 'just now';
  try {
    const ms = new Date(iso).getTime();
    if (isNaN(ms)) return 'just now';
    const diffMin = Math.round((Date.now() - ms) / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffMin < 1440) return `${Math.round(diffMin / 60)}h ago`;
    return `${Math.round(diffMin / 1440)}d ago`;
  } catch { return ''; }
}

// ── Styles ────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  loadingHint: { fontSize: 12 },
  errorTitle: { fontSize: 16, fontWeight: '700', marginTop: 8 },
  errorBody: { fontSize: 12, textAlign: 'center' },

  content: { padding: 16, paddingBottom: 60, gap: 12 },

  mapWrap: { borderWidth: 1, borderRadius: 14, overflow: 'hidden', aspectRatio: 600 / 300 },
  mapImage: { width: '100%', height: '100%' },
  mapPlaceholder: {
    borderWidth: 1, borderRadius: 14, aspectRatio: 600 / 300,
    alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  mapPlaceholderText: { fontSize: 12, fontStyle: 'italic' },

  statsCard: { borderWidth: 1, borderRadius: 16, padding: 14 },
  statsRow: { flexDirection: 'row' },
  statCell: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 16, fontWeight: '800' },
  statLabel: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },

  card: { borderWidth: 1, borderRadius: 14, padding: 14 },
  cardLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },

  // Elevation sparkline
  sparkWrap: { gap: 4 },
  sparkAxis: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 80,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sparkBar: { borderRadius: 1 },
  sparkLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  sparkAxisLabel: { fontSize: 10 },

  // HR zones
  zoneRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  zoneLabel: { fontSize: 12, fontWeight: '600' },
  zoneTime: { fontSize: 11 },
  zoneTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  zoneFill: { height: 6 },

  // Splits
  splitsHeader: {
    flexDirection: 'row', paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  splitsHeadCell: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  splitsRow: {
    flexDirection: 'row', paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  splitsCell: { fontSize: 12 },

  footnote: { fontSize: 11, fontStyle: 'italic', marginTop: 4, textAlign: 'center' },
});

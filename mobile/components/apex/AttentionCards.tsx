import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';

import { apiFetch } from '../../lib/api';
import { useAutoSyncUsageStatsOnFocus, useUsageStats } from '../../lib/hooks/useUsageStats';
import { useTokens } from '../../lib/theme';

// ── Shared types ──────────────────────────────────────────────────────────

interface ScreenTimeApp {
  package: string;
  label: string;
  minutes: number;
}
interface ScreenTimeTodayResponse {
  today?: {
    total_minutes?: number;
    pickups?: number | null;
    longest_session_min?: number | null;
    top_apps?: ScreenTimeApp[];
    synced_at?: string;
  };
  history?: unknown[];
}

interface LocationVisit {
  centroid_lat: number;
  centroid_lon: number;
  start_iso: string;
  end_iso: string;
  dwell_minutes: number;
  sample_count: number;
  cluster_id?: number;
  place_name?: string | null;
  place_label?: string | null;
}

interface LocationCluster {
  id: number;
  place_name: string | null;
  place_label: string | null;
  total_dwell_minutes: number;
  centroid_lat: number;
  centroid_lon: number;
}

interface LocationTodayResponse {
  samples_today?: number;
  last_sample?: { lat: number; lon: number; sampled_at: string } | null;
  visits?: LocationVisit[];
  map_url?: string | null;
  clusters?: LocationCluster[];
  has_maps_api_key?: boolean;
}

// ── Hooks ─────────────────────────────────────────────────────────────────

function useScreenTimeStatus() {
  const [data, setData] = useState<ScreenTimeTodayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchOnce = async () => {
    try {
      const res = await apiFetch('/api/screen-time/today');
      if (!res.ok) return;
      setData(await res.json());
    } finally { setLoading(false); }
  };
  useEffect(() => { void fetchOnce(); }, []);
  return { data, loading, refetch: fetchOnce };
}

function useLocationStatus() {
  const [data, setData] = useState<LocationTodayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchOnce = async () => {
    try {
      const res = await apiFetch('/api/location/today');
      if (!res.ok) return;
      setData(await res.json());
    } finally { setLoading(false); }
  };
  useEffect(() => { void fetchOnce(); }, []);
  return { data, loading, refetch: fetchOnce };
}

// ── Screen Time card ──────────────────────────────────────────────────────

export function ScreenTimeCard() {
  const t = useTokens();
  const { data, loading, refetch } = useScreenTimeStatus();
  // Distinguish "not connected" from "connected, no data yet" —
  // INBOX 2026-04-28 founder flagged that this card kept showing
  // "Connect Screen Time" even after granting Usage Access. Same
  // root cause as the HC display gap: component checked DATA, not
  // PERMISSION. Hook also fires an auto-sync (90s throttle) so a
  // freshly-granted permission populates `screen_time_daily`
  // without requiring a manual sync tap.
  const us = useUsageStats();
  useAutoSyncUsageStatsOnFocus(refetch);

  if (loading && !data) {
    return (
      <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }
  const today = data?.today;
  const totalMin = today?.total_minutes ?? 0;
  const topApps = today?.top_apps ?? [];

  if (!today || (totalMin === 0 && topApps.length === 0)) {
    // Three empty-state branches:
    //   (a) Android, permission NOT granted → connect prompt.
    //   (b) Android, permission granted, no data → "syncing" state
    //       — the auto-sync above is firing; data should appear
    //       within seconds.
    //   (c) Non-Android → connect prompt (Apple Family Controls
    //       isn't shipped; iOS users see "not available on iOS yet").
    const isPermitted = us.available && us.permitted;
    return (
      <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border, opacity: 0.85 }]}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Ionicons name="phone-portrait-outline" size={16} color={t.text} />
            <Text style={[styles.title, { color: t.text }]}>Screen Time</Text>
          </View>
          <View style={[styles.pill, { borderColor: t.border }]}>
            <Text style={[styles.pillText, { color: t.subtle }]}>
              {isPermitted ? 'Syncing…' : 'No data'}
            </Text>
          </View>
        </View>
        <Text style={[styles.sub, { color: t.muted }]}>
          {isPermitted
            ? 'Screen Time is connected — pulling today\'s usage now. Top apps and total time appear here within a minute.'
            : 'Connect Screen Time in Settings → Connections to surface your daily phone usage and top apps here.'}
        </Text>
      </View>
    );
  }

  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  const totalLabel = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  return (
    <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons name="phone-portrait-outline" size={16} color={t.text} />
          <Text style={[styles.title, { color: t.text }]}>Screen Time</Text>
        </View>
      </View>
      <Text style={[styles.bigStat, { color: t.text }]}>{totalLabel}</Text>
      <Text style={[styles.sub, { color: t.muted }]}>on phone today</Text>
      {topApps.length > 0 ? (
        <>
          <Text style={[styles.bucketLabel, { color: t.muted }]}>Top apps</Text>
          {topApps.slice(0, 5).map((app) => (
            <View key={app.package} style={styles.appRow}>
              <Text style={[styles.appLabel, { color: t.text }]} numberOfLines={1}>
                {app.label}
              </Text>
              <Text style={[styles.appMinutes, { color: t.muted }]}>
                {app.minutes < 60 ? `${app.minutes}m` : `${Math.floor(app.minutes / 60)}h ${app.minutes % 60}m`}
              </Text>
            </View>
          ))}
        </>
      ) : null}
    </View>
  );
}

// ── Location card ─────────────────────────────────────────────────────────

export function LocationCard() {
  const t = useTokens();
  const { data, loading } = useLocationStatus();

  if (loading && !data) {
    return (
      <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }
  const samples = data?.samples_today ?? 0;
  const visits = data?.visits ?? [];
  const last = data?.last_sample;
  const mapUrl = data?.map_url || null;
  const clusters = data?.clusters ?? [];

  if (samples === 0 && !last) {
    return (
      <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border, opacity: 0.85 }]}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Ionicons name="location-outline" size={16} color={t.text} />
            <Text style={[styles.title, { color: t.text }]}>Location</Text>
          </View>
          <View style={[styles.pill, { borderColor: t.border }]}>
            <Text style={[styles.pillText, { color: t.subtle }]}>No samples</Text>
          </View>
        </View>
        <Text style={[styles.sub, { color: t.muted }]}>
          Connect Location in Settings → Connections to start logging where you spend time.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: t.text }]}>📍 Location</Text>
        <Text style={[styles.subFootnote, { color: t.subtle }]}>
          {samples} sample{samples === 1 ? '' : 's'} today
        </Text>
      </View>

      {/* Static map preview if we have a Google Maps API key + at
          least one sample. The map is just an Image — no native maps
          library, no rebuild needed. */}
      {mapUrl ? (
        <View style={styles.mapWrap}>
          <Image source={{ uri: mapUrl }} style={styles.mapImage} resizeMode="cover" />
        </View>
      ) : null}

      {/* Today's visits — derived from the day's samples. Each row:
          icon + name + dwell range. */}
      {visits.length > 0 ? (
        <>
          <Text style={[styles.bucketLabel, { color: t.muted }]}>
            {visits.length} place{visits.length === 1 ? '' : 's'} today
          </Text>
          {visits.slice(0, 5).map((v, idx) => (
            <VisitRow key={`${v.cluster_id ?? idx}-${v.start_iso}`} visit={v} />
          ))}
        </>
      ) : (
        <Text style={[styles.summaryEmpty, { color: t.muted }]}>
          Just samples so far — visits show up after you stay in one place for 2+ minutes.
        </Text>
      )}

      {/* Recurring places (lifetime, not today) — gives the card a
          "knows where I usually am" feel from day 2 onward. */}
      {clusters.length > 0 ? (
        <>
          <Text style={[styles.bucketLabel, { color: t.muted }]}>Recurring places</Text>
          <View style={styles.clusterRow}>
            {clusters.slice(0, 3).map((c) => (
              <ClusterPill key={c.id} cluster={c} />
            ))}
          </View>
        </>
      ) : null}

      {/* Setup hint — only when API key is missing, so the user knows
          why the map slot is blank. */}
      {!data?.has_maps_api_key ? (
        <Text style={[styles.subFootnote, { color: t.subtle, marginTop: 6 }]}>
          Set GOOGLE_MAPS_API_KEY in your backend .env to enable the path map and place names.
        </Text>
      ) : null}
    </View>
  );
}

function VisitRow({ visit }: { visit: LocationVisit }) {
  const t = useTokens();
  const name =
    visit.place_label
      ? prettyLabel(visit.place_label)
      : visit.place_name
        ? visit.place_name
        : `${visit.centroid_lat.toFixed(4)}, ${visit.centroid_lon.toFixed(4)}`;
  const start = formatLastTime(visit.start_iso);
  const end = formatLastTime(visit.end_iso);
  const dwell = visit.dwell_minutes < 60
    ? `${visit.dwell_minutes}m`
    : `${Math.floor(visit.dwell_minutes / 60)}h ${visit.dwell_minutes % 60}m`;
  return (
    <View style={styles.visitRow}>
      <View style={[styles.visitDot, { backgroundColor: t.accent }]} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.visitName, { color: t.text }]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[styles.visitMeta, { color: t.muted }]} numberOfLines={1}>
          {start} – {end} · {dwell}
        </Text>
      </View>
    </View>
  );
}

function ClusterPill({ cluster }: { cluster: LocationCluster }) {
  const t = useTokens();
  const name =
    cluster.place_label
      ? prettyLabel(cluster.place_label)
      : cluster.place_name
        ? cluster.place_name
        : `${cluster.centroid_lat.toFixed(3)}, ${cluster.centroid_lon.toFixed(3)}`;
  const totalH = Math.floor(cluster.total_dwell_minutes / 60);
  const summary = totalH > 0
    ? `${totalH}h total`
    : `${cluster.total_dwell_minutes}m total`;
  return (
    <View style={[styles.clusterPill, { borderColor: t.border, backgroundColor: t.bg }]}>
      <Text style={[styles.clusterPillName, { color: t.text }]} numberOfLines={1}>
        {name}
      </Text>
      <Text style={[styles.clusterPillSub, { color: t.muted }]} numberOfLines={1}>
        {summary}
      </Text>
    </View>
  );
}

function prettyLabel(label: string): string {
  if (!label) return '';
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatLastTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } catch { return ''; }
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 6 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 14, fontWeight: '700' },
  sub: { fontSize: 12 },
  subFootnote: { fontSize: 10, marginTop: 6 },
  pill: { borderWidth: 1, borderRadius: 100, paddingVertical: 3, paddingHorizontal: 10 },
  pillText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  bigStat: { fontSize: 26, fontWeight: '800', marginTop: 4 },
  bucketLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 8 },
  summaryEmpty: { fontSize: 12, fontStyle: 'italic', marginTop: 4 },
  appRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 4, alignItems: 'center',
  },
  appLabel: { fontSize: 13, flex: 1, marginRight: 12 },
  appMinutes: { fontSize: 12, fontWeight: '600' },

  // Location-specific
  mapWrap: {
    borderRadius: 10,
    overflow: 'hidden',
    marginTop: 6,
    aspectRatio: 600 / 240,
    backgroundColor: '#0001',
  },
  mapImage: { width: '100%', height: '100%' },
  visitRow: {
    flexDirection: 'row', gap: 10, alignItems: 'center',
    paddingVertical: 6,
  },
  visitDot: { width: 8, height: 8, borderRadius: 4 },
  visitName: { fontSize: 13, fontWeight: '600' },
  visitMeta: { fontSize: 11, marginTop: 1 },
  clusterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  clusterPill: {
    borderWidth: 1,
    borderRadius: 100,
    paddingVertical: 4,
    paddingHorizontal: 10,
    maxWidth: '100%',
  },
  clusterPillName: { fontSize: 11, fontWeight: '700' },
  clusterPillSub: { fontSize: 9, fontWeight: '500', marginTop: 1 },
});

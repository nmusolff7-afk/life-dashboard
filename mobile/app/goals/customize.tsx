import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { Button } from '../../components/ui';
import type { GoalConfig, GoalCreateInput, GoalLibraryEntry } from '../../../shared/src/types/goals';
import { apiFetch } from '../../lib/api';
import { createGoal, useGoalLibrary } from '../../lib/hooks/useGoals';
import { useTokens } from '../../lib/theme';

interface ClusterRow {
  id: number;
  place_name: string | null;
  place_label: string | null;
  total_dwell_minutes: number;
  centroid_lat: number;
  centroid_lon: number;
}

function clusterDisplayName(c: ClusterRow): string {
  return c.place_name || c.place_label
    || `${c.centroid_lat.toFixed(4)}, ${c.centroid_lon.toFixed(4)}`;
}

function formatDwellHours(minutes: number): string {
  if (minutes < 60) return `${minutes}m dwell`;
  return `${Math.round(minutes / 60)}h dwell`;
}

/** Customize & create-from-library. The inputs shown depend on the library
 *  entry's goal_type — cumulative_numeric gets a target value + deadline,
 *  streak gets a target streak length, etc. */
export default function CustomizeScreen() {
  const t = useTokens();
  const router = useRouter();
  const { library_id } = useLocalSearchParams<{ library_id: string }>();
  const lib = useGoalLibrary();

  const entry: GoalLibraryEntry | undefined = useMemo(
    () => (lib.data ?? []).find((e) => e.library_id === library_id),
    [lib.data, library_id],
  );

  const [targetValue, setTargetValue] = useState('');
  const [deadline, setDeadline] = useState(''); // YYYY-MM-DD
  const [targetStreak, setTargetStreak] = useState('');
  const [targetCount, setTargetCount] = useState('');
  const [targetRate, setTargetRate] = useState('');
  const [startValue, setStartValue] = useState('');
  const [baselineValue, setBaselineValue] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [busy, setBusy] = useState(false);

  // Per-library_id config inputs (§14.8 mobile follow-up).
  // TIME-02: daily screen-time cap (minutes).
  // TIME-06: cluster_id + weekly visits target.
  // FIT-08: daily active-kcal target (2026-04-28 expansion).
  const [dailyCapMinutes, setDailyCapMinutes] = useState('');
  const [clusterId, setClusterId] = useState<number | null>(null);
  const [weeklyVisitsTarget, setWeeklyVisitsTarget] = useState('');
  const [activeKcalTarget, setActiveKcalTarget] = useState('');
  const [clusters, setClusters] = useState<ClusterRow[] | null>(null);
  const [clustersLoading, setClustersLoading] = useState(false);

  // Fetch the user's location clusters when picking TIME-06.
  // Cheap one-shot read of /api/location/clusters (no geocoding side
  // effects — that's /api/location/today). Empty array is a valid
  // result; UI shows a "no clusters yet" hint.
  useEffect(() => {
    if (library_id !== 'TIME-06') return;
    let cancelled = false;
    setClustersLoading(true);
    apiFetch('/api/location/clusters?limit=20')
      .then((res) => res.ok ? res.json() : { clusters: [] })
      .then((json: { clusters?: ClusterRow[] }) => {
        if (!cancelled) setClusters(json.clusters ?? []);
      })
      .catch(() => { if (!cancelled) setClusters([]); })
      .finally(() => { if (!cancelled) setClustersLoading(false); });
    return () => { cancelled = true; };
  }, [library_id]);

  if (lib.loading && !lib.data) {
    return (
      <View style={[styles.container, { backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }
  if (!entry) {
    return (
      <View style={[styles.container, { backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: t.muted }}>Goal not found in library.</Text>
      </View>
    );
  }

  const canCreate = (() => {
    // Library-id-specific config gates (§14.8 backend handlers
    // require these or instantiate as paused).
    if (entry.library_id === 'TIME-02' && dailyCapMinutes.length === 0) return false;
    if (entry.library_id === 'TIME-06' && (clusterId == null || weeklyVisitsTarget.length === 0)) return false;
    if (entry.library_id === 'FIT-08' && activeKcalTarget.length === 0) return false;

    if (entry.goal_type === 'cumulative_numeric') return targetValue.length > 0;
    if (entry.goal_type === 'streak') return targetStreak.length > 0;
    if (entry.goal_type === 'period_count') return targetCount.length > 0;
    if (entry.goal_type === 'rate') return targetRate.length > 0;
    if (entry.goal_type === 'best_attempt') return targetValue.length > 0;
    return false;
  })();

  const onSubmit = async () => {
    const input: GoalCreateInput = { library_id: entry.library_id };
    if (displayName.trim()) input.display_name = displayName.trim();
    if (entry.goal_type === 'cumulative_numeric') {
      input.target_value = parseFloat(targetValue);
      if (startValue) input.start_value = parseFloat(startValue);
      if (deadline) input.deadline = deadline;
    }
    if (entry.goal_type === 'best_attempt') {
      input.target_value = parseFloat(targetValue);
      if (baselineValue) input.baseline_value = parseFloat(baselineValue);
    }
    if (entry.goal_type === 'streak') {
      input.target_streak_length = parseInt(targetStreak, 10);
    }
    if (entry.goal_type === 'period_count') {
      input.target_count = parseInt(targetCount, 10);
    }
    if (entry.goal_type === 'rate') {
      input.target_rate = parseFloat(targetRate);
    }
    if (entry.category === 'fitness' && entry.affects_calorie_math === 1 && isPrimary) {
      input.is_primary = true;
    }

    // Per-library_id config (§14.8). Only attach a `config` object
    // if at least one key is set — keeps the create payload clean.
    const config: GoalConfig = {};
    if (entry.library_id === 'TIME-02' && dailyCapMinutes) {
      config.daily_cap_minutes = parseInt(dailyCapMinutes, 10);
    }
    if (entry.library_id === 'TIME-06') {
      if (clusterId != null) config.cluster_id = clusterId;
      if (weeklyVisitsTarget) config.weekly_visits_target = parseInt(weeklyVisitsTarget, 10);
    }
    if (entry.library_id === 'FIT-08' && activeKcalTarget) {
      config.daily_active_kcal_target = parseInt(activeKcalTarget, 10);
    }
    if (Object.keys(config).length > 0) input.config = config;

    setBusy(true);
    try {
      await createGoal(input);
      router.replace('/goals' as never);
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.code === 'slot_limit_reached') {
        Alert.alert('Slot limit reached', 'Archive a goal to free a slot, then try again.');
      } else {
        Alert.alert('Could not create goal', err.message || 'Unknown error');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
      <Stack.Screen options={{ title: 'Customize goal', headerStyle: { backgroundColor: t.bg }, headerTintColor: t.text, headerShadowVisible: false }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.eyebrow, { color: t.subtle }]}>{entry.library_id} · {entry.goal_type.replace(/_/g, ' ')}</Text>
        <Text style={[styles.title, { color: t.text }]}>{entry.display_name}</Text>
        {entry.description ? <Text style={[styles.desc, { color: t.muted }]}>{entry.description}</Text> : null}

        <View style={{ height: 12 }} />

        <Text style={[styles.label, { color: t.muted }]}>Display name (optional)</Text>
        <TextInput
          style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
          value={displayName}
          onChangeText={setDisplayName}
          placeholder={entry.display_name}
          placeholderTextColor={t.subtle}
        />

        {entry.goal_type === 'cumulative_numeric' && (
          <>
            <Text style={[styles.label, { color: t.muted, marginTop: 12 }]}>Target {entry.metric_name ?? 'value'}</Text>
            <TextInput style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
              value={targetValue} onChangeText={setTargetValue} keyboardType="numeric"
              placeholder="e.g. 175" placeholderTextColor={t.subtle} />
            <Text style={[styles.label, { color: t.muted, marginTop: 12 }]}>Starting value (optional)</Text>
            <TextInput style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
              value={startValue} onChangeText={setStartValue} keyboardType="numeric"
              placeholder="today's value" placeholderTextColor={t.subtle} />
            <Text style={[styles.label, { color: t.muted, marginTop: 12 }]}>Deadline (YYYY-MM-DD)</Text>
            <TextInput style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
              value={deadline} onChangeText={setDeadline}
              placeholder={`default: +${entry.default_deadline_days ?? 90} days`} placeholderTextColor={t.subtle} />
          </>
        )}

        {entry.goal_type === 'best_attempt' && (
          <>
            <Text style={[styles.label, { color: t.muted, marginTop: 12 }]}>Target {entry.metric_name ?? 'value'}</Text>
            <TextInput style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
              value={targetValue} onChangeText={setTargetValue} keyboardType="numeric"
              placeholder="e.g. 315" placeholderTextColor={t.subtle} />
            <Text style={[styles.label, { color: t.muted, marginTop: 12 }]}>Current best (optional)</Text>
            <TextInput style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
              value={baselineValue} onChangeText={setBaselineValue} keyboardType="numeric"
              placeholder="your current PR" placeholderTextColor={t.subtle} />
          </>
        )}

        {entry.goal_type === 'streak' && (
          <>
            <Text style={[styles.label, { color: t.muted, marginTop: 12 }]}>
              Target streak length ({entry.qualifying_condition ?? 'days'})
            </Text>
            <TextInput style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
              value={targetStreak} onChangeText={setTargetStreak} keyboardType="numeric"
              placeholder={`default: ${entry.default_target ?? 14}`} placeholderTextColor={t.subtle} />
          </>
        )}

        {entry.goal_type === 'period_count' && (
          <>
            <Text style={[styles.label, { color: t.muted, marginTop: 12 }]}>
              Target count per {entry.default_period ?? 'period'}
            </Text>
            <TextInput style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
              value={targetCount} onChangeText={setTargetCount} keyboardType="numeric"
              placeholder={`default: ${entry.default_target ?? 10}`} placeholderTextColor={t.subtle} />
          </>
        )}

        {entry.goal_type === 'rate' && (
          <>
            <Text style={[styles.label, { color: t.muted, marginTop: 12 }]}>
              Target rate ({entry.default_aggregation ?? 'average'} over {entry.default_window_size ?? 30} periods)
            </Text>
            <TextInput style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
              value={targetRate} onChangeText={setTargetRate} keyboardType="numeric"
              placeholder="e.g. 180" placeholderTextColor={t.subtle} />
          </>
        )}

        {entry.category === 'fitness' && entry.affects_calorie_math === 1 && (
          <View style={[styles.primaryRow, { borderColor: t.border, backgroundColor: t.surface }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.primaryLabel, { color: t.text }]}>Primary fitness goal</Text>
              <Text style={[styles.primarySub, { color: t.muted }]}>Drives your calorie and macro targets. Only one fitness goal can be primary.</Text>
            </View>
            <Switch value={isPrimary} onValueChange={setIsPrimary} />
          </View>
        )}

        {/* TIME-02 — daily screen-time cap. Without this the goal
         *  instantiates paused (handler returns _paused_handler when
         *  config.daily_cap_minutes is missing). */}
        {entry.library_id === 'TIME-02' && (
          <>
            <Text style={[styles.label, { color: t.muted, marginTop: 16 }]}>
              Daily screen-time cap (minutes)
            </Text>
            <TextInput
              style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
              value={dailyCapMinutes}
              onChangeText={setDailyCapMinutes}
              keyboardType="numeric"
              placeholder="e.g. 180 (3 hours)"
              placeholderTextColor={t.subtle}
            />
            <Text style={[styles.hint, { color: t.subtle }]}>
              A day qualifies for the streak when total screen time is at or below this number.
            </Text>
          </>
        )}

        {/* FIT-08 — daily active-kcal target. Reads
         *  health_daily.active_kcal; goal qualifies a day when the
         *  reading meets the target. (2026-04-28 §14.4-followup
         *  expansion.) */}
        {entry.library_id === 'FIT-08' && (
          <>
            <Text style={[styles.label, { color: t.muted, marginTop: 16 }]}>
              Daily active-calories target
            </Text>
            <TextInput
              style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
              value={activeKcalTarget}
              onChangeText={setActiveKcalTarget}
              keyboardType="numeric"
              placeholder="e.g. 300"
              placeholderTextColor={t.subtle}
            />
            <Text style={[styles.hint, { color: t.subtle }]}>
              Active calories from your wearable via Health Connect.
              A typical 30-minute brisk walk is ~150–200 kcal.
            </Text>
          </>
        )}

        {/* TIME-06 — pick a cluster + weekly visit target. Cluster
         *  list comes from /api/location/clusters ranked by dwell. */}
        {entry.library_id === 'TIME-06' && (
          <>
            <Text style={[styles.label, { color: t.muted, marginTop: 16 }]}>
              Which place are you tracking visits to?
            </Text>
            {clustersLoading ? (
              <ActivityIndicator color={t.accent} style={{ marginVertical: 12 }} />
            ) : !clusters || clusters.length === 0 ? (
              <Text style={[styles.pausedHint, { color: t.muted }]}>
                No location clusters yet. Open the app a few times in
                different places (gym, work, etc.) and the system
                will detect them automatically. Then come back and
                pick one here.
              </Text>
            ) : (
              <View style={{ gap: 8 }}>
                {clusters.map((c) => {
                  const active = clusterId === c.id;
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => setClusterId(c.id)}
                      style={[
                        styles.clusterRow,
                        {
                          borderColor: active ? t.accent : t.border,
                          backgroundColor: active ? t.surface : t.bg,
                        },
                      ]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.clusterTitle, { color: t.text }]} numberOfLines={1}>
                          {clusterDisplayName(c)}
                        </Text>
                        <Text style={[styles.clusterMeta, { color: t.muted }]}>
                          {formatDwellHours(c.total_dwell_minutes)}
                          {c.place_label ? ` · ${c.place_label}` : ''}
                        </Text>
                      </View>
                      {active ? (
                        <Text style={[styles.clusterCheck, { color: t.accent }]}>✓</Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            )}

            <Text style={[styles.label, { color: t.muted, marginTop: 16 }]}>
              Weekly visit target
            </Text>
            <TextInput
              style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
              value={weeklyVisitsTarget}
              onChangeText={setWeeklyVisitsTarget}
              keyboardType="numeric"
              placeholder="e.g. 3 (visits per week)"
              placeholderTextColor={t.subtle}
            />
            <Text style={[styles.hint, { color: t.subtle }]}>
              A week qualifies for the streak when you visit this place at least this many days.
            </Text>
          </>
        )}

        {entry.data_source && entry.data_source !== 'meal_logs' && entry.data_source !== 'workout_logs' && entry.data_source !== 'strength_logs' && entry.data_source !== 'health_connect' && entry.data_source !== 'mind_tasks' && (
          <Text style={[styles.pausedHint, { color: t.muted }]}>
            Note: this goal tracks data from <Text style={{ fontWeight: '700' }}>{entry.data_source}</Text>, which isn't connected yet. Progress will stay paused until you connect that source.
          </Text>
        )}

        <Button
          title={busy ? 'Creating…' : 'Add goal'}
          onPress={onSubmit}
          disabled={!canCreate || busy}
          style={{ marginTop: 20 }}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 48 },
  eyebrow: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  title: { fontSize: 24, fontWeight: '800', marginTop: 4 },
  desc: { fontSize: 14, lineHeight: 20, marginTop: 6 },
  label: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  primaryRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, padding: 14, gap: 12, marginTop: 16 },
  primaryLabel: { fontSize: 14, fontWeight: '700' },
  primarySub: { fontSize: 12, marginTop: 2 },
  pausedHint: { fontSize: 12, lineHeight: 17, marginTop: 14, fontStyle: 'italic' },
  hint: { fontSize: 11, marginTop: 6, lineHeight: 15 },
  clusterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 12,
  },
  clusterTitle: { fontSize: 14, fontWeight: '600' },
  clusterMeta: { fontSize: 11, marginTop: 2 },
  clusterCheck: { fontSize: 18, fontWeight: '700' },
});

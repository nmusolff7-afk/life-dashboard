import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { apiFetch } from '../../lib/api';
import { useTokens } from '../../lib/theme';

/** Patterns view — deterministic 14-day rollup + AI insights.
 *
 *  Two-tier per BUILD_PLAN.md → Vision (PRD §4.3 + §14.3 revised):
 *    - Deterministic patterns: pure 14-day rollup, no AI.
 *      Always-loaded.
 *    - AI insights: Claude Haiku reads the patterns + surfaces 3
 *      plain-English observations. User-invoked via "Refresh
 *      insights" tap; not auto.
 *
 *  Replaces the EmptyState placeholder that used to live in
 *  `time.tsx PatternsView`. INBOX 2026-04-28: founder said
 *  "time > patterns needs populated with data."
 */

interface Patterns {
  window_days: number;
  today: string;
  sleep: SleepPattern | null;
  movement: MovementPattern | null;
  screen: ScreenPattern | null;
  places: PlacesPattern | null;
  calendar: CalendarPattern | null;
  nutrition: NutritionPattern | null;
  workouts: WorkoutsPattern | null;
}

interface SleepPattern {
  days_reported: number;
  avg_minutes: number;
  stddev_minutes: number;
  min_minutes: number;
  max_minutes: number;
}
interface MovementPattern {
  days_reported: number;
  avg_steps: number | null;
  avg_active_kcal: number | null;
  most_active_day_of_week: string | null;
}
interface ScreenPattern {
  days_reported: number;
  avg_minutes: number;
  weekday_avg: number | null;
  weekend_avg: number | null;
  top_apps: { label: string; minutes: number }[];
}
interface PlacesPattern {
  top_places: { name: string; dwell_h: number }[];
  new_places_in_window: number;
}
interface CalendarPattern {
  events_total: number;
  days_with_events: number;
  avg_meetings_weekday: number | null;
  focus_minutes_total: number;
  focus_hours_per_week: number;
}
interface NutritionPattern {
  days_logged: number;
  avg_calories: number;
  avg_protein_g: number;
  calorie_target: number;
  protein_target_g: number;
  calorie_hit_rate: number;
  protein_hit_rate: number;
}
interface WorkoutsPattern {
  days_with_workout: number;
  total_workouts: number;
  avg_burn_per_day: number;
  workouts_per_week: number;
}

interface Insight {
  headline: string;
  detail: string;
  tag: string;
}

export function PatternsView() {
  const t = useTokens();
  const [patterns, setPatterns] = useState<Patterns | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [synthLoading, setSynthLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/patterns')
      .then((r) => r.json())
      .then((j: { ok?: boolean; patterns?: Patterns }) => {
        if (cancelled) return;
        if (j.ok) setPatterns(j.patterns ?? null);
        else setError('Could not load patterns');
      })
      .catch((e) => { if (!cancelled) setError((e as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const onSynthesize = async () => {
    setSynthLoading(true);
    try {
      const res = await apiFetch('/api/patterns/synthesize', { method: 'POST' });
      const j = await res.json() as { ok?: boolean; patterns?: Patterns; insights?: Insight[] };
      if (j.ok) {
        if (j.patterns) setPatterns(j.patterns);
        setInsights(j.insights ?? []);
      }
    } finally {
      setSynthLoading(false);
    }
  };

  if (loading && !patterns) {
    return <ActivityIndicator color={t.accent} style={{ paddingVertical: 40 }} />;
  }
  if (error || !patterns) {
    return (
      <Text style={[styles.empty, { color: t.muted }]}>
        Couldn&apos;t load patterns. Pull to refresh.
      </Text>
    );
  }

  const hasAnyData = !!(
    patterns.sleep || patterns.movement || patterns.screen ||
    patterns.places || patterns.calendar || patterns.nutrition ||
    patterns.workouts
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={[styles.kicker, { color: t.muted }]}>
          14-DAY PATTERNS · ENDING {patterns.today}
        </Text>
      </View>

      {!hasAnyData ? (
        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text style={[styles.emptyTitle, { color: t.text }]}>
            Not enough data yet
          </Text>
          <Text style={[styles.emptyBody, { color: t.muted }]}>
            Connect Health Connect, your calendar, screen-time, and
            location, then come back in a few days. Patterns appear
            once you have 7+ days of data across at least one source.
          </Text>
        </View>
      ) : null}

      {patterns.sleep ? (
        <PatternCard
          icon="moon-outline"
          accent={t.accent}
          title="Sleep"
          rows={[
            ['Avg duration', formatHM(patterns.sleep.avg_minutes)],
            ['Std dev (regularity)', `${patterns.sleep.stddev_minutes}m`],
            ['Range', `${formatHM(patterns.sleep.min_minutes)} – ${formatHM(patterns.sleep.max_minutes)}`],
            ['Nights reported', `${patterns.sleep.days_reported} of 14`],
          ]}
        />
      ) : null}

      {patterns.movement ? (
        <PatternCard
          icon="walk-outline"
          accent={t.fitness}
          title="Movement"
          rows={[
            ['Avg steps', patterns.movement.avg_steps != null
              ? patterns.movement.avg_steps.toLocaleString() : '—'],
            ['Avg active kcal', patterns.movement.avg_active_kcal != null
              ? patterns.movement.avg_active_kcal.toString() : '—'],
            ['Most active day', patterns.movement.most_active_day_of_week ?? '—'],
            ['Days reported', `${patterns.movement.days_reported} of 14`],
          ]}
        />
      ) : null}

      {patterns.screen ? (
        <PatternCard
          icon="phone-portrait-outline"
          accent={t.muted}
          title="Screen time"
          rows={[
            ['Avg total', formatHM(patterns.screen.avg_minutes)],
            ['Weekday avg', patterns.screen.weekday_avg != null
              ? formatHM(patterns.screen.weekday_avg) : '—'],
            ['Weekend avg', patterns.screen.weekend_avg != null
              ? formatHM(patterns.screen.weekend_avg) : '—'],
            ...(patterns.screen.top_apps.length > 0
              ? [['Top app', `${patterns.screen.top_apps[0].label} · ${formatHM(patterns.screen.top_apps[0].minutes)}`] as [string, string]]
              : []),
          ]}
        />
      ) : null}

      {patterns.places ? (
        <PatternCard
          icon="location-outline"
          accent={t.fitness}
          title="Places"
          rows={[
            ...patterns.places.top_places.slice(0, 3).map((p) =>
              [p.name, `${p.dwell_h}h`] as [string, string]
            ),
            ['New places in 14d', String(patterns.places.new_places_in_window)],
          ]}
        />
      ) : null}

      {patterns.calendar ? (
        <PatternCard
          icon="calendar-outline"
          accent={t.accent}
          title="Calendar"
          rows={[
            ['Events total', String(patterns.calendar.events_total)],
            ['Avg meetings weekday', patterns.calendar.avg_meetings_weekday != null
              ? `${patterns.calendar.avg_meetings_weekday}` : '—'],
            ['Focus hours / week', `${patterns.calendar.focus_hours_per_week}`],
          ]}
        />
      ) : null}

      {patterns.nutrition ? (
        <PatternCard
          icon="restaurant-outline"
          accent={t.cal}
          title="Nutrition"
          rows={[
            ['Days logged', `${patterns.nutrition.days_logged} of 14`],
            ['Avg calories', `${patterns.nutrition.avg_calories} (target ${patterns.nutrition.calorie_target})`],
            ['Avg protein', `${patterns.nutrition.avg_protein_g}g (target ${patterns.nutrition.protein_target_g}g)`],
            ['Calorie target hit rate', `${Math.round(patterns.nutrition.calorie_hit_rate * 100)}%`],
            ['Protein target hit rate', `${Math.round(patterns.nutrition.protein_hit_rate * 100)}%`],
          ]}
        />
      ) : null}

      {patterns.workouts ? (
        <PatternCard
          icon="barbell-outline"
          accent={t.fitness}
          title="Workouts"
          rows={[
            ['Workouts / week', `${patterns.workouts.workouts_per_week}`],
            ['Days with workout', `${patterns.workouts.days_with_workout} of 14`],
            ['Avg burn (workout day)', `${patterns.workouts.avg_burn_per_day} kcal`],
          ]}
        />
      ) : null}

      {/* AI insights — user-invoked. Cards only render after the
       *  founder taps "Refresh insights" so we don't burn Haiku
       *  calls on every Patterns tab visit. */}
      <View style={[styles.aiHeader, { borderTopColor: t.border }]}>
        <Text style={[styles.aiKicker, { color: t.muted }]}>AI INSIGHTS</Text>
        <Pressable
          onPress={() => { void onSynthesize(); }}
          disabled={synthLoading}
          hitSlop={10}>
          <Text style={[styles.aiAction, { color: t.accent, opacity: synthLoading ? 0.5 : 1 }]}>
            {synthLoading ? 'Thinking…' : insights.length > 0 ? 'Refresh' : 'Generate'}
          </Text>
        </Pressable>
      </View>
      {insights.length === 0 ? (
        <Text style={[styles.aiEmpty, { color: t.subtle }]}>
          Tap Generate for 3 plain-English observations on your last
          14 days. Descriptive only — never tells you what to do.
        </Text>
      ) : (
        insights.map((ins, i) => (
          <View
            key={i}
            style={[styles.insight, { backgroundColor: t.surface, borderColor: t.border }]}>
            <View style={styles.insightHeader}>
              <Ionicons
                name={iconForTag(ins.tag)}
                size={14}
                color={t.accent}
              />
              <Text style={[styles.insightTitle, { color: t.text }]} numberOfLines={2}>
                {ins.headline}
              </Text>
            </View>
            <Text style={[styles.insightBody, { color: t.muted }]}>
              {ins.detail}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

function PatternCard({ icon, accent, title, rows }: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  accent: string;
  title: string;
  rows: [string, string][];
}) {
  const t = useTokens();
  return (
    <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.iconWrap, { backgroundColor: accent + '22' }]}>
          <Ionicons name={icon} size={14} color={accent} />
        </View>
        <Text style={[styles.cardTitle, { color: t.text }]}>{title}</Text>
      </View>
      {rows.map(([k, v], i) => (
        <View
          key={k}
          style={[
            styles.row,
            { borderBottomColor: t.border, borderBottomWidth: i < rows.length - 1 ? StyleSheet.hairlineWidth : 0 },
          ]}>
          <Text style={[styles.rowLabel, { color: t.muted }]}>{k}</Text>
          <Text style={[styles.rowValue, { color: t.text }]} numberOfLines={1}>{v}</Text>
        </View>
      ))}
    </View>
  );
}

function iconForTag(tag: string): React.ComponentProps<typeof Ionicons>['name'] {
  switch (tag) {
    case 'sleep':     return 'moon-outline';
    case 'movement':  return 'walk-outline';
    case 'screen':    return 'phone-portrait-outline';
    case 'places':    return 'location-outline';
    case 'calendar':  return 'calendar-outline';
    case 'nutrition': return 'restaurant-outline';
    case 'workouts':  return 'barbell-outline';
    default:          return 'sparkles-outline';
  }
}

function formatHM(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  header: { paddingHorizontal: 2 },
  kicker: { fontSize: 9, fontWeight: '700', letterSpacing: 0.7 },
  empty: { fontSize: 12, padding: 16, textAlign: 'center' },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 4,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 6 },
  iconWrap: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 14, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, gap: 12 },
  rowLabel: { fontSize: 12, flex: 1 },
  rowValue: { fontSize: 12, fontWeight: '600', textAlign: 'right' },
  emptyTitle: { fontSize: 14, fontWeight: '700' },
  emptyBody: { fontSize: 12, marginTop: 4, lineHeight: 17 },

  aiHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingTop: 12,
    marginTop: 6,
  },
  aiKicker: { fontSize: 9, fontWeight: '700', letterSpacing: 0.7 },
  aiAction: { fontSize: 12, fontWeight: '700' },
  aiEmpty: { fontSize: 11, fontStyle: 'italic', lineHeight: 16, paddingVertical: 8 },
  insight: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 4,
  },
  insightHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  insightTitle: { fontSize: 13, fontWeight: '700', flex: 1 },
  insightBody: { fontSize: 12, lineHeight: 17 },
});

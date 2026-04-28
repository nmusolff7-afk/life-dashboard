import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Workout } from '../../../shared/src/types/home';
import { useTokens } from '../../lib/theme';
import {
  classifyWorkout,
  formatWorkoutTime,
  iconForWorkoutType,
  type WorkoutType,
} from '../../lib/workout';
import { EmptyState } from './EmptyState';
import { WorkoutEditSheet } from './WorkoutEditSheet';

type Filter = 'all' | WorkoutType;

interface Props {
  workouts: Workout[];
  /** Refetch after edit/delete. */
  onChanged: () => void;
}

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'strength', label: 'Strength' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'mixed', label: 'Mixed' },
];

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function yesterdayIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysAgo(iso: string, n: number): boolean {
  const d = new Date(iso);
  const ref = new Date();
  ref.setDate(ref.getDate() - n);
  return d >= ref;
}

type Bucket = 'today' | 'yesterday' | 'this-week' | 'earlier';

function bucketFor(logDate: string, today: string, yesterday: string): Bucket {
  if (logDate === today) return 'today';
  if (logDate === yesterday) return 'yesterday';
  if (daysAgo(logDate, 7)) return 'this-week';
  return 'earlier';
}

const BUCKET_LABEL: Record<Bucket, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  'this-week': 'This week',
  earlier: 'Earlier',
};

const BUCKET_ORDER: Bucket[] = ['today', 'yesterday', 'this-week', 'earlier'];

function formatRowDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function WorkoutHistoryList({ workouts, onChanged }: Props) {
  const t = useTokens();
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<Workout | null>(null);

  const today = todayIso();
  const yesterday = yesterdayIso();

  const grouped = useMemo(() => {
    const filtered = filter === 'all'
      ? workouts
      : workouts.filter((w) => classifyWorkout(w.description) === filter);
    const byBucket: Record<Bucket, Workout[]> = {
      today: [], yesterday: [], 'this-week': [], earlier: [],
    };
    filtered.forEach((w) => {
      byBucket[bucketFor(w.log_date, today, yesterday)].push(w);
    });
    return byBucket;
  }, [workouts, filter, today, yesterday]);

  const isEmpty = workouts.length === 0;
  const filteredEmpty =
    !isEmpty &&
    BUCKET_ORDER.every((b) => grouped[b].length === 0);

  if (isEmpty) {
    return (
      <EmptyState
        icon="🏋️"
        title="No workouts logged yet"
        description="Log your first workout from the Today tab."
      />
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.chips}>
        {FILTERS.map((f) => {
          const active = filter === f.value;
          return (
            <Pressable
              key={f.value}
              onPress={() => setFilter(f.value)}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? t.accent : t.surface,
                  borderColor: active ? t.accent : t.border,
                },
              ]}>
              <Text
                style={[
                  styles.chipLabel,
                  { color: active ? '#fff' : t.muted, fontWeight: active ? '700' : '500' },
                ]}>
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {filteredEmpty ? (
        <Text style={[styles.emptyFilter, { color: t.subtle }]}>
          No {filter} workouts in the last 90 days.
        </Text>
      ) : null}

      {BUCKET_ORDER.map((bucket) => {
        const rows = grouped[bucket];
        if (rows.length === 0) return null;
        const bucketTotal = rows.reduce((sum, w) => sum + (w.calories_burned ?? 0), 0);
        return (
          <View key={bucket} style={styles.group}>
            <View style={styles.groupHeader}>
              <Text style={[styles.groupLabel, { color: t.muted }]}>
                {BUCKET_LABEL[bucket]}
              </Text>
              <Text style={[styles.groupTotal, { color: t.cal }]}>{bucketTotal} kcal</Text>
            </View>
            <View style={[styles.card, { backgroundColor: t.surface, shadowColor: '#000' }]}>
              {rows.map((w, idx) => {
                const type = classifyWorkout(w.description);
                return (
                  <Pressable
                    key={w.id}
                    onPress={() => setEditing(w)}
                    style={({ pressed }) => [
                      styles.row,
                      {
                        borderBottomColor: t.border,
                        borderBottomWidth: idx < rows.length - 1 ? StyleSheet.hairlineWidth : 0,
                        opacity: pressed ? 0.6 : 1,
                      },
                    ]}>
                    <Ionicons name={iconForWorkoutType(type)} size={20} color={t.fitness} />
                    <View style={styles.rowBody}>
                      <Text style={[styles.rowDesc, { color: t.text }]} numberOfLines={2}>
                        {w.description}
                      </Text>
                      <Text style={[styles.rowMeta, { color: t.muted }]}>
                        {formatRowDate(w.log_date)} · {formatWorkoutTime(w.logged_at)}
                        {w.strava_activity_id ? ' · 🏃 Strava' : ''}
                      </Text>
                    </View>
                    <Text style={[styles.rowBurn, { color: t.cal }]}>
                      {w.calories_burned}{' '}
                      <Text style={styles.rowBurnUnit}>kcal</Text>
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}

      <WorkoutEditSheet
        workout={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          onChanged();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    borderRadius: 100,
    borderWidth: 1,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  chipLabel: { fontSize: 13 },
  emptyFilter: { fontSize: 13, textAlign: 'center', paddingVertical: 16 },

  group: { gap: 8 },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 2,
  },
  groupLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.1 },
  groupTotal: { fontSize: 12, fontWeight: '700' },

  card: {
    borderRadius: 16,
    paddingHorizontal: 16,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  rowBody: { flex: 1 },
  rowDesc: { fontSize: 14, fontWeight: '500' },
  rowMeta: { fontSize: 11, marginTop: 2 },
  rowBurn: { fontSize: 15, fontWeight: '700' },
  rowBurnUnit: { fontSize: 10, fontWeight: '500' },
});

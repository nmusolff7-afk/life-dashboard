import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Workout } from '../../../shared/src/types/home';
import { useTokens } from '../../lib/theme';
import { classifyWorkout, formatWorkoutTime, iconForWorkoutType } from '../../lib/workout';
import { WorkoutEditSheet } from './WorkoutEditSheet';

interface Props {
  workouts: Workout[];
  /** Refetch today's workouts after an edit/delete. */
  onChanged: () => void;
}

export function TodayWorkoutsList({ workouts, onChanged }: Props) {
  const t = useTokens();
  const [editing, setEditing] = useState<Workout | null>(null);

  if (workouts.length === 0) {
    return (
      <View style={[styles.card, { backgroundColor: t.surface, shadowColor: '#000' }]}>
        <Text style={[styles.title, { color: t.muted }]}>Today's workouts</Text>
        <Text style={[styles.empty, { color: t.subtle }]}>
          No workouts logged yet today. Log your first above.
        </Text>
      </View>
    );
  }

  const totalBurn = workouts.reduce((sum, w) => sum + (w.calories_burned ?? 0), 0);

  return (
    <View style={[styles.card, { backgroundColor: t.surface, shadowColor: '#000' }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: t.muted }]}>Today's workouts</Text>
        <Text style={[styles.totalBurn, { color: t.cal }]}>{totalBurn} kcal</Text>
      </View>

      {workouts.map((w) => {
        const type = classifyWorkout(w.description);
        return (
          <Pressable
            key={w.id}
            onPress={() => setEditing(w)}
            style={({ pressed }) => [
              styles.row,
              { borderBottomColor: t.border, opacity: pressed ? 0.6 : 1 },
            ]}>
            <Ionicons name={iconForWorkoutType(type)} size={20} color={t.fitness} />
            <View style={styles.rowBody}>
              <Text style={[styles.rowDesc, { color: t.text }]} numberOfLines={2}>
                {w.description}
              </Text>
              <Text style={[styles.rowTime, { color: t.muted }]}>
                {formatWorkoutTime(w.logged_at)}
              </Text>
            </View>
            <Text style={[styles.rowBurn, { color: t.cal }]}>
              {w.calories_burned} <Text style={styles.rowBurnUnit}>kcal</Text>
            </Text>
          </Pressable>
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
  card: {
    borderRadius: 20,
    padding: 16,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingBottom: 8,
  },
  title: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.1 },
  totalBurn: { fontSize: 14, fontWeight: '700' },
  empty: { fontSize: 13, marginTop: 4 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowBody: { flex: 1 },
  rowDesc: { fontSize: 14, fontWeight: '500' },
  rowTime: { fontSize: 11, marginTop: 2 },
  rowBurn: { fontSize: 15, fontWeight: '700' },
  rowBurnUnit: { fontSize: 10, fontWeight: '500' },
});

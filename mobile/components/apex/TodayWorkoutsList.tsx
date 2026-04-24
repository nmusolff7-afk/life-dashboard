import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Workout } from '../../../shared/src/types/home';
import { deleteWorkout } from '../../lib/api/fitness';
import { useHaptics } from '../../lib/useHaptics';
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
  const haptics = useHaptics();
  const [editing, setEditing] = useState<Workout | null>(null);
  const openEdit = (w: Workout) => {
    haptics.fire('tap');
    setEditing(w);
  };

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
        const handleDelete = () => {
          Alert.alert(
            'Delete workout?',
            'This removes the logged workout and any parsed sets.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await deleteWorkout(w.id);
                    onChanged();
                  } catch (e) {
                    Alert.alert('Delete failed', e instanceof Error ? e.message : String(e));
                  }
                },
              },
            ],
          );
        };
        return (
          <Pressable
            key={w.id}
            onPress={() => openEdit(w)}
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
            <View style={styles.actions}>
              <Pressable
                onPress={() => openEdit(w)}
                hitSlop={10}
                accessibilityLabel="Edit workout"
                style={[styles.iconBtn, { backgroundColor: t.surface2 }]}>
                <Ionicons name="pencil" size={13} color={t.muted} />
              </Pressable>
              <Pressable
                onPress={handleDelete}
                hitSlop={10}
                accessibilityLabel="Delete workout"
                style={[styles.iconBtn, { backgroundColor: t.surface2 }]}>
                <Ionicons name="trash-outline" size={13} color={t.danger} />
              </Pressable>
            </View>
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
  actions: { flexDirection: 'column', gap: 6, marginLeft: 4 },
  iconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Meal } from '../../../shared/src/types/home';
import { useTokens } from '../../lib/theme';
import { MealDetailModal } from './MealDetailModal';

interface Props {
  meals: Meal[];
  onChanged: () => void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const h = d.getHours();
  const m = d.getMinutes();
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

/** Reverse-chronological list of today's meals. Tap a row → MealEditSheet
 *  which hits /api/edit-meal or /api/delete-meal. */
export function TodayMealsList({ meals, onChanged }: Props) {
  const t = useTokens();
  const [editing, setEditing] = useState<Meal | null>(null);

  if (meals.length === 0) {
    return (
      <View style={[styles.card, { backgroundColor: t.surface, shadowColor: '#000' }]}>
        <Text style={[styles.title, { color: t.muted }]}>Today's meals</Text>
        <Text style={[styles.empty, { color: t.subtle }]}>
          No meals logged yet today. Tap the input above to get started.
        </Text>
      </View>
    );
  }

  // Newest first.
  const sorted = [...meals].sort(
    (a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime(),
  );
  const totalKcal = meals.reduce((s, m) => s + (m.calories ?? 0), 0);

  return (
    <View style={[styles.card, { backgroundColor: t.surface, shadowColor: '#000' }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: t.muted }]}>Today's meals</Text>
        <Text style={[styles.total, { color: t.cal }]}>{totalKcal.toLocaleString()} kcal</Text>
      </View>

      {sorted.map((m, idx) => (
        <Pressable
          key={m.id}
          onPress={() => setEditing(m)}
          style={({ pressed }) => [
            styles.row,
            {
              borderBottomColor: t.border,
              borderBottomWidth: idx < sorted.length - 1 ? StyleSheet.hairlineWidth : 0,
              opacity: pressed ? 0.6 : 1,
            },
          ]}>
          <Ionicons name="restaurant-outline" size={18} color={t.cal} />
          <View style={styles.body}>
            <View style={styles.headRow}>
              <Text style={[styles.desc, { color: t.text }]} numberOfLines={2}>
                {m.description}
              </Text>
              <Text style={[styles.kcal, { color: t.cal }]}>
                {m.calories} <Text style={styles.kcalUnit}>kcal</Text>
              </Text>
            </View>
            <Text style={[styles.time, { color: t.muted }]}>{formatTime(m.logged_at)}</Text>
            <View style={styles.macros}>
              <MacroTag label="P" value={m.protein_g ?? 0} color={t.protein} />
              <MacroTag label="C" value={m.carbs_g ?? 0} color={t.carbs} />
              <MacroTag label="F" value={m.fat_g ?? 0} color={t.fat} />
            </View>
          </View>
        </Pressable>
      ))}

      <MealDetailModal
        meal={editing}
        onClose={() => setEditing(null)}
        onChanged={onChanged}
      />
    </View>
  );
}

function MacroTag({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Text style={[styles.macroTag, { color }]}>
      {label} {Math.round(value)}g
    </Text>
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
  total: { fontSize: 14, fontWeight: '700' },
  empty: { fontSize: 13, marginTop: 4 },

  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    gap: 12,
  },
  body: { flex: 1, gap: 2 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  desc: { fontSize: 14, fontWeight: '600', flex: 1 },
  kcal: { fontSize: 15, fontWeight: '700' },
  kcalUnit: { fontSize: 10, fontWeight: '500' },
  time: { fontSize: 11 },
  macros: { flexDirection: 'row', gap: 12, marginTop: 2 },
  macroTag: { fontSize: 11, fontWeight: '700' },
});

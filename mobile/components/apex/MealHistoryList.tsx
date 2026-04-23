import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Meal } from '../../../shared/src/types/home';
import { useTokens } from '../../lib/theme';
import { EmptyState } from './EmptyState';
import { MealEditSheet } from './MealEditSheet';

type Filter = 'all' | 'week' | 'month';

interface Props {
  meals: Meal[];
  onChanged: () => void;
}

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
];

function daysBackIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateHeader(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const inputDay = new Date(d);
  inputDay.setHours(0, 0, 0, 0);
  if (inputDay.getTime() === today.getTime()) return 'Today';
  if (inputDay.getTime() === yesterday.getTime()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const h = d.getHours();
  const m = d.getMinutes();
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export function MealHistoryList({ meals, onChanged }: Props) {
  const t = useTokens();
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<Meal | null>(null);

  const grouped = useMemo(() => {
    const cutoff = filter === 'week' ? daysBackIso(6) : filter === 'month' ? daysBackIso(29) : null;
    const filtered = cutoff ? meals.filter((m) => m.log_date >= cutoff) : meals;
    const map = new Map<string, Meal[]>();
    filtered.forEach((m) => {
      const existing = map.get(m.log_date);
      if (existing) existing.push(m);
      else map.set(m.log_date, [m]);
    });
    // Sort keys desc, each group's meals desc by logged_at.
    return [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([date, rows]) => ({
        date,
        meals: [...rows].sort(
          (a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime(),
        ),
      }));
  }, [meals, filter]);

  if (meals.length === 0) {
    return (
      <EmptyState
        icon="🍽️"
        title="No meals logged yet"
        description="Start logging from the Today tab."
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

      {grouped.length === 0 ? (
        <Text style={[styles.filterEmpty, { color: t.subtle }]}>
          No meals in this range.
        </Text>
      ) : null}

      {grouped.map(({ date, meals: rows }) => {
        const totalKcal = rows.reduce((s, m) => s + (m.calories ?? 0), 0);
        const totalProtein = rows.reduce((s, m) => s + (m.protein_g ?? 0), 0);
        return (
          <View key={date} style={styles.group}>
            <Text style={[styles.groupHeader, { color: t.text }]}>{formatDateHeader(date)}</Text>
            <View style={[styles.summaryPill, { backgroundColor: t.surface2 }]}>
              <Text style={[styles.summaryText, { color: t.muted }]}>
                {rows.length} meal{rows.length === 1 ? '' : 's'} · {totalKcal.toLocaleString()} kcal ·{' '}
                {Math.round(totalProtein)}g protein
              </Text>
            </View>

            <View style={[styles.card, { backgroundColor: t.surface, shadowColor: '#000' }]}>
              {rows.map((m, idx) => (
                <Pressable
                  key={m.id}
                  onPress={() => setEditing(m)}
                  style={({ pressed }) => [
                    styles.row,
                    {
                      borderBottomColor: t.border,
                      borderBottomWidth: idx < rows.length - 1 ? StyleSheet.hairlineWidth : 0,
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
            </View>
          </View>
        );
      })}

      <MealEditSheet meal={editing} onClose={() => setEditing(null)} onSaved={onChanged} />
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
  wrap: { gap: 14 },

  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    borderRadius: 100,
    borderWidth: 1,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  chipLabel: { fontSize: 13 },
  filterEmpty: { fontSize: 13, textAlign: 'center', paddingVertical: 16 },

  group: { gap: 6 },
  groupHeader: { fontSize: 17, fontWeight: '700', paddingHorizontal: 2 },
  summaryPill: {
    alignSelf: 'flex-start',
    borderRadius: 100,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginLeft: 2,
  },
  summaryText: { fontSize: 11, fontWeight: '600' },

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

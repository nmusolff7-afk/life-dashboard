import { useRouter, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { GoalCategory, GoalLibraryEntry } from '../../../shared/src/types/goals';
import { useGoalLibrary } from '../../lib/hooks/useGoals';
import { useTokens } from '../../lib/theme';

const CATEGORIES: { key: GoalCategory | 'all'; label: string; emoji: string }[] = [
  { key: 'all', label: 'All', emoji: '📚' },
  { key: 'fitness', label: 'Fitness', emoji: '💪' },
  { key: 'nutrition', label: 'Nutrition', emoji: '🥗' },
  { key: 'finance', label: 'Finance', emoji: '💰' },
  { key: 'time', label: 'Time', emoji: '⏰' },
];

export default function LibraryScreen() {
  const t = useTokens();
  const router = useRouter();
  const lib = useGoalLibrary();
  const [filter, setFilter] = useState<GoalCategory | 'all'>('all');

  const entries = useMemo(() => {
    const all = lib.data ?? [];
    if (filter === 'all') return all;
    return all.filter((e) => e.category === filter);
  }, [lib.data, filter]);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: 'Goal library', headerStyle: { backgroundColor: t.bg }, headerTintColor: t.text, headerShadowVisible: false }} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {CATEGORIES.map((c) => {
          const active = filter === c.key;
          return (
            <Pressable
              key={c.key}
              onPress={() => setFilter(c.key)}
              style={[
                styles.filterPill,
                { backgroundColor: active ? t.accent + '22' : t.surface, borderColor: active ? t.accent : t.border },
              ]}>
              <Text style={[styles.filterText, { color: active ? t.accent : t.muted }]}>{c.emoji}  {c.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {lib.loading && !lib.data ? (
        <ActivityIndicator color={t.accent} style={{ marginTop: 30 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {entries.map((e) => (
            <LibraryCard
              key={e.library_id}
              entry={e}
              onPress={() => router.push({ pathname: '/goals/customize', params: { library_id: e.library_id } } as never)}
            />
          ))}
          {entries.length === 0 && (
            <Text style={[styles.empty, { color: t.muted }]}>No goals in this category.</Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function LibraryCard({ entry, onPress }: { entry: GoalLibraryEntry; onPress: () => void }) {
  const t = useTokens();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: t.surface, borderColor: t.border, opacity: pressed ? 0.85 : 1 },
      ]}>
      <View style={styles.cardHeader}>
        <Text style={[styles.cardId, { color: t.subtle }]}>{entry.library_id}</Text>
        <Text style={[styles.cardType, { color: t.subtle }]}>{entry.goal_type.replace(/_/g, ' ')}</Text>
      </View>
      <Text style={[styles.cardName, { color: t.text }]}>{entry.display_name}</Text>
      {entry.description ? (
        <Text style={[styles.cardDesc, { color: t.muted }]}>{entry.description}</Text>
      ) : null}
      {entry.affects_calorie_math === 1 ? (
        <View style={[styles.flagPill, { backgroundColor: t.accent + '22', borderColor: t.accent }]}>
          <Text style={[styles.flagText, { color: t.accent }]}>Drives calorie targets</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  filterRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  filterPill: { borderWidth: 1, borderRadius: 100, paddingVertical: 6, paddingHorizontal: 12, marginRight: 8 },
  filterText: { fontSize: 12, fontWeight: '600' },
  content: { padding: 16, gap: 10, paddingBottom: 48 },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 6 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  cardId: { fontSize: 11, fontWeight: '700' },
  cardType: { fontSize: 11, fontWeight: '500', textTransform: 'capitalize' },
  cardName: { fontSize: 16, fontWeight: '700' },
  cardDesc: { fontSize: 13, lineHeight: 18 },
  flagPill: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 100, paddingVertical: 3, paddingHorizontal: 8, marginTop: 4 },
  flagText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 14 },
});

import { useFocusEffect, useRouter, Stack } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/ui';
import { useTokens } from '../../lib/theme';
import { useGoals, useArchivedGoals, useCompletedGoals } from '../../lib/hooks/useGoals';
import { GoalRow } from '../../components/apex/GoalRow';

export default function GoalsScreen() {
  const t = useTokens();
  const router = useRouter();
  const active = useGoals();
  const completed = useCompletedGoals();
  const archived = useArchivedGoals();

  // Deps MUST be stable .refetch refs, not the hook-return objects
  // (which are fresh each render — see Finance/Time tabs for the full
  // render-loop explanation).
  const activeRefetch = active.refetch;
  const completedRefetch = completed.refetch;
  const archivedRefetch = archived.refetch;
  useFocusEffect(
    useCallback(() => {
      activeRefetch();
      completedRefetch();
      archivedRefetch();
    }, [activeRefetch, completedRefetch, archivedRefetch]),
  );

  const activeGoals = active.data?.goals ?? [];
  const slotLimit = active.data?.slot_limit ?? 6;
  const slotsUsed = active.data?.active_count ?? activeGoals.length;
  const canAdd = slotsUsed < slotLimit;
  const completedGoals = completed.data?.goals ?? [];
  const archivedGoals = archived.data?.goals ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: 'Goals', headerStyle: { backgroundColor: t.bg }, headerTintColor: t.text, headerShadowVisible: false }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.slotRow}>
          <Text style={[styles.sectionLabel, { color: t.muted }]}>Active goals</Text>
          <Text style={[styles.slotCount, { color: t.subtle }]}>{slotsUsed} / {slotLimit}</Text>
        </View>

        {active.loading && !active.data ? (
          <ActivityIndicator color={t.accent} />
        ) : activeGoals.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={styles.emoji}>🎯</Text>
            <Text style={[styles.emptyTitle, { color: t.text }]}>No active goals yet</Text>
            <Text style={[styles.emptyBody, { color: t.muted }]}>
              Pick up to {slotLimit} goals from the library. Fitness body-composition goals drive your calorie targets; others just track progress.
            </Text>
            <Button
              title="Browse goal library"
              onPress={() => router.push('/goals/library' as never)}
              style={{ marginTop: 8 }}
            />
          </View>
        ) : (
          <>
            {activeGoals.map((g) => (
              <GoalRow key={g.goal_id} goal={g} onPress={() => router.push(`/goals/${g.goal_id}` as never)} />
            ))}
            <Button
              title={canAdd ? 'Add another goal' : 'Slot limit reached'}
              onPress={() => canAdd && router.push('/goals/library' as never)}
              disabled={!canAdd}
              style={{ marginTop: 8 }}
            />
          </>
        )}

        {completedGoals.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: t.muted, marginTop: 18 }]}>Completed</Text>
            {completedGoals.map((g) => (
              <GoalRow key={g.goal_id} goal={g} onPress={() => router.push(`/goals/${g.goal_id}` as never)} />
            ))}
          </>
        )}

        <Text style={[styles.sectionLabel, { color: t.muted, marginTop: 18 }]}>Archived</Text>
        {archivedGoals.length === 0 ? (
          <Pressable style={[styles.archivedCard, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={[styles.archivedText, { color: t.subtle }]}>Archived goals appear here.</Text>
          </Pressable>
        ) : (
          archivedGoals.map((g) => (
            <GoalRow key={g.goal_id} goal={g} onPress={() => router.push(`/goals/${g.goal_id}` as never)} />
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 10, paddingBottom: 48 },
  slotRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  slotCount: { fontSize: 12, fontWeight: '600' },
  sectionLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  emptyCard: { borderWidth: 1, borderRadius: 20, padding: 20, alignItems: 'center', gap: 10 },
  emoji: { fontSize: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptyBody: { fontSize: 13, lineHeight: 18, textAlign: 'center', maxWidth: 300 },
  archivedCard: { borderWidth: 1, borderRadius: 14, padding: 14 },
  archivedText: { fontSize: 13 },
});

import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useWorkoutPlan } from '../../lib/hooks/useWorkoutPlan';
import { useHaptics } from '../../lib/useHaptics';
import { useTokens } from '../../lib/theme';

/** Settings → Workout Plan section (PRD §4.3.10 "Edit Plan" /
 *  direct-edit sectional pattern). Shows a plan summary + Build/Edit/
 *  Switch buttons. Heavy lifting lives in /fitness/plan and
 *  /fitness/plan/builder; this screen is an entry point for users who
 *  prefer the Settings hierarchy. */
export default function SettingsWorkoutPlan() {
  const t = useTokens();
  const router = useRouter();
  const haptics = useHaptics();
  const { plan, loading, refetch } = useWorkoutPlan();

  // Re-fetch when returning from the builder so a just-built plan
  // surfaces here immediately.
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: 'Workout plan' }} />
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator color={t.accent} style={{ marginTop: 40 }} />
        ) : plan ? (
          <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={[styles.cardLabel, { color: t.muted }]}>Active plan</Text>
            <Text style={[styles.cardTitle, { color: t.text }]}>
              {planSummary(plan)}
            </Text>
            {plan.understanding ? (
              <Text style={[styles.cardBody, { color: t.muted }]} numberOfLines={3}>
                {plan.understanding}
              </Text>
            ) : null}
            <View style={styles.cardActions}>
              <Pressable
                onPress={() => { haptics.fire('tap'); router.push('/fitness/plan' as never); }}
                style={({ pressed }) => [
                  styles.secondary,
                  { backgroundColor: t.surface2, opacity: pressed ? 0.7 : 1 },
                ]}>
                <Ionicons name="create-outline" size={14} color={t.text} />
                <Text style={[styles.secondaryLabel, { color: t.text }]}>View / edit</Text>
              </Pressable>
              <Pressable
                onPress={() => { haptics.fire('tap'); router.push('/fitness/plan/builder'); }}
                style={({ pressed }) => [
                  styles.secondary,
                  { backgroundColor: t.surface2, opacity: pressed ? 0.7 : 1 },
                ]}>
                <Ionicons name="swap-horizontal-outline" size={14} color={t.text} />
                <Text style={[styles.secondaryLabel, { color: t.text }]}>Switch plan</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={[styles.cardLabel, { color: t.muted }]}>No plan yet</Text>
            <Text style={[styles.cardTitle, { color: t.text }]}>Build a workout plan</Text>
            <Text style={[styles.cardBody, { color: t.muted }]}>
              Pick your days, goal, equipment, and constraints — the app generates a full weekly
              plan you can edit at any time.
            </Text>
            <Pressable
              onPress={() => { haptics.fire('tap'); router.push('/fitness/plan/builder'); }}
              style={({ pressed }) => [
                styles.primary,
                { backgroundColor: t.accent, opacity: pressed ? 0.85 : 1 },
              ]}>
              <Ionicons name="sparkles-outline" size={14} color="#fff" />
              <Text style={styles.primaryLabel}>Build a plan</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function planSummary(plan: ReturnType<typeof useWorkoutPlan>['plan']): string {
  if (!plan) return '—';
  const weekly = plan.plan?.weeklyPlan ?? {};
  const trainingDays = Object.entries(weekly).filter(([, d]) => {
    const hasExercises = Array.isArray(d?.exercises) && (d?.exercises.length ?? 0) > 0;
    const hasCardio = !!d?.cardio?.type?.trim();
    return hasExercises || hasCardio;
  }).length;
  return `${trainingDays} training day${trainingDays === 1 ? '' : 's'} / week`;
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 8 },
  cardLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  cardTitle: { fontSize: 18, fontWeight: '700' },
  cardBody: { fontSize: 13, lineHeight: 18 },
  cardActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  secondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
  },
  secondaryLabel: { fontSize: 13, fontWeight: '600' },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 100,
    marginTop: 6,
  },
  primaryLabel: { color: '#fff', fontSize: 13, fontWeight: '700' },
});

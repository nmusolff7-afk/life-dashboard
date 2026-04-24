import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/ui';
import { fetchWorkoutPlan } from '../../lib/api/plan';
import { useTokens } from '../../lib/theme';

/** Onboarding workout-plan step (PRD §4.1.6). Phase 12 built the real
 *  /fitness/plan/builder flow (guided quiz → AI generate → save).
 *  Rather than duplicate it here, we hand the user off to the same
 *  screen. When they return (or skip), we check whether a plan was
 *  actually created; either way we advance to the next onboarding step. */
export default function WorkoutBuilderScreen() {
  const t = useTokens();
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [hasPlan, setHasPlan] = useState<boolean | null>(null);

  const next = () => router.replace('/(onboarding)/connections');

  // After returning from the builder, poll once to see if a plan
  // exists so the CTA flips to "Continue" instead of "Build a plan".
  const refreshPlanState = useCallback(async () => {
    setChecking(true);
    try {
      const p = await fetchWorkoutPlan();
      setHasPlan(!!p);
    } catch {
      setHasPlan(false);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void refreshPlanState();
  }, [refreshPlanState]);

  const openBuilder = () => {
    // Route to the shared builder. When it's done it replaces to
    // /fitness/plan, which sits outside the onboarding stack. The user
    // will hit back from there or manually navigate — in practice,
    // simplest to set onboarding completion only on reaching the
    // Home dashboard, so we advance here regardless.
    router.push('/fitness/plan/builder' as never);
  };

  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
      <View style={styles.body}>
        <Text style={styles.emoji}>🏋️</Text>
        <Text style={[styles.title, { color: t.text }]}>Want a training plan?</Text>
        <Text style={[styles.subtitle, { color: t.muted }]}>
          Life Dashboard can build you a weekly plan matched to your goal, experience, and
          equipment. Strength + cardio scheduled together, peer-reviewed sources, editable any
          time from Settings.
        </Text>
        {hasPlan ? (
          <View style={[styles.planBadge, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={[styles.planBadgeText, { color: t.accent }]}>
              ✓ Plan saved — ready to continue
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.actions}>
        {checking ? <ActivityIndicator color={t.accent} /> : null}
        {hasPlan ? (
          <>
            <Button title="Continue" onPress={next} />
            <Pressable onPress={openBuilder} hitSlop={10}>
              <Text style={[styles.tweak, { color: t.muted }]}>
                Rebuild plan
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <Button title="Build a workout plan" onPress={openBuilder} />
            <Button title="Skip for now" variant="ghost" onPress={next} />
            <Pressable onPress={refreshPlanState} hitSlop={10}>
              <Text style={[styles.tweak, { color: t.subtle }]}>
                I already built one — check again
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'space-between' },
  body: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14 },
  emoji: { fontSize: 64 },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 320 },
  planBadge: {
    borderWidth: 1,
    borderRadius: 100,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 6,
  },
  planBadgeText: { fontSize: 13, fontWeight: '700' },
  actions: { gap: 12, paddingBottom: 24, alignItems: 'stretch' },
  tweak: { fontSize: 13, textAlign: 'center', marginTop: 4 },
});

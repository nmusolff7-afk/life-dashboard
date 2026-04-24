import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  CategoryScoreRow,
  FAB,
  OverallScoreHero,
  StreakBar,
  TodayBalanceCard,
} from '../../components/apex';
import {
  useLoggedDates,
  useProfile,
  useTodayNutrition,
  useTodaySteps,
  useTodayWorkouts,
} from '../../lib/hooks/useHomeData';
import { useScores } from '../../lib/hooks/useScores';
import { useTokens } from '../../lib/theme';
import { useResetScrollOnFocus } from '../../lib/useResetScrollOnFocus';
import { computeNeat, type Occupation } from '../../../shared/src/logic/neat';
import { resolveTef } from '../../../shared/src/logic/tef';
import { computeTdee } from '../../../shared/src/logic/tdee';
import { localToday } from '../../lib/localTime';

export default function HomeScreen() {
  const t = useTokens();
  const router = useRouter();
  // Use user's local timezone for "today" instead of UTC — otherwise
  // anything west of UTC sees the streak-bar highlight jump forward
  // and logs bucket into the wrong day late in the evening.
  const today = localToday();

  const { ref: scrollRef } = useResetScrollOnFocus();

  const nutrition = useTodayNutrition();
  const workouts = useTodayWorkouts();
  const profile = useProfile();
  const loggedDatesApi = useLoggedDates(90);
  const scores = useScores();
  const stepsState = useTodaySteps();

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        nutrition.refetch(),
        workouts.refetch(),
        profile.refetch(),
        loggedDatesApi.refetch(),
        scores.refetchAll(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [nutrition, workouts, profile, loggedDatesApi, scores]);

  // Derived values ---------------------------------------------------------

  const loggedDates = useMemo(() => new Set(loggedDatesApi.data ?? []), [loggedDatesApi.data]);

  const totals = nutrition.data?.totals;
  const burn = workouts.data?.burn ?? 0;
  const consumed = totals?.total_calories ?? 0;

  // Live TDEE — RMR + NEAT + EAT + TEF computed from today's actual data.
  // Mirrors templates/index.html `applyProfileToMeals` (line ~5906). The
  // calorie target is then (liveTdee + deficit_surplus), where deficit is
  // signed per goal (negative for weight loss, positive for surplus). The
  // stored user_goals.calorie_target is NOT used here — it's a stale
  // snapshot and would break calorie-remaining math whenever today's
  // actual burn diverges from the profile's assumed burn.
  const occupation: Occupation = ((): Occupation => {
    const ws = profile.data?.work_style;
    return ws === 'standing' || ws === 'physical' ? ws : 'sedentary';
  })();
  const workoutDescriptions = (workouts.data?.workouts ?? []).map((w) => w.description ?? '');
  const neat = computeNeat({
    occupation,
    totalSteps: stepsState.steps ?? 0,
    workoutDescriptions,
  });
  const tef = resolveTef(consumed, {
    proteinG: totals?.total_protein ?? 0,
    carbsG: totals?.total_carbs ?? 0,
    fatG: totals?.total_fat ?? 0,
  });
  const rmr = profile.data?.rmr_kcal ?? 0;
  const liveTdee = rmr > 0 ? computeTdee({ rmr, neat: neat.neatKcal, eat: burn, tef }) : null;
  const deficit = profile.data?.goal_targets?.deficit_surplus ?? 0;
  const calorieTarget = liveTdee != null ? liveTdee + deficit : null;

  const targets = profile.data?.goal_targets;
  const macroTargets = {
    proteinG: targets?.protein_g ?? profile.data?.daily_protein_goal_g ?? null,
    carbsG: targets?.carbs_g ?? null,
    fatG: targets?.fat_g ?? null,
    sugarG: null,
    fiberG: null,
    sodiumMg: null,
  };
  const macroValues = {
    proteinG: totals?.total_protein ?? 0,
    carbsG: totals?.total_carbs ?? 0,
    fatG: totals?.total_fat ?? 0,
    sugarG: totals?.total_sugar ?? 0,
    fiberG: totals?.total_fiber ?? 0,
    sodiumMg: totals?.total_sodium ?? 0,
  };

  // Category row blurbs — "most important data point" per PRD §4.2.3 and
  // locked D2. Parent assembles, child renders. Kept short so the row
  // stays scannable.
  const fitnessBlurb = useMemo(() => {
    const w = workouts.data?.workouts ?? [];
    if (w.length === 0) return 'No activity logged yet today';
    const last = w[w.length - 1];
    const shortDesc = (last.description ?? '').split(',')[0].slice(0, 40);
    return `${burn} cal burned · last: ${shortDesc || 'workout'}`;
  }, [workouts.data, burn]);

  const nutritionBlurb = useMemo(() => {
    const meals = nutrition.data?.meals ?? [];
    if (meals.length === 0) return 'No meals logged yet today';
    const remaining = calorieTarget != null ? Math.max(0, calorieTarget - consumed) : null;
    const protein = Math.round(totals?.total_protein ?? 0);
    if (remaining != null) {
      return `${consumed} of ${calorieTarget} cal · ${protein}g protein`;
    }
    return `${consumed} cal consumed · ${protein}g protein`;
  }, [nutrition.data, consumed, calorieTarget, totals]);

  // Backend-error detection: if core calls fail together, surface a single banner.
  const backendError = nutrition.error && workouts.error && profile.error;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.muted} />}>
        {backendError ? (
          <Pressable
            onPress={onRefresh}
            style={[styles.errorBanner, { backgroundColor: 'rgba(255,77,77,0.08)' }]}>
            <Text style={[styles.errorText, { color: t.danger }]}>
              ⚠ Can't reach the backend. Pull down to refresh.
            </Text>
          </Pressable>
        ) : null}

        {/* Streak bar anchors the top — preserved from Flask PWA layout. */}
        <StreakBar loggedDates={loggedDates} today={today} days={90} />

        {/* Overall Score — BLUF for the tab. */}
        <OverallScoreHero data={scores.overall.data} loading={scores.overall.loading} />


        {/* Four category score rows — full-width stacked per D2 */}
        <View style={styles.categoryStack}>
          <CategoryScoreRow
            category="fitness"
            data={scores.fitness.data}
            loading={scores.fitness.loading}
            blurb={fitnessBlurb}
            href="/(tabs)/fitness"
          />
          <CategoryScoreRow
            category="nutrition"
            data={scores.nutrition.data}
            loading={scores.nutrition.loading}
            blurb={nutritionBlurb}
            href="/(tabs)/nutrition"
          />
          <CategoryScoreRow
            category="finance"
            data={scores.finance.data}
            loading={scores.finance.loading}
            href="/(tabs)/finance"
          />
          <CategoryScoreRow
            category="time"
            data={scores.time.data}
            loading={scores.time.loading}
            href="/(tabs)/time"
          />
        </View>

        {/* Today's balance card — stays on Home until Phase 3 reorg moves
            it into Nutrition Today. */}
        <View style={styles.horizPad}>
          <TodayBalanceCard
            caloriesConsumed={consumed}
            calorieTarget={calorieTarget}
            tdee={liveTdee}
            macroValues={macroValues}
            macroTargets={macroTargets}
            empty={(nutrition.data?.meals.length ?? 0) === 0}
            meals={nutrition.data?.meals ?? []}
            workouts={workouts.data?.workouts ?? []}
            onGoalsPress={() => router.push('/goals')}
          />
        </View>
      </ScrollView>
      <FAB />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 8, paddingBottom: 96, gap: 14 },
  horizPad: { paddingHorizontal: 16 },

  categoryStack: { paddingHorizontal: 16, gap: 10 },

  errorBanner: { marginHorizontal: 16, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16 },
  errorText: { fontSize: 14, fontWeight: '500' },
});

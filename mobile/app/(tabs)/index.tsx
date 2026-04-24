import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  CategoryScoreRow,
  FAB,
  OverallScoreHero,
  ProgressRow,
  StreakBar,
  TabHeader,
} from '../../components/apex';
import {
  useLoggedDates,
  useProfile,
  useTodayNutrition,
  useTodaySteps,
  useTodayWorkouts,
} from '../../lib/hooks/useHomeData';
import { useLiveCalorieBalance } from '../../lib/hooks/useLiveCalorieBalance';
import { useScores } from '../../lib/hooks/useScores';
import { useTokens } from '../../lib/theme';
import { useDailyReset } from '../../lib/useDailyReset';
import { useResetScrollOnFocus } from '../../lib/useResetScrollOnFocus';
import { localToday } from '../../lib/localTime';

// PRD §4.4.9 — FDA-default secondary nutrients. Used as fallback when the
// user hasn't set personal targets on Profile / Macros page.
const SUGAR_GOAL_G = 50;
const FIBER_GOAL_G = 30;
const SODIUM_GOAL_MG = 2300;

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
  const balance = useLiveCalorieBalance();

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

  // Silently refetch everything when the local calendar day rolls over.
  // Otherwise "today's" sections keep showing yesterday's data until the
  // user manually pulls-to-refresh.
  useDailyReset(() => {
    void onRefresh();
    void stepsState.refetch();
  });

  // Derived values ---------------------------------------------------------

  const loggedDates = useMemo(() => new Set(loggedDatesApi.data ?? []), [loggedDatesApi.data]);

  const totals = nutrition.data?.totals;
  // Calorie math — all displays use these names (never RMR/NEAT/EAT/TEF
  // individually outside Settings). See useLiveCalorieBalance.ts for the spec.
  const { totalBurn, totalIntake, goalIntake, deficitSurplus, distanceToGoal } = balance;

  // Macro targets — from profile when set, otherwise FDA defaults for micros.
  // E3 locked fix: Home's previous null micro targets meant the bars never
  // filled. FDA defaults match templates/index.html L5939 (sugar 50, fiber 30,
  // sodium 2300). Once per-user custom goals ship, swap these through.
  const targets = profile.data?.goal_targets;
  const macroTargets = {
    proteinG: targets?.protein_g ?? profile.data?.daily_protein_goal_g ?? null,
    carbsG: targets?.carbs_g ?? null,
    fatG: targets?.fat_g ?? null,
    sugarG: SUGAR_GOAL_G,
    fiberG: FIBER_GOAL_G,
    sodiumMg: SODIUM_GOAL_MG,
  };

  // Per-row blurbs ("most important data point" per PRD §4.2.3, locked D2).
  const fitnessBlurb = useMemo(() => {
    const w = workouts.data?.workouts ?? [];
    if (w.length === 0 && totalBurn == null) return 'No activity logged yet today';
    const last = w[w.length - 1];
    const shortDesc = last ? (last.description ?? '').split(',')[0].slice(0, 40) : null;
    const burnText = totalBurn != null ? `${totalBurn} cal burned` : 'tracking burn';
    return shortDesc ? `${burnText} · last: ${shortDesc}` : burnText;
  }, [workouts.data, totalBurn]);

  const nutritionBlurb = useMemo(() => {
    const meals = nutrition.data?.meals ?? [];
    if (meals.length === 0) return 'No meals logged yet today';
    if (goalIntake != null && distanceToGoal != null) {
      const tail = distanceToGoal >= 0
        ? `${distanceToGoal} cals left`
        : `${Math.abs(distanceToGoal)} over`;
      return `${totalIntake} of ${goalIntake} cal · ${tail}`;
    }
    return `${totalIntake} cal consumed`;
  }, [nutrition.data, totalIntake, goalIntake, distanceToGoal]);

  // Fitness rich content — small stat trio (weight / steps / workout) per
  // PRD §4.2.3 Fitness Card ("Weight · Steps · Cal burned · Last workout").
  const weightLbs = profile.data?.current_weight_lbs ?? null;
  const stepsToday = stepsState.steps ?? 0;

  // Backend-error detection: if core calls fail together, surface a single banner.
  const backendError = nutrition.error && workouts.error && profile.error;

  // Active-goals strip — single-card variant until the 22-goal library
  // (PRD §4.10) ships. Renders the user's primary calorie goal if set.
  const activeGoal = profile.data?.goal_targets;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <TabHeader
        title="Home"
        right={<StreakBar loggedDates={loggedDates} today={today} days={90} compact />}
      />
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

        {/* Overall Score — BLUF for the tab. */}
        <OverallScoreHero data={scores.overall.data} loading={scores.overall.loading} />

        {/* 90-day scrolling streak bar — today at the right edge, oldest
            left. The compact flame+count in the header is a glance;
            this is the full drillable history. */}
        <StreakBar loggedDates={loggedDates} today={today} days={90} />

        {/* Active goals strip. Single card until §4.10 goal library lands. */}
        {activeGoal ? (
          <View style={styles.horizPad}>
            <Pressable
              onPress={() => router.push('/goals')}
              style={({ pressed }) => [
                styles.goalCard,
                {
                  backgroundColor: t.surface,
                  borderColor: t.border,
                  transform: [{ scale: pressed ? 0.99 : 1 }],
                },
              ]}>
              <View style={styles.goalHeader}>
                <View style={[styles.goalCategoryDot, { backgroundColor: t.fitness }]} />
                <Text style={[styles.goalTitle, { color: t.text }]} numberOfLines={1}>
                  {activeGoal.goal_label}
                </Text>
              </View>
              <View style={[styles.goalBarTrack, { backgroundColor: 'rgba(255,255,255,0.05)' }]}>
                <View style={[styles.goalBarFill, { backgroundColor: t.fitness, width: '35%' }]} />
              </View>
              <Text style={[styles.goalSub, { color: t.muted }]} numberOfLines={1}>
                {goalIntake != null ? `${goalIntake} kcal goal · ` : ''}
                {Math.abs(deficitSurplus)} kcal {deficitSurplus < 0 ? 'deficit' : 'surplus'}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* Four category score rows — full-width stacked per D2 */}
        <View style={styles.categoryStack}>
          <CategoryScoreRow
            category="fitness"
            data={scores.fitness.data}
            loading={scores.fitness.loading}
            blurb={fitnessBlurb}
            href="/(tabs)/fitness"
            richContent={
              <View style={styles.statGrid}>
                <MiniStat label="Weight" value={weightLbs != null ? `${Math.round(weightLbs)}` : '—'} unit="lbs" />
                <MiniStat label="Steps" value={stepsToday > 0 ? stepsToday.toLocaleString() : '—'} />
                <MiniStat label="Burned" value={totalBurn != null ? `${totalBurn}` : '—'} unit="kcal" />
              </View>
            }
            expandedContent={
              <View style={styles.statGrid}>
                <MiniStat
                  label="Workouts"
                  value={`${(workouts.data?.workouts ?? []).length}`}
                />
                <MiniStat
                  label="Intake"
                  value={totalIntake > 0 ? `${totalIntake}` : '—'}
                  unit="kcal"
                />
                <MiniStat
                  label="Net"
                  value={
                    totalBurn != null
                      ? `${Math.abs(totalBurn - totalIntake)}`
                      : '—'
                  }
                  unit={totalBurn != null && totalBurn - totalIntake >= 0 ? 'deficit' : 'surplus'}
                />
              </View>
            }
          />

          <CategoryScoreRow
            category="nutrition"
            data={scores.nutrition.data}
            loading={scores.nutrition.loading}
            blurb={nutritionBlurb}
            href="/(tabs)/nutrition"
            richContent={
              <View style={styles.macroBars}>
                <ProgressRow
                  label="Protein"
                  color={t.protein}
                  consumed={totals?.total_protein ?? 0}
                  target={macroTargets.proteinG}
                  unit="g"
                />
                <ProgressRow
                  label="Carbs"
                  color={t.carbs}
                  consumed={totals?.total_carbs ?? 0}
                  target={macroTargets.carbsG}
                  unit="g"
                />
                <ProgressRow
                  label="Fat"
                  color={t.fat}
                  consumed={totals?.total_fat ?? 0}
                  target={macroTargets.fatG}
                  unit="g"
                />
              </View>
            }
            expandedContent={
              <View style={styles.macroBars}>
                <ProgressRow
                  label="Sugar"
                  color={t.sugar}
                  consumed={totals?.total_sugar ?? 0}
                  target={macroTargets.sugarG}
                  unit="g"
                />
                <ProgressRow
                  label="Fiber"
                  color={t.fiber}
                  consumed={totals?.total_fiber ?? 0}
                  target={macroTargets.fiberG}
                  unit="g"
                />
                <ProgressRow
                  label="Sodium"
                  color={t.sodium}
                  consumed={totals?.total_sodium ?? 0}
                  target={macroTargets.sodiumMg}
                  unit="mg"
                />
              </View>
            }
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
      </ScrollView>
      <FAB />
    </View>
  );
}

// ── Subcomponents ─────────────────────────────────────────────────────────

function MiniStat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  const t = useTokens();
  return (
    <View style={styles.miniStat}>
      <Text style={[styles.miniStatLabel, { color: t.muted }]}>{label}</Text>
      <Text style={[styles.miniStatValue, { color: t.text }]}>
        {value}
        {unit ? <Text style={[styles.miniStatUnit, { color: t.muted }]}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 8, paddingBottom: 96, gap: 14 },
  horizPad: { paddingHorizontal: 16 },

  categoryStack: { paddingHorizontal: 16, gap: 10 },

  statGrid: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  miniStat: { flex: 1 },
  miniStatLabel: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  miniStatValue: { fontSize: 16, fontWeight: '700', marginTop: 2 },
  miniStatUnit: { fontSize: 11, fontWeight: '500' },

  macroBars: { gap: 8, marginTop: 4 },
  divider: { height: 1, marginVertical: 4 },

  goalCard: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 8,
  },
  goalHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  goalCategoryDot: { width: 8, height: 8, borderRadius: 4 },
  goalTitle: { fontSize: 14, fontWeight: '600', flex: 1 },
  goalBarTrack: { height: 4, borderRadius: 100, overflow: 'hidden' },
  goalBarFill: { height: '100%', borderRadius: 100 },
  goalSub: { fontSize: 11 },

  errorBanner: { marginHorizontal: 16, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16 },
  errorText: { fontSize: 14, fontWeight: '500' },
});

import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  CategoryScoreCard,
  FAB,
  MacroMicroGrid,
  ScreenHeader,
  StatCard,
  StreakBar,
  TodayBalanceCard,
} from '../../components/apex';
import {
  useMomentumHistory,
  useProfile,
  useTodayNutrition,
  useTodaySteps,
  useTodayWorkouts,
} from '../../lib/hooks/useHomeData';
import { useTokens } from '../../lib/theme';

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function HomeScreen() {
  const t = useTokens();
  const router = useRouter();
  const today = todayIso();

  const nutrition = useTodayNutrition();
  const workouts = useTodayWorkouts();
  const profile = useProfile();
  const momentum = useMomentumHistory(90);
  const stepsState = useTodaySteps();

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        nutrition.refetch(),
        workouts.refetch(),
        profile.refetch(),
        momentum.refetch(),
        stepsState.refetch(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [nutrition, workouts, profile, momentum, stepsState]);

  // Derived values ---------------------------------------------------------

  // Streak: momentum history as proxy for "logged" days (score > 0).
  // Flagged imperfection — a dedicated logged-days endpoint should replace this.
  const loggedDates = useMemo(() => {
    const set = new Set<string>();
    (momentum.data ?? []).forEach((row) => {
      if (row.momentum_score > 0) set.add(row.score_date);
    });
    return set;
  }, [momentum.data]);

  const overallScore = useMemo(() => {
    const list = momentum.data;
    if (!list || list.length === 0) return null;
    const todays = list.find((r) => r.score_date === today);
    const latest = todays ?? list[list.length - 1];
    return Math.round(latest.momentum_score);
  }, [momentum.data, today]);

  const totals = nutrition.data?.totals;
  const burn = workouts.data?.burn ?? 0;
  const consumed = totals?.total_calories ?? 0;
  const calorieTarget = profile.data?.goal_targets?.calorie_target ?? profile.data?.daily_calorie_goal ?? null;
  const weight = profile.data?.current_weight_lbs ?? null;
  const firstName = profile.data?.first_name?.trim();

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

  // Chatbot shortcut helper for logging CTAs.
  const askBot = (prefill: string) =>
    router.push({ pathname: '/chatbot', params: { from: 'home', prefill } });

  // Render -----------------------------------------------------------------

  const title = firstName ? `Hi, ${firstName}` : 'Life Dashboard';

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScreenHeader title={title} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.muted} />}>
        {/* 1. 90-day streak bar */}
        <StreakBar loggedDates={loggedDates} today={today} days={90} />

        {/* 2. Overall score */}
        <View style={styles.overallWrap}>
          <Text style={[styles.overallBig, { color: overallScore == null ? t.subtle : t.text }]}>
            {overallScore == null ? '—' : overallScore}
          </Text>
          <Text style={[styles.overallLabel, { color: t.muted }]}>Overall momentum</Text>
        </View>

        {/* 3. Today's balance */}
        <View style={styles.horizPad}>
          <TodayBalanceCard
            caloriesConsumed={consumed}
            caloriesBurned={burn}
            projectedBurn={profile.data?.rmr_kcal ?? null}
          />
        </View>

        {/* 4–7. Weight / Steps / Burned / Consumed */}
        <View style={styles.statGrid}>
          <StatCard
            label="Weight"
            value={weight == null ? '—' : String(Math.round(weight))}
            unit={weight == null ? undefined : 'lbs'}
            cta={{ label: weight == null ? 'Log weight' : 'Update', onPress: () => askBot('Log my weight: ') }}
            style={styles.statHalf}
          />
          <StatCard
            label="Steps"
            value={stepsState.steps == null ? '—' : stepsState.steps.toLocaleString()}
            cta={{
              label: stepsState.steps == null ? 'Log steps' : 'Update',
              onPress: () => askBot('Log steps: '),
            }}
            style={styles.statHalf}
          />
          <StatCard
            label="Calories burned"
            value={burn > 0 ? String(Math.round(burn)) : '—'}
            unit={burn > 0 ? 'kcal' : undefined}
            valueColor={burn > 0 ? t.green : undefined}
            cta={{ label: 'Log workout', onPress: () => askBot('I just did: ') }}
            style={styles.statHalf}
          />
          <StatCard
            label="Calories eaten"
            value={consumed > 0 ? String(Math.round(consumed)) : '—'}
            unit={
              consumed > 0
                ? calorieTarget
                  ? `/ ${Math.round(calorieTarget)} kcal`
                  : 'kcal'
                : undefined
            }
            valueColor={consumed > 0 ? t.cal : undefined}
            cta={{ label: 'Log meal', onPress: () => askBot('I just ate: ') }}
            style={styles.statHalf}
          />
        </View>

        {/* 8. Macro/micro grid */}
        <View style={styles.horizPad}>
          <MacroMicroGrid consumed={macroValues} targets={macroTargets} />
        </View>

        {/* 9–12. Category score cards (2×2) */}
        <View style={styles.catGrid}>
          <CategoryScoreCard
            label="Fitness"
            color={t.fitness}
            score={null}
            onPress={() => router.push('/(tabs)/fitness')}
          />
          <CategoryScoreCard
            label="Nutrition"
            color={t.nutrition}
            score={null}
            onPress={() => router.push('/(tabs)/nutrition')}
          />
          <CategoryScoreCard
            label="Finance"
            color={t.finance}
            score={null}
            onPress={() => router.push('/(tabs)/finance')}
          />
          <CategoryScoreCard
            label="Time"
            color={t.time}
            score={null}
            onPress={() => router.push('/(tabs)/time')}
          />
        </View>

        {/* 13. Day Timeline stub */}
        <Pressable
          onPress={() => router.push({ pathname: '/day/[date]', params: { date: today } })}
          style={[styles.stub, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text style={[styles.stubLabel, { color: t.muted }]}>Today</Text>
          <Text style={[styles.stubBody, { color: t.subtle }]}>
            {nutrition.data && workouts.data && (nutrition.data.meals.length > 0 || workouts.data.workouts.length > 0)
              ? `${nutrition.data.meals.length} meal${nutrition.data.meals.length === 1 ? '' : 's'} · ${workouts.data.workouts.length} workout${workouts.data.workouts.length === 1 ? '' : 's'} — tap for timeline`
              : 'Your Day Timeline will appear once you log meals or workouts.'}
          </Text>
        </Pressable>

        {/* 14. Active goals stub */}
        <Pressable
          onPress={() => router.push('/goals')}
          style={[styles.stub, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text style={[styles.stubLabel, { color: t.muted }]}>Active goals</Text>
          <Text style={[styles.stubBody, { color: t.subtle }]}>
            No active goals yet. Tap to browse the library.
          </Text>
        </Pressable>
      </ScrollView>
      <FAB />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 8, paddingBottom: 96, gap: 16 },
  horizPad: { paddingHorizontal: 16 },
  overallWrap: { alignItems: 'center', paddingVertical: 8 },
  overallBig: { fontSize: 56, fontWeight: '700' },
  overallLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 2 },
  statGrid: { paddingHorizontal: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statHalf: { flexBasis: '48%', flexGrow: 1 },
  catGrid: { paddingHorizontal: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  stub: { marginHorizontal: 16, borderRadius: 20, borderWidth: 1, padding: 16, gap: 6 },
  stubLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  stubBody: { fontSize: 13 },
});

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
  useLoggedDates,
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
  const loggedDatesApi = useLoggedDates(90);
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
        loggedDatesApi.refetch(),
        stepsState.refetch(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [nutrition, workouts, profile, momentum, loggedDatesApi, stepsState]);

  // Derived values ---------------------------------------------------------

  const loggedDates = useMemo(() => new Set(loggedDatesApi.data ?? []), [loggedDatesApi.data]);

  const overallScore = useMemo(() => {
    const list = momentum.data;
    if (!list || list.length === 0) return null;
    const todays = list.find((r) => r.score_date === today);
    const latest = todays ?? list[list.length - 1];
    return Math.round(latest.momentum_score);
  }, [momentum.data, today]);

  // Flask's traffic-light thresholds: >=80 green, >=50 amber, <50 danger.
  const overallColor =
    overallScore == null
      ? t.subtle
      : overallScore >= 80
        ? t.green
        : overallScore >= 50
          ? t.amber
          : t.danger;

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

  // CTA: logging is reachable via the chatbot prefill for now.
  const askBot = (prefill: string) =>
    router.push({ pathname: '/chatbot', params: { from: 'home', prefill } });

  // Backend-error detection: if core calls fail together, surface a single banner.
  const backendError = nutrition.error && workouts.error && profile.error;

  const greeting = firstName ? `Hi, ${firstName}` : 'Life Dashboard';

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScreenHeader title={greeting} showHistory />
      <ScrollView
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

        {/* Page header — ports Flask .page-header hero */}
        <View style={styles.pageHeader}>
          <Text style={[styles.pageTitle, { color: t.text }]}>Today's Overview</Text>
          <Text style={[styles.pageSubtitle, { color: t.muted }]}>
            Your daily snapshot at a glance
          </Text>
        </View>

        {/* 1. 90-day streak bar */}
        <StreakBar loggedDates={loggedDates} today={today} days={90} />

        {/* 2. Overall momentum score */}
        <View style={styles.overallWrap}>
          <Text style={[styles.overallBig, { color: overallColor }]}>
            {overallScore == null ? '—' : overallScore}
          </Text>
          <Text style={[styles.overallDenom, { color: t.muted }]}>/ 100</Text>
          <Text style={[styles.overallLabel, { color: t.muted }]}>Daily momentum</Text>
        </View>

        {/* 3. Today's balance ring */}
        <View style={styles.horizPad}>
          <TodayBalanceCard
            caloriesConsumed={consumed}
            caloriesBurned={burn}
            projectedBurn={profile.data?.rmr_kcal ?? null}
          />
        </View>

        {/* 4–7. 2×2 stat grid */}
        <View style={styles.statGrid}>
          <StatCard
            label="Weight"
            value={weight == null ? '—' : String(Math.round(weight))}
            onPress={() => askBot('Log my weight: ')}
            style={styles.statHalf}
          />
          <StatCard
            label="Steps"
            value={stepsState.steps == null ? '—' : stepsState.steps.toLocaleString()}
            onPress={() => askBot('Log steps: ')}
            style={styles.statHalf}
          />
          <StatCard
            label="Proj. Burn"
            value={burn > 0 ? String(Math.round(burn)) : '—'}
            valueColor={burn > 0 ? t.cal : undefined}
            onPress={() => askBot('I just did: ')}
            style={styles.statHalf}
          />
          <StatCard
            label="Cals Consumed"
            value={consumed > 0 ? String(Math.round(consumed)) : '—'}
            valueColor={consumed > 0 ? t.cal : undefined}
            onPress={() => askBot('I just ate: ')}
            style={styles.statHalf}
          />
        </View>

        {/* 8. Macros / micros swipe card */}
        <View style={styles.horizPad}>
          <MacroMicroGrid
            consumed={macroValues}
            targets={macroTargets}
            empty={(nutrition.data?.meals.length ?? 0) === 0}
          />
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
          style={[styles.stub, { backgroundColor: t.surface, shadowColor: '#000' }]}>
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
          style={[styles.stub, { backgroundColor: t.surface, shadowColor: '#000' }]}>
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

const cardShadow = {
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.45,
  shadowRadius: 20,
  elevation: 3,
};

const styles = StyleSheet.create({
  content: { paddingTop: 8, paddingBottom: 96, gap: 14 },
  horizPad: { paddingHorizontal: 16 },

  pageHeader: { alignItems: 'center', paddingHorizontal: 18, paddingTop: 4, paddingBottom: 2 },
  pageTitle: { fontSize: 28, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1, lineHeight: 30 },
  pageSubtitle: { fontSize: 13, marginTop: 4 },

  overallWrap: { alignItems: 'center', paddingVertical: 8 },
  overallBig: { fontSize: 72, fontWeight: '700', lineHeight: 74, letterSpacing: -1.5 },
  overallDenom: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: -2 },
  overallLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 6 },

  statGrid: { paddingHorizontal: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statHalf: { flexBasis: '48%', flexGrow: 1 },

  catGrid: { paddingHorizontal: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 12 },

  stub: {
    marginHorizontal: 16,
    borderRadius: 20,
    padding: 16,
    gap: 6,
    ...cardShadow,
  },
  stubLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  stubBody: { fontSize: 13 },

  errorBanner: { marginHorizontal: 16, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16 },
  errorText: { fontSize: 14, fontWeight: '500' },
});

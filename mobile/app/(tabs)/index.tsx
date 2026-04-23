import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  CategoryScoreCard,
  FAB,
  ScreenHeader,
  StreakBar,
  TodayBalanceCard,
} from '../../components/apex';
import {
  useLoggedDates,
  useProfile,
  useTodayNutrition,
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
  const loggedDatesApi = useLoggedDates(90);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        nutrition.refetch(),
        workouts.refetch(),
        profile.refetch(),
        loggedDatesApi.refetch(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [nutrition, workouts, profile, loggedDatesApi]);

  // Derived values ---------------------------------------------------------

  const loggedDates = useMemo(() => new Set(loggedDatesApi.data ?? []), [loggedDatesApi.data]);

  const totals = nutrition.data?.totals;
  const burn = workouts.data?.burn ?? 0;
  const consumed = totals?.total_calories ?? 0;
  const calorieTarget = profile.data?.goal_targets?.calorie_target ?? profile.data?.daily_calorie_goal ?? null;
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

  // Backend-error detection: if core calls fail together, surface a single banner.
  const backendError = nutrition.error && workouts.error && profile.error;

  const headerTitle = firstName
    ? `${firstName.toUpperCase()}'S DASHBOARD`
    : 'YOUR DASHBOARD';

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScreenHeader title={headerTitle} />
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

        <View style={styles.pageHeader}>
          <Text style={[styles.pageTitle, { color: t.text }]}>Today's Overview</Text>
          <Text style={[styles.pageSubtitle, { color: t.muted }]}>
            Your daily snapshot at a glance
          </Text>
        </View>

        <StreakBar loggedDates={loggedDates} today={today} days={90} />

        <View style={styles.horizPad}>
          <TodayBalanceCard
            caloriesConsumed={consumed}
            calorieTarget={calorieTarget}
            tdee={profile.data?.rmr_kcal ?? null}
            macroValues={macroValues}
            macroTargets={macroTargets}
            empty={(nutrition.data?.meals.length ?? 0) === 0}
          />
        </View>

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

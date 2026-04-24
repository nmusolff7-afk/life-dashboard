import { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  BarcodeScanner,
  CalorieBalanceChart,
  CalorieRingCard,
  CaloriesConsumedChart,
  FAB,
  HydrationCard,
  LogMealCard,
  MacroTrendsCard,
  MealHistoryList,
  MealPhotoScanner,
  NutritionMacrosCard,
  OverallScoreHero,
  PantryScanner,
  RecentMealsChips,
  SavedMealsPicker,
  SubTabs,
  TabHeader,
  TodayMealsList,
} from '../../components/apex';
import { DEFAULT_PREFERENCES, loadPreferences, type Preferences } from '../../lib/preferences';
import { useNutritionScore } from '../../lib/hooks/useScores';
import {
  useMealHistory,
  useProfile,
  useSavedMeals,
  useTodayNutrition,
  useTodayWorkouts,
} from '../../lib/hooks/useHomeData';
import { useLiveCalorieBalance } from '../../lib/hooks/useLiveCalorieBalance';
import { useTokens } from '../../lib/theme';
import { useDailyReset } from '../../lib/useDailyReset';
import { useResetScrollOnFocus } from '../../lib/useResetScrollOnFocus';

type Tab = 'today' | 'progress' | 'history';

export default function NutritionScreen() {
  const t = useTokens();
  const [tab, setTab] = useState<Tab>('today');
  const { ref: scrollRef, resetScroll } = useResetScrollOnFocus();

  const nutrition = useTodayNutrition();
  const workouts = useTodayWorkouts();
  const profile = useProfile();
  const savedMeals = useSavedMeals();
  const history = useMealHistory(90);
  const balance = useLiveCalorieBalance();
  const nutritionScore = useNutritionScore();

  // Hydration opt-in pref — re-hydrates (heh) from AsyncStorage on focus.
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);
  useEffect(() => {
    loadPreferences().then(setPrefs).catch(() => {});
  }, []);

  const [refreshing, setRefreshing] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [pantryOpen, setPantryOpen] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        nutrition.refetch(),
        workouts.refetch(),
        profile.refetch(),
        savedMeals.refetch(),
        history.refetch(),
        nutritionScore.refetch(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  // Any meal mutation refreshes both today's meals and the full history.
  const refreshAllMeals = () => {
    nutrition.refetch();
    history.refetch();
  };

  // Silently refetch when the local calendar day rolls over.
  useDailyReset(() => {
    void onRefresh();
  });

  const totals = nutrition.data?.totals;
  const meals = nutrition.data?.meals ?? [];

  // Calorie math comes from the live-balance hook. Do NOT derive goals from
  // profile.goal_targets.calorie_target (that's a stored static value and
  // drifts from today's actual burn). See useLiveCalorieBalance.ts spec.
  const { totalBurn, totalIntake, goalIntake } = balance;

  const targets = profile.data?.goal_targets;
  const macroTargets = {
    proteinG: targets?.protein_g ?? profile.data?.daily_protein_goal_g ?? null,
    carbsG: targets?.carbs_g ?? null,
    fatG: targets?.fat_g ?? null,
    // FDA defaults for micros per PRD §4.4.9 (match templates/index.html L5939)
    sugarG: 50,
    fiberG: 30,
    sodiumMg: 2300,
  };
  const macroValues = {
    proteinG: totals?.total_protein ?? 0,
    carbsG: totals?.total_carbs ?? 0,
    fatG: totals?.total_fat ?? 0,
    sugarG: totals?.total_sugar ?? 0,
    fiberG: totals?.total_fiber ?? 0,
    sodiumMg: totals?.total_sodium ?? 0,
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <TabHeader title="Nutrition" />
      <SubTabs<Tab>
        tabs={[
          { value: 'today', label: 'Today' },
          { value: 'progress', label: 'Progress' },
          { value: 'history', label: 'History' },
        ]}
        value={tab}
        onChange={(next) => {
          setTab(next);
          resetScroll();
        }}
      />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.muted} />
        }>
        {tab === 'today' ? (
          <>
            <OverallScoreHero
              data={
                nutritionScore.data
                  ? {
                      score: nutritionScore.data.score,
                      band: nutritionScore.data.band,
                      reason: nutritionScore.data.reason,
                      calibrating: nutritionScore.data.calibrating,
                      contributing: ['nutrition'],
                      effective_weights: { fitness: 0, nutrition: 100, finance: 0, time: 0 },
                      data_completeness_overall: nutritionScore.data.data_completeness_overall,
                      sparkline_7d: nutritionScore.data.sparkline_7d ?? [],
                      cta: nutritionScore.data.cta,
                    }
                  : null
              }
              loading={nutritionScore.loading}
            />

            <CalorieRingCard
              totalIntake={totalIntake}
              totalBurn={totalBurn}
              goalIntake={goalIntake}
            />

            <NutritionMacrosCard
              consumed={macroValues}
              targets={macroTargets}
              empty={meals.length === 0}
            />

            {prefs.hydrationActive ? (
              <HydrationCard goalOz={prefs.hydrationGoalOz} />
            ) : null}

            <RecentMealsChips
              saved={savedMeals.data ?? []}
              onLogged={refreshAllMeals}
              onRemoved={savedMeals.refetch}
            />

            <LogMealCard
              onLogged={refreshAllMeals}
              onTemplateSaved={savedMeals.refetch}
              onPhotoScan={() => setPhotoOpen(true)}
              onBarcodeScan={() => setBarcodeOpen(true)}
              onPantryScan={() => setPantryOpen(true)}
              onSavedPick={() => setSavedOpen(true)}
            />

            <TodayMealsList meals={meals} onChanged={refreshAllMeals} />
          </>
        ) : null}

        {tab === 'progress' ? (
          <>
            <CalorieBalanceChart />
            <CaloriesConsumedChart />
            <MacroTrendsCard />
          </>
        ) : null}

        {tab === 'history' ? (
          <MealHistoryList meals={history.data ?? []} onChanged={refreshAllMeals} />
        ) : null}
      </ScrollView>
      <FAB from="nutrition" />

      <MealPhotoScanner
        visible={photoOpen}
        onClose={() => setPhotoOpen(false)}
        onLogged={refreshAllMeals}
      />
      <BarcodeScanner
        visible={barcodeOpen}
        onClose={() => setBarcodeOpen(false)}
        onLogged={refreshAllMeals}
      />
      <PantryScanner
        visible={pantryOpen}
        onClose={() => setPantryOpen(false)}
        onLogged={refreshAllMeals}
        caloriesConsumedToday={totalIntake}
      />
      <SavedMealsPicker
        visible={savedOpen}
        meals={savedMeals.data ?? []}
        onClose={() => setSavedOpen(false)}
        onLogged={refreshAllMeals}
        onRemoved={savedMeals.refetch}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 96, gap: 16 },
});

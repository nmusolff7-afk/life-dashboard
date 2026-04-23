import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  BarcodeScanner,
  CalorieBalanceChart,
  CalorieRingCard,
  CaloriesConsumedChart,
  FAB,
  LogMealCard,
  MacroTrendsCard,
  MealHistoryList,
  MealPhotoScanner,
  NutritionMacrosCard,
  PantryScanner,
  RecentMealsChips,
  SavedMealsPicker,
  SubTabs,
  TodayMealsList,
} from '../../components/apex';
import {
  useMealHistory,
  useProfile,
  useSavedMeals,
  useTodayNutrition,
  useTodayWorkouts,
} from '../../lib/hooks/useHomeData';
import { useTokens } from '../../lib/theme';
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

  const totals = nutrition.data?.totals;
  const meals = nutrition.data?.meals ?? [];
  const consumed = totals?.total_calories ?? 0;
  const burned = workouts.data?.burn ?? 0;
  const calorieTarget =
    profile.data?.goal_targets?.calorie_target ?? profile.data?.daily_calorie_goal ?? null;

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

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
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
            <View style={styles.scoreBlock}>
              <Text style={[styles.scoreBig, { color: t.subtle }]}>—</Text>
              <Text style={[styles.scoreLabel, { color: t.nutrition }]}>Nutrition score</Text>
              <Text style={[styles.scoreHint, { color: t.muted }]}>
                Score calculated once you have enough data.
              </Text>
            </View>

            <CalorieRingCard
              caloriesConsumed={consumed}
              caloriesBurned={burned}
              calorieTarget={calorieTarget}
            />

            <NutritionMacrosCard
              consumed={macroValues}
              targets={macroTargets}
              empty={meals.length === 0}
            />

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
        caloriesConsumedToday={consumed}
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

  scoreBlock: { alignItems: 'center', paddingVertical: 8, gap: 2 },
  scoreBig: { fontSize: 56, fontWeight: '700', lineHeight: 58, letterSpacing: -1.2 },
  scoreLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 4 },
  scoreHint: { fontSize: 12, textAlign: 'center', marginTop: 2 },
});

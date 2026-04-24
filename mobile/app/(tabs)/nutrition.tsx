import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  BarcodeScanner,
  CalorieBalanceChart,
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
import { ChatDock } from '../../components/chat/ChatDock';
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
import { useChatSession } from '../../lib/useChatSession';
import { useTokens } from '../../lib/theme';
import { useDailyReset } from '../../lib/useDailyReset';
import { useResetScrollOnFocus } from '../../lib/useResetScrollOnFocus';

type Tab = 'today' | 'progress' | 'history';

export default function NutritionScreen() {
  const t = useTokens();
  const router = useRouter();
  const params = useLocalSearchParams<{ open?: string }>();
  const [tab, setTab] = useState<Tab>('today');
  const { ref: scrollRef, resetScroll } = useResetScrollOnFocus();

  const nutrition = useTodayNutrition();
  const workouts = useTodayWorkouts();
  const profile = useProfile();
  const savedMeals = useSavedMeals();
  const history = useMealHistory(90);
  const balance = useLiveCalorieBalance();
  const nutritionScore = useNutritionScore();

  // Hydration opt-in pref — re-hydrates (heh) from AsyncStorage on mount
  // AND every time the Nutrition tab regains focus, so toggling in
  // Settings → Preferences takes effect immediately on navigation back.
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);
  useFocusEffect(
    useCallback(() => {
      loadPreferences().then(setPrefs).catch(() => {});
    }, []),
  );

  // Respond to ?open=manual|scan|barcode|saved query param fired from the
  // chat overlay's Log Meal sub-shortcuts. Clears the param after opening
  // so re-navigating to the tab doesn't re-open.
  useEffect(() => {
    const open = params.open;
    if (!open) return;
    setTab('today');
    if (open === 'scan') setPhotoOpen(true);
    else if (open === 'barcode') setBarcodeOpen(true);
    else if (open === 'saved') setSavedOpen(true);
    else if (open === 'pantry') setPantryOpen(true);
    // Clear the param so subsequent navigations don't re-trigger.
    router.setParams({ open: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.open]);

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

  // Refetch when a FAB quick-log modal saves from over any tab.
  const { dataVersion } = useChatSession();
  useEffect(() => {
    if (dataVersion > 0) void onRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataVersion]);

  // Reset sub-tab to Today whenever this tab regains focus.
  useFocusEffect(
    useCallback(() => {
      setTab('today');
    }, []),
  );

  const totals = nutrition.data?.totals;
  const meals = nutrition.data?.meals ?? [];

  // Calorie math comes from the live-balance hook. Do NOT derive goals from
  // profile.goal_targets.calorie_target (that's a stored static value and
  // drifts from today's actual burn). See useLiveCalorieBalance.ts spec.
  const { totalBurn, totalIntake, distanceToGoal } = balance;
  // Current deficit = burn - intake. Negative → surplus. null when we
  // haven't computed a burn yet (early-morning, no profile data).
  const currentDeficit = totalBurn != null ? totalBurn - totalIntake : null;

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
      <TabHeader
        title="Nutrition"
        right={
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
            compact
          />
        }
      />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.muted} />
        }>
        {tab === 'today' ? (
          <>
            {/* Big score hero — matches Fitness tab's top-of-page pattern. */}
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

            {/* Summary row — Intake · current Deficit · Δ vs goal intake.
                Burn is intentionally omitted here; the Fitness tab is the
                source of truth for burn, and founder flagged that showing
                it on both tabs creates inconsistency. */}
            <View style={styles.summaryRow}>
              <SummaryCell
                t={t}
                label="Intake"
                value={`${totalIntake}`}
                unit="kcal"
              />
              <View style={[styles.summaryDivider, { backgroundColor: t.border }]} />
              <SummaryCell
                t={t}
                label={currentDeficit != null && currentDeficit < 0 ? 'Surplus' : 'Deficit'}
                value={currentDeficit != null ? `${Math.abs(currentDeficit)}` : '—'}
                unit="kcal"
                valueColor={
                  currentDeficit == null
                    ? undefined
                    : currentDeficit >= 0
                      ? t.green
                      : t.danger
                }
              />
              <View style={[styles.summaryDivider, { backgroundColor: t.border }]} />
              <SummaryCell
                t={t}
                label={distanceToGoal != null && distanceToGoal < 0 ? 'Over goal' : 'Δ vs goal'}
                value={
                  distanceToGoal != null
                    ? `${distanceToGoal >= 0 ? '' : '+'}${Math.abs(distanceToGoal)}`
                    : '—'
                }
                unit="kcal"
                emphasize
              />
            </View>

            {/* Log Meal moved up top per founder — primary action. */}
            <LogMealCard
              onLogged={refreshAllMeals}
              onTemplateSaved={savedMeals.refetch}
              onPhotoScan={() => setPhotoOpen(true)}
              onBarcodeScan={() => setBarcodeOpen(true)}
              onPantryScan={() => setPantryOpen(true)}
              onSavedPick={() => setSavedOpen(true)}
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
      <ChatDock surface="nutrition" />

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

function SummaryCell({
  t,
  label,
  value,
  unit,
  emphasize,
  valueColor,
}: {
  t: ReturnType<typeof useTokens>;
  label: string;
  value: string;
  unit?: string;
  emphasize?: boolean;
  valueColor?: string;
}) {
  const color = valueColor ?? (emphasize ? t.nutrition : t.text);
  return (
    <View style={styles.summaryCell}>
      <Text style={[styles.summaryValue, { color }]}>
        {value}
        {unit ? <Text style={[styles.summaryUnit, { color: t.muted }]}> {unit}</Text> : null}
      </Text>
      <Text style={[styles.summaryLabel, { color: t.muted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 96, gap: 16 },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryDivider: { width: 1, height: 32, alignSelf: 'center' },
  summaryCell: { flex: 1, alignItems: 'center', gap: 2 },
  summaryValue: { fontSize: 16, fontWeight: '700' },
  summaryUnit: { fontSize: 10, fontWeight: '500' },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
});

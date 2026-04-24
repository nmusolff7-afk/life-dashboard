/**
 * Single source of truth for calorie math across the whole app.
 *
 * Founder's model (non-negotiable):
 *   totalBurn   = RMR + NEAT + EAT + TEF        (live — updates with today's
 *                                                logs, steps, and settings)
 *   totalIntake = calories logged today
 *   goalIntake  = totalBurn + deficitSurplus    (deficit signed: negative
 *                                                for lose_weight, positive
 *                                                for surplus)
 *
 * Two user-facing numbers (both derived):
 *   distanceToGoal = goalIntake - totalIntake   (positive → cals left;
 *                                                negative → cals over)
 *   actualNet      = totalBurn - totalIntake    (positive → actual deficit;
 *                                                negative → actual surplus)
 *
 * Hard rule: individual RMR / NEAT / EAT / TEF do NOT appear outside of
 * Settings. This hook collapses them into `totalBurn` on purpose.
 *
 * Any surface that shows a calorie goal or consumed/remaining/net figure
 * should read from this hook. Don't roll your own math in a component.
 */

import { useEffect, useState } from 'react';

import { computeNeat, type Occupation } from '../../../shared/src/logic/neat';
import { resolveTef } from '../../../shared/src/logic/tef';
import { computeTdee } from '../../../shared/src/logic/tdee';
import { DEFAULT_PREFERENCES, loadPreferences, type Preferences } from '../preferences';
import { useMealHistory, useProfile, useTodayNutrition, useTodaySteps, useTodayWorkouts } from './useHomeData';
import { localToday } from '../localTime';

export interface LiveCalorieBalance {
  /** RMR + NEAT + EAT + TEF. Null until RMR is known. */
  totalBurn: number | null;
  /** Calories logged today. Always a number ≥ 0. */
  totalIntake: number;
  /** totalBurn + deficitSurplus. Null until totalBurn is known. */
  goalIntake: number | null;
  /** Signed kcal/day from goal (−500 = weight loss, +300 = surplus). 0 if
   *  no goal set. */
  deficitSurplus: number;
  /** Today's adjusted goal delta from rollover (yesterday's surplus/
   *  deficit folded in) + auto-adjust (7-day trailing shift). 0 when
   *  neither preference is enabled. Positive = today's goal tightened
   *  (less intake allowed). */
  rolloverKcal: number;
  autoAdjustKcal: number;
  /** goalIntake − totalIntake. Positive = cals left, negative = over. Null
   *  when goalIntake is null. */
  distanceToGoal: number | null;
  /** totalBurn − totalIntake. Positive = current deficit, negative = current
   *  surplus. Null when totalBurn is null. */
  actualNet: number | null;
  /** True when any upstream fetch is still loading. */
  loading: boolean;
  /** Any fetch error (use the first non-null). */
  error: Error | null;
  /** Re-fetch every upstream source. */
  refetch: () => Promise<void>;
}

export function useLiveCalorieBalance(): LiveCalorieBalance {
  const profile = useProfile();
  const nutrition = useTodayNutrition();
  const workouts = useTodayWorkouts();
  const steps = useTodaySteps();
  // Rollover + auto-adjust pull from meal history (past 7 days) so we
  // can compute yesterday's delta + 7-day trailing average. History is
  // cheap — 7 days of meal rows — and the hook lives one place, so any
  // tab that shows calorie numbers picks up the adjustment automatically.
  const history = useMealHistory(7);
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);
  useEffect(() => {
    loadPreferences().then(setPrefs).catch(() => {});
  }, []);

  const rmr = profile.data?.rmr_kcal ?? 0;
  const occupation: Occupation = ((): Occupation => {
    const ws = profile.data?.work_style;
    return ws === 'standing' || ws === 'physical' ? ws : 'sedentary';
  })();

  const totals = nutrition.data?.totals;
  const totalIntake = totals?.total_calories ?? 0;

  const eat = workouts.data?.burn ?? 0;
  const neat = computeNeat({
    occupation,
    totalSteps: steps.steps ?? 0,
    workoutDescriptions: (workouts.data?.workouts ?? []).map((w) => w.description ?? ''),
  });
  const tef = resolveTef(totalIntake, {
    proteinG: totals?.total_protein ?? 0,
    carbsG: totals?.total_carbs ?? 0,
    fatG: totals?.total_fat ?? 0,
  });

  const totalBurn = rmr > 0 ? computeTdee({ rmr, neat: neat.neatKcal, eat, tef }) : null;
  const deficitSurplus = profile.data?.goal_targets?.deficit_surplus ?? 0;
  const baseCalorieTarget = profile.data?.goal_targets?.calorie_target ?? null;

  // Rollover: fold yesterday's (intake − goal) into today's target.
  // A surplus yesterday tightens today's goal (negative adjustment =
  // fewer calories allowed); a deficit loosens it. Capped at ±20% of
  // the base goal so one bad day doesn't blow the week.
  let rolloverKcal = 0;
  if (prefs.calorieRollover && baseCalorieTarget != null && baseCalorieTarget > 0) {
    const today = localToday();
    const yesterday = ((): string => {
      const [y, m, d] = today.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      dt.setUTCDate(dt.getUTCDate() - 1);
      return dt.toISOString().slice(0, 10);
    })();
    const ySum = (history.data ?? [])
      .filter((meal) => meal.log_date === yesterday)
      .reduce((s, m) => s + (m.calories ?? 0), 0);
    if (ySum > 0) {
      const delta = ySum - baseCalorieTarget; // + = surplus yesterday
      const cap = baseCalorieTarget * 0.2;
      rolloverKcal = Math.max(-cap, Math.min(cap, delta));
    }
  }

  // Auto-adjust: 7-day trailing avg intake vs base goal. If consistently
  // off, shift today's goal ¼ of the average delta — gentle nudge, not
  // whiplash. Excludes today's partial data so it's stable across the day.
  let autoAdjustKcal = 0;
  if (prefs.autoAdjustTargets && baseCalorieTarget != null && baseCalorieTarget > 0) {
    const today = localToday();
    const pastDays = new Map<string, number>();
    (history.data ?? []).forEach((m) => {
      if (m.log_date === today) return; // exclude today
      pastDays.set(m.log_date, (pastDays.get(m.log_date) ?? 0) + (m.calories ?? 0));
    });
    if (pastDays.size >= 3) {
      const avgIntake = [...pastDays.values()].reduce((a, b) => a + b, 0) / pastDays.size;
      const avgDelta = avgIntake - baseCalorieTarget;
      const cap = baseCalorieTarget * 0.15;
      autoAdjustKcal = Math.max(-cap, Math.min(cap, avgDelta * 0.25));
    }
  }

  const goalIntake = totalBurn != null
    ? totalBurn + deficitSurplus - rolloverKcal - autoAdjustKcal
    : null;
  const distanceToGoal = goalIntake != null ? goalIntake - totalIntake : null;
  const actualNet = totalBurn != null ? totalBurn - totalIntake : null;

  const loading = profile.loading || nutrition.loading || workouts.loading || steps.loading;
  const error = profile.error ?? nutrition.error ?? workouts.error ?? null;

  const refetch = async () => {
    await Promise.all([
      profile.refetch(),
      nutrition.refetch(),
      workouts.refetch(),
      steps.refetch(),
    ]);
  };

  return {
    totalBurn,
    totalIntake,
    goalIntake,
    deficitSurplus,
    rolloverKcal,
    autoAdjustKcal,
    distanceToGoal,
    actualNet,
    loading,
    error,
    refetch,
  };
}

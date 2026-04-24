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

import { computeNeat, type Occupation } from '../../../shared/src/logic/neat';
import { resolveTef } from '../../../shared/src/logic/tef';
import { computeTdee } from '../../../shared/src/logic/tdee';
import { useProfile, useTodayNutrition, useTodaySteps, useTodayWorkouts } from './useHomeData';

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
  const goalIntake = totalBurn != null ? totalBurn + deficitSurplus : null;
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
    distanceToGoal,
    actualNet,
    loading,
    error,
    refetch,
  };
}

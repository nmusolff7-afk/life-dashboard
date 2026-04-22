/**
 * Calorie and macro targets — port of goal_config.py compute_targets().
 *
 * Deviation notes:
 * - Python's round() uses banker's rounding (round-half-to-even). JS Math.round()
 *   rounds half-up-toward-+∞. Values landing exactly on .5 diverge. We use
 *   roundHalfEven below to match Flask bit-for-bit on these boundaries.
 * - Body-fat range uses rmr.ts' 5-60 window (tighter than Flask's 0-100).
 */

import { computeRmr, type Sex } from './rmr';

/** Python-compatible round-half-to-even (banker's rounding). */
function roundHalfEven(x: number): number {
  const floor = Math.floor(x);
  const diff = x - floor;
  if (Math.abs(diff - 0.5) < Number.EPSILON * 8) {
    return floor % 2 === 0 ? floor : floor + 1;
  }
  return Math.round(x);
}

export type GoalKey = 'lose_weight' | 'build_muscle' | 'recomp' | 'maintain';
export type ProteinRef = 'current' | 'goal';

export interface GoalConfig {
  key: GoalKey;
  label: string;
  calAdjust: number;
  proteinGPerKg: number;
  proteinRef: ProteinRef;
  fatPct: number;
  fatFloorGPerKg: number;
  carbMinG: number;
}

export const GOAL_CONFIGS: Record<GoalKey, GoalConfig> = {
  lose_weight: {
    key: 'lose_weight', label: 'Lose Weight',
    calAdjust: -0.20, proteinGPerKg: 2.0, proteinRef: 'goal',
    fatPct: 0.25, fatFloorGPerKg: 0.7, carbMinG: 100,
  },
  build_muscle: {
    key: 'build_muscle', label: 'Build Muscle',
    calAdjust: 0.10, proteinGPerKg: 1.8, proteinRef: 'current',
    fatPct: 0.25, fatFloorGPerKg: 0.7, carbMinG: 100,
  },
  recomp: {
    key: 'recomp', label: 'Body Recomposition',
    calAdjust: -0.10, proteinGPerKg: 2.2, proteinRef: 'current',
    fatPct: 0.25, fatFloorGPerKg: 0.7, carbMinG: 100,
  },
  maintain: {
    key: 'maintain', label: 'Maintain',
    calAdjust: 0.0, proteinGPerKg: 1.6, proteinRef: 'current',
    fatPct: 0.25, fatFloorGPerKg: 0.7, carbMinG: 100,
  },
};

/** FDA default micronutrient targets (user-adjustable via sliders). */
export const MICRO_DEFAULTS = { sugarG: 50, fiberG: 30, sodiumMg: 2300 } as const;

export function getGoalConfig(goalKey: string): GoalConfig {
  if (goalKey in GOAL_CONFIGS) return GOAL_CONFIGS[goalKey as GoalKey];
  return GOAL_CONFIGS.lose_weight;
}

// ── Calorie target ──

export interface CalorieTargetInput {
  tdee: number;
  rmr: number;
  goal: GoalKey | string;
}

export interface CalorieTargetResult {
  calorieTarget: number;
  tdeeUsed: number;
  rawTarget: number;
  deficitSurplus: number;
  flooredToRmr: boolean;
}

export function computeCalorieTarget(input: CalorieTargetInput): CalorieTargetResult {
  const cfg = getGoalConfig(input.goal);
  const tdeeUsed = input.tdee > 0 ? input.tdee : input.rmr;
  const rawTarget = roundHalfEven(tdeeUsed * (1 + cfg.calAdjust));
  const calorieTarget = Math.max(rawTarget, input.rmr);
  return {
    calorieTarget,
    tdeeUsed,
    rawTarget,
    deficitSurplus: calorieTarget - tdeeUsed,
    flooredToRmr: rawTarget < input.rmr,
  };
}

// ── Macro targets ──

export interface MacroTargetsInput {
  calorieTarget: number;
  weightKg: number;
  targetWeightKg?: number;
  goal: GoalKey | string;
}

export interface MacroTargets {
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export function computeMacroTargets(input: MacroTargetsInput): MacroTargets {
  const cfg = getGoalConfig(input.goal);
  const { calorieTarget, weightKg, targetWeightKg } = input;

  const hasGoalWeight =
    targetWeightKg !== undefined && targetWeightKg > 0 && targetWeightKg !== weightKg;
  const refKg =
    cfg.proteinRef === 'goal' && hasGoalWeight && (targetWeightKg as number) < weightKg
      ? (targetWeightKg as number)
      : weightKg;
  const proteinG = roundHalfEven(refKg * cfg.proteinGPerKg);

  const fatFromPct = roundHalfEven((calorieTarget * cfg.fatPct) / 9);
  const fatFromBw = roundHalfEven(weightKg * cfg.fatFloorGPerKg);
  const fatG = Math.max(fatFromPct, fatFromBw);

  const remaining = calorieTarget - proteinG * 4 - fatG * 9;
  const carbsG = Math.max(cfg.carbMinG, roundHalfEven(remaining / 4));

  return { proteinG, carbsG, fatG };
}

// ── Full bundle ──

export interface ComputeTargetsInput {
  goal: GoalKey | string;
  weightLbs: number;
  targetWeightLbs?: number;
  heightFt: number;
  heightIn: number;
  ageYears: number;
  sex: Sex;
  bodyFatPct?: number;
  /** Full TDEE if available; when 0 or omitted, RMR is used in its place. */
  tdee?: number;
}

export interface TargetsResult {
  goalKey: GoalKey;
  goalLabel: string;
  rmr: number;
  rmrMethod: 'mifflin_st_jeor' | 'katch_mcardle';
  tdeeUsed: number;
  calorieTarget: number;
  deficitSurplus: number;
  calAdjustPct: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  sugarG: number;
  fiberG: number;
  sodiumMg: number;
}

const LBS_TO_KG = 0.453592;
const IN_TO_CM = 2.54;

export function computeTargets(input: ComputeTargetsInput): TargetsResult {
  const cfg = getGoalConfig(input.goal);
  const weightKg = input.weightLbs * LBS_TO_KG;
  const heightCm = (input.heightFt * 12 + input.heightIn) * IN_TO_CM;

  const rmrResult = computeRmr({
    weightKg, heightCm,
    ageYears: input.ageYears, sex: input.sex,
    bodyFatPct: input.bodyFatPct,
  });

  const cal = computeCalorieTarget({
    tdee: input.tdee ?? 0,
    rmr: rmrResult.kcalPerDay,
    goal: input.goal,
  });

  const targetWeightKg =
    input.targetWeightLbs !== undefined ? input.targetWeightLbs * LBS_TO_KG : undefined;
  const macros = computeMacroTargets({
    calorieTarget: cal.calorieTarget,
    weightKg,
    targetWeightKg,
    goal: input.goal,
  });

  return {
    goalKey: cfg.key,
    goalLabel: cfg.label,
    rmr: rmrResult.kcalPerDay,
    rmrMethod: rmrResult.formulaUsed === 'mifflin' ? 'mifflin_st_jeor' : 'katch_mcardle',
    tdeeUsed: cal.tdeeUsed,
    calorieTarget: cal.calorieTarget,
    deficitSurplus: cal.deficitSurplus,
    calAdjustPct: cfg.calAdjust,
    ...macros,
    sugarG: MICRO_DEFAULTS.sugarG,
    fiberG: MICRO_DEFAULTS.fiberG,
    sodiumMg: MICRO_DEFAULTS.sodiumMg,
  };
}

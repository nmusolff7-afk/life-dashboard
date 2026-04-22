/**
 * Daily Momentum Score — port of db.py compute_momentum.
 *
 * Penalty-based: start at 100, subtract penalties per category.
 * Pure function — no DB, no AI, no IO. The caller assembles inputs from storage.
 */

export const MOMENTUM_WEIGHTS = {
  nutrition: 40,
  macros: 25,
  activity: 25,
  checkin: 0,
  tasks: 10,
} as const;

export type MomentumCategory = keyof typeof MOMENTUM_WEIGHTS;

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/** Time-of-day proration for nutrition/macro targets. Clamped to [0.33, 1.0]. */
export function dayProgress(hour: number): number {
  return Math.min(1.0, Math.max(0.33, (hour - 6) / 15));
}

export interface MomentumInput {
  /** Hour of day 0-23. Default 23 (full day). */
  hour?: number;
  calorieGoal?: number;
  caloriesConsumed: number;
  proteinGoal?: number;
  proteinConsumed?: number;
  carbsGoal?: number;
  carbsConsumed?: number;
  fatGoal?: number;
  fatConsumed?: number;
  /** True if a manually-logged workout exists today (Garmin auto-imports don't count). */
  hasLoggedWorkout: boolean;
  /** True if a workout was scheduled today. Default true. Rest days → no activity penalty. */
  workoutPlanned?: boolean;
  totalTasks: number;
  completedTasks: number;
}

export interface MacroComponentDetail {
  name: 'protein' | 'carbs' | 'fat';
  target: number;
  actual: number;
  weight: number;
  dev: number;
}

export interface ComponentStats {
  penalty: number;
  pct: number;
  weighted: number;
}

export interface MomentumResult {
  score: number;
  penalties: Record<MomentumCategory, number>;
  components: {
    nutrition: ComponentStats;
    macros: ComponentStats & { components: MacroComponentDetail[] };
    activity: ComponentStats;
    tasks: ComponentStats;
  };
  rawDeltas: {
    calories: { target: number | null; actual: number; delta: number };
    macros: { components: MacroComponentDetail[] };
    workout: { done: boolean; rest_day: boolean };
    tasks: { total: number; completed: number };
  };
}

export function computeMomentum(input: MomentumInput): MomentumResult {
  const hour = input.hour ?? 23;
  const progress = dayProgress(hour);
  const workoutPlanned = input.workoutPlanned ?? true;

  const cal = input.caloriesConsumed;
  const calGoal = input.calorieGoal ?? 0;
  const proteinConsumed = input.proteinConsumed ?? 0;
  const carbsConsumed = input.carbsConsumed ?? 0;
  const fatConsumed = input.fatConsumed ?? 0;

  // ── Nutrition (40) ──
  let nutPen = 0;
  let caloriesDelta = 0;
  if (calGoal > 0 && cal > 0) {
    const prorated = calGoal * progress;
    caloriesDelta = cal - prorated;
    const dev = Math.abs(caloriesDelta) / Math.max(prorated, 1);
    nutPen = Math.min(1.0, dev / 0.50) * MOMENTUM_WEIGHTS.nutrition;
  } else if (cal === 0 && calGoal > 0) {
    nutPen = MOMENTUM_WEIGHTS.nutrition;
  }

  // ── Macros (25) ──
  const macroComponents: MacroComponentDetail[] = [];
  const pushMacro = (
    name: MacroComponentDetail['name'],
    goal: number | undefined,
    consumed: number,
    weight: number,
  ) => {
    if (!goal || goal <= 0) return;
    const prorated = goal * progress;
    const dev = consumed > 0 ? Math.abs(consumed - prorated) / Math.max(prorated, 1) : 1.0;
    macroComponents.push({ name, target: goal, actual: consumed, weight, dev });
  };
  pushMacro('protein', input.proteinGoal, proteinConsumed, 0.4);
  pushMacro('carbs', input.carbsGoal, carbsConsumed, 0.3);
  pushMacro('fat', input.fatGoal, fatConsumed, 0.3);

  let macroPen = 0;
  if (macroComponents.length > 0) {
    const totalWeight = macroComponents.reduce((s, m) => s + m.weight, 0);
    const weightedDev = macroComponents.reduce(
      (s, m) => s + Math.min(1.0, m.dev / 0.75) * (m.weight / totalWeight),
      0,
    );
    macroPen = weightedDev * MOMENTUM_WEIGHTS.macros;
  } else if (cal === 0) {
    macroPen = MOMENTUM_WEIGHTS.macros;
  }

  // ── Activity (25) ──
  let activityPen = 0;
  let restDay = false;
  if (!workoutPlanned) {
    restDay = true;
  } else if (!input.hasLoggedWorkout) {
    activityPen = MOMENTUM_WEIGHTS.activity;
  }

  // ── Tasks (10) ──
  let tasksPen = 0;
  if (input.totalTasks > 0) {
    tasksPen = (1 - input.completedTasks / input.totalTasks) * MOMENTUM_WEIGHTS.tasks;
  }

  const penalties: Record<MomentumCategory, number> = {
    nutrition: round2(nutPen),
    macros: round2(macroPen),
    activity: round2(activityPen),
    checkin: 0,
    tasks: round2(tasksPen),
  };
  const totalPenalty =
    penalties.nutrition + penalties.macros + penalties.activity + penalties.checkin + penalties.tasks;
  const score = Math.max(0, Math.round(100 - totalPenalty));

  const compPct = (key: MomentumCategory): number => {
    if (MOMENTUM_WEIGHTS[key] <= 0) return 1.0;
    return Math.round((1.0 - penalties[key] / MOMENTUM_WEIGHTS[key]) * 10000) / 10000;
  };
  const compWeighted = (key: MomentumCategory): number =>
    round2(MOMENTUM_WEIGHTS[key] - penalties[key]);

  return {
    score,
    penalties,
    components: {
      nutrition: {
        penalty: penalties.nutrition,
        pct: compPct('nutrition'),
        weighted: compWeighted('nutrition'),
      },
      macros: {
        penalty: penalties.macros,
        pct: compPct('macros'),
        weighted: compWeighted('macros'),
        components: macroComponents,
      },
      activity: {
        penalty: penalties.activity,
        pct: compPct('activity'),
        weighted: compWeighted('activity'),
      },
      tasks: {
        penalty: penalties.tasks,
        pct: compPct('tasks'),
        weighted: compWeighted('tasks'),
      },
    },
    rawDeltas: {
      calories: {
        target: calGoal > 0 ? calGoal : null,
        actual: cal,
        delta: Math.round(caloriesDelta),
      },
      macros: { components: macroComponents },
      workout: { done: input.hasLoggedWorkout, rest_day: restDay },
      tasks: { total: input.totalTasks, completed: input.completedTasks },
    },
  };
}

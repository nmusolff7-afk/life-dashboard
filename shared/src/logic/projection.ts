/**
 * Weight projection — estimate how long until user reaches target weight at a steady deficit/surplus.
 * Port of index.html weeksToGoal(); adds weekly chart points.
 *
 * Uses the canonical 3500 kcal ≈ 1 lb rule.
 */

const KG_PER_LB = 0.453592;
const LB_PER_KG = 1 / KG_PER_LB;
const KCAL_PER_LB = 3500;

export interface ProjectionInput {
  currentWeightKg?: number;
  currentWeightLbs?: number;
  targetWeightKg?: number;
  targetWeightLbs?: number;
  /**
   * Positive kcal = deficit (losing). Negative = surplus (gaining).
   * Must point in the same direction as the weight delta or projection returns null.
   */
  dailyDeficitKcal: number;
  /** YYYY-MM-DD. Defaults to current date (UTC). */
  today?: string;
}

export interface ProjectionPoint {
  date: string;
  projectedWeightKg: number;
  projectedWeightLbs: number;
}

export interface ProjectionResult {
  /** Integer weeks, ceil'd. null if projection is impossible. */
  weeks: number | null;
  /** YYYY-MM-DD of the projected target date. null if weeks is null. */
  projectedDate: string | null;
  /** Weekly checkpoints from today through the projected date (inclusive). */
  points: ProjectionPoint[];
}

function toLbs(lbs: number | undefined, kg: number | undefined): number | undefined {
  // Prefer lbs when supplied — avoids an fp roundtrip that can push values just past
  // integer boundaries and inflate Math.ceil by 1 week.
  if (lbs !== undefined) return lbs;
  if (kg !== undefined) return kg * LB_PER_KG;
  return undefined;
}

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

export function computeProjection(input: ProjectionInput): ProjectionResult {
  const currentLbs = toLbs(input.currentWeightLbs, input.currentWeightKg);
  const targetLbs = toLbs(input.targetWeightLbs, input.targetWeightKg);
  if (currentLbs === undefined || targetLbs === undefined) {
    return { weeks: null, projectedDate: null, points: [] };
  }

  const today = input.today ?? todayUTC();
  const weightDeltaLbs = currentLbs - targetLbs;

  if (weightDeltaLbs === 0) {
    return { weeks: 0, projectedDate: today, points: [] };
  }

  const deficit = input.dailyDeficitKcal;
  const directionMismatch =
    (weightDeltaLbs > 0 && deficit <= 0) || (weightDeltaLbs < 0 && deficit >= 0);
  if (directionMismatch) {
    return { weeks: null, projectedDate: null, points: [] };
  }

  const absDelta = Math.abs(weightDeltaLbs);
  const absDeficit = Math.abs(deficit);
  const lbsPerWeek = (absDeficit * 7) / KCAL_PER_LB;
  const weeks = Math.ceil(absDelta / lbsPerWeek);
  const projectedDate = addDays(today, weeks * 7);

  const sign = weightDeltaLbs > 0 ? -1 : 1;
  const points: ProjectionPoint[] = [];
  for (let w = 0; w <= weeks; w++) {
    const lbs = currentLbs + sign * lbsPerWeek * w;
    points.push({
      date: addDays(today, w * 7),
      projectedWeightLbs: Math.round(lbs * 100) / 100,
      projectedWeightKg: Math.round(lbs * KG_PER_LB * 100) / 100,
    });
  }

  return { weeks, projectedDate, points };
}

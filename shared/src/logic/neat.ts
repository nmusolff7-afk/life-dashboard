/**
 * Non-Exercise Activity Thermogenesis — occupation base + step-based estimate,
 * with device-logged workout steps stripped out so EAT and NEAT don't double-count.
 *
 * Mirrors templates/index.html `calcNEAT` and `estimateWorkoutSteps`.
 */

export type Occupation = 'sedentary' | 'standing' | 'physical';

export const OCC_BASE: Record<Occupation, number> = {
  sedentary: 200,
  standing: 400,
  physical: 700,
};

export const KCAL_PER_STEP = 0.04;
export const STEPS_PER_MILE = 2000;

const NON_AMBULATORY = [
  'cycl', 'bike', 'row', 'swim', 'ellip', 'strength', 'lift',
  'bench', 'squat', 'deadlift', 'press', 'curl', 'pulldown',
];
const AMBULATORY = ['run', 'ran', 'jog', 'walk', 'hike', 'treadmill'];

/** Estimate steps attributed to a workout description (0 if non-ambulatory or unparseable). */
export function estimateWorkoutSteps(description: string): number {
  const d = description.toLowerCase();
  if (NON_AMBULATORY.some((kw) => d.includes(kw))) return 0;
  if (!AMBULATORY.some((kw) => d.includes(kw))) return 0;
  const mileMatch = d.match(/(\d+\.?\d*)\s*mi(?:le)?s?/);
  if (mileMatch) return Math.round(parseFloat(mileMatch[1]) * STEPS_PER_MILE);
  const kmMatch = d.match(/(\d+\.?\d*)\s*km/);
  if (kmMatch) return Math.round(parseFloat(kmMatch[1]) * 0.621371 * STEPS_PER_MILE);
  return 0;
}

export interface NeatInput {
  occupation: Occupation;
  totalSteps: number;
  /** Workout text descriptions (e.g. "ran 3 miles"). The algorithm strips ambulatory-workout steps from totalSteps. */
  workoutDescriptions?: string[];
}

export interface NeatResult {
  neatKcal: number;
  workoutSteps: number;
  netSteps: number;
  /** Kcal implied by the workout steps we subtracted — useful for debugging the attribution. */
  stepKcalSubtracted: number;
}

export function computeNeat(input: NeatInput): NeatResult {
  const { occupation, totalSteps, workoutDescriptions = [] } = input;
  const workoutSteps = workoutDescriptions.reduce((sum, d) => sum + estimateWorkoutSteps(d), 0);
  const netSteps = Math.max(0, (totalSteps || 0) - workoutSteps);
  const base = OCC_BASE[occupation] ?? OCC_BASE.sedentary;
  return {
    neatKcal: base + Math.round(netSteps * KCAL_PER_STEP),
    workoutSteps,
    netSteps,
    stepKcalSubtracted: Math.round(workoutSteps * KCAL_PER_STEP),
  };
}

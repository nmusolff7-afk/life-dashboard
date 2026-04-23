/**
 * Response shapes for Flask home-dashboard endpoints.
 * Kept aligned with actual Flask response shape (not PRD target shape) for v1.
 * When the Node backend replaces Flask, these types migrate unchanged if the contract is preserved.
 */

export interface Meal {
  id: number;
  user_id: number;
  logged_at: string;
  log_date: string;
  description: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  sugar_g?: number;
  fiber_g?: number;
  sodium_mg?: number;
}

export interface Workout {
  id: number;
  user_id: number;
  logged_at: string;
  log_date: string;
  description: string;
  calories_burned: number;
}

export interface NutritionTotals {
  meal_count: number;
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  total_sugar: number;
  total_fiber: number;
  total_sodium: number;
}

export interface TodayNutritionResponse {
  meals: Meal[];
  totals: NutritionTotals;
}

export interface TodayWorkoutsResponse {
  workouts: Workout[];
  burn: number;
}

export interface GoalTargets {
  goal_key: string;
  goal_label: string;
  calorie_target: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  deficit_surplus: number;
  rmr: number;
  sources?: string[];
  description?: string;
  rationale?: Record<string, string>;
}

export interface ProfileResponse {
  first_name?: string | null;
  gender?: 'male' | 'female' | null;
  age?: number | null;
  birthday?: string | null;
  height_ft?: number | null;
  height_in?: number | null;
  current_weight_lbs?: number | null;
  target_weight_lbs?: number | null;
  body_fat_pct?: number | null;
  rmr_kcal?: number | null;
  rmr_is_fallback?: boolean;
  primary_goal?: string | null;
  work_style?: string | null;
  steps_per_day_estimated?: number | null;
  daily_calorie_goal?: number | null;
  daily_protein_goal_g?: number | null;
  goal_targets?: GoalTargets;
}

export interface MomentumHistoryItem {
  score_date: string;
  momentum_score: number;
  nutrition_pct?: number;
  protein_pct?: number;
  activity_pct?: number;
}

// ── Fitness ──────────────────────────────────────────────────────────────

export interface SavedWorkout {
  id: number;
  user_id: number;
  description: string;
  calories_burned: number;
  saved_at: string;
}

/** Response from /api/burn-estimate (Claude-estimated). */
export interface BurnEstimate {
  calories_burned: number;
  notes: string;
}

export interface WeightHistoryPoint {
  date: string;
  weight_lbs: number;
}

export interface BurnChartPoint {
  date: string;
  total_burn: number;
}

export interface CalorieChartPoint {
  date: string;
  calories: number;
}

export interface MacroChartPoint {
  date: string;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface ActivityCalendarDay {
  date: string;
  /** Raw workout descriptions for that day — classified client-side into
   *  strength / cardio / mixed so color logic stays in one place. */
  descriptions: string[];
}

// ── Nutrition ─────────────────────────────────────────────────────────────

export interface NutritionItem {
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

/** Response from /api/estimate (Claude-estimated macros for a meal). */
export interface NutritionEstimate {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  sugar_g: number;
  fiber_g: number;
  sodium_mg: number;
  items: NutritionItem[];
  notes: string;
}

export interface SavedMeal {
  id: number;
  user_id: number;
  description: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  sugar_g?: number;
  fiber_g?: number;
  sodium_mg?: number;
  /** Flask stores items[] as a JSON-encoded string in `items_json`. */
  items_json?: string | null;
  saved_at: string;
}

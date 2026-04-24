/**
 * Score response shapes returned by Flask /api/score/* endpoints.
 *
 * Per locked decision B1: rich envelope with per-signal breakdown.
 * Per locked decision B2: Overall auto-redistributes weights across categories
 *   that have scored (e.g. if Finance is null, Overall averages over the three
 *   remaining categories). Redistribution happens server-side; clients just
 *   render whatever number comes back.
 * Per locked decision B4: no user-facing "Calibrating" copy. The flag is in
 *   the payload for client logic that may want it later, but UI does NOT
 *   surface it in v1.
 * Per locked decision B5: minimum 3 days of logging per category before a
 *   score renders — below that threshold, `score` is null and the caller
 *   shows the CTA/caption.
 */

export type ScoreBand = 'green' | 'amber' | 'red' | 'grey';

export type ScoreReason =
  | 'ok'
  | 'insufficient_data'       // <3 days of logging in this category
  | 'not_connected'            // Finance w/o Plaid, Time w/o HealthKit+Calendar
  | 'disabled';                // user turned a category off (future)

export type CategoryKey = 'fitness' | 'nutrition' | 'finance' | 'time';

/**
 * One signal's contribution to a category score. `data_completeness` is the
 * fraction of the signal's expected inputs actually present in the window
 * ([0, 1]). For a daily signal with data today → 1.0; for a 7-day trailing
 * signal with 4 of 7 days logged → 0.57.
 */
export interface ScoreSignal {
  name: string;                 // stable identifier, e.g. "calorie_adherence"
  label: string;                // human-readable, e.g. "Calorie adherence"
  score: number | null;         // [0, 1] once the signal has data, else null
  weight: number;               // static weight in [0, 100]
  contribution: number;         // score × (weight / Σ active_weights × 100)
  data_completeness: number;    // [0, 1]
}

/**
 * Fitness subsystem breakdown (Body, Strength, Cardio, Movement, Sleep,
 * Recovery, Plan). Each subsystem is a mini-category with its own signals.
 */
export interface SubsystemScore {
  key: string;                  // "body" | "strength" | "cardio" | "movement" | "sleep" | "recovery" | "plan"
  label: string;
  score: number | null;
  band: ScoreBand;
  weight: number;               // subsystem weight inside Fitness
  signals: ScoreSignal[];
}

export interface CategoryScoreResponse {
  category: CategoryKey;
  score: number | null;
  band: ScoreBand;
  reason: ScoreReason;
  calibrating: boolean;         // true for first 14 days (do NOT surface per B4)
  signals: ScoreSignal[];       // flat for nutrition/finance/time; see subsystems for Fitness
  subsystems?: SubsystemScore[];// Fitness only
  data_completeness_overall: number; // avg(signal.data_completeness) across all active signals
  sparkline_7d?: (number | null)[];  // prior-6-days + today, oldest first
  cta?: string;                 // present when score is null
}

/**
 * Overall = auto-weighted average of available category scores (B2).
 * `contributing` names the categories that were in the average.
 */
export interface OverallScoreResponse {
  score: number | null;
  band: ScoreBand;
  reason: ScoreReason;
  calibrating: boolean;
  contributing: CategoryKey[];  // subset of {fitness, nutrition, finance, time}
  effective_weights: Record<CategoryKey, number>; // post-redistribution, e.g. {fitness:33.3, nutrition:33.3, finance:0, time:33.3}
  data_completeness_overall: number;
  sparkline_7d: (number | null)[];
  cta?: string;
}

/** Shared score-band thresholds per PRD §4.2.9. Mirrored in Python. */
export const SCORE_BAND_THRESHOLDS = {
  green: 75,  // score >= 75
  amber: 50,  // 50 <= score < 75
  // red < 50; grey when score is null
} as const;

/** Minimum days of data before a category score renders (locked B5). */
export const MIN_DAYS_FOR_CATEGORY_SCORE = 3;

// ── Strength ────────────────────────────────────────────────────────────
// Exposed here because the Strength subsystem detail screen (Phase 5) and
// the Fitness score's Strength signal both read this shape.

export interface StrengthSet {
  id: number;
  workout_log_id: number;
  exercise_name: string;
  set_number: number;
  weight_lbs: number | null;    // null for bodyweight exercises
  reps: number;
  rpe: number | null;
  created_at: string;           // ISO timestamp
}

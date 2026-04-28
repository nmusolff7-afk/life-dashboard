// Unified goal system types (PRD §4.10).
// Mirrors the backend `goals` and `goal_library` tables. Do NOT confuse
// with the legacy calorie-config `GoalKey` union in ./home.ts — that one
// is specifically the 4 calorie-driving body-comp presets
// (lose_weight/build_muscle/recomp/maintain) and represents a single
// fitness goal's effect on calorie math, not the unified library.

export type GoalCategory = 'fitness' | 'nutrition' | 'finance' | 'time';

export type GoalType =
  | 'cumulative_numeric'
  | 'streak'
  | 'best_attempt'
  | 'rate'
  | 'period_count';

export type GoalStatus = 'active' | 'paused' | 'completed' | 'archived' | 'expired';

export type GoalDirection = 'increase' | 'decrease';

export type GoalPaceIndicator =
  | 'ahead'
  | 'on_track'
  | 'behind'
  | 'neutral'
  | 'paused'
  | 'complete'
  | 'broken';

/** Library catalog entry — v1 ships 22 of these. */
export interface GoalLibraryEntry {
  library_id: string;            // 'FIT-01', 'NUT-02', ...
  category: GoalCategory;
  goal_type: GoalType;
  display_name: string;
  description: string | null;
  metric_name: string | null;    // 'weight_lbs', 'squat_1rm_lbs', ...
  data_source: string | null;    // 'health_connect', 'strength_logs', 'plaid', ...
  default_target: number | null;
  default_deadline_days: number | null;
  default_direction: GoalDirection | null;
  default_period: 'month' | 'week' | null;
  default_window_size: number | null;
  default_aggregation: 'average' | 'sum' | 'percentage' | null;
  qualifying_condition: string | null;
  affects_calorie_math: number;  // 0 | 1
  status: 'active' | 'deprecated';
  sort_order: number;
}

export interface GoalPace {
  indicator: GoalPaceIndicator;
  ratio: number | null;
  label: string;
}

/** A user's instantiated goal. All type-specific fields are nullable; only
 *  the ones matching the goal's `goal_type` are populated. */
export interface Goal {
  goal_id: number;
  user_id: number;
  library_id: string;
  goal_type: GoalType;
  category: GoalCategory;
  display_name: string;
  is_primary: number;  // 0 | 1 — only one per category
  status: GoalStatus;
  affects_calorie_math: number;

  // Cumulative numeric
  start_value?: number | null;
  target_value?: number | null;
  current_value?: number | null;
  direction?: GoalDirection | null;
  deadline?: string | null;      // 'YYYY-MM-DD'
  original_duration_days?: number | null;
  auto_restart_enabled?: number;
  extension_count?: number;

  // Streak
  target_streak_length?: number | null;
  current_streak_length?: number;
  period_unit?: 'day' | 'week' | null;

  // Best attempt
  best_attempt_value?: number | null;
  baseline_value?: number | null;

  // Rate
  target_rate?: number | null;
  current_rate?: number | null;
  window_size?: number | null;
  aggregation?: 'average' | 'sum' | 'percentage' | null;

  // Period count
  target_count?: number | null;
  current_count?: number;
  period?: 'month' | 'week' | null;
  period_start?: string | null;
  period_end?: string | null;

  config_json?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  archived_at?: string | null;

  // Engine-derived (filled in by recompute before serializing to client):
  progress_pct?: number | null;  // 0..1
  paused?: boolean;
  pace?: GoalPace;
}

export interface GoalsListResponse {
  ok: boolean;
  goals: Goal[];
  slot_limit: number;
  active_count: number;
}

export interface GoalDetailResponse {
  ok: boolean;
  goal: Goal;
  history: GoalProgressLogRow[];
}

export interface GoalProgressLogRow {
  log_date: string;  // 'YYYY-MM-DD'
  progress_pct: number | null;
  snapshot_value: number | null;
}

export interface GoalLibraryResponse {
  ok: boolean;
  library: GoalLibraryEntry[];
}

/** Per-goal config dict (`config_json` on the row). Goal-type
 *  orthogonal — different library_ids consume different keys. The
 *  shape is loose-typed because adding a new key shouldn't require
 *  type churn. Backend stores as JSON string; client reads/writes
 *  as a parsed object. */
export interface GoalConfig {
  /** TIME-02 Screen-time cap streak — minutes/day cap. */
  daily_cap_minutes?: number;
  /** TIME-06 Location visits — id of the location_clusters row to
   *  count visits to. */
  cluster_id?: number;
  /** TIME-06 Location visits — weekly visit count needed for the
   *  week to qualify the streak. */
  weekly_visits_target?: number;
  /** Future keys land here. */
  [key: string]: unknown;
}

export interface GoalCreateInput {
  library_id: string;
  target_value?: number;
  target_streak_length?: number;
  target_count?: number;
  target_rate?: number;
  start_value?: number;
  baseline_value?: number;
  deadline?: string;
  display_name?: string;
  direction?: GoalDirection;
  is_primary?: boolean;
  period?: 'month' | 'week';
  window_size?: number;
  aggregation?: 'average' | 'sum' | 'percentage';
  period_unit?: 'day' | 'week';
  config?: GoalConfig;
}

export interface GoalUpdateInput {
  target_value?: number;
  target_streak_length?: number;
  target_count?: number;
  target_rate?: number;
  deadline?: string;
  display_name?: string;
  is_primary?: boolean;
  auto_restart_enabled?: boolean;
}

/** Error codes specific to the goals subsystem. Extend as new edges land. */
export type GoalsErrorCode =
  | 'slot_limit_reached'
  | 'validation_failed'
  | 'not_found'
  | 'db_error';

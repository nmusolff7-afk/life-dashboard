/** Workout plan types (PRD §4.3.10). Kept narrow — exact JSON shape
 *  matches what the Flask /api/workout-plan endpoints emit + what the
 *  AI comprehensive-plan prompt returns. */

export type DayName =
  | 'Monday'
  | 'Tuesday'
  | 'Wednesday'
  | 'Thursday'
  | 'Friday'
  | 'Saturday'
  | 'Sunday';

export interface PlanExercise {
  name: string;
  sets: number;
  reps: string; // "8-12", "AMRAP", "5", etc.
  rest?: string | null; // "90s"
  notes?: string | null;
}

export interface PlanCardio {
  /** Specific session label — never generic "Cardio". See claude_nutrition.py
   *  revise_plan prompt for the allowed vocabulary. */
  type: string;
  committed?: boolean;
}

export interface PlanDay {
  /** Optional display label — "Push Day", "Upper A", "Rest". */
  label?: string;
  exercises: PlanExercise[];
  cardio?: PlanCardio | null;
  isRestDay?: boolean;
}

export interface WeeklyPlan {
  weeklyPlan: Partial<Record<DayName, PlanDay>>;
  planNotes?: string | null;
}

/** Builder quiz payload — the inputs users give the comprehensive-plan
 *  generator. Shape mirrors Flask's generate_comprehensive_plan prompt. */
export interface WorkoutPlanQuiz {
  goal?: string;
  experience?: string;
  schedule?: {
    daysPerWeek?: number;
    trainingDays?: DayName[];
  };
  sessionLength?: 'under_30' | '30_to_60' | '60_to_90' | '90_plus';
  equipment?: string[];
  selectedExercises?: string[];
  preferredFocus?: string[];
  physicalConstraints?: string | null;
  aiFlags?: string[];
  [key: string]: unknown;
}

/** /api/workout-plan response envelope. */
export interface WorkoutPlanResponse {
  id: number;
  plan: WeeklyPlan;
  quiz_payload?: WorkoutPlanQuiz | null;
  understanding?: string | null;
  created_at: string;
  is_active: boolean;
}

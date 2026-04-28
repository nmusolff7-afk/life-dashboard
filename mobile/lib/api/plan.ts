import type {
  WorkoutPlanQuiz,
  WorkoutPlanResponse,
  WeeklyPlan,
} from '../../../shared/src/types/plan';
import { apiFetch } from '../api';

async function jsonOrThrow<T>(res: Response, ctx: string): Promise<T> {
  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { error?: string };
      detail = body?.error ?? '';
    } catch {
      // ignore
    }
    throw new Error(`${ctx} → ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return (await res.json()) as T;
}

/** Fetch the current active plan. Server returns 204 when the user has
 *  no active plan; we surface that as null. */
export async function fetchWorkoutPlan(): Promise<WorkoutPlanResponse | null> {
  const res = await apiFetch('/api/workout-plan');
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`workout-plan GET → ${res.status}`);
  return (await res.json()) as WorkoutPlanResponse;
}

/** Parse a free-form plan text block via the AI Import flow. Returns a
 *  normalized weekly plan — NOT yet saved. Caller reviews + tweaks,
 *  then calls saveWorkoutPlan. */
export async function parseWorkoutPlanText(text: string): Promise<WeeklyPlan> {
  const res = await apiFetch('/api/parse-workout-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  return jsonOrThrow<WeeklyPlan>(res, 'parse-workout-plan');
}

/** Save a pre-built plan (AI Import or Manual Builder) as the active
 *  plan. Archives any prior active plan. */
export async function saveWorkoutPlan(params: {
  plan: WeeklyPlan;
  quiz_payload?: unknown;
  understanding?: string;
}): Promise<WorkoutPlanResponse> {
  const res = await apiFetch('/api/workout-plan/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return jsonOrThrow<WorkoutPlanResponse>(res, 'workout-plan/save');
}

/** Generate a new plan from the builder quiz. Archives any previous
 *  active plan and installs this one. */
export async function generateWorkoutPlan(
  quiz: WorkoutPlanQuiz,
): Promise<WorkoutPlanResponse> {
  const res = await apiFetch('/api/workout-plan/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(quiz),
  });
  return jsonOrThrow<WorkoutPlanResponse>(res, 'workout-plan/generate');
}

/** AI-revise the current plan with a natural-language change request.
 *
 *  Default mode (no opts): commits the revision to the active plan and
 *  returns the saved WorkoutPlanResponse. Used by anything that wants
 *  immediate apply.
 *
 *  Dry-run mode (opts.dryRun): returns the AI-proposed plan WITHOUT
 *  saving, so the client can show it for review + explicit Save. The
 *  shape in dry-run is `{plan: WeeklyPlan, dry_run: true}`. Optional
 *  `currentPlan` lets the caller send their working-copy plan as the
 *  AI's basis instead of the DB-saved one (supports edits-on-top-of-
 *  edits in mobile's draft mode).
 */
export interface ReviseOptions {
  dryRun?: boolean;
  currentPlan?: WeeklyPlan;
}

export interface ReviseDryRunResponse {
  plan: WeeklyPlan;
  dry_run: true;
}

export async function reviseWorkoutPlan(
  changeRequest: string,
): Promise<WorkoutPlanResponse>;
export async function reviseWorkoutPlan(
  changeRequest: string,
  opts: ReviseOptions & { dryRun: true },
): Promise<ReviseDryRunResponse>;
export async function reviseWorkoutPlan(
  changeRequest: string,
  opts: ReviseOptions = {},
): Promise<WorkoutPlanResponse | ReviseDryRunResponse> {
  const body: Record<string, unknown> = { change_request: changeRequest };
  if (opts.dryRun) body.dry_run = true;
  if (opts.currentPlan) body.current_plan = opts.currentPlan;
  const res = await apiFetch('/api/workout-plan/revise', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (opts.dryRun) {
    return jsonOrThrow<ReviseDryRunResponse>(res, 'workout-plan/revise (dry-run)');
  }
  return jsonOrThrow<WorkoutPlanResponse>(res, 'workout-plan/revise');
}

/** Persist manual edits to the current plan (exercise swap, set/rep
 *  tweaks, add/remove). Client sends the WHOLE new plan dict. */
export async function patchWorkoutPlan(
  plan: WeeklyPlan,
): Promise<WorkoutPlanResponse> {
  const res = await apiFetch('/api/workout-plan', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan }),
  });
  return jsonOrThrow<WorkoutPlanResponse>(res, 'workout-plan PATCH');
}

/** Deactivate the active plan (Switch Plan first step). Row is kept
 *  so the user can reactivate it later if they want. */
export async function deactivateWorkoutPlan(): Promise<{ deactivated: boolean }> {
  const res = await apiFetch('/api/workout-plan', { method: 'DELETE' });
  return jsonOrThrow<{ deactivated: boolean }>(res, 'workout-plan DELETE');
}

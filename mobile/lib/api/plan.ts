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

/** AI-revise the current plan with a natural-language change request. */
export async function reviseWorkoutPlan(
  changeRequest: string,
): Promise<WorkoutPlanResponse> {
  const res = await apiFetch('/api/workout-plan/revise', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ change_request: changeRequest }),
  });
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

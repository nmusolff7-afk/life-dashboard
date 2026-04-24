import type {
  OnboardingDataResponse,
  OnboardingPollResponse,
  OnboardingRawInputs,
} from '../../../shared/src/types/home';
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

/** Read back the user's saved onboarding inputs so profile editors can pre-fill. */
export async function fetchOnboardingData(): Promise<OnboardingDataResponse> {
  const res = await apiFetch('/api/onboarding/data');
  return jsonOrThrow<OnboardingDataResponse>(res, 'onboarding/data');
}

/** Progressive save — merges the supplied partial payload into raw_inputs.
 *  Only non-null values overwrite (Flask side strips nulls), so callers can
 *  send just the fields they're editing without clobbering others. */
export async function saveOnboardingInputs(patch: Partial<OnboardingRawInputs>): Promise<void> {
  const res = await apiFetch('/api/onboarding/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  await jsonOrThrow<{ ok: boolean }>(res, 'onboarding/save');
}

/** /api/goal/update persists slider-driven targets. The endpoint takes:
 *  - rmr: resting metabolic rate, used as the floor for the calorie target.
 *  - tdee: full daily expenditure (RMR + NEAT + EAT + TEF), used as the base
 *          the deficit bites against.
 *  - deficit: negative for cut, positive for bulk, 0 for maintain.
 *  Target = max(tdee + deficit, rmr). Flask accepts `rmr` without `tdee`
 *  (legacy behavior) but we always send both so goal adjustments actually
 *  differentiate targets.
 */
export interface GoalUpdatePayload {
  goal: string;          // goal_key
  rmr: number;           // kcal/day resting floor
  tdee: number;          // kcal/day full expenditure base
  deficit: number;       // kcal offset from tdee
  protein: number;       // g
  carbs: number;         // g
  fat: number;           // g
  sugar?: number;
  fiber?: number;
  sodium?: number;
}

export async function updateGoal(payload: GoalUpdatePayload): Promise<void> {
  const res = await apiFetch('/api/goal/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await jsonOrThrow<{ ok: boolean }>(res, 'goal/update');
}

/** Kick off async AI profile regeneration. Idempotent — if a job is already
 *  running it just returns queued again. Poll via pollOnboarding(). */
export async function regenerateProfile(): Promise<void> {
  const res = await apiFetch('/api/onboarding/complete', { method: 'POST' });
  await jsonOrThrow<{ queued: boolean }>(res, 'onboarding/complete');
}

export async function pollOnboarding(): Promise<OnboardingPollResponse> {
  const res = await apiFetch('/api/onboarding/poll');
  return jsonOrThrow<OnboardingPollResponse>(res, 'onboarding/poll');
}

export interface ProfileSyncStatus {
  out_of_sync: boolean;
  /** Short human-readable reason, e.g. "diet preferences changed". */
  reason: string | null;
}

/** Whether the stored profile_map needs an AI regeneration because the user
 *  edited diet/goal fields that feed it. Returned by /api/profile/sync-status. */
export async function fetchProfileSyncStatus(): Promise<ProfileSyncStatus> {
  const res = await apiFetch('/api/profile/sync-status');
  return jsonOrThrow<ProfileSyncStatus>(res, 'profile/sync-status');
}

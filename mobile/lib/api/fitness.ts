import type { BurnEstimate, SavedWorkout } from '../../../shared/src/types/home';
import { apiFetch } from '../api';

async function jsonOrThrow<T>(res: Response, ctx: string): Promise<T> {
  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { error?: string };
      detail = body?.error ?? '';
    } catch {
      // ignore json parse
    }
    throw new Error(`${ctx} → ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return (await res.json()) as T;
}

export async function estimateBurn(description: string): Promise<BurnEstimate> {
  const res = await apiFetch('/api/burn-estimate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description }),
  });
  return jsonOrThrow<BurnEstimate>(res, 'burn-estimate');
}

export async function logWorkout(description: string, caloriesBurned: number): Promise<void> {
  const res = await apiFetch('/api/log-workout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description, calories_burned: caloriesBurned }),
  });
  await jsonOrThrow<{ ok: boolean }>(res, 'log-workout');
}

export async function editWorkout(id: number, description: string, caloriesBurned: number): Promise<void> {
  const res = await apiFetch(`/api/edit-workout/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description, calories_burned: caloriesBurned }),
  });
  await jsonOrThrow<{ ok: boolean }>(res, 'edit-workout');
}

export async function deleteWorkout(id: number): Promise<void> {
  const res = await apiFetch(`/api/delete-workout/${id}`, { method: 'POST' });
  // delete-workout returns {workouts, burn} — we just need 2xx.
  if (!res.ok) throw new Error(`delete-workout → ${res.status}`);
}

export async function logWeight(weightLbs: number): Promise<void> {
  const res = await apiFetch('/api/log-weight', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weight_lbs: weightLbs }),
  });
  await jsonOrThrow<{ ok: boolean }>(res, 'log-weight');
}

export async function fetchSavedWorkouts(): Promise<SavedWorkout[]> {
  const res = await apiFetch('/api/saved-workouts');
  return jsonOrThrow<SavedWorkout[]>(res, 'saved-workouts');
}

export async function saveWorkoutTemplate(description: string, caloriesBurned: number): Promise<void> {
  const res = await apiFetch('/api/saved-workouts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description, calories_burned: caloriesBurned }),
  });
  await jsonOrThrow<{ ok: boolean }>(res, 'save-workout-template');
}

export async function deleteSavedWorkout(id: number): Promise<void> {
  const res = await apiFetch(`/api/saved-workouts/${id}`, { method: 'DELETE' });
  await jsonOrThrow<{ ok: boolean }>(res, 'delete-saved-workout');
}

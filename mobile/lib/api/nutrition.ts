import type {
  NutritionEstimate,
  SavedMeal,
  TodayNutritionResponse,
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

export interface MealPayload {
  description: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  sugar_g?: number;
  fiber_g?: number;
  sodium_mg?: number;
}

export async function estimateMealNutrition(description: string): Promise<NutritionEstimate> {
  const res = await apiFetch('/api/estimate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description }),
  });
  return jsonOrThrow<NutritionEstimate>(res, 'estimate');
}

/** /api/log-meal returns the full {meals, totals} payload — same shape as
 *  /api/today-nutrition — so callers can optimistically update without an
 *  extra round-trip. */
export async function logMeal(payload: MealPayload): Promise<TodayNutritionResponse> {
  const res = await apiFetch('/api/log-meal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return jsonOrThrow<TodayNutritionResponse>(res, 'log-meal');
}

export async function editMeal(id: number, payload: MealPayload): Promise<TodayNutritionResponse> {
  const res = await apiFetch(`/api/edit-meal/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return jsonOrThrow<TodayNutritionResponse>(res, 'edit-meal');
}

export async function deleteMeal(id: number): Promise<void> {
  const res = await apiFetch(`/api/delete-meal/${id}`, { method: 'POST' });
  if (!res.ok) throw new Error(`delete-meal → ${res.status}`);
}

export async function fetchSavedMeals(): Promise<SavedMeal[]> {
  const res = await apiFetch('/api/saved-meals');
  return jsonOrThrow<SavedMeal[]>(res, 'saved-meals');
}

export async function saveMealTemplate(payload: MealPayload & { items?: unknown[] }): Promise<void> {
  const res = await apiFetch('/api/saved-meals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, items: payload.items ?? [] }),
  });
  await jsonOrThrow<{ ok: boolean }>(res, 'save-meal-template');
}

export async function deleteSavedMeal(id: number): Promise<void> {
  const res = await apiFetch(`/api/saved-meals/${id}`, { method: 'DELETE' });
  await jsonOrThrow<{ ok: boolean }>(res, 'delete-saved-meal');
}

/** AI re-estimate with user corrections appended to the original description. */
export async function aiEditMeal(original: string, edits: string): Promise<NutritionEstimate> {
  const res = await apiFetch('/api/ai-edit-meal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ original, edits }),
  });
  return jsonOrThrow<NutritionEstimate>(res, 'ai-edit-meal');
}

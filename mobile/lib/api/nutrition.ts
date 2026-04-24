import type {
  NutritionEstimate,
  SavedMeal,
  TodayNutritionResponse,
} from '../../../shared/src/types/home';
import { apiFetch } from '../api';
import { clientTimeFields } from '../localTime';

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
    body: JSON.stringify({ ...payload, ...clientTimeFields() }),
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

/** Meal photo scan — sends a single base64 image to Claude via Flask and
 *  returns the identified description + full macro breakdown. */
export interface MealScanResponse extends NutritionEstimate {
  description: string;
  model?: string;
  premium?: boolean;
}

export async function scanMealImage(
  imageBase64: string,
  mediaType: string = 'image/jpeg',
  context: string = '',
  premium: boolean = false,
): Promise<MealScanResponse> {
  const res = await apiFetch('/api/scan-meal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_b64: imageBase64, media_type: mediaType, context, premium }),
  });
  return jsonOrThrow<MealScanResponse>(res, 'scan-meal');
}

/** Barcode AI fallback — called client-side when Open Food Facts returns
 *  no product for a scanned barcode. Haiku estimates from the raw number
 *  plus optional hint text. */
export interface BarcodeAiLookup {
  description: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  sugar_g: number;
  fiber_g: number;
  sodium_mg: number;
  notes: string;
  source: 'ai';
}

export async function lookupBarcodeAi(barcode: string, hint: string = ''): Promise<BarcodeAiLookup> {
  const res = await apiFetch('/api/barcode/lookup-ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ barcode, hint }),
  });
  return jsonOrThrow<BarcodeAiLookup>(res, 'barcode/lookup-ai');
}

/** Pantry: list of ingredients detected from one or more photos. */
export interface PantryIngredient {
  name: string;
  confidence?: number;
}

export async function identifyIngredients(
  images: { b64: string; media_type?: string }[],
): Promise<PantryIngredient[]> {
  const res = await apiFetch('/api/meals/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ images }),
  });
  const body = await jsonOrThrow<{ ingredients: PantryIngredient[] }>(res, 'meals/scan');
  return body.ingredients ?? [];
}

/** Meal suggestion payload — options fit inside remaining calories. */
export interface MealSuggestion {
  meal_name: string;
  why: string;
  instructions: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface MealSuggestResponse {
  options: MealSuggestion[];
  meal_type?: string;
  cal_remaining?: number;
}

export async function suggestMeals(params: {
  ingredients?: string[];
  images?: { b64: string; media_type?: string }[];
  hour?: number;
  calories_consumed?: number;
}): Promise<MealSuggestResponse> {
  const res = await apiFetch('/api/meals/suggest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return jsonOrThrow<MealSuggestResponse>(res, 'meals/suggest');
}

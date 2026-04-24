import type { Meal, Workout } from '../../../shared/src/types/home';
import { apiFetch } from '../api';

export interface DayDetailTotals {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  sugar_g: number;
  fiber_g: number;
  sodium_mg: number;
  workout_burn: number;
}

export interface DayDetailResponse {
  date: string;
  meals: Meal[];
  workouts: Workout[];
  totals: DayDetailTotals;
  weight_lbs: number | null;
  hydration_oz: number;
}

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

export async function fetchDayDetail(dateIso: string): Promise<DayDetailResponse> {
  const res = await apiFetch(`/api/day/${dateIso}`);
  return jsonOrThrow<DayDetailResponse>(res, `day/${dateIso}`);
}

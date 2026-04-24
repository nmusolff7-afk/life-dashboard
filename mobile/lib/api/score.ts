import type {
  CategoryKey,
  CategoryScoreResponse,
  OverallScoreResponse,
} from '../../../shared/src/types/score';
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

export async function fetchOverallScore(): Promise<OverallScoreResponse> {
  const res = await apiFetch('/api/score/overall');
  return jsonOrThrow<OverallScoreResponse>(res, 'score/overall');
}

export async function fetchCategoryScore(
  category: CategoryKey,
): Promise<CategoryScoreResponse> {
  const res = await apiFetch(`/api/score/${category}`);
  return jsonOrThrow<CategoryScoreResponse>(res, `score/${category}`);
}

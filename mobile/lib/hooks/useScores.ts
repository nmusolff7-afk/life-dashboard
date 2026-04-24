import type {
  CategoryScoreResponse,
  OverallScoreResponse,
} from '../../../shared/src/types/score';
import { useApi, type ApiState } from './useApi';

export function useOverallScore(): ApiState<OverallScoreResponse> {
  return useApi<OverallScoreResponse>('/api/score/overall');
}

export function useFitnessScore(): ApiState<CategoryScoreResponse> {
  return useApi<CategoryScoreResponse>('/api/score/fitness');
}

export function useNutritionScore(): ApiState<CategoryScoreResponse> {
  return useApi<CategoryScoreResponse>('/api/score/nutrition');
}

export function useFinanceScore(): ApiState<CategoryScoreResponse> {
  return useApi<CategoryScoreResponse>('/api/score/finance');
}

export function useTimeScore(): ApiState<CategoryScoreResponse> {
  return useApi<CategoryScoreResponse>('/api/score/time');
}

/** Bundle: Overall + all 4 category scores + a unified loading flag.
 *  Each score has its own ApiState so partial-render is natural (show
 *  Overall as soon as it arrives, individual cards fill in as they do). */
export interface ScoresBundle {
  overall: ApiState<OverallScoreResponse>;
  fitness: ApiState<CategoryScoreResponse>;
  nutrition: ApiState<CategoryScoreResponse>;
  finance: ApiState<CategoryScoreResponse>;
  time: ApiState<CategoryScoreResponse>;
  /** True while any of the 5 is still loading. */
  anyLoading: boolean;
  /** Refetch all in parallel. */
  refetchAll: () => Promise<void>;
}

export function useScores(): ScoresBundle {
  const overall = useOverallScore();
  const fitness = useFitnessScore();
  const nutrition = useNutritionScore();
  const finance = useFinanceScore();
  const time = useTimeScore();

  const refetchAll = async () => {
    await Promise.all([
      overall.refetch(),
      fitness.refetch(),
      nutrition.refetch(),
      finance.refetch(),
      time.refetch(),
    ]);
  };

  return {
    overall,
    fitness,
    nutrition,
    finance,
    time,
    anyLoading:
      overall.loading || fitness.loading || nutrition.loading ||
      finance.loading || time.loading,
    refetchAll,
  };
}

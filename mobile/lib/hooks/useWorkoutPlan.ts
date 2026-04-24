import { useCallback, useEffect, useState } from 'react';

import type { WorkoutPlanResponse } from '../../../shared/src/types/plan';
import { fetchWorkoutPlan } from '../api/plan';

export interface UseWorkoutPlan {
  plan: WorkoutPlanResponse | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/** Reads the user's currently active workout plan. Returns null when
 *  there is no active plan (server emits 204). */
export function useWorkoutPlan(): UseWorkoutPlan {
  const [plan, setPlan] = useState<WorkoutPlanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = await fetchWorkoutPlan();
      setPlan(p);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { plan, loading, error, refetch };
}

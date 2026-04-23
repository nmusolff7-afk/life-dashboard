import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import type {
  ProfileResponse,
  SavedWorkout,
  TodayNutritionResponse,
  TodayWorkoutsResponse,
  Workout,
} from '../../../shared/src/types/home';
import { useApi, type ApiState } from './useApi';

export const useTodayNutrition = (): ApiState<TodayNutritionResponse> =>
  useApi<TodayNutritionResponse>('/api/today-nutrition');

export const useTodayWorkouts = (): ApiState<TodayWorkoutsResponse> =>
  useApi<TodayWorkoutsResponse>('/api/today-workouts');

export const useProfile = (): ApiState<ProfileResponse> =>
  useApi<ProfileResponse>('/api/profile');

/** Dates (YYYY-MM-DD) where user logged at least one meal or workout. */
export const useLoggedDates = (days = 90): ApiState<string[]> =>
  useApi<string[]>(`/api/logged-dates?days=${days}`);

export const useSavedWorkouts = (): ApiState<SavedWorkout[]> =>
  useApi<SavedWorkout[]>('/api/saved-workouts');

export const useWorkoutHistory = (days = 90): ApiState<Workout[]> =>
  useApi<Workout[]>(`/api/workout-history?days=${days}`);

// Steps: Flask stores this in browser localStorage only (no API endpoint). On
// mobile we use AsyncStorage keyed by date so refreshes are stable.

function todayKey(): string {
  return `apex.steps.${new Date().toISOString().slice(0, 10)}`;
}

export interface StepsState {
  steps: number | null;
  loading: boolean;
  save: (n: number) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useTodaySteps(): StepsState {
  const [steps, setSteps] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await AsyncStorage.getItem(todayKey());
      const n = raw != null ? parseInt(raw, 10) : null;
      setSteps(Number.isFinite(n as number) ? (n as number) : null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const save = useCallback(async (n: number) => {
    await AsyncStorage.setItem(todayKey(), String(n));
    setSteps(n);
  }, []);

  return { steps, loading, save, refetch };
}

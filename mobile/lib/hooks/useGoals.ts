import { useCallback, useEffect, useState } from 'react';

import type {
  Goal,
  GoalCreateInput,
  GoalDetailResponse,
  GoalLibraryEntry,
  GoalLibraryResponse,
  GoalsListResponse,
  GoalUpdateInput,
} from '../../../shared/src/types/goals';
import { apiFetch } from '../api';
import { useApi } from './useApi';

/** Active + paused goals, plus slot info. Hot path on Goals tab. */
export function useGoals() {
  return useApi<GoalsListResponse>('/api/goals');
}

export function useArchivedGoals() {
  return useApi<GoalsListResponse>('/api/goals?status=archived');
}

export function useCompletedGoals() {
  return useApi<GoalsListResponse>('/api/goals?status=completed');
}

export function useGoalDetail(goalId: number | null) {
  const [data, setData] = useState<GoalDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    if (goalId == null) return;
    setLoading(true); setError(null);
    try {
      const res = await apiFetch(`/api/goals/${goalId}`);
      if (!res.ok) throw new Error(`GET /api/goals/${goalId} -> ${res.status}`);
      setData((await res.json()) as GoalDetailResponse);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [goalId]);

  useEffect(() => { refetch(); }, [refetch]);
  return { data, loading, error, refetch };
}

/** Library cached for session. Matches PRD §4.10.3 cold-start fetch policy. */
let _libraryCache: GoalLibraryEntry[] | null = null;

export function useGoalLibrary() {
  const [data, setData] = useState<GoalLibraryEntry[] | null>(_libraryCache);
  const [loading, setLoading] = useState(_libraryCache == null);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch('/api/goal-library');
      if (!res.ok) throw new Error(`GET /api/goal-library -> ${res.status}`);
      const json = (await res.json()) as GoalLibraryResponse;
      _libraryCache = json.library;
      setData(json.library);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (_libraryCache == null) refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

export async function createGoal(input: GoalCreateInput): Promise<Goal> {
  const res = await apiFetch('/api/goals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw Object.assign(new Error(json.error || 'create failed'), { code: json.error_code });
  }
  return json.goal as Goal;
}

export async function updateGoal(goalId: number, input: GoalUpdateInput): Promise<Goal> {
  const res = await apiFetch(`/api/goals/${goalId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw Object.assign(new Error(json.error || 'update failed'), { code: json.error_code });
  }
  return json.goal as Goal;
}

export async function archiveGoal(goalId: number): Promise<void> {
  const res = await apiFetch(`/api/goals/${goalId}/archive`, { method: 'POST' });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error || 'archive failed');
}

export async function unarchiveGoal(goalId: number): Promise<void> {
  const res = await apiFetch(`/api/goals/${goalId}/unarchive`, { method: 'POST' });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw Object.assign(new Error(json.error || 'unarchive failed'), { code: json.error_code });
  }
}

export async function completeGoal(goalId: number): Promise<void> {
  const res = await apiFetch(`/api/goals/${goalId}/complete`, { method: 'POST' });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error || 'complete failed');
}

import type {
  CreateTaskInput, Task, TaskListResponse, TimeFocusResponse, UpdateTaskInput,
} from '../../../shared/src/types/tasks';
import { apiFetch } from '../api';
import { useApi } from './useApi';

export function useTasks(includeCompleted = true) {
  return useApi<TaskListResponse>(
    `/api/mind/tasks?include_completed=${includeCompleted ? 1 : 0}`,
  );
}

export function useTimeFocus() {
  return useApi<TimeFocusResponse>('/api/time/focus');
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  const res = await apiFetch('/api/mind/task', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw Object.assign(new Error(json.error || 'create failed'), { code: json.error_code });
  }
  return json.task as Task;
}

export async function toggleTask(id: number): Promise<void> {
  // Empty body triggers toggle behavior; object body triggers edit.
  const res = await apiFetch(`/api/mind/task/${id}`, { method: 'PATCH' });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error || 'toggle failed');
}

export async function updateTask(id: number, input: UpdateTaskInput): Promise<void> {
  const res = await apiFetch(`/api/mind/task/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error || 'update failed');
}

export async function deleteTask(id: number): Promise<void> {
  const res = await apiFetch(`/api/mind/task/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`delete failed (${res.status})`);
}

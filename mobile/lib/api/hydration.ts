import { apiFetch } from '../api';

export interface HydrationToday {
  oz: number;
  date: string;
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

export async function fetchHydrationToday(): Promise<HydrationToday> {
  const res = await apiFetch('/api/hydration/today');
  return jsonOrThrow<HydrationToday>(res, 'hydration/today');
}

export async function logHydration(oz: number): Promise<HydrationToday> {
  const res = await apiFetch('/api/hydration/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oz }),
  });
  return jsonOrThrow<HydrationToday>(res, 'hydration/log');
}

export async function resetHydration(): Promise<HydrationToday> {
  const res = await apiFetch('/api/hydration/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  return jsonOrThrow<HydrationToday>(res, 'hydration/reset');
}

import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '../api';

export interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Minimal fetch-state-refetch hook for JSON endpoints. Goes through apiFetch so
 * Bearer auth + 15s timeout are inherited.
 */
export function useApi<T>(path: string, init?: RequestInit): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(path, init);
      if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${path} → ${res.status}`);
      const json = (await res.json()) as T;
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
    // init is intentionally excluded from deps — callers should use a stable reference
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

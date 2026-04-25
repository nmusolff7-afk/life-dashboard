import type {
  ConnectorsListResponse, ConsentMap, ConsentResponse,
} from '../../../shared/src/types/connectors';
import { apiFetch } from '../api';
import { useApi } from './useApi';

/** Full catalog + per-user status. Source of truth for Settings →
 *  Connections and the onboarding connections screen. */
export function useConnectors() {
  return useApi<ConnectorsListResponse>('/api/connectors');
}

/** Per-source AI consent map. Backend is source of truth (B1). */
export function useConsent() {
  return useApi<ConsentResponse>('/api/privacy/consent');
}

export async function setConsent(source: string, allowed: boolean): Promise<void> {
  const res = await apiFetch('/api/privacy/consent', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, allowed }),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error || 'consent update failed');
}

export async function disconnectConnector(provider: string): Promise<void> {
  const res = await apiFetch(`/api/connectors/${provider}/disconnect`, { method: 'POST' });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error || 'disconnect failed');
}

/** Helper: resolve consent for a source with sensible default (true when
 *  the backend hasn't recorded a value yet — matches the opt-out model). */
export function sourceAllowed(map: ConsentMap | undefined, source: string): boolean {
  if (!map) return true;
  return map[source] !== false;
}

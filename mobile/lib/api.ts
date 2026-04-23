import { getFlaskToken } from './flaskToken';

export const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';

if (!baseUrl && typeof __DEV__ !== 'undefined' && __DEV__) {
  // eslint-disable-next-line no-console
  console.warn('EXPO_PUBLIC_API_BASE_URL is not set in mobile/.env — API calls will fail.');
}

export type ClerkVerifyResponse = {
  ok: boolean;
  user_id?: number;
  username?: string;
  email?: string;
  flask_token?: string;
  is_new_user?: boolean;
  error?: string;
};

export const api = {
  async clerkVerify(clerkToken: string): Promise<ClerkVerifyResponse> {
    const res = await fetch(`${baseUrl}/api/auth/clerk-verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ clerk_token: clerkToken }),
    });
    return res.json();
  },
};

const DEFAULT_TIMEOUT_MS = 15000;

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = getFlaskToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const start = Date.now();
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
      signal: init?.signal ?? controller.signal,
    });
    const ms = Date.now() - start;
    // eslint-disable-next-line no-console
    console.log(`[api] ${init?.method ?? 'GET'} ${path} → ${res.status} (${ms}ms)`);
    return res;
  } catch (err) {
    const ms = Date.now() - start;
    const aborted = err instanceof Error && err.name === 'AbortError';
    // eslint-disable-next-line no-console
    console.log(`[api] ${init?.method ?? 'GET'} ${path} → ${aborted ? `TIMEOUT after ${ms}ms` : `FAIL ${(err as Error)?.message}`}`);
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

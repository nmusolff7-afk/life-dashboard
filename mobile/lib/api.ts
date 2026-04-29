import { getFlaskToken } from './flaskToken';
import { localToday } from './localTime';

export const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';

// Surface the baked-in baseUrl on every boot so logcat reveals what
// the release bundle thinks it should call. Founder caught a stale
// bundle 2026-04-29 where every API call failed with "Network
// request failed" even though .env said Railway — turned out the
// JS bundle was Gradle-cached from a prior build. No DEV warning
// fires in release builds, so we always-log here.
// eslint-disable-next-line no-console
console.log('[api] baseUrl =', JSON.stringify(baseUrl));
if (!baseUrl) {
  // eslint-disable-next-line no-console
  console.warn('EXPO_PUBLIC_API_BASE_URL is not set — API calls will fail.');
}

/** Structured error codes returned by /api/auth/clerk-verify so the
 *  mobile bridge can distinguish terminal ("sign out") from
 *  recoverable ("retry later") failures. */
export type ClerkVerifyErrorCode =
  | 'missing_token'
  | 'clerk_token_invalid'
  | 'clerk_api_unavailable'
  | 'server_config'
  | 'db_error';

export type ClerkVerifyResponse = {
  ok: boolean;
  user_id?: number;
  username?: string;
  email?: string;
  flask_token?: string;
  is_new_user?: boolean;
  error?: string;
  error_code?: ClerkVerifyErrorCode;
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
  // Always send the user's local date so Flask's client_today() aligns
  // today-queries to the user's calendar day, not server UTC. Without
  // this, "today's" data rolls over at UTC midnight (5pm PT) instead of
  // at the user's actual local midnight.
  if (!headers.has('X-Client-Date')) {
    headers.set('X-Client-Date', localToday());
  }

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

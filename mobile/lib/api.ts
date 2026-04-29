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

const DEFAULT_TIMEOUT_MS = 15_000;
// AI-driven endpoints (Claude plan / scan / estimate / synthesize)
// regularly take 20-60s on the backend. Default 15s timeout aborts
// them client-side before the response arrives. Founder caught this
// 2026-04-29: workout-plan/generate aborted twice during onboarding.
const LONG_TIMEOUT_MS = 90_000;
// Path fragments that flag a request as AI-driven and need the long
// timeout. Substring match on the path (case-insensitive).
const LONG_TIMEOUT_PATTERNS = [
  '/generate',
  '/scan',
  '/estimate',
  '/synthesize',
  '/regenerate',
  '/label-soft',
  '/comprehensive',
];

function timeoutFor(path: string, override?: number): number {
  if (typeof override === 'number' && override > 0) return override;
  const lower = path.toLowerCase();
  if (LONG_TIMEOUT_PATTERNS.some((p) => lower.includes(p))) return LONG_TIMEOUT_MS;
  return DEFAULT_TIMEOUT_MS;
}

export interface ApiFetchOptions extends RequestInit {
  /** Override the per-call timeout in milliseconds. Defaults to
   *  15s for normal endpoints, 90s for AI-driven endpoints (auto-
   *  detected via path). Pass an explicit number to override. */
  timeoutMs?: number;
}

export async function apiFetch(path: string, init?: ApiFetchOptions): Promise<Response> {
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

  const ttl = timeoutFor(path, init?.timeoutMs);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ttl);
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
    console.log(`[api] ${init?.method ?? 'GET'} ${path} → ${aborted ? `TIMEOUT after ${ms}ms (limit ${ttl}ms)` : `FAIL ${(err as Error)?.message}`}`);
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

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

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = getFlaskToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  return fetch(`${baseUrl}${path}`, { ...init, headers });
}

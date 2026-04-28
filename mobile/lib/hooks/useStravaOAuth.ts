import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef } from 'react';

import { apiFetch } from '../api';

// Required so the in-app browser session resolves cleanly on return.
WebBrowser.maybeCompleteAuthSession();

const STRAVA_CLIENT_ID = process.env.EXPO_PUBLIC_STRAVA_CLIENT_ID;

// Strava is plain OAuth 2.0 with a real client_secret (no PKCE), so the
// flow is simpler than Gmail:
//   1. Open consent URL via expo-auth-session.useAuthRequest.
//   2. On success the response carries `code`.
//   3. POST { code, redirect_uri } to /api/strava/oauth/exchange. Backend
//      uses STRAVA_CLIENT_SECRET (held server-side) to complete the
//      token exchange + persist tokens + run the 90-day backfill.
//
// The redirect URI uses the app's default `lifedashboard://` scheme,
// already declared at the top level of app.json — no extra intent filter
// is needed (unlike Google, which forced a reverse-client-id scheme).

const STRAVA_DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://www.strava.com/oauth/mobile/authorize',
  tokenEndpoint:         'https://www.strava.com/api/v3/oauth/token',
  revocationEndpoint:    'https://www.strava.com/oauth/deauthorize',
};

const STRAVA_SCOPES = ['read', 'activity:read_all'];

export interface StravaConnectResult {
  /** Strava athlete id as a string — what the backend stores as
   *  external_user_id. The display name is built in the UI from athlete. */
  athlete_id: string;
  athlete_name: string;
  /** Backfill stats from the initial sync triggered server-side after
   *  exchange — useful for the success toast. */
  fetched: number;
  inserted: number;
}

export interface StravaOAuthState {
  connect: () => Promise<StravaConnectResult>;
  disconnect: () => Promise<void>;
  /** True once expo-auth-session has finished preparing the request.
   *  connect() is safe to call before this flips — it'll await internally. */
  ready: boolean;
}

export function useStravaOAuth(): StravaOAuthState {
  const redirectUri = AuthSession.makeRedirectUri({
    scheme: 'lifedashboard',
    path:   'strava-callback',
  });

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId:     STRAVA_CLIENT_ID ?? '',
      scopes:       STRAVA_SCOPES,
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      // Strava-specific param. 'auto' = don't re-prompt if user already
      // approved; 'force' = re-prompt every time (useful for debugging).
      extraParams:  { approval_prompt: 'auto' },
    },
    STRAVA_DISCOVERY,
  );


  // Buffer of the latest response so the response observer can resolve
  // the connect() promise across renders.
  const pendingRef = useRef<{
    resolve: (r: StravaConnectResult) => void;
    reject: (e: Error) => void;
  } | null>(null);

  useEffect(() => {
    if (!response || !pendingRef.current) return;
    const pending = pendingRef.current;
    pendingRef.current = null;

    if (response.type === 'cancel' || response.type === 'dismiss') {
      pending.reject(new Error('Strava connect was cancelled.'));
      return;
    }
    if (response.type === 'error') {
      pending.reject(new Error(response.error?.message || 'Strava OAuth failed'));
      return;
    }
    if (response.type !== 'success') {
      pending.reject(new Error(`Unexpected OAuth result: ${response.type}`));
      return;
    }
    const code = response.params.code;
    if (!code) {
      pending.reject(new Error('No authorization code in callback.'));
      return;
    }

    (async () => {
      try {
        const res = await apiFetch('/api/strava/oauth/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code,
            redirect_uri: redirectUri,
            // Strava uses state as CSRF only; expo-auth-session manages
            // it client-side, we pass it through for backend logging.
            state: response.params.state || '',
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          throw new Error(json.error || 'Strava token exchange failed');
        }
        const athlete = json.athlete || {};
        const sync = json.sync || {};
        pending.resolve({
          athlete_id:   String(athlete.id ?? ''),
          athlete_name: [athlete.firstname, athlete.lastname].filter(Boolean).join(' ').trim()
                        || (athlete.username || 'Strava athlete'),
          fetched:      Number(sync.fetched ?? 0),
          inserted:     Number(sync.inserted ?? 0),
        });
      } catch (e) {
        pending.reject(e instanceof Error ? e : new Error(String(e)));
      }
    })();
  }, [response, redirectUri]);

  const connect = async (): Promise<StravaConnectResult> => {
    if (!request) {
      // Auth request still being prepared — wait one tick. Same pattern
      // as useGmailOAuth.
      await new Promise<void>((r) => setTimeout(r, 50));
    }
    return new Promise<StravaConnectResult>((resolve, reject) => {
      pendingRef.current = { resolve, reject };
      promptAsync({ showInRecents: true }).catch((e) => {
        pendingRef.current = null;
        reject(e instanceof Error ? e : new Error(String(e)));
      });
    });
  };

  const disconnect = async (): Promise<void> => {
    const res = await apiFetch('/api/strava/disconnect', { method: 'POST' });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error((j as { error?: string }).error || 'Strava disconnect failed');
    }
  };

  return { connect, disconnect, ready: !!request };
}

/** Manual sync trigger — pulls last 90 days from Strava, deduped server-side. */
export async function syncStrava(): Promise<{ fetched: number; inserted: number; skipped: number }> {
  const res = await apiFetch('/api/strava/sync', { method: 'POST' });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw new Error(json.error || 'Strava sync failed');
  }
  return json.sync || { fetched: 0, inserted: 0, skipped: 0 };
}

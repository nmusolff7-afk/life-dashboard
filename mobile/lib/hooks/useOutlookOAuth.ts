import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef } from 'react';

import { apiFetch } from '../api';

WebBrowser.maybeCompleteAuthSession();

const MS_CLIENT_ID = process.env.EXPO_PUBLIC_MS_CLIENT_ID;

// Microsoft accepts /common/ as the tenant for multi-tenant +
// personal-account apps. Lets the user sign in with personal Outlook,
// work Microsoft 365, school accounts — anything Microsoft.
const MS_DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  tokenEndpoint:         'https://login.microsoftonline.com/common/oauth2/v2.0/token',
};

// `offline_access` is REQUIRED for the refresh_token. Without it the
// connection silently dies after 1 hour.
const OUTLOOK_SCOPES = ['offline_access', 'User.Read', 'Mail.Read', 'Calendars.Read'];

// Uses the app's primary scheme (already declared in app.json), so no
// extra intent filter or rebuild needed. Lands on app/outlook-callback.tsx
// which is a no-op screen that bounces back.
const REDIRECT_URI = 'lifedashboard://outlook-callback';

export interface OutlookOAuthState {
  connect: () => Promise<{ email: string; name: string; emails: number; events: number }>;
  disconnect: () => Promise<void>;
  ready: boolean;
}

export function useOutlookOAuth(): OutlookOAuthState {
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId:     MS_CLIENT_ID ?? '',
      scopes:       OUTLOOK_SCOPES,
      redirectUri:  REDIRECT_URI,
      responseType: AuthSession.ResponseType.Code,
      usePKCE:      true,
      // prompt=select_account so the user gets an account picker even
      // when they're already signed in to one Microsoft account in the
      // browser — better UX for "I want to connect a different mailbox".
      extraParams: { prompt: 'select_account' },
    },
    MS_DISCOVERY,
  );

  const pendingRef = useRef<{
    resolve: (r: { email: string; name: string; emails: number; events: number }) => void;
    reject: (e: Error) => void;
  } | null>(null);

  useEffect(() => {
    if (!response) return;
    if (!pendingRef.current) return;
    const pending = pendingRef.current;
    pendingRef.current = null;

    if (response.type === 'cancel' || response.type === 'dismiss') {
      pending.reject(new Error('Outlook connect was cancelled.'));
      return;
    }
    if (response.type === 'error') {
      pending.reject(new Error(response.error?.message || 'Outlook OAuth failed'));
      return;
    }
    if (response.type !== 'success') {
      pending.reject(new Error(`Unexpected OAuth result: ${response.type}`));
      return;
    }
    const code = response.params.code;
    const verifier = request?.codeVerifier;
    if (!code) { pending.reject(new Error('No authorization code in callback.')); return; }
    if (!verifier) { pending.reject(new Error('PKCE verifier missing — auth request not ready.')); return; }

    (async () => {
      try {
        const res = await apiFetch('/api/outlook/oauth/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code,
            code_verifier: verifier,
            redirect_uri:  REDIRECT_URI,
            state: response.params.state || '',
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          const msg = json.detail
            ? `${json.error || 'Token exchange failed'} — ${json.detail}`
            : (json.error || 'Token exchange failed');
          throw new Error(msg);
        }
        pending.resolve({
          email:  json.email || '',
          name:   json.name || '',
          emails: Number(json.sync?.emails ?? 0),
          events: Number(json.sync?.events ?? 0),
        });
      } catch (e) {
        pending.reject(e instanceof Error ? e : new Error(String(e)));
      }
    })();
  }, [response, request]);

  const connect = async (): Promise<{ email: string; name: string; emails: number; events: number }> => {
    if (!request) {
      await new Promise<void>((r) => setTimeout(r, 50));
    }
    return new Promise((resolve, reject) => {
      pendingRef.current = { resolve, reject };
      promptAsync({ showInRecents: true }).catch((e) => {
        pendingRef.current = null;
        reject(e instanceof Error ? e : new Error(String(e)));
      });
    });
  };

  const disconnect = async (): Promise<void> => {
    const res = await apiFetch('/api/outlook/disconnect', { method: 'POST' });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error((j as { error?: string }).error || 'Outlook disconnect failed');
    }
  };

  return { connect, disconnect, ready: !!request };
}

export async function syncOutlook(): Promise<{ emails: number; events: number }> {
  const res = await apiFetch('/api/outlook/sync', { method: 'POST' });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw new Error(json.error || 'Outlook sync failed');
  }
  return json.sync || { emails: 0, events: 0 };
}

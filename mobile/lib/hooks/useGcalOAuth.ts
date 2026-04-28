import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { useEffect, useRef } from 'react';

import { apiFetch } from '../api';

WebBrowser.maybeCompleteAuthSession();

// Reuses the same Google OAuth client IDs as Gmail. The user must add
// `https://www.googleapis.com/auth/calendar.readonly` to their Google
// Cloud Console OAuth consent screen's scopes list (Testing-mode apps
// must explicitly list every restricted scope they request).
const ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID;
const IOS_CLIENT_ID     = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS;

const GCAL_SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

const GOOGLE_DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint:         'https://oauth2.googleapis.com/token',
  revocationEndpoint:    'https://oauth2.googleapis.com/revoke',
};

// Same redirect URI as Gmail: matches the AndroidManifest intent filter
// for the `com.lifedashboard` scheme (using a non-default scheme avoids
// expo-router intercepting the deep link with "Unmatched Route").
const REDIRECT_URI = 'com.lifedashboard:/oauthredirect';

export interface GcalOAuthState {
  /** Returns connected Google account email + initial sync count. */
  connect: () => Promise<{ email: string; fetched: number }>;
  disconnect: () => Promise<void>;
  ready: boolean;
}

export function useGcalOAuth(): GcalOAuthState {
  const clientId = Platform.OS === 'ios' ? IOS_CLIENT_ID : ANDROID_CLIENT_ID;

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId:     clientId ?? '',
      scopes:       GCAL_SCOPES,
      redirectUri:  REDIRECT_URI,
      responseType: AuthSession.ResponseType.Code,
      usePKCE:      true,
      extraParams: {
        access_type: 'offline',
        prompt:      'consent',
      },
    },
    GOOGLE_DISCOVERY,
  );

  const pendingRef = useRef<{
    resolve: (r: { email: string; fetched: number }) => void;
    reject: (e: Error) => void;
  } | null>(null);

  useEffect(() => {
    if (!response) return;
    if (!pendingRef.current) return;
    const pending = pendingRef.current;
    pendingRef.current = null;

    if (response.type === 'cancel' || response.type === 'dismiss') {
      pending.reject(new Error('Calendar connect was cancelled.'));
      return;
    }
    if (response.type === 'error') {
      pending.reject(new Error(response.error?.message || 'Calendar OAuth failed'));
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
        const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
        const res = await apiFetch('/api/gcal/oauth/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code,
            code_verifier: verifier,
            redirect_uri:  REDIRECT_URI,
            platform,
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
          email:   json.email || '',
          fetched: Number(json.sync?.fetched ?? 0),
        });
      } catch (e) {
        pending.reject(e instanceof Error ? e : new Error(String(e)));
      }
    })();
  }, [response, request]);

  const connect = async (): Promise<{ email: string; fetched: number }> => {
    if (!request) {
      await new Promise<void>((r) => setTimeout(r, 50));
    }
    return new Promise<{ email: string; fetched: number }>((resolve, reject) => {
      pendingRef.current = { resolve, reject };
      promptAsync({ showInRecents: true }).catch((e) => {
        pendingRef.current = null;
        reject(e instanceof Error ? e : new Error(String(e)));
      });
    });
  };

  const disconnect = async (): Promise<void> => {
    const res = await apiFetch('/api/gcal/disconnect', { method: 'POST' });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error((j as { error?: string }).error || 'Calendar disconnect failed');
    }
  };

  return { connect, disconnect, ready: !!request };
}

/** Manual sync trigger — refresh the cached event window. */
export async function syncGcal(): Promise<{ fetched: number }> {
  const res = await apiFetch('/api/gcal/sync', { method: 'POST' });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw new Error(json.error || 'Calendar sync failed');
  }
  return json.sync || { fetched: 0 };
}

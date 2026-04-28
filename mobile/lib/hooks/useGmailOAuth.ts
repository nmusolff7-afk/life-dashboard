import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { useEffect, useRef } from 'react';

import { apiFetch } from '../api';

WebBrowser.maybeCompleteAuthSession();

const ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID;
const IOS_CLIENT_ID     = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS;
const GMAIL_SCOPES      = [
  'https://www.googleapis.com/auth/gmail.readonly',
];

// Why the generic AuthSession.useAuthRequest, not /providers/google?
//
// expo-auth-session/providers/google AUTO-EXCHANGES the authorization
// code for tokens client-side. Our backend then tries to exchange the
// same code → Google rejects with HTTP 400 because codes are single-use.
// The generic useAuthRequest (same pattern Strava uses) just returns
// the raw code; our backend completes the exchange, gets the refresh
// token, and stores everything in users_connectors.
//
// Native Google OAuth clients on Android validate the package_name +
// SHA-1 fingerprint, NOT the redirect URI, so we can use any URI we
// like as long as Android has an intent filter for it. We use
// `com.lifedashboard:/oauthredirect` — matches the intent filter we
// shipped in app.json, and uses a different scheme from `lifedashboard://`
// (the app's primary scheme) so expo-router doesn't intercept and show
// "Unmatched Route" before the auth session resolves.

const GOOGLE_DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint:         'https://oauth2.googleapis.com/token',
  revocationEndpoint:    'https://oauth2.googleapis.com/revoke',
};

const REDIRECT_URI = 'com.lifedashboard:/oauthredirect';

export interface GmailOAuthState {
  connect: () => Promise<string>;
  disconnect: () => Promise<void>;
  ready: boolean;
}

export function useGmailOAuth(): GmailOAuthState {
  const clientId = Platform.OS === 'ios' ? IOS_CLIENT_ID : ANDROID_CLIENT_ID;

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId:     clientId ?? '',
      scopes:       GMAIL_SCOPES,
      redirectUri:  REDIRECT_URI,
      responseType: AuthSession.ResponseType.Code,
      usePKCE:      true,
      // access_type=offline + prompt=consent guarantees Google issues a
      // refresh_token. Without these, repeat connects only return an
      // access_token and our backend has no way to refresh later.
      extraParams: {
        access_type: 'offline',
        prompt:      'consent',
      },
    },
    GOOGLE_DISCOVERY,
  );

  const pendingRef = useRef<{
    resolve: (email: string) => void;
    reject: (e: Error) => void;
  } | null>(null);

  useEffect(() => {
    if (!response) return;
    if (!pendingRef.current) return;
    const pending = pendingRef.current;
    pendingRef.current = null;

    if (response.type === 'cancel' || response.type === 'dismiss') {
      pending.reject(new Error('Gmail connect was cancelled.'));
      return;
    }
    if (response.type === 'error') {
      pending.reject(new Error(response.error?.message || 'Gmail OAuth failed'));
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
        const res = await apiFetch('/api/gmail/oauth/exchange', {
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
          // Surface backend `detail` (often the upstream Google error
          // body) — without it we get a useless "Token exchange failed"
          // toast and have to dig in Flask logs.
          const msg = json.detail
            ? `${json.error || 'Token exchange failed'} — ${json.detail}`
            : (json.error || 'Token exchange failed');
          throw new Error(msg);
        }
        pending.resolve(json.email as string);
      } catch (e) {
        pending.reject(e instanceof Error ? e : new Error(String(e)));
      }
    })();
  }, [response, request]);

  const connect = async (): Promise<string> => {
    if (!request) {
      await new Promise<void>((r) => setTimeout(r, 50));
    }
    return new Promise<string>((resolve, reject) => {
      pendingRef.current = { resolve, reject };
      promptAsync({ showInRecents: true }).catch((e) => {
        pendingRef.current = null;
        reject(e instanceof Error ? e : new Error(String(e)));
      });
    });
  };

  const disconnect = async (): Promise<void> => {
    const res = await apiFetch('/api/gmail/disconnect', { method: 'POST' });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error((j as { error?: string }).error || 'Gmail disconnect failed');
    }
  };

  return { connect, disconnect, ready: !!request };
}

export async function connectGmail(): Promise<string> {
  throw new Error('connectGmail() is deprecated. Use the useGmailOAuth() hook from a component.');
}

export async function disconnectGmail(): Promise<void> {
  const res = await apiFetch('/api/gmail/disconnect', { method: 'POST' });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error((j as { error?: string }).error || 'Gmail disconnect failed');
  }
}

import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { useEffect, useRef } from 'react';

import { apiFetch } from '../api';

// Required so Google's OAuth WebBrowser session resolves cleanly
// when the user switches back to the app.
WebBrowser.maybeCompleteAuthSession();

const ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID;
const IOS_CLIENT_ID     = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS;
const GMAIL_SCOPES      = ['https://www.googleapis.com/auth/gmail.readonly'];

/**
 * Gmail OAuth via expo-auth-session/providers/google with the
 * platform-specific native client IDs. Native clients use PKCE
 * (code_verifier) instead of a client secret per RFC 8252; the verifier
 * gets passed to the backend so it can complete the token exchange.
 *
 * Flow:
 *   1. useAuthRequest builds a request with PKCE + the right per-platform
 *      client ID. Redirect URI is auto-derived from the bundle ID
 *      (com.lifedashboard) — Google's iOS/Android OAuth clients accept
 *      that scheme natively, no Cloud Console URL registration needed.
 *   2. promptAsync() opens the consent screen in an in-app browser.
 *   3. On success the response carries `code` (the auth code) plus
 *      `request.codeVerifier` (the PKCE verifier).
 *   4. We POST { code, code_verifier, platform, redirect_uri } to
 *      /api/gmail/oauth/exchange. Backend uses the matching native
 *      client_id (no secret) + verifier to complete the exchange with
 *      Google, persists tokens, marks the connector connected, and
 *      returns { ok, email }.
 */
export interface GmailOAuthState {
  /** Kick off the consent flow. Returns connected email on success. */
  connect: () => Promise<string>;
  /** Disconnect Gmail (clears tokens + flips connector to revoked). */
  disconnect: () => Promise<void>;
  /** True while the auth request is being prepared by expo-auth-session
   *  (it generates PKCE async). connect() is safe to call before this
   *  flips true; it'll await the request internally. */
  ready: boolean;
}

export function useGmailOAuth(): GmailOAuthState {
  const [request, response, promptAsync] = Google.useAuthRequest({
    androidClientId: ANDROID_CLIENT_ID,
    iosClientId: IOS_CLIENT_ID,
    scopes: GMAIL_SCOPES,
    // Code flow with PKCE — we exchange server-side so refresh_token
    // lives on the backend and gmail_sync can refresh without bothering
    // the client. The default `responseType` for this provider is
    // already 'code'; explicit here for clarity.
    responseType: 'code',
  });

  // Buffer the latest response so connect() can await it across renders.
  const latestResponseRef = useRef(response);
  latestResponseRef.current = response;

  // Promise resolver that connect() awaits — fulfilled by the response
  // observer below.
  const pendingRef = useRef<{
    resolve: (email: string) => void;
    reject: (e: Error) => void;
  } | null>(null);

  useEffect(() => {
    if (!response || !pendingRef.current) return;
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
    const redirectUri = request?.redirectUri;
    if (!code) { pending.reject(new Error('No authorization code in callback.')); return; }
    if (!verifier) { pending.reject(new Error('PKCE verifier missing — auth request not ready.')); return; }
    if (!redirectUri) { pending.reject(new Error('Redirect URI missing — auth request not ready.')); return; }

    // Exchange via backend.
    (async () => {
      try {
        const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
        const res = await apiFetch('/api/gmail/oauth/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code,
            code_verifier: verifier,
            redirect_uri: redirectUri,
            platform,
            // expo-auth-session manages its own state; pass it through
            // for backend logging but the backend won't have a row to
            // verify against (state-validation only fires when /init
            // issued the state).
            state: response.params.state || '',
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          throw new Error(json.error || 'Token exchange failed');
        }
        pending.resolve(json.email as string);
      } catch (e) {
        pending.reject(e instanceof Error ? e : new Error(String(e)));
      }
    })();
  }, [response, request]);

  const connect = async (): Promise<string> => {
    if (!request) {
      // Auth request still being prepared — wait one tick. In practice
      // useAuthRequest resolves synchronously after the first render so
      // this almost never blocks.
      await new Promise<void>((r) => setTimeout(r, 50));
    }
    return new Promise<string>((resolve, reject) => {
      pendingRef.current = { resolve, reject };
      promptAsync().catch((e) => {
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

/** For backward compat with the old hook signature — single-shot call. */
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

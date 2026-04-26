import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { apiFetch } from '../api';

/**
 * Gmail OAuth flow for the mobile client.
 *
 * Sequence:
 *   1. POST /api/gmail/oauth/init  with our deep-link redirect URI →
 *      returns { auth_url, state }
 *   2. WebBrowser.openAuthSessionAsync(auth_url, redirect_uri) opens
 *      the Google consent screen in an in-app browser. Google redirects
 *      back to our deep link (lifedashboard://oauth/gmail?code=...&state=...).
 *      WebBrowser intercepts the deep link and returns a result.
 *   3. POST /api/gmail/oauth/exchange with { code, state, redirect_uri }
 *      → backend exchanges, persists tokens, marks connector connected.
 *
 * Returns the connected email address on success, or throws.
 *
 * NB: the redirect_uri MUST be registered in Google Cloud Console as an
 * authorized redirect URI for our OAuth client. For the deep-link
 * scheme to work, register the literal string `lifedashboard://oauth/gmail`
 * (Google accepts custom schemes for "Web application" client types).
 */

const REDIRECT_PATH = 'oauth/gmail';

function buildRedirectUri(): string {
  // Linking.createURL adds the app's scheme prefix. In a managed Expo
  // dev build it'll be the scheme from app.json ("lifedashboard").
  // In Expo Go it'll be exp://... which won't match Google Console;
  // testing via dev client / built app is required.
  return Linking.createURL(REDIRECT_PATH);
}

export async function connectGmail(): Promise<string> {
  const redirectUri = buildRedirectUri();

  // Step 1: ask backend for auth URL + state
  const initRes = await apiFetch('/api/gmail/oauth/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ redirect_uri: redirectUri }),
  });
  const initJson = await initRes.json();
  if (!initRes.ok || !initJson.ok) {
    throw new Error(initJson.error || 'OAuth init failed');
  }
  const { auth_url, state } = initJson as { auth_url: string; state: string };

  // Step 2: open Google consent
  const result = await WebBrowser.openAuthSessionAsync(auth_url, redirectUri);
  if (result.type === 'cancel' || result.type === 'dismiss') {
    throw new Error('Gmail connect was cancelled.');
  }
  if (result.type !== 'success' || !result.url) {
    throw new Error('Gmail connect did not complete.');
  }

  // Parse the deep link Google redirected us to
  const url = result.url;
  const queryStart = url.indexOf('?');
  if (queryStart < 0) throw new Error('No callback parameters returned.');
  const params = new URLSearchParams(url.slice(queryStart + 1));
  const code = params.get('code');
  const returnedState = params.get('state');
  const oauthError = params.get('error');
  if (oauthError) throw new Error(`Google denied access: ${oauthError}`);
  if (!code) throw new Error('No authorization code in callback.');
  if (returnedState !== state) throw new Error('OAuth state mismatch (possible CSRF).');

  // Step 3: exchange code for tokens server-side
  const xchgRes = await apiFetch('/api/gmail/oauth/exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, state: returnedState, redirect_uri: redirectUri }),
  });
  const xchgJson = await xchgRes.json();
  if (!xchgRes.ok || !xchgJson.ok) {
    throw new Error(xchgJson.error || 'Token exchange failed');
  }
  return xchgJson.email as string;
}

export async function disconnectGmail(): Promise<void> {
  const res = await apiFetch('/api/gmail/disconnect', { method: 'POST' });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error((j as { error?: string }).error || 'Gmail disconnect failed');
  }
}

/** Returns the deep-link redirect URI the app will hand to Google. The
 *  user must register this exact string in Google Cloud Console as an
 *  authorized redirect URI. Surface in a debug screen so the user can
 *  copy/paste it without guessing. */
export function gmailRedirectUriForRegistration(): string {
  return buildRedirectUri();
}

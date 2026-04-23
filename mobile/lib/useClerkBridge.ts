import { useAuth } from '@clerk/clerk-expo';
import { useEffect, useRef } from 'react';

import { api, apiFetch } from './api';
import { clearFlaskToken, getFlaskToken, setFlaskToken } from './flaskToken';

/**
 * Watches Clerk auth state and keeps the Flask JWT in sync.
 *
 * On mount while signed in:
 *   1. If a flask_token is already in memory (e.g. hydrated from secure-store),
 *      probe it with /api/onboarding/status. If Flask 401s the probe, the token
 *      is stale (e.g. Flask SECRET_KEY rotated) — clear it and fall through to mint.
 *   2. If no flask_token, call /api/auth/clerk-verify to mint a fresh one.
 *   3. On bridge failure that indicates a dead Clerk session (user was deleted
 *      on Clerk's side, or the session token is no longer valid), call
 *      signOut() + clearFlaskToken() so the app drops back to the sign-in screen.
 *
 * On sign-out transition:
 *   Clears the flask_token.
 *
 * Call once inside a component rendered only when auth is loaded (e.g. the tabs layout).
 */
export function useClerkBridge(): void {
  const { isLoaded, isSignedIn, getToken, signOut } = useAuth();
  const prevSignedInRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (!isLoaded) return;

    if (prevSignedInRef.current && !isSignedIn) {
      clearFlaskToken();
    }
    prevSignedInRef.current = isSignedIn ?? null;

    if (!isSignedIn) return;

    let cancelled = false;

    const ensureFlaskToken = async () => {
      // Step 1: if we already think we have a flask token, probe it. Don't
      // use apiFetch's timeout retries for this — a direct call is clearer.
      if (getFlaskToken()) {
        try {
          const probe = await apiFetch('/api/onboarding/status');
          if (probe.status !== 401) {
            // Token passes server-side validation. We're done.
            return;
          }
          // 401 → stale token. Clear it and fall through to mint.
          console.log('useClerkBridge: existing flask_token is stale (probe 401). Re-minting.');
          clearFlaskToken();
        } catch (err) {
          // Probe failed for a non-auth reason (network, timeout).
          // Don't nuke the token — it might still be fine next attempt.
          console.warn('useClerkBridge: probe failed (non-auth):', err);
          return;
        }
      }

      if (cancelled) return;

      // Step 2: mint a fresh flask_token via /api/auth/clerk-verify.
      try {
        const clerkToken = await getToken();
        if (!clerkToken) {
          console.error('useClerkBridge: Clerk getToken returned null — signing out');
          clearFlaskToken();
          await signOut();
          return;
        }
        const res = await api.clerkVerify(clerkToken);
        if (cancelled) return;

        if (res.ok && res.flask_token) {
          setFlaskToken(res.flask_token);
          console.log(
            `useClerkBridge: Clerk -> Flask bridged (user_id=${res.user_id}, is_new=${res.is_new_user})`,
          );
          return;
        }

        // Step 3: bridge failed. Some failures indicate a dead Clerk session on
        // the client (user was deleted server-side, or session is no longer valid).
        // In those cases, force sign-out so the user lands back on the sign-in screen.
        console.error('useClerkBridge: clerk-verify failed:', res.error);
        const deadSession =
          res.error === 'Failed to fetch Clerk user' || res.error === 'Invalid Clerk token';
        if (deadSession) {
          console.log('useClerkBridge: dead Clerk session detected — signing out');
          clearFlaskToken();
          await signOut();
        }
      } catch (err) {
        if (!cancelled) console.error('useClerkBridge: bridge call threw:', err);
      }
    };

    ensureFlaskToken();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, getToken, signOut]);
}

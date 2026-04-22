import { useAuth } from '@clerk/clerk-expo';
import { useEffect, useRef } from 'react';

import { api } from './api';
import { clearFlaskToken, getFlaskToken, setFlaskToken } from './flaskToken';

/**
 * Watches Clerk auth state and keeps the Flask JWT in sync:
 *   - On sign-in (or mount while already signed in) with no Flask JWT: call /api/auth/clerk-verify and store the returned token.
 *   - On sign-out: clear the Flask JWT.
 * Call once inside a component rendered only when auth is loaded (e.g. the tabs layout).
 */
export function useClerkBridge(): void {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const prevSignedInRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (!isLoaded) return;

    if (prevSignedInRef.current && !isSignedIn) {
      clearFlaskToken();
    }
    prevSignedInRef.current = isSignedIn ?? null;

    if (isSignedIn && !getFlaskToken()) {
      let cancelled = false;
      (async () => {
        try {
          const clerkToken = await getToken();
          if (!clerkToken) {
            console.error('useClerkBridge: Clerk getToken returned null');
            return;
          }
          const res = await api.clerkVerify(clerkToken);
          if (cancelled) return;
          if (res.ok && res.flask_token) {
            setFlaskToken(res.flask_token);
            console.log(
              'useClerkBridge: Clerk → Flask bridged (user_id=%s, is_new=%s)',
              res.user_id,
              res.is_new_user,
            );
          } else {
            console.error('useClerkBridge: clerk-verify failed:', res.error);
          }
        } catch (err) {
          if (!cancelled) console.error('useClerkBridge: bridge call threw:', err);
        }
      })();
      return () => {
        cancelled = true;
      };
    }
  }, [isLoaded, isSignedIn, getToken]);
}

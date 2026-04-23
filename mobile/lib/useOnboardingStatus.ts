import { useAuth } from '@clerk/clerk-expo';
import { useEffect, useState } from 'react';

import { apiFetch } from './api';
import { getFlaskToken } from './flaskToken';

export type OnboardingStatus = 'loading' | 'complete' | 'incomplete';

/**
 * Polls getFlaskToken() until set, then checks GET /api/onboarding/status.
 * Returns 'loading' until the bridge completes and status is fetched.
 */
export function useOnboardingStatus(): OnboardingStatus {
  const { isSignedIn } = useAuth();
  const [status, setStatus] = useState<OnboardingStatus>('loading');

  useEffect(() => {
    if (!isSignedIn) {
      setStatus('loading');
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const check = async () => {
      while (!cancelled) {
        const token = getFlaskToken();
        if (token) {
          try {
            const res = await apiFetch('/api/onboarding/status');
            const data = await res.json();
            if (!cancelled) setStatus(data?.complete ? 'complete' : 'incomplete');
          } catch {
            if (!cancelled) setStatus('incomplete');
          }
          return;
        }
        await new Promise<void>((resolve) => {
          timer = setTimeout(resolve, 200);
        });
      }
    };
    check();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [isSignedIn]);

  return status;
}

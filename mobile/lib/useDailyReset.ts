import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { localToday } from './localTime';

/**
 * Fires `onNewDay` whenever the user's local calendar day has rolled over.
 *
 * Ticks every 60s while foregrounded (cheap — it's just a date comparison)
 * and also on foreground-from-background so re-opening the app the next
 * morning re-seeds today's data immediately.
 *
 * Typical use: parent screen passes a refetch-everything-for-today callback.
 * That single callback then triggers refetch on all the "today" surfaces
 * (nutrition, workouts, scores, live balance, etc.). Stops per-surface
 * drift where one tab shows yesterday's data and another tab shows
 * today's.
 */
export function useDailyReset(onNewDay: () => void): void {
  // Keep the callback stable via ref so we don't restart the interval
  // every render.
  const cbRef = useRef(onNewDay);
  useEffect(() => {
    cbRef.current = onNewDay;
  }, [onNewDay]);

  // Track the last seen "today" — when it changes, fire.
  const lastDayRef = useRef<string>(localToday());

  useEffect(() => {
    const check = () => {
      const today = localToday();
      if (today !== lastDayRef.current) {
        lastDayRef.current = today;
        try {
          cbRef.current();
        } catch {
          // fire-and-forget
        }
      }
    };

    // Tick every minute — cheap no-op when day hasn't changed.
    const interval = setInterval(check, 60_000);
    // And check immediately when app returns from background.
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') check();
    });

    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, []);
}

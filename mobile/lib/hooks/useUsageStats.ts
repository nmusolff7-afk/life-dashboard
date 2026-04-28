import { Platform } from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';

import { apiFetch } from '../api';
import { localToday } from '../localTime';

// Lazy require of our local Expo module. Lazy because:
//   1. iOS/web bundling: the module is Android-only; importing it on
//      iOS would trip Metro on `requireNativeModule('UsageStats')`
//      (no native side present).
//   2. Dev-without-rebuild: until the user runs `npm install
//      ./modules/usage-stats` and a fresh EAS build, the require
//      throws — we treat that as "not available" so the hook
//      degrades gracefully instead of crashing the screen.
type UsageStatsModule = {
  hasPermission(): boolean;
  openUsageAccessSettings(): void;
  queryDailyStats(dateIso: string): Promise<{
    total_minutes: number;
    top_apps: { package: string; label: string; minutes: number }[];
  }>;
};

let _us: UsageStatsModule | null | undefined;
function getUS(): UsageStatsModule | null {
  if (_us !== undefined) return _us;
  try {
    if (Platform.OS !== 'android') {
      _us = null;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      _us = require('usage-stats').default as UsageStatsModule;
    }
  } catch {
    _us = null;
  }
  return _us ?? null;
}

export interface ScreenTimeAggregate {
  total_minutes: number;
  pickups: number | null;
  longest_session_min: number | null;
  top_apps: { package: string; label: string; minutes: number }[];
}

export interface UsageStatsState {
  available: boolean;
  permitted: boolean;
  today: ScreenTimeAggregate | null;
  loading: boolean;
  error: string | null;
  /** Open system Settings → Usage Access; poll for grant; sync on
   *  success. Returns whether permission ended up granted. */
  connect: () => Promise<boolean>;
  sync: () => Promise<void>;
  disconnect: () => Promise<void>;
}

export function useUsageStats(): UsageStatsState {
  const us = getUS();
  const available = !!us;
  const [permitted, setPermitted] = useState(false);
  const [today, setToday] = useState<ScreenTimeAggregate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkPermission = useCallback((): boolean => {
    if (!us) return false;
    try {
      const ok = us.hasPermission();
      setPermitted(!!ok);
      return !!ok;
    } catch {
      return false;
    }
  }, [us]);

  useEffect(() => {
    if (available) checkPermission();
  }, [available, checkPermission]);

  const sync = useCallback(async () => {
    if (!us) return;
    setLoading(true);
    setError(null);
    try {
      const stats = await us.queryDailyStats(localToday());
      const agg: ScreenTimeAggregate = {
        total_minutes:       stats.total_minutes,
        pickups:             null,
        longest_session_min: null,
        top_apps:            stats.top_apps.slice(0, 5),
      };
      setToday(agg);
      await apiFetch('/api/screen-time/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date:                localToday(),
          total_minutes:       agg.total_minutes,
          pickups:             agg.pickups,
          longest_session_min: agg.longest_session_min,
          top_apps:            agg.top_apps,
        }),
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [us]);

  const connect = useCallback(async (): Promise<boolean> => {
    if (!us) {
      setError('Screen Time not available on this device.');
      return false;
    }
    setLoading(true);
    setError(null);
    try {
      // Maybe already granted from a prior session.
      if (checkPermission()) {
        await sync();
        return true;
      }
      us.openUsageAccessSettings();
      // Poll every second for 30s — Android doesn't fire an event
      // when the user toggles us on. If they take longer than that,
      // they can just retry Connect.
      for (let i = 0; i < 30; i++) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 1000));
        if (checkPermission()) {
          // eslint-disable-next-line no-await-in-loop
          await sync();
          return true;
        }
      }
      return false;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [us, checkPermission, sync]);

  const disconnect = useCallback(async () => {
    // No programmatic revoke — user revokes via Settings → Apps →
    // Special access → Usage access → toggle our app off. We just
    // clear local state and stop syncing.
    setPermitted(false);
    setToday(null);
  }, []);

  return { available, permitted, today, loading, error, connect, sync, disconnect };
}

// ── Auto-sync ───────────────────────────────────────────────────────
//
// Same pattern as `useAutoSyncHealthOnFocus` — fixes the symmetric
// founder symptom: "screen time still says connect even though I've
// done it" (INBOX 2026-04-28). Root cause was the same as HC: the
// component checks for DATA, not for whether the connector is
// connected. If the user grants permission but no sync has fired,
// `screen_time_daily` stays empty and the UI shows the connect copy
// indefinitely.
let _usLastSync = 0;
const US_THROTTLE_MS = 90 * 1000;

/** Fire UsageStats sync on mount when permitted, throttled to 90s
 *  app-wide. Call from ScreenTimeCard or any other surface that
 *  reads `screen_time_daily`. Pass a `refetch` to update the
 *  caller's view after sync completes. */
export function useAutoSyncUsageStatsOnFocus(onSynced?: () => void): void {
  const us = useUsageStats();
  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;
  useEffect(() => {
    if (!us.permitted) return;
    const now = Date.now();
    if (now - _usLastSync < US_THROTTLE_MS) return;
    _usLastSync = now;
    void us.sync().then(() => {
      onSyncedRef.current?.();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [us.permitted]);
}

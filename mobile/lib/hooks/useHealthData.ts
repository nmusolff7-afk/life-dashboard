import { AppState, Platform } from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';

import { apiFetch } from '../api';
import { localToday } from '../localTime';

/** A single row from `health_daily` (or null fields for missing metrics). */
export interface HealthDay {
  steps: number | null;
  sleep_minutes: number | null;
  resting_hr: number | null;
  hrv_ms: number | null;
  active_kcal: number | null;
  synced_at?: string;
}

/** Backend-persisted aggregate from `/api/health/today` — today + recent
 *  history. Use this in subsystem screens (sleep/recovery/movement) to
 *  display the data the HC custom Expo Module has synced. */
export function useHealthToday(): {
  today: HealthDay | null;
  history: HealthDay[];
  loading: boolean;
  refetch: () => Promise<void>;
} {
  const [today, setToday] = useState<HealthDay | null>(null);
  const [history, setHistory] = useState<HealthDay[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      const res = await apiFetch('/api/health/today');
      if (!res.ok) return;
      const json = (await res.json()) as { today?: HealthDay; history?: HealthDay[] };
      setToday(json.today ?? null);
      setHistory(json.history ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refetch(); }, [refetch]);

  return { today, history, loading, refetch };
}

/** Platform-aware copy for "the health hub on this device". Used by
 *  fitness subsystem screens that need to tell the user where to grant
 *  permission. */
export function healthHubLabel(): string {
  return Platform.OS === 'android' ? 'Health Connect' : 'Apple Health';
}

// ── Auto-sync ───────────────────────────────────────────────────────
//
// Module-scope last-sync timestamp shared across the whole app. The
// HC sync path goes: native module read → POST /api/health/sync →
// `health_daily` row updated → `useHealthToday()` next read sees it.
// Sync only happens on explicit `useHealthData().sync()` call —
// before this hook landed, that meant the user had to manually tap
// "Sync now" in HealthConnectCard before any data could appear on
// sleep / recovery / movement subsystem screens. Founder flagged
// 2026-04-28 that those screens stayed empty even with HC connected.
let _hcLastSync = 0;
const HC_THROTTLE_MS = 90 * 1000;

/** Fire HC sync on mount when permitted, throttled to once per 90s
 *  per app instance. Used on Today tab, Fitness tab, and HC-backed
 *  subsystem screens (sleep, recovery, movement, body) so the
 *  backend gets fresh data without the user manually tapping
 *  "Sync now" every time. Failures are swallowed — connector
 *  may not be permitted yet, which is fine.
 *
 *  Pass `onSynced` to refetch backend-derived data after the sync
 *  completes — `useHealthToday()` returns its own `refetch` for
 *  this purpose. */
export function useAutoSyncHealthOnFocus(onSynced?: () => void): void {
  const hc = useHealthData();
  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;
  useEffect(() => {
    if (!hc.permitted) return;
    const now = Date.now();
    if (now - _hcLastSync < HC_THROTTLE_MS) return;
    _hcLastSync = now;
    void hc.sync().then(() => {
      onSyncedRef.current?.();
    });
  // Intentionally only on mount + when permitted flips; tab-focus
  // remount will re-fire if needed. Deps frozen by design.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hc.permitted]);
}

// Local Expo module — see mobile/modules/health-connect/. Lazy-required
// so iOS/web bundling doesn't choke on the native binding lookup.
type HealthConnectModuleType = {
  getSdkStatus(): number;
  openHealthConnectSettings(): void;
  getGrantedPermissions(): Promise<string[]>;
  requestPermissions(perms: string[]): Promise<string[]>;
  readDailyAggregates(dateIso: string): Promise<{
    steps: number | null;
    sleep_minutes: number | null;
    resting_hr: number | null;
    hrv_ms: number | null;
    active_kcal: number | null;
  }>;
  // 2026-04-28 §14.5.2 expansion. Optional because older app
  // builds without these natives still degrade cleanly.
  readWorkoutSegments?(dateIso: string): Promise<Array<{
    start_iso: string;
    end_iso: string;
    duration_min: number;
    exercise_type: number;
    title: string;
    notes: string;
  }>>;
  readSleepStages?(dateIso: string): Promise<{
    total: number;
    awake: number;
    light: number;
    deep: number;
    rem: number;
  }>;
};

let _hc: HealthConnectModuleType | null | undefined;
function getHC(): HealthConnectModuleType | null {
  if (_hc !== undefined) return _hc;
  try {
    if (Platform.OS !== 'android') {
      _hc = null;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      _hc = require('health-connect').default as HealthConnectModuleType;
    }
  } catch {
    _hc = null;
  }
  return _hc ?? null;
}

// SDK status enum (mirrors the constants exported from our module).
const SDK_AVAILABLE = 3;
const SDK_UNAVAILABLE = 1;
const SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED = 2;

// Core perms — `permitted` is gated on having all of these. Auto-sync
// fires only when permitted=true, so missing any of these silences the
// app's HC pipeline.
const HC_CORE_READ_PERMISSIONS = [
  'android.permission.health.READ_STEPS',
  'android.permission.health.READ_SLEEP',
  'android.permission.health.READ_HEART_RATE',
  'android.permission.health.READ_HEART_RATE_VARIABILITY',
  'android.permission.health.READ_ACTIVE_CALORIES_BURNED',
];
// Optional — requested in the same system sheet, but `permitted` doesn't
// require them. Adding new optional perms here can never silently break
// existing users (their `permitted` stays true even if they never re-
// grant). 2026-04-28 §14.5.2: READ_EXERCISE added for Garmin /
// Pixel Watch / Fitbit activity flow-through; without it, workout
// segments stay empty but core sleep / steps / HRV still flow.
const HC_OPTIONAL_READ_PERMISSIONS = [
  'android.permission.health.READ_EXERCISE',
];
const HC_READ_PERMISSIONS = [
  ...HC_CORE_READ_PERMISSIONS,
  ...HC_OPTIONAL_READ_PERMISSIONS,
];

export interface HealthDailyAggregate {
  steps: number | null;
  sleep_minutes: number | null;
  resting_hr: number | null;
  hrv_ms: number | null;
  active_kcal: number | null;
}

export interface HealthDataState {
  available: boolean;
  permitted: boolean;
  today: HealthDailyAggregate | null;
  loading: boolean;
  error: string | null;
  /** True when SDK status reports HC isn't installed or needs update.
   *  UI shows a Play Store CTA in that case. */
  needsHcApp: boolean;
  connect: () => Promise<boolean>;
  sync: () => Promise<void>;
  disconnect: () => Promise<void>;
}

export function useHealthData(): HealthDataState {
  const hc = getHC();
  const available = !!hc;
  const [permitted, setPermitted] = useState(false);
  const [today, setToday] = useState<HealthDailyAggregate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsHcApp, setNeedsHcApp] = useState(false);

  const checkSdk = useCallback((): boolean => {
    if (!hc) return false;
    try {
      const status = hc.getSdkStatus();
      if (status === SDK_AVAILABLE) {
        setNeedsHcApp(false);
        return true;
      }
      if (status === SDK_UNAVAILABLE) {
        setNeedsHcApp(true);
        setError('Health Connect not installed. Install it from the Play Store first.');
        return false;
      }
      if (status === SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) {
        setNeedsHcApp(true);
        setError('Health Connect needs an update. Open the Play Store and update it.');
        return false;
      }
      // Unknown status code — treat as unavailable defensively.
      setNeedsHcApp(true);
      return false;
    } catch (e) {
      setError((e as Error).message || 'sdk_status_failed');
      return false;
    }
  }, [hc]);

  const checkPermissions = useCallback(async (): Promise<boolean> => {
    if (!hc) return false;
    try {
      const granted = await hc.getGrantedPermissions();
      // Only require core perms — optional perms (READ_EXERCISE) flow
      // separately. This means a 5-of-6 granted user is still
      // permitted=true and auto-sync runs.
      const haveCore = HC_CORE_READ_PERMISSIONS.every((p) => granted.includes(p));
      setPermitted(haveCore);
      return haveCore;
    } catch {
      return false;
    }
  }, [hc]);

  useEffect(() => {
    if (available) void checkPermissions();
  }, [available, checkPermissions]);

  // Re-check perms when the app comes back to the foreground. Without
  // this, a user who grants HC perms in the HC app (instead of via our
  // in-app Continue button) stays at permitted=false until they tap
  // Connect again — what founder hit on 2026-04-28. AppState listener
  // fires on every active-state transition.
  useEffect(() => {
    if (!available) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void checkPermissions();
    });
    return () => sub.remove();
  }, [available, checkPermissions]);

  const sync = useCallback(async () => {
    if (!hc) return;
    setLoading(true);
    setError(null);
    try {
      const dateIso = localToday();
      const agg = await hc.readDailyAggregates(dateIso);
      setToday(agg);

      // 2026-04-28 §14.5.2 expansion. Pull workout segments + sleep
      // stages alongside the daily aggregates and ship in one
      // /api/health/sync POST. The native methods are optional —
      // older app builds without the new Kotlin module bindings
      // skip these branches and post just the aggregates.
      let workoutSegments: unknown[] = [];
      let sleepStages: { total?: number; awake?: number; light?: number; deep?: number; rem?: number } | null = null;
      try {
        if (typeof hc.readWorkoutSegments === 'function') {
          workoutSegments = await hc.readWorkoutSegments(dateIso);
        }
      } catch { /* permission/API issue — degrade gracefully */ }
      try {
        if (typeof hc.readSleepStages === 'function') {
          sleepStages = await hc.readSleepStages(dateIso);
        }
      } catch { /* same */ }

      // Prefer the sleep-stages total when available — `readDailyAggregates`
      // filters SleepSessionRecord on [today 00:00, tomorrow 00:00), which
      // misses sessions whose start_time is before midnight (almost all of
      // them). `readSleepStages` uses [yesterday 18:00, today 18:00) which
      // catches last night's sleep correctly. Fallback to the daily-
      // aggregate value only when stages reports nothing. Founder symptom
      // 2026-04-28: "no sleep data" despite HC being connected.
      const sleepMinutes =
        (sleepStages && typeof sleepStages.total === 'number' && sleepStages.total > 0)
          ? sleepStages.total
          : agg.sleep_minutes;

      await apiFetch('/api/health/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date:             dateIso,
          platform:         Platform.OS,
          steps:            agg.steps,
          sleep_minutes:    sleepMinutes,
          resting_hr:       agg.resting_hr,
          hrv_ms:           agg.hrv_ms,
          active_kcal:      agg.active_kcal,
          sleep_stages:     sleepStages,
          workout_segments: workoutSegments,
        }),
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [hc]);

  const connect = useCallback(async (): Promise<boolean> => {
    if (!hc) {
      setError('Health Connect not available on this device.');
      return false;
    }
    setLoading(true);
    setError(null);
    try {
      // Step 1: SDK availability (HC app installed + recent enough)
      if (!checkSdk()) return false;

      // Step 2: Maybe already granted — short-circuit if so
      if (await checkPermissions()) {
        await sync();
        return true;
      }

      // Step 3: Fire the system permission sheet via our custom
      // module. This call uses activityResultRegistry under the hood
      // (not the broken matinzd lateinit launcher), so it works
      // reliably under Expo's new architecture. Side effect: this
      // call also REGISTERS our app with Health Connect's
      // PermissionController, so we'll appear in HC's app list from
      // here on.
      const granted = await hc.requestPermissions(HC_READ_PERMISSIONS);
      const haveAll = HC_READ_PERMISSIONS.every((p) => granted.includes(p));
      setPermitted(haveAll);
      if (!haveAll) {
        setError('Some Health Connect permissions weren\'t granted. Try Connect again or grant manually in Health Connect → App permissions → Life Dashboard.');
        return false;
      }
      await sync();
      return true;
    } catch (e) {
      const msg = (e as Error).message || String(e);
      setError(msg);
      return false;
    } finally {
      setLoading(false);
    }
  }, [hc, checkSdk, checkPermissions, sync]);

  const disconnect = useCallback(async () => {
    // No programmatic revoke — user revokes in HC's own settings:
    // Health Connect → App permissions → Life Dashboard → toggle
    // off each permission, OR Health Connect → All apps → Remove
    // app. We just clear local state.
    setPermitted(false);
    setToday(null);
  }, []);

  return { available, permitted, today, loading, error, needsHcApp, connect, sync, disconnect };
}

import { Platform } from 'react-native';
import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '../api';
import { localToday } from '../localTime';

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

const HC_READ_PERMISSIONS = [
  'android.permission.health.READ_STEPS',
  'android.permission.health.READ_SLEEP',
  'android.permission.health.READ_HEART_RATE',
  'android.permission.health.READ_HEART_RATE_VARIABILITY',
  'android.permission.health.READ_ACTIVE_CALORIES_BURNED',
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
      const haveAll = HC_READ_PERMISSIONS.every((p) => granted.includes(p));
      setPermitted(haveAll);
      return haveAll;
    } catch {
      return false;
    }
  }, [hc]);

  useEffect(() => {
    if (available) void checkPermissions();
  }, [available, checkPermissions]);

  const sync = useCallback(async () => {
    if (!hc) return;
    setLoading(true);
    setError(null);
    try {
      const agg = await hc.readDailyAggregates(localToday());
      setToday(agg);
      await apiFetch('/api/health/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date:          localToday(),
          platform:      Platform.OS,
          steps:         agg.steps,
          sleep_minutes: agg.sleep_minutes,
          resting_hr:    agg.resting_hr,
          hrv_ms:        agg.hrv_ms,
          active_kcal:   agg.active_kcal,
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
